-- Migration: Issue #357 — Daily reconciliation RPC
--
-- What it does:
-- 1. Creates public.get_daily_reconciliation RPC to aggregate daily financial data for a station.
-- 2. Calculates expected/real cash, discrepancies, POS/fleet totals, vouchers, credits, and outflows.
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

DROP FUNCTION IF EXISTS public.get_daily_reconciliation(integer, date);
DROP FUNCTION IF EXISTS public.get_daily_reconciliation(integer);
DROP FUNCTION IF EXISTS public.get_daily_reconciliation(bigint, date);
DROP FUNCTION IF EXISTS public.get_daily_reconciliation(bigint);

CREATE OR REPLACE FUNCTION public.get_daily_reconciliation(
    p_station_id integer,
    p_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id bigint;
    v_is_admin boolean;
    v_shifts jsonb;
    v_extra_incomes jsonb;
    v_outflows jsonb;
    v_vouchers jsonb;
    v_credits jsonb;
    v_fuel_revenue numeric := 0;
    v_extra_revenue numeric := 0;
    v_total_sold numeric := 0;
    v_expected_cash numeric := 0;
    v_real_cash numeric := 0;
    v_discrepancy numeric := 0;
    v_pos_total numeric := 0;
    v_fleet_total numeric := 0;
    v_vouchers_total numeric := 0;
    v_credits_total numeric := 0;
    v_outflows_total numeric := 0;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Get current user details via security definer functions
    v_user_id := public.current_user_id()::bigint;
    v_is_admin := public.is_admin();

    -- Authorization check: admin or station operators only
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1 FROM public.user_stations us
        WHERE us.user_id = v_user_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Fetch shifts of the day
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'opened_at', s.opened_at,
            'closed_at', s.closed_at,
            'operator_id', s.operator_id,
            'operator_name', u.full_name,
            'status', s.status,
            'closing_data', s.closing_data
        ) ORDER BY s.closed_at ASC
    ), '[]'::jsonb)
    INTO v_shifts
    FROM public.shifts s
    LEFT JOIN public.users u ON u.user_id = s.operator_id
    WHERE s.station_id = p_station_id
      AND s.closed_at::date = p_date
      AND s.status = 'closed';

    -- Fetch movements of type incasso (extra incomes)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', m.id,
            'created_at', m.created_at,
            'descrizione', m.descrizione,
            'importo', m.importo,
            'payment_method', m.payment_method,
            'operator_id', m.operator_id,
            'operator_name', u.full_name
        ) ORDER BY m.created_at ASC
    ), '[]'::jsonb)
    INTO v_extra_incomes
    FROM public.movimenti_cassa m
    LEFT JOIN public.users u ON u.user_id = m.operator_id
    WHERE m.station_id = p_station_id
      AND m.created_at::date = p_date
      AND m.tipo = 'incasso';

    -- Fetch movements of type uscita (outflows)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', m.id,
            'created_at', m.created_at,
            'descrizione', m.descrizione,
            'importo', m.importo,
            'payment_method', m.payment_method,
            'operator_id', m.operator_id,
            'operator_name', u.full_name
        ) ORDER BY m.created_at ASC
    ), '[]'::jsonb)
    INTO v_outflows
    FROM public.movimenti_cassa m
    LEFT JOIN public.users u ON u.user_id = m.operator_id
    WHERE m.station_id = p_station_id
      AND m.created_at::date = p_date
      AND m.tipo = 'uscita';

    -- Fetch redeemed vouchers of the day
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', v.id,
            'code', v.code,
            'amount', v.amount,
            'redeemed_at', v.redeemed_at,
            'status', v.status,
            'redeemed_by', v.redeemed_by
        ) ORDER BY v.redeemed_at ASC
    ), '[]'::jsonb)
    INTO v_vouchers
    FROM public.vouchers v
    WHERE v.station_id = p_station_id
      AND v.redeemed_at::date = p_date
      AND v.status = 'redeemed';

    -- Fetch credit movements of the day
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', cm.id,
            'cliente_id', cm.cliente_id,
            'cliente_name', cc.cliente,
            'created_at', cm.created_at,
            'importo', cm.importo,
            'metodo', cm.metodo,
            'note', cm.note,
            'operator_id', cm.operator_id,
            'operator_name', u.full_name,
            'tipo', cm.tipo
        ) ORDER BY cm.created_at ASC
    ), '[]'::jsonb)
    INTO v_credits
    FROM public.crediti_movimenti cm
    LEFT JOIN public.crediti_clienti cc ON cc.id = cm.cliente_id
    LEFT JOIN public.users u ON u.user_id = cm.operator_id
    WHERE cm.station_id = p_station_id
      AND cm.created_at::date = p_date;

    -- Calculate Totals from closed shifts (financial snapshot)
    SELECT
        COALESCE(SUM((s.closing_data->'computed'->>'fuel_revenue')::numeric), 0),
        COALESCE(SUM((s.closing_data->'computed'->>'expected_cash')::numeric), 0),
        COALESCE(SUM((s.closing_data->'computed'->>'real_cash')::numeric), 0),
        COALESCE(SUM(
            COALESCE((s.closing_data->'computed'->'self'->>'pos')::numeric, 0) +
            COALESCE((s.closing_data->'computed'->'operator'->>'pos')::numeric, 0) +
            COALESCE((s.closing_data->'computed'->'extra_by_method'->>'pos')::numeric, 0) +
            COALESCE((s.closing_data->'computed'->'credit_payments'->>'pos')::numeric, 0)
        ), 0),
        COALESCE(SUM(
            COALESCE((s.closing_data->'computed'->'self'->>'fleet')::numeric, 0) +
            COALESCE((s.closing_data->'computed'->'operator'->>'fleet')::numeric, 0) +
            COALESCE((s.closing_data->'computed'->'extra_by_method'->>'uta_dkv_fine_mese')::numeric, 0) +
            COALESCE((s.closing_data->'computed'->'credit_payments'->>'uta_dkv_fine_mese')::numeric, 0)
        ), 0)
    INTO
        v_fuel_revenue,
        v_expected_cash,
        v_real_cash,
        v_pos_total,
        v_fleet_total
    FROM public.shifts s
    WHERE s.station_id = p_station_id
      AND s.closed_at::date = p_date
      AND s.status = 'closed';

    -- Other totals directly from the tables
    SELECT COALESCE(SUM(importo), 0) INTO v_extra_revenue
    FROM public.movimenti_cassa
    WHERE station_id = p_station_id AND created_at::date = p_date AND tipo = 'incasso';

    SELECT COALESCE(SUM(importo), 0) INTO v_outflows_total
    FROM public.movimenti_cassa
    WHERE station_id = p_station_id AND created_at::date = p_date AND tipo = 'uscita';

    SELECT COALESCE(SUM(amount), 0) INTO v_vouchers_total
    FROM public.vouchers
    WHERE station_id = p_station_id AND redeemed_at::date = p_date AND status = 'redeemed';

    SELECT COALESCE(SUM(importo), 0) INTO v_credits_total
    FROM public.crediti_clienti
    WHERE station_id = p_station_id AND created_at::date = p_date;

    v_total_sold := v_fuel_revenue + v_extra_revenue;
    v_discrepancy := v_expected_cash - v_real_cash;

    RETURN jsonb_build_object(
        'date', p_date::text,
        'station_id', p_station_id,
        'shifts', v_shifts,
        'totals', jsonb_build_object(
            'fuel_revenue', round(v_fuel_revenue, 2),
            'extra_revenue', round(v_extra_revenue, 2),
            'total_sold', round(v_total_sold, 2),
            'expected_cash', round(v_expected_cash, 2),
            'real_cash', round(v_real_cash, 2),
            'discrepancy', round(v_discrepancy, 2),
            'pos_total', round(v_pos_total, 2),
            'fleet_total', round(v_fleet_total, 2),
            'vouchers_total', round(v_vouchers_total, 2),
            'credits_total', round(v_credits_total, 2),
            'outflows_total', round(v_outflows_total, 2)
        ),
        'movements', jsonb_build_object(
            'extra_incomes', v_extra_incomes,
            'outflows', v_outflows,
            'vouchers', v_vouchers,
            'credits', v_credits
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_reconciliation(integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_reconciliation(integer, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
