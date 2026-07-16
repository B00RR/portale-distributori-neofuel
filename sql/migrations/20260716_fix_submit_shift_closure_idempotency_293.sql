-- Migration: validate the stored payload on submit_shift_closure request_id replays (#293)
-- Created: 2026-07-16
--
-- The idempotency mechanism returned the cached response for any row matching
-- request_id + action_type, without comparing the stored payload. A retry that
-- reused a request_id with a DIFFERENT shift (or different closing data)
-- therefore received the success response of the ORIGINAL closure, leaving the
-- second shift untouched while the client believed it was closed.
--
-- This aligns submit_shift_closure with create_credit_transaction /
-- register_credit_payment (payload equality) and open_shift (identity fields):
--   * new markers embed shift_id/station_id in the stored payload;
--   * on replay the stored payload must match; a mismatch fails closed with
--     error = 'request_id_collision' instead of returning the cached response;
--   * markers written before this migration stored only the enriched
--     closing_data (no shift_id key): those are compared against the current
--     closing_data, so in-flight legacy retries keep working;
--   * pre-payload legacy rows (payload NULL) can no longer be validated and
--     now fail closed with request_id_collision.
--
-- Behavioral note: the closing_data shape validation now runs before the early
-- replay lookup (the payload must be computed to be compared). A replay with a
-- malformed body now gets 'Dati di chiusura non validi' instead of the cached
-- response; a genuine retry resends the original, valid body.
--
-- Downtime: none (CREATE OR REPLACE). Data backfill: none.
-- IMPORTANT: baseline taken from the LIVE definition on 2026-07-16 (which
-- already differs from sql/migrations/20260714_* by the early replay block).

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_shift_closure(
    p_shift_id bigint,
    p_station_id integer,
    p_closing_data jsonb,
    p_is_final boolean,
    p_final_counters jsonb,
    p_tank_usage jsonb,
    p_request_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_shift public.shifts%ROWTYPE;
    v_operator_id integer;
    v_counter_key text;
    v_counter_value text;
    v_pistol_id bigint;
    v_final numeric;
    v_opened numeric;
    v_previous_closing numeric;
    v_current_pistol numeric;
    v_minimum_counter numeric;
    v_closing_data jsonb;
    v_payload jsonb;
    v_existing_payload jsonb;
    v_result jsonb;
    v_request_inserted boolean;
    v_is_final boolean := COALESCE(p_is_final, false);
    v_usage jsonb;
    v_usage_pump_id bigint;
    v_usage_tank_id bigint;
    v_usage_liters numeric;
    v_usage_ratio numeric;
    v_usage_mode text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();

    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Lock by id and station before authorization/idempotency decisions so a
    -- concurrent final closure cannot race this call.
    SELECT *
    INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id
      AND station_id = p_station_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Turno non trovato',
            'message', 'Turno non trovato'
        );
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Normalize the closing payload before the replay lookup: the idempotency
    -- comparison needs the same enriched shape that gets stored in the marker.
    v_closing_data := COALESCE(p_closing_data, '{}'::jsonb);
    IF jsonb_typeof(v_closing_data) <> 'object' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Dati di chiusura non validi',
            'message', 'Dati di chiusura non validi'
        );
    END IF;

    v_closing_data := v_closing_data || jsonb_build_object(
        'closure_stage', CASE WHEN v_is_final THEN 'final' ELSE 'partial' END,
        'is_final', v_is_final
    );

    -- Marker payload: bind the request to its shift and station so a replay
    -- with a different target fails closed instead of returning the cached
    -- response of another closure (#293).
    v_payload := v_closing_data || jsonb_build_object(
        'shift_id', p_shift_id,
        'station_id', p_station_id
    );

    -- A completed request must remain replayable even after the shift is final,
    -- but only when the stored payload matches the current call.
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT payload, response
        INTO v_existing_payload, v_result
        FROM public.processed_requests
        WHERE request_id = trim(p_request_id)
          AND (
              action_type = 'submit_shift_closure'
              OR (action_type IS NULL AND endpoint = 'submit_shift_closure')
          );

        IF FOUND THEN
            IF jsonb_typeof(v_existing_payload) = 'object'
               AND (
                   (v_existing_payload ? 'shift_id' AND v_existing_payload = v_payload)
                   OR (NOT v_existing_payload ? 'shift_id' AND v_existing_payload = v_closing_data)
               ) THEN
                RETURN COALESCE(
                    v_result,
                    jsonb_build_object(
                        'success', true,
                        'idempotent', true,
                        'request_id', trim(p_request_id)
                    )
                );
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'request_id_collision',
                'message', 'Request ID gia usato con parametri diversi'
            );
        END IF;
    END IF;

    IF v_shift.closed_at IS NOT NULL OR v_shift.status NOT IN ('open', 'partial') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Turno gia chiuso o non finalizzabile',
            'message', 'Turno gia chiuso o non finalizzabile'
        );
    END IF;

    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) <> 'object' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'I contatori devono essere un oggetto JSON',
            'message', 'I contatori devono essere un oggetto JSON'
        );
    END IF;

    IF v_is_final AND EXISTS (
        SELECT 1
        FROM public.shift_pistols sp
        WHERE sp.shift_id = p_shift_id
          AND NOT (COALESCE(p_final_counters, '{}'::jsonb) ? sp.pistola_id::text)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La chiusura finale richiede tutti i contatori del turno',
            'message', 'La chiusura finale richiede tutti i contatori del turno'
        );
    END IF;

    -- Validate every supplied counter before the idempotency marker or any
    -- side effect is written. Unknown pistols and regressions fail closed.
    IF p_final_counters IS NOT NULL THEN
        FOR v_counter_key, v_counter_value IN
            SELECT key, value
            FROM jsonb_each_text(p_final_counters)
        LOOP
            IF v_counter_key !~ '^[0-9]+$' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Identificativo pistola non valido',
                    'message', 'Identificativo pistola non valido'
                );
            END IF;

            BEGIN
                v_pistol_id := v_counter_key::bigint;
                v_final := v_counter_value::numeric;
            EXCEPTION
                WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Valore contatore non valido',
                        'message', 'Valore contatore non valido'
                    );
            END;

            IF v_final::text IN ('NaN', 'Infinity', '-Infinity') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Valore contatore non finito',
                    'message', 'Valore contatore non finito'
                );
            END IF;

            SELECT sp.opened_at_counter, sp.closed_at_counter, p.numero_litri
            INTO v_opened, v_previous_closing, v_current_pistol
            FROM public.shift_pistols sp
            JOIN public.pistole p ON p.id = sp.pistola_id
            WHERE sp.shift_id = p_shift_id
              AND sp.pistola_id = v_pistol_id
            FOR UPDATE OF sp, p;

            IF NOT FOUND THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Pistola non associata al turno',
                    'message', 'Pistola non associata al turno'
                );
            END IF;

            v_minimum_counter := GREATEST(
                v_opened,
                COALESCE(v_previous_closing, v_opened),
                COALESCE(v_current_pistol, v_opened)
            );

            IF v_final < v_minimum_counter THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', format(
                        'Contatore finale %s inferiore all ultimo valore registrato (%s < %s)',
                        v_counter_key,
                        v_final,
                        v_minimum_counter
                    ),
                    'message', format(
                        'Contatore finale %s inferiore all ultimo valore registrato (%s < %s)',
                        v_counter_key,
                        v_final,
                        v_minimum_counter
                    )
                );
            END IF;
        END LOOP;
    END IF;

    IF p_tank_usage IS NOT NULL AND jsonb_typeof(p_tank_usage) <> 'array' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Gli utilizzi serbatoio devono essere un array JSON',
            'message', 'Gli utilizzi serbatoio devono essere un array JSON'
        );
    END IF;

    -- Preserve the historical p_tank_usage contract, but validate every row
    -- before the idempotency marker and side effects are written.
    IF p_tank_usage IS NOT NULL THEN
        FOR v_usage IN
            SELECT value
            FROM jsonb_array_elements(p_tank_usage)
        LOOP
            IF jsonb_typeof(v_usage) <> 'object' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Utilizzo serbatoio non valido',
                    'message', 'Utilizzo serbatoio non valido'
                );
            END IF;

            BEGIN
                v_usage_pump_id := (v_usage ->> 'pump_id')::bigint;
                v_usage_tank_id := (v_usage ->> 'tank_id')::bigint;
                v_usage_liters := (v_usage ->> 'liters')::numeric;
                v_usage_ratio := NULLIF(v_usage ->> 'ratio', '')::numeric;
                v_usage_mode := NULLIF(trim(v_usage ->> 'mode'), '');
            EXCEPTION
                WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Valori utilizzo serbatoio non validi',
                        'message', 'Valori utilizzo serbatoio non validi'
                    );
            END;

            IF v_usage_liters::text IN ('NaN', 'Infinity', '-Infinity')
               OR v_usage_ratio::text IN ('NaN', 'Infinity', '-Infinity') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Valori utilizzo serbatoio non finiti',
                    'message', 'Valori utilizzo serbatoio non finiti'
                );
            END IF;

            IF v_usage_pump_id IS NULL
               OR v_usage_tank_id IS NULL
               OR v_usage_liters IS NULL
               OR v_usage_mode IS NULL
               OR v_usage_liters < 0
               OR COALESCE(v_usage_ratio, 0) < 0
               OR NOT EXISTS (
                   SELECT 1
                   FROM public.shift_pistols sp
                   WHERE sp.shift_id = p_shift_id
                     AND sp.pistola_id = v_usage_pump_id
               )
               OR NOT EXISTS (
                   SELECT 1
                   FROM public.tanks t
                   WHERE t.id = v_usage_tank_id
                     AND t.station_id = p_station_id
               ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Utilizzo serbatoio non coerente con turno e stazione',
                    'message', 'Utilizzo serbatoio non coerente con turno e stazione'
                );
            END IF;
        END LOOP;
    END IF;

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        INSERT INTO public.processed_requests (
            request_id,
            action_type,
            payload,
            response,
            created_at
        )
        VALUES (
            trim(p_request_id),
            'submit_shift_closure',
            v_payload,
            NULL,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            SELECT payload, response
            INTO v_existing_payload, v_result
            FROM public.processed_requests
            WHERE request_id = trim(p_request_id)
              AND (
                  action_type = 'submit_shift_closure'
                  OR (action_type IS NULL AND endpoint = 'submit_shift_closure')
              );

            IF FOUND THEN
                IF jsonb_typeof(v_existing_payload) = 'object'
                   AND (
                       (v_existing_payload ? 'shift_id' AND v_existing_payload = v_payload)
                       OR (NOT v_existing_payload ? 'shift_id' AND v_existing_payload = v_closing_data)
                   ) THEN
                    RETURN COALESCE(
                        v_result,
                        jsonb_build_object(
                            'success', true,
                            'idempotent', true,
                            'request_id', trim(p_request_id)
                        )
                    );
                END IF;

                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'request_id_collision',
                    'message', 'Request ID gia usato con parametri diversi'
                );
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'Request ID gia usato da un altra operazione',
                'message', 'Request ID gia usato da un altra operazione'
            );
        END IF;
    END IF;

    IF p_final_counters IS NOT NULL THEN
        FOR v_counter_key, v_counter_value IN
            SELECT key, value
            FROM jsonb_each_text(p_final_counters)
        LOOP
            v_pistol_id := v_counter_key::bigint;
            v_final := v_counter_value::numeric;

            UPDATE public.shift_pistols
            SET closed_at_counter = v_final,
                liters_dispensed = v_final - opened_at_counter,
                updated_at = now()
            WHERE shift_id = p_shift_id
              AND pistola_id = v_pistol_id;

            UPDATE public.pistole
            SET numero_litri = v_final
            WHERE id = v_pistol_id;
        END LOOP;
    END IF;

    IF p_tank_usage IS NOT NULL AND jsonb_array_length(p_tank_usage) > 0 THEN
        INSERT INTO public.tank_pump_usages (
            shift_id,
            station_id,
            pump_id,
            tank_id,
            liters,
            mode,
            ratio
        )
        SELECT
            p_shift_id,
            p_station_id,
            (item ->> 'pump_id')::bigint,
            (item ->> 'tank_id')::bigint,
            (item ->> 'liters')::numeric,
            item ->> 'mode',
            NULLIF(item ->> 'ratio', '')::numeric
        FROM jsonb_array_elements(p_tank_usage) AS item;
    END IF;

    UPDATE public.shifts
    SET closing_data = v_closing_data,
        status = CASE WHEN v_is_final THEN 'closed' ELSE 'partial' END,
        closed_at = CASE WHEN v_is_final THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = p_shift_id;

    v_result := jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'closure_stage', CASE WHEN v_is_final THEN 'final' ELSE 'partial' END
    );

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'submit_shift_closure';
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text)
    TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Manual staging verification:
-- 1. Close a shift with request_id X: success, marker payload contains
--    shift_id/station_id.
-- 2. Replay the identical call with X: identical cached response, no side
--    effects repeated.
-- 3. Call with X but a different shift_id (or altered closing_data):
--    success=false, error=request_id_collision, target shift untouched.
-- 4. Marker written before this migration (payload without shift_id key):
--    identical replay still returns the cached response.
