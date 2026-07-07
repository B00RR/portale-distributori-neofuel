-- Migration: validate final counters and update timestamp in submit_shift_closure
-- Issue references: schema audit 2026-07-07
-- Author: Hermes Agent
-- Created: 2026-07-07
-- Note: live DB does not have shift_closures table; closure data is stored on shifts.closing_data

BEGIN;

DROP FUNCTION IF EXISTS public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text);

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
SET search_path = public
AS $$
DECLARE
    v_shift shifts%ROWTYPE;
    v_sp shift_pistols%ROWTYPE;
    v_counter_key text;
    v_final numeric;
    v_opened numeric;
    v_result jsonb;
BEGIN
    -- Idempotency: if this request was already processed, return stored result.
    IF p_request_id IS NOT NULL THEN
        SELECT response INTO v_result
        FROM processed_requests
        WHERE request_id = p_request_id;

        IF FOUND THEN
            RETURN v_result;
        END IF;
    END IF;

    -- Load the shift
    SELECT * INTO v_shift
    FROM shifts
    WHERE id = p_shift_id AND station_id = p_station_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Turno non trovato');
    END IF;

    IF v_shift.status <> 'open' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Il turno non è aperto');
    END IF;

    -- Validate final counters if provided
    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) = 'object' THEN
        FOR v_sp IN
            SELECT * FROM shift_pistols WHERE shift_id = p_shift_id
        LOOP
            v_counter_key := v_sp.pistola_id::text;
            IF p_final_counters ? v_counter_key THEN
                v_final := (p_final_counters ->> v_counter_key)::numeric;
                v_opened := v_sp.opened_at_counter;

                IF v_final < v_opened THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'message', format('Contatore finale %s inferiore a quello di apertura (%s < %s)',
                                          v_counter_key, v_final, v_opened)
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- Update shift_pistols counters and timestamp
    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) = 'object' THEN
        FOR v_counter_key, v_final IN
            SELECT key, value::numeric
            FROM jsonb_each_text(p_final_counters)
        LOOP
            UPDATE shift_pistols
            SET
                closed_at_counter = v_final,
                updated_at = now()
            WHERE shift_id = p_shift_id
              AND pistola_id = v_counter_key::bigint;
        END LOOP;
    END IF;

    -- Mark shift as closed or partial and store closing data
    UPDATE shifts
    SET
        closing_data = p_closing_data,
        status = CASE WHEN p_is_final THEN 'closed' ELSE 'partial' END,
        closed_at = CASE WHEN p_is_final THEN now() ELSE closed_at END,
        updated_at = now()
    WHERE id = p_shift_id;

    v_result := jsonb_build_object('success', true, 'shift_id', p_shift_id);

    -- Record request idempotency if provided
    IF p_request_id IS NOT NULL THEN
        INSERT INTO processed_requests (request_id, action_type, payload, response, created_at)
        VALUES (p_request_id, 'submit_shift_closure', p_closing_data, v_result, now())
        ON CONFLICT (request_id) DO NOTHING;
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text) TO authenticated;

COMMIT;
