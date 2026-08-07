-- Migration: make shift opening atomic
-- Resolves: #254
--
-- This migration adds an idempotent unique partial index on public.shifts(station_id)
-- where closed_at IS NULL to ensure only one active shift can exist per station.
-- It also defines a transactional open_shift RPC function to atomically open a shift,
-- write pistol counters, and tank readings, using request_id idempotency.
-- Downtime: brief locks while creating the partial index.
-- Data backfill: none.

BEGIN;

-- Pre-check: verify no duplicate active shifts exist for any station
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.shifts
        WHERE closed_at IS NULL
        GROUP BY station_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot create unique index: Multiple active shifts found for a single station';
    END IF;
END
$$;

-- Create unique index to ensure at most one active shift per station
CREATE UNIQUE INDEX IF NOT EXISTS shifts_station_id_active_idx
ON public.shifts (station_id)
WHERE (closed_at IS NULL);

-- Create transactional shift opening function
CREATE OR REPLACE FUNCTION public.open_shift(
    p_station_id integer,
    p_opening_data jsonb,
    p_pistol_counters jsonb,
    p_tank_levels jsonb DEFAULT '{}'::jsonb,
    p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_operator_id integer;
    v_shift_id bigint;
    v_request_inserted boolean;
    v_result jsonb;
    v_existing_payload jsonb;
    v_key text;
    v_val_text text;
    v_pistol_id integer;
    v_counter_val numeric;
    v_tank_id integer;
    v_tank_val numeric;
    v_money_field text;
    v_money_field_type text;
    v_money_val numeric;
    v_cash_in numeric;
    v_cash_out numeric;
    v_normalized_opening_data jsonb;
BEGIN
    -- Authenticate user
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();

    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Validate p_station_id is a positive integer
    IF p_station_id IS NULL OR p_station_id <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_station_id',
            'message', 'ID stazione non valido o non positivo'
        );
    END IF;

    -- Validate that the station actually exists
    IF NOT EXISTS (
        SELECT 1
        FROM public.fuel_stations
        WHERE station_id = p_station_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'station_not_found',
            'message', 'Stazione non trovata'
        );
    END IF;

    -- Authorize user (operator or admin)
    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- A completed request must remain replayable.
    -- If a request is found in processed_requests with a NULL response, we return 'request_in_progress'.
    -- If the transaction subsequently aborts or rolls back, the entire database transaction is rolled back,
    -- which automatically removes this request's marker from processed_requests so it can be retried.
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT response, payload
        INTO v_result, v_existing_payload
        FROM public.processed_requests
        WHERE request_id = trim(p_request_id)
          AND (
              action_type = 'open_shift'
              OR (action_type IS NULL AND endpoint = 'open_shift')
          );

        IF FOUND THEN
            IF jsonb_typeof(v_existing_payload) = 'object'
               AND (v_existing_payload ->> 'station_id') = p_station_id::text
               AND (v_existing_payload ->> 'operator_id') = v_operator_id::text THEN
                IF v_result IS NULL THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'request_in_progress',
                        'message', 'La richiesta è in elaborazione o incompleta.'
                    );
                ELSE
                    RETURN v_result;
                END IF;
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'request_id_collision',
                    'message', 'Il codice richiesta è già stato utilizzato da un''altra operazione'
                );
            END IF;
        END IF;
    END IF;

    -- Validate input data shapes
    IF p_opening_data IS NULL OR jsonb_typeof(p_opening_data) <> 'object' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_opening_data',
            'message', 'I dati di apertura devono essere un oggetto JSON valido'
        );
    END IF;

    IF p_pistol_counters IS NULL OR jsonb_typeof(p_pistol_counters) <> 'object' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_pistol_counters',
            'message', 'I contatori delle pistole devono essere un oggetto JSON valido'
        );
    END IF;

    IF p_tank_levels IS NULL OR jsonb_typeof(p_tank_levels) <> 'object' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_tank_levels',
            'message', 'I livelli delle cisterne devono essere un oggetto JSON valido'
        );
    END IF;

    -- Validate opening_data money fields as finite non-negative numeric values when present
    FOREACH v_money_field IN ARRAY ARRAY['cash_in', 'cash_out', 'pos_amount', 'total_amount', 'uta_dkv_iscard'] LOOP
        v_money_field_type := jsonb_typeof(p_opening_data -> v_money_field);
        CONTINUE WHEN v_money_field_type IS NULL OR v_money_field_type = 'null';

        IF v_money_field_type <> 'number' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_field_type',
                'message', 'Il campo ' || v_money_field || ' deve essere un numero'
            );
        END IF;

        BEGIN
            v_money_val := (p_opening_data ->> v_money_field)::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_money_value',
                'message', 'Il campo ' || v_money_field || ' deve essere un valore numerico valido'
            );
        END;

        IF v_money_val IS NULL OR v_money_val < 0 OR v_money_val::text IN ('NaN', 'Infinity', '-Infinity') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_money_value',
                'message', 'Il campo ' || v_money_field || ' deve essere un numero reale non negativo'
            );
        END IF;
    END LOOP;

    -- Validate pistol counters key format first (supporting full positive signed int4 range)
    IF EXISTS (
        SELECT 1
        FROM jsonb_each_text(p_pistol_counters) AS counter(key, value)
        WHERE counter.key !~ '^[1-9][0-9]*$'
           OR length(counter.key) > 10
           OR (length(counter.key) = 10 AND counter.key > '2147483647')
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_pistol_id_format',
            'message', 'Gli ID delle pistole devono essere numeri interi positivi'
        );
    END IF;

    -- Validate tank levels key format first (supporting full positive signed int4 range)
    IF EXISTS (
        SELECT 1
        FROM jsonb_each_text(p_tank_levels) AS lvl(key, value)
        WHERE lvl.key !~ '^[1-9][0-9]*$'
           OR length(lvl.key) > 10
           OR (length(lvl.key) = 10 AND lvl.key > '2147483647')
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_tank_id_format',
            'message', 'Gli ID delle cisterne devono essere numeri interi positivi'
        );
    END IF;

    -- Validate that all pistols in p_pistol_counters belong to the station
    IF EXISTS (
        SELECT 1
        FROM jsonb_each_text(p_pistol_counters) AS counter(key, value)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.pistole p
            WHERE p.id = (counter.key)::integer
              AND (p.station_id = p_station_id OR p.island_id IN (
                  SELECT i.island_id FROM public.islands i WHERE i.station_id = p_station_id
              ))
        )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_pistol_id',
            'message', 'Una o più pistole fornite non appartengono a questa stazione'
        );
    END IF;

    -- Validate that all configured pistols for the station are supplied
    IF EXISTS (
        SELECT 1
        FROM public.pistole p
        WHERE (p.station_id = p_station_id OR p.island_id IN (
            SELECT i.island_id FROM public.islands i WHERE i.station_id = p_station_id
        ))
        AND NOT (p_pistol_counters ? (p.id)::text)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'missing_pistol_counters',
            'message', 'È necessario fornire i contatori per tutte le pistole della stazione'
        );
    END IF;

    -- Validate pistol counters values
    FOR v_key, v_val_text IN SELECT * FROM jsonb_each_text(p_pistol_counters) LOOP
        BEGIN
            v_counter_val := v_val_text::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_counter_value',
                'message', 'I contatori delle pistole devono essere valori numerici validi'
            );
        END;

        IF v_counter_val IS NULL OR v_counter_val < 0 OR v_counter_val::text IN ('NaN', 'Infinity', '-Infinity') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_counter_value',
                'message', 'I contatori delle pistole devono essere numeri reali non negativi'
            );
        END IF;
    END LOOP;

    -- Validate that all tanks in p_tank_levels belong to the station
    IF EXISTS (
        SELECT 1
        FROM jsonb_each_text(p_tank_levels) AS lvl(key, value)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.tanks t
            WHERE t.id = (lvl.key)::integer
              AND t.station_id = p_station_id
        )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_tank_id',
            'message', 'Una o più cisterne fornite non appartengono a questa stazione'
        );
    END IF;

    -- Validate that all configured tanks for the station are supplied
    IF EXISTS (
        SELECT 1
        FROM public.tanks t
        WHERE t.station_id = p_station_id
        AND NOT (p_tank_levels ? (t.id)::text)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'missing_tank_levels',
            'message', 'È necessario fornire i livelli per tutte le cisterne della stazione'
        );
    END IF;

    -- Validate tank level values
    FOR v_key, v_val_text IN SELECT * FROM jsonb_each_text(p_tank_levels) LOOP
        BEGIN
            v_tank_val := v_val_text::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_tank_level_value',
                'message', 'I livelli delle cisterne devono essere valori numerici validi'
            );
        END;

        IF v_tank_val IS NULL OR v_tank_val < 0 OR v_tank_val::text IN ('NaN', 'Infinity', '-Infinity') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_tank_level_value',
                'message', 'I livelli delle cisterne devono essere numeri reali non negativi'
            );
        END IF;
    END LOOP;

    -- Recalculate cash_in_minus_out server-side when cash fields are provided
    IF p_opening_data ? 'cash_in' AND p_opening_data ? 'cash_out' THEN
        v_cash_in := (p_opening_data ->> 'cash_in')::numeric;
        v_cash_out := (p_opening_data ->> 'cash_out')::numeric;
        v_normalized_opening_data := p_opening_data || jsonb_build_object('cash_in_minus_out', v_cash_in - v_cash_out);
    ELSE
        v_normalized_opening_data := p_opening_data;
    END IF;

    -- Prevent replay ID concurrent insertions. Store a payload containing station/opening/pistols/tanks.
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
            'open_shift',
            jsonb_build_object(
                'station_id', p_station_id,
                'operator_id', v_operator_id,
                'opening_data', p_opening_data,
                'pistol_counters', p_pistol_counters,
                'tank_levels', p_tank_levels
            ),
            NULL,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            SELECT response, payload
            INTO v_result, v_existing_payload
            FROM public.processed_requests
            WHERE request_id = trim(p_request_id)
              AND (
                  action_type = 'open_shift'
                  OR (action_type IS NULL AND endpoint = 'open_shift')
              );

            IF FOUND THEN
                IF jsonb_typeof(v_existing_payload) = 'object'
                   AND (v_existing_payload ->> 'station_id') = p_station_id::text
                   AND (v_existing_payload ->> 'operator_id') = v_operator_id::text THEN
                    IF v_result IS NULL THEN
                        RETURN jsonb_build_object(
                            'success', false,
                            'error', 'request_in_progress',
                            'message', 'La richiesta è in elaborazione o incompleta.'
                        );
                    ELSE
                        RETURN v_result;
                    END IF;
                ELSE
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'request_id_collision',
                        'message', 'Il codice richiesta è già stato utilizzato da un''altra operazione'
                    );
                END IF;
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'request_id_collision',
                'message', 'Il codice richiesta è già stato utilizzato da un''altra operazione'
            );
        END IF;
    END IF;

    -- Main transactional database changes
    -- 1. Insert into shifts, utilizing ON CONFLICT DO NOTHING to handle concurrency atomically.
    INSERT INTO public.shifts (
        station_id,
        operator_id,
        status,
        opened_at,
        opening_data
    )
    VALUES (
        p_station_id,
        v_operator_id,
        'open',
        now(),
        v_normalized_opening_data
    )
    ON CONFLICT (station_id) WHERE closed_at IS NULL DO NOTHING
    RETURNING id INTO v_shift_id;

    IF v_shift_id IS NULL THEN
        v_result := jsonb_build_object(
            'success', false,
            'error', 'active_shift_exists',
            'message', 'Esiste già un turno attivo per questa stazione'
        );

        IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
            UPDATE public.processed_requests
            SET response = v_result
            WHERE request_id = trim(p_request_id)
              AND action_type = 'open_shift';
        END IF;

        RETURN v_result;
    END IF;

    -- 2. Insert into shift_pistols (errors propagate, triggering transaction rollback)
    FOR v_key, v_val_text IN SELECT * FROM jsonb_each_text(p_pistol_counters) LOOP
        v_pistol_id := v_key::integer;
        v_counter_val := v_val_text::numeric;

        INSERT INTO public.shift_pistols (
            shift_id,
            pistola_id,
            opened_at_counter
        )
        VALUES (
            v_shift_id,
            v_pistol_id,
            v_counter_val
        );
    END LOOP;

    -- 3. Insert into tank_readings (errors propagate, triggering transaction rollback)
    FOR v_key, v_val_text IN SELECT * FROM jsonb_each_text(p_tank_levels) LOOP
        v_tank_id := v_key::integer;
        v_tank_val := v_val_text::numeric;

        INSERT INTO public.tank_readings (
            shift_id,
            tank_id,
            reading_type,
            liters
        )
        VALUES (
            v_shift_id,
            v_tank_id,
            'opening',
            v_tank_val
        );
    END LOOP;

    -- Return success response and store it in processed_requests
    v_result := jsonb_build_object(
        'success', true,
        'shift_id', v_shift_id
    );

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'open_shift';
    END IF;

    RETURN v_result;
