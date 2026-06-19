-- Security hardening for issue #40.
-- Verified against live Supabase project ahlmgafaurossyghimxc on 2026-06-19.
-- Production was authoritative when this migration was written; older sql/*.sql
-- files in this repository are historical and do not fully match the live DB.

BEGIN;

-- ---------------------------------------------------------------------------
-- Privileged RPCs must not be executable by anon.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_function regprocedure;
BEGIN
    FOREACH v_function IN ARRAY ARRAY[
        to_regprocedure('public.redeem_voucher_validated(text, integer, uuid)'),
        to_regprocedure('public.submit_shift_closure(uuid, integer, jsonb, boolean, jsonb, jsonb)'),
        to_regprocedure('public.create_credit_validated(integer, uuid, text, numeric, text, text)'),
        to_regprocedure('public.admin_update_price(bigint, numeric, numeric, timestamp with time zone)'),
        to_regprocedure('public.admin_delete_closure(bigint)'),
        to_regprocedure('public.admin_delete_user(uuid)'),
        to_regprocedure('public.admin_assign_station(uuid, bigint)')
    ]
    LOOP
        IF v_function IS NOT NULL THEN
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_function);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_function);
        END IF;
    END LOOP;
END;
$$;

-- The existing uuid signature is inconsistent with public.shifts.id (bigint).
-- Drop it after revoking anon, then create the callable bigint RPC below.
DROP FUNCTION IF EXISTS public.submit_shift_closure(uuid, integer, jsonb, boolean, jsonb, jsonb);

-- ---------------------------------------------------------------------------
-- Voucher redemption: derive the operator from auth.uid() and verify station
-- ownership server-side. The p_operator_id argument is kept for API
-- compatibility but is not trusted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_voucher_validated(
    p_voucher_code text,
    p_station_id integer,
    p_operator_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_voucher record;
    v_operator_id integer;
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
-- Shift closure: require auth, verify the shift belongs to the requested
-- station, and verify the caller is admin or assigned to that station.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_shift_closure(
    p_shift_id bigint,
    p_station_id integer,
    p_closing_data jsonb,
    p_is_final boolean,
    p_final_counters jsonb DEFAULT NULL::jsonb,
    p_tank_usage jsonb DEFAULT NULL::jsonb
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

GRANT EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_shift_closure(bigint, integer, jsonb, boolean, jsonb, jsonb) FROM anon;

-- Defense in depth for admin RPCs that already fail closed internally.
ALTER FUNCTION public.admin_update_price(bigint, numeric, numeric, timestamp with time zone)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_delete_closure(bigint)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_delete_user(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_assign_station(uuid, bigint)
  SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Remove permissive legacy policies that OR with scoped policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_read_all ON public.users;
DROP POLICY IF EXISTS "Operators can read movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Operators can insert movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Operators can read shifts" ON public.shifts;
DROP POLICY IF EXISTS "Operators can start shift" ON public.shifts;

DROP POLICY IF EXISTS operator_can_insert_shifts ON public.shifts;
CREATE POLICY operator_can_insert_shifts ON public.shifts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_stations us
      JOIN public.users u ON u.user_id = us.user_id
      WHERE u.created_by_auth = auth.uid()
        AND us.station_id = shifts.station_id
        AND shifts.operator_id = u.user_id
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view vouchers" ON public.vouchers;
CREATE POLICY "Authenticated users can view vouchers" ON public.vouchers
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_operator());

COMMIT;
