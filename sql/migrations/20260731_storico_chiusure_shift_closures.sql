-- Migration: storico chiusure con tabella shift_closures e aggiornamento submit_shift_closure
-- Resolves: storico chiusure / shift redesign 2026-07-31
--
-- This migration:
--   1. Creates public.shift_closures as an append-only closure history table.
--   2. Replaces public.submit_shift_closure so that:
--        - partial -> insert a new shift_closures row and update shifts to status='partial'
--        - final   -> convert the latest partial closure of the shift to final
--                     (update its closure_type, closed_at and closing_data).
--                     If no partial closure exists, insert a final one.
--        - shifts.status, shifts.closed_at and shifts.closing_data are always
--          kept in sync with the latest closure for backward compatibility.
--   3. Keeps submit_shift_closure_v2 semantics untouched (it writes its own snapshot).
--   4. Adds idempotency via processed_requests on submit_shift_closure.
--
-- Downtime: none (CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION).
-- Data backfill: existing shifts get one legacy closure row only when next closure is recorded.

BEGIN;

-- ============================================================================
-- 1. Schema: append-only closure history
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shift_closures (
    id bigserial PRIMARY KEY,
    shift_id bigint NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    operator_id integer NOT NULL,
    closure_type text NOT NULL CHECK (closure_type IN ('partial', 'final')),
    closed_at timestamptz NOT NULL DEFAULT now(),
    closing_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    ALTER TABLE public.shift_closures ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS shift_closures_shift_id_idx
    ON public.shift_closures (shift_id);

CREATE INDEX IF NOT EXISTS shift_closures_closed_at_idx
    ON public.shift_closures (closed_at);

CREATE INDEX IF NOT EXISTS shift_closures_type_idx
    ON public.shift_closures (closure_type);

CREATE INDEX IF NOT EXISTS shift_closures_shift_closed_idx
    ON public.shift_closures (shift_id, closed_at DESC);

-- Trigger to keep updated_at in sync.
CREATE OR REPLACE FUNCTION public.set_shift_closures_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shift_closures_updated_at_trigger ON public.shift_closures;
CREATE TRIGGER shift_closures_updated_at_trigger
    BEFORE UPDATE ON public.shift_closures
    FOR EACH ROW
    EXECUTE FUNCTION public.set_shift_closures_updated_at();

-- ============================================================================
-- 2. RLS policies for shift_closures
-- ============================================================================

DROP POLICY IF EXISTS "shift_closures_select" ON public.shift_closures;
CREATE POLICY "shift_closures_select" ON public.shift_closures
    FOR SELECT
    USING (public.is_admin() OR EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = (
              SELECT s.station_id FROM public.shifts s WHERE s.id = shift_closures.shift_id
          )
    ));

DROP POLICY IF EXISTS "shift_closures_insert" ON public.shift_closures;
CREATE POLICY "shift_closures_insert" ON public.shift_closures
    FOR INSERT
    WITH CHECK (public.is_admin() OR EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = (
              SELECT s.station_id FROM public.shifts s WHERE s.id = shift_closures.shift_id
          )
    ));

DROP POLICY IF EXISTS "shift_closures_update" ON public.shift_closures;
CREATE POLICY "shift_closures_update" ON public.shift_closures
    FOR UPDATE
    USING (public.is_admin() OR EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = (
              SELECT s.station_id FROM public.shifts s WHERE s.id = shift_closures.shift_id
          )
    ))
    WITH CHECK (public.is_admin() OR EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = (
              SELECT s.station_id FROM public.shifts s WHERE s.id = shift_closures.shift_id
          )
    ));

DROP POLICY IF EXISTS "shift_closures_delete" ON public.shift_closures;
CREATE POLICY "shift_closures_delete" ON public.shift_closures
    FOR DELETE
    USING (public.is_admin());

-- Grants (no direct DELETE: deletions go through admin_delete_closure RPC)
GRANT SELECT, INSERT, UPDATE ON public.shift_closures TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.shift_closures_id_seq TO authenticated;

