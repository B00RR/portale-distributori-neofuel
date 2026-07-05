-- Plan 032 / Issue #143 — request-id idempotency for offline financial RPCs.
--
-- IMPORTANT: draft migration only. Do NOT apply to production before manually
-- verifying the live function bodies/signatures in Supabase project
-- ahlmgafaurossyghimxc. The SQL below is based on the repo's latest documented
-- RPC bodies from sql/20260619_security_hardening_issue_40.sql, which may drift.
--
-- Goal: make retries with the same offline queue action id safe after the RPC
-- committed but the client lost the response.

BEGIN;

CREATE TABLE IF NOT EXISTS public.processed_requests (
    request_id text PRIMARY KEY,
    endpoint text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processed_requests_no_direct_access ON public.processed_requests;
CREATE POLICY processed_requests_no_direct_access
    ON public.processed_requests
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

REVOKE ALL ON TABLE public.processed_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.processed_requests FROM anon;
REVOKE ALL ON TABLE public.processed_requests FROM authenticated;

CREATE INDEX IF NOT EXISTS processed_requests_created_at_idx
    ON public.processed_requests (created_at);

-- ---------------------------------------------------------------------------
-- Voucher redemption: same behaviour as the current hardened RPC, with an
-- optional p_request_id guard inserted after auth/station/business validation
-- and before the first side effect.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_voucher_validated(
    p_voucher_code text,
    p_station_id integer,
    p_operator_id uuid,
    p_request_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_voucher record;
    v_operator_id integer;
    v_request_inserted boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT u.user_id
    INTO v_operator_id
    FROM public.users u
    WHERE u.created_by_auth = auth.uid()
    LIMIT 1;

    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT *
    INTO v_voucher
    FROM public.vouchers
    WHERE code = upper(trim(p_voucher_code))
       OR code LIKE upper(trim(p_voucher_code)) || '%'
    FOR UPDATE
    LIMIT 1;

    IF v_voucher IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher non trovato');
    END IF;

    IF v_voucher.status = 'redeemed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Voucher gia riscattato',
            'redeemed_at', v_voucher.redeemed_at
        );
    END IF;

    IF v_voucher.status = 'expired'
       OR (v_voucher.expiration_date IS NOT NULL AND v_voucher.expiration_date < current_date) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher scaduto');
    END IF;

    IF v_voucher.status = 'void' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher annullato');
    END IF;

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        INSERT INTO public.processed_requests (request_id, endpoint)
        VALUES (trim(p_request_id), 'redeem_voucher_validated')
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'request_id', trim(p_request_id)
            );
        END IF;
    END IF;

    UPDATE public.vouchers
    SET status = 'redeemed',
        redeemed_at = now(),
        redeemed_by = auth.uid(),
        station_id = COALESCE(station_id, p_station_id)
    WHERE id = v_voucher.id;

    INSERT INTO public.movimenti_cassa (station_id, operator_id, tipo, importo, descrizione, created_at)
    VALUES (
        p_station_id,
        v_operator_id,
        'voucher',
        v_voucher.amount,
        'Riscatto Voucher ' || v_voucher.code,
        now()
    );

    RETURN jsonb_build_object('success', true, 'amount', v_voucher.amount, 'code', v_voucher.code);
END;
$$;

-- ---------------------------------------------------------------------------
-- Shift closure: same behaviour as the current hardened RPC, with request-id
-- dedup before updates/inserts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_shift_closure(
    p_shift_id bigint,
    p_station_id integer,
    p_closing_data jsonb,
    p_is_final boolean,
    p_final_counters jsonb DEFAULT NULL::jsonb,
    p_tank_usage jsonb DEFAULT NULL::jsonb,
    p_request_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shift record;
    v_operator_id integer;
    v_pistol_id integer;
    v_counter numeric;
    v_request_inserted boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT u.user_id
    INTO v_operator_id
    FROM public.users u
    WHERE u.created_by_auth = auth.uid()
    LIMIT 1;

    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT *
    INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF v_shift IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Turno non trovato');
    END IF;

    IF v_shift.station_id <> p_station_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_shift.closed_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Turno gia chiuso');
    END IF;

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        INSERT INTO public.processed_requests (request_id, endpoint)
        VALUES (trim(p_request_id), 'submit_shift_closure')
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'request_id', trim(p_request_id)
            );
        END IF;
    END IF;

    UPDATE public.shifts
    SET closing_data = p_closing_data,
        status = CASE WHEN p_is_final THEN 'closed' ELSE 'open' END,
        closed_at = CASE WHEN p_is_final THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = p_shift_id;

    IF p_final_counters IS NOT NULL THEN
        FOR v_pistol_id, v_counter IN
            SELECT key::integer, value::numeric
            FROM jsonb_each_text(p_final_counters)
        LOOP
            UPDATE public.shift_pistols
            SET closed_at_counter = v_counter
            WHERE shift_id = p_shift_id
              AND pistola_id = v_pistol_id;

            IF p_is_final THEN
                UPDATE public.pistole
                SET numero_litri = v_counter
                WHERE id = v_pistol_id;
            END IF;
        END LOOP;
    END IF;

    IF p_tank_usage IS NOT NULL AND jsonb_typeof(p_tank_usage) = 'array' AND jsonb_array_length(p_tank_usage) > 0 THEN
        INSERT INTO public.tank_pump_usages (shift_id, station_id, pump_id, tank_id, liters, mode, ratio)
        SELECT
            p_shift_id,
            p_station_id,
            (item->>'pump_id')::integer,
            (item->>'tank_id')::integer,
            (item->>'liters')::numeric,
            item->>'mode',
            (item->>'ratio')::numeric
        FROM jsonb_array_elements(p_tank_usage) AS item;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb, text) FROM anon;

-- Avoid PostgREST overload ambiguity: the new signatures have defaults, so old
-- clients can still omit p_request_id while only one callable signature remains.
DROP FUNCTION IF EXISTS public.redeem_voucher_validated(text, integer, uuid);
DROP FUNCTION IF EXISTS public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb);

-- Ask PostgREST/Supabase to refresh its schema cache after the signature change.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Manual verification after applying on staging / approved DB window:
-- 1. Call each RPC once with a unique p_request_id and valid fixture data.
-- 2. Simulate a lost response by calling the same RPC again with the same
--    p_request_id.
-- 3. Verify the second response has success=true,idempotent=true and no duplicate
--    movimento/closure/tank usage rows were created.
-- 4. Verify a call without p_request_id still works for backwards compatibility.
