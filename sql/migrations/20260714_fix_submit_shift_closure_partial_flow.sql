-- Migration: keep partial shifts finalizable and synchronize pistol counters
-- Created: 2026-07-14
--
-- A partial closure intentionally leaves closed_at NULL and status = 'partial'.
-- The same locked shift can therefore be reopened and finalized later. Counter
-- values are validated against both the opening value and any value already
-- recorded by a previous partial closure before both counter stores are updated.
-- Downtime: brief locks while the shifts status constraint is replaced.
-- Data backfill: none.

BEGIN;

-- The live constraint historically allowed only open/closed. Validate the live
-- data before extending it so the RPC can persist the intentional partial state.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.shifts
        WHERE status IS NULL
           OR status NOT IN ('open', 'partial', 'closed')
    ) THEN
        RAISE EXCEPTION 'Cannot extend shifts_status_check: unsupported shifts.status values found';
    END IF;
END
$$;

ALTER TABLE public.shifts
    DROP CONSTRAINT IF EXISTS shifts_status_check;

ALTER TABLE public.shifts
    ADD CONSTRAINT shifts_status_check
    CHECK (status IN ('open', 'partial', 'closed'))
    NOT VALID;

ALTER TABLE public.shifts
    VALIDATE CONSTRAINT shifts_status_check;

CREATE OR REPLACE FUNCTION public.submit_shift_closure(
    p_shift_id bigint,
    p_station_id integer,
    p_closing_data jsonb,
    p_is_final boolean,
    p_final_counters jsonb,
    p_tank_usage jsonb,
    p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

    -- A completed request must remain replayable even after the shift is final.
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT response
        INTO v_result
        FROM public.processed_requests
        WHERE request_id = trim(p_request_id)
          AND (
              action_type = 'submit_shift_closure'
              OR (action_type IS NULL AND endpoint = 'submit_shift_closure')
          );

        IF FOUND THEN
            RETURN COALESCE(
                v_result,
                jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'request_id', trim(p_request_id)
                )
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
            v_closing_data,
            NULL,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            SELECT response
            INTO v_result
            FROM public.processed_requests
            WHERE request_id = trim(p_request_id)
              AND (
                  action_type = 'submit_shift_closure'
                  OR (action_type IS NULL AND endpoint = 'submit_shift_closure')
              );

            IF FOUND THEN
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
-- 1. Assigned operator submits partial counters: status=partial, closed_at=NULL,
--    and both shift_pistols/pistole contain the same counter.
-- 2. Reopen the same shift and submit a greater final counter: status=closed.
-- 3. Retry each request_id: identical success, no repeated side effects.
-- 4. Submit a counter below the prior partial value: success=false.
-- 5. Unassigned operator and anon calls: Unauthorized / EXECUTE denied.