-- ============================================================================
-- 3. Replace submit_shift_closure (legacy 7-arg RPC)
-- ============================================================================

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
SET search_path = ''
AS $$
DECLARE
    v_shift public.shifts%ROWTYPE;
    v_operator_id integer;
    v_closure_id bigint;
    v_result jsonb;
    v_existing jsonb;
    v_request_inserted boolean;
    v_payload jsonb;
    v_fingerprint text;
    v_latest_closure public.shift_closures%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Idempotency
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT response
        INTO v_existing
        FROM public.processed_requests
        WHERE request_id = trim(p_request_id)
          AND action_type = 'submit_shift_closure';

        IF FOUND THEN
            RETURN COALESCE(
                v_existing,
                jsonb_build_object('success', true, 'idempotent', true, 'request_id', trim(p_request_id))
            );
        END IF;
    END IF;

    -- Authorize station access
    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Load shift
    SELECT *
    INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id
      AND station_id = p_station_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Turno non trovato');
    END IF;

    IF v_shift.status NOT IN ('open', 'partial') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Il turno non e aperto');
    END IF;

    -- Validate final counters if provided
    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) = 'object' THEN
        IF EXISTS (
            SELECT 1
            FROM public.shift_pistols sp
            WHERE sp.shift_id = p_shift_id
              AND (p_final_counters ->> sp.pistola_id::text)::numeric < sp.opened_at_counter
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Contatore finale inferiore a quello di apertura'
            );
        END IF;
    END IF;

    -- Persist final counters / side effects
    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) = 'object' THEN
        UPDATE public.shift_pistols sp
        SET closed_at_counter = (p_final_counters ->> sp.pistola_id::text)::numeric,
            liters_dispensed = (p_final_counters ->> sp.pistola_id::text)::numeric - sp.opened_at_counter,
            updated_at = now()
        WHERE sp.shift_id = p_shift_id
          AND p_final_counters ? sp.pistola_id::text;

        UPDATE public.pistole p
        SET numero_litri = (p_final_counters ->> p.id::text)::numeric,
            updated_at = now()
        WHERE p.id IN (
            SELECT (key)::bigint
            FROM jsonb_each_text(p_final_counters)
        );
    END IF;

    -- Apply tank usage side effects.
    IF p_tank_usage IS NOT NULL AND jsonb_typeof(p_tank_usage) = 'array' AND jsonb_array_length(p_tank_usage) > 0 THEN
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

    IF p_is_final THEN
        -- Final: convert the latest partial closure of this shift to final.
        SELECT *
        INTO v_latest_closure
        FROM public.shift_closures
        WHERE shift_id = p_shift_id
          AND closure_type = 'partial'
        ORDER BY closed_at DESC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.shift_closures
            SET closure_type = 'final',
                closed_at = now(),
                closing_data = p_closing_data,
                updated_at = now()
            WHERE id = v_latest_closure.id
            RETURNING id INTO v_closure_id;
        ELSE
            -- No partial row exists: insert a final one.
            INSERT INTO public.shift_closures (
                shift_id,
                operator_id,
                closure_type,
                closed_at,
                closing_data
            )
            VALUES (
                p_shift_id,
                v_operator_id,
                'final',
                now(),
                p_closing_data
            )
            RETURNING id INTO v_closure_id;
        END IF;

        UPDATE public.shifts
        SET closing_data = p_closing_data,
            status = 'closed',
            closed_at = now(),
            updated_at = now()
        WHERE id = p_shift_id;
    ELSE
        -- Partial: always append a new closure row.
        INSERT INTO public.shift_closures (
            shift_id,
            operator_id,
            closure_type,
            closed_at,
            closing_data
        )
        VALUES (
            p_shift_id,
            v_operator_id,
            'partial',
            now(),
            p_closing_data
        )
        RETURNING id INTO v_closure_id;

        UPDATE public.shifts
        SET closing_data = p_closing_data,
            status = 'partial',
            closed_at = NULL,
            updated_at = now()
        WHERE id = p_shift_id;
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'closure_id', v_closure_id
    );

    -- Record idempotency if provided
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        INSERT INTO public.processed_requests (
            request_id,
            action_type,
            payload,
            payload_fingerprint,
            response,
            created_at
        )
        VALUES (
            trim(p_request_id),
            'submit_shift_closure',
            jsonb_build_object(
                'shift_id', p_shift_id,
                'station_id', p_station_id,
                'closing_data', p_closing_data,
                'is_final', p_is_final,
                'final_counters', p_final_counters,
                'tank_usage', p_tank_usage
            ),
            md5(jsonb_build_object(
                'shift_id', p_shift_id,
                'station_id', p_station_id,
                'closing_data', p_closing_data,
                'is_final', p_is_final,
                'final_counters', p_final_counters,
                'tank_usage', p_tank_usage
            )::text),
            v_result,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            -- Concurrent call won; replay stored result.
            SELECT response
            INTO v_existing
            FROM public.processed_requests
            WHERE request_id = trim(p_request_id)
              AND action_type = 'submit_shift_closure';

            RETURN COALESCE(
                v_existing,
                jsonb_build_object('success', true, 'shift_id', p_shift_id, 'closure_id', v_closure_id)
            );
        END IF;
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