END;
$$;

-- Revoke execute permissions from public/anon and grant only to authenticated
REVOKE ALL ON FUNCTION public.open_shift(integer, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_shift(integer, jsonb, jsonb, jsonb, text) TO authenticated;

-- MANUAL VERIFICATION CASES
--
-- 1. Malformed IDs:
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"abc": 100}'::jsonb,
--        '{}'::jsonb,
--        'req_test_1'
--    );
--    Expected response: {"success": false, "error": "invalid_pistol_id_format", "message": "Gli ID delle pistole devono essere numeri interi positivi"}
--
-- 2. Idempotent replay:
--    -- First execution (Success):
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_test_2'
--    );
--    -- Second execution (Replay):
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_test_2'
--    );
--    Expected response: Identical successful result from processed_requests.
--
-- 3. Cross-action collision:
--    -- Insert token used by another endpoint/action:
--    INSERT INTO public.processed_requests (request_id, action_type, response) VALUES ('req_collision_1', 'other_action', '{"success":true}'::jsonb);
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_collision_1'
--    );
--    Expected response: {"success": false, "error": "request_id_collision", "message": "Il codice richiesta è già stato utilizzato da un'altra operazione"}
--
-- 4. Concurrency (active shift exists):
--    -- Simulating concurrent request where execution is already in progress:
--    INSERT INTO public.processed_requests (request_id, action_type, response) VALUES ('req_concurrency_1', 'open_shift', NULL);
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_concurrency_1'
--    );
--    Expected response: {"success": false, "error": "request_in_progress", "message": "La richiesta è in elaborazione o incompleta."}
--
-- 5. All tanks required verification:
--    -- Simulating omitting levels for configured tanks:
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{}'::jsonb, -- Missing level for tank 10
--        'req_test_tanks_1'
--    );
--    Expected response: {"success": false, "error": "missing_tank_levels", "message": "È necessario fornire i livelli per tutte le cisterne della stazione"}
--
-- 6. Normalized cash difference verification:
--    -- Simulating a client that sends tampered cash_in_minus_out:
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100.00, "cash_out": 10.00, "pos_amount": 50.00, "total_amount": 160.00, "uta_dkv_iscard": 20.00, "cash_in_minus_out": 9999.00}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_test_cash_normalize'
--    );
--    Expected result: Shift is successfully created. In shifts table, opening_data -> 'cash_in_minus_out' is stored as 90.00 (recalculated server-side as 100.00 - 10.00), ignoring the tampered value.
--
-- 7. Two different request IDs racing on one station verification:
--    -- Request 1 (Opens shift successfully):
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_race_1'
--    );
--    -- Request 2 (Concurrent/subsequent race with a different request ID):
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_race_2'
--    );
--    Expected response for Request 2: {"success": false, "error": "active_shift_exists", "message": "Esiste già un turno attivo per questa stazione"}
--    Additionally, Request 2's failure response is persisted under its request ID 'req_race_2' in the processed_requests table.
--
-- 8. Same request_id used by another operator or station:
--    -- Step A: Operator 1 opens shift on Station 1:
--    -- (assuming v_operator_id = 1)
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_shared_id_1'
--    );
--    -- Step B: Same operator tries to use the same request_id on Station 2 (different station):
--    SELECT public.open_shift(
--        2,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"22": 100}'::jsonb,
--        '{"11": 1000}'::jsonb,
--        'req_shared_id_1'
--    );
--    Expected response for Step B: {"success": false, "error": "request_id_collision", "message": "Il codice richiesta è già stato utilizzato da un'altra operazione"}
--
--    -- Step C: Different operator tries to use the same request_id on Station 1:
--    -- (assuming client connects as operator 2)
--    SELECT public.open_shift(
--        1,
--        '{"cash_in": 100, "cash_out": 10, "pos_amount": 50, "total_amount": 160, "uta_dkv_iscard": 20}'::jsonb,
--        '{"20": 100}'::jsonb,
--        '{"10": 1000}'::jsonb,
--        'req_shared_id_1'
--    );
--    Expected response for Step C: {"success": false, "error": "request_id_collision", "message": "Il codice richiesta è già stato utilizzato da un'altra operazione"}

NOTIFY pgrst, 'reload schema';

COMMIT;
