-- Migration: Harden submit_shift_closure authorization and race safety
-- Resolves: #213
-- Description:
--   The previous submit_shift_closure was SECURITY DEFINER but did not verify
--   that the caller is authorized to close the requested shift/station.
--   This migration adds:
--     1. SET search_path = public, pg_temp
--     2. auth.uid() / current_user_id() validation
--     3. Admin or assigned-station authorization
--     4. SELECT ... FOR UPDATE on the open shift to prevent race conditions
--     5. Idempotent p_request_id handling (rerunnable migration + runtime dedup)
-- Requires Downtime: No
-- Data Backfill: No

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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shift shifts%ROWTYPE;
    v_operator_id integer;
    v_sp shift_pistols%ROWTYPE;
    v_counter_key text;
    v_final numeric;
    v_opened numeric;
    v_result jsonb;
    v_request_inserted boolean;
BEGIN
    -- Caller must be authenticated and mapped to a local user
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();

    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Idempotency: if this request was already processed, return stored result.
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT response INTO v_result
        FROM public.processed_requests
        WHERE request_id = trim(p_request_id);

        IF FOUND THEN
            RETURN v_result;
        END IF;
    END IF;

    -- Load and lock the open shift (prevents concurrent closure races)
    SELECT * INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id
      AND station_id = p_station_id
      AND status = 'open'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Turno non trovato o non aperto');
    END IF;

    -- Authorization: admin can close any shift; operators only their assigned stations
    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Validate final counters if provided
    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) = 'object' THEN
        FOR v_sp IN
            SELECT * FROM public.shift_pistols WHERE shift_id = p_shift_id
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

    -- Insert idempotency marker before side effects to avoid duplicate closures on retry
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        INSERT INTO public.processed_requests (request_id, action_type, payload, response, created_at)
        VALUES (trim(p_request_id), 'submit_shift_closure', p_closing_data, NULL, now())
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            -- Another concurrent call won the race; fetch its stored response.
            SELECT response INTO v_result
            FROM public.processed_requests
            WHERE request_id = trim(p_request_id);
            RETURN COALESCE(v_result, jsonb_build_object('success', true, 'idempotent', true, 'request_id', trim(p_request_id)));
        END IF;
    END IF;

    -- Update shift_pistols counters and timestamp
    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) = 'object' THEN
        FOR v_counter_key, v_final IN
            SELECT key, value::numeric
            FROM jsonb_each_text(p_final_counters)
        LOOP
            UPDATE public.shift_pistols
            SET
                closed_at_counter = v_final,
                updated_at = now()
            WHERE shift_id = p_shift_id
              AND pistola_id = v_counter_key::bigint;
        END LOOP;
    END IF;

    -- Mark shift as closed or partial and store closing data
    UPDATE public.shifts
    SET
        closing_data = p_closing_data,
        status = CASE WHEN p_is_final THEN 'closed' ELSE 'partial' END,
        closed_at = CASE WHEN p_is_final THEN now() ELSE closed_at END,
        updated_at = now()
    WHERE id = p_shift_id;

    v_result := jsonb_build_object('success', true, 'shift_id', p_shift_id);

    -- Backfill stored response on the idempotency marker
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'submit_shift_closure';
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text) TO authenticated;

COMMIT;

-- Manual verification after applying on staging / approved DB window:
-- 1. \df public.submit_shift_closure  -> check SECURITY DEFINER, search_path, owner
-- 2. As unassigned operator: call submit_shift_closure(p_shift_id, p_station_id, ...) -> expect RAISE EXCEPTION 'Unauthorized'
-- 3. As admin or assigned operator: close a shift with p_request_id -> success
-- 4. Replay same p_request_id -> idempotent success with identical response
-- 5. Concurrent calls on same open shift: one wins, the other returns idempotent result
