-- Migration: Issue #344 — Server-side analytics aggregation with completeness metadata
--
-- What it does:
--   1. Creates public.get_analytics_aggregation(p_station_id, p_start_iso, p_end_exclusive_iso)
--      SECURITY DEFINER RPC that aggregates analytics (revenue, liters, payment splits)
--      from public.shift_closures in SQL instead of broad client-side reads.
--   2. Mirrors the previous client-side aggregation (js/admin/analytics-aggregation.ts:
--      aggregateShiftAnalytics + readPaymentTotals) so chart data is identical but
--      computed on the server, avoiding PostgREST row-limit truncation.
--   3. Creates public.get_sales_trend(p_station_id, p_start_iso, p_end_exclusive_iso)
--      SECURITY DEFINER RPC that returns per-day-per-station revenue for the dashboard
--      "andamento vendite" trend chart (previously a 30-day broad read aggregated client-side).
--   4. Both RPCs return completeness metadata (complete flag, row/day counts, range,
--      generated_at).
--   5. Adds an internal immutable helper public._analytics_safe_numeric(text) for robust
--      numeric coercion (non-numeric/empty -> NULL, mirroring toFiniteMetric -> 0).
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Internal immutable helper for safe numeric coercion.
--    Used only inside the aggregation function; not exposed to clients.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._analytics_safe_numeric(p_value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN p_value ~ '^[+-]?[0-9]+(\.[0-9]+)?$' THEN p_value::numeric
        ELSE NULL
    END;
$$;

REVOKE ALL ON FUNCTION public._analytics_safe_numeric(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._analytics_safe_numeric(text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Analytics aggregation RPC.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_analytics_aggregation(integer, text, text);
DROP FUNCTION IF EXISTS public.get_analytics_aggregation(integer, text);
DROP FUNCTION IF EXISTS public.get_analytics_aggregation(integer);

CREATE OR REPLACE FUNCTION public.get_analytics_aggregation(
    p_station_id integer DEFAULT NULL,
    p_start_iso text DEFAULT NULL,
    p_end_exclusive_iso text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id bigint;
    v_is_admin boolean;
    v_start timestamptz;
    v_end timestamptz;
    v_daily jsonb;
    v_totals jsonb;
    v_row_count bigint;
    v_day_count bigint;
BEGIN
    -- Auth guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_user_id := public.current_user_id()::bigint;
    v_is_admin := public.is_admin();

    -- Authorization: admins may aggregate any station (or the whole network);
    -- non-admins are strictly scoped to exactly one of their own stations.
    IF NOT v_is_admin THEN
        IF p_station_id IS NULL THEN
            RAISE EXCEPTION 'Unauthorized';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.user_stations us
            WHERE us.user_id = v_user_id
              AND us.station_id = p_station_id
        ) THEN
            RAISE EXCEPTION 'Unauthorized';
        END IF;
    END IF;

    v_start := COALESCE(p_start_iso::timestamptz, 'epoch'::timestamptz);
    v_end := COALESCE(p_end_exclusive_iso::timestamptz, now());

    WITH src AS (
        SELECT
            sc.closed_at,
            s.station_id,
            sc.closing_data,
            sc.closing_data->'scontrino_self' AS ss,
            sc.closing_data->'dettaglio_incasso' AS op
        FROM public.shift_closures sc
        JOIN public.shifts s ON s.id = sc.shift_id
        WHERE sc.closed_at >= v_start
          AND sc.closed_at < v_end
          AND (p_station_id IS NULL OR s.station_id = p_station_id)
    ),
    pay AS (
        SELECT
            src.closed_at,
            to_char(src.closed_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS day_key,
            COALESCE(public._analytics_safe_numeric(src.closing_data->>'ricavo_teorico'), 0) AS revenue,
            COALESCE(public._analytics_safe_numeric(src.closing_data->>'litri_benzina'), 0) AS liters_benzina,
            COALESCE(public._analytics_safe_numeric(src.closing_data->>'litri_gasolio'), 0) AS liters_gasolio,
            CASE
                WHEN (jsonb_typeof(src.ss) = 'object' AND src.ss ? 'banconote_incassate')
                  OR (jsonb_typeof(src.ss) = 'object' AND src.ss ? 'banconote_erogate')
                  OR (jsonb_typeof(src.op) = 'object' AND src.op ? 'contanti_operatore')
                THEN COALESCE(public._analytics_safe_numeric(src.ss->>'banconote_incassate'), 0)
                   - COALESCE(public._analytics_safe_numeric(src.ss->>'banconote_erogate'), 0)
                   + COALESCE(public._analytics_safe_numeric(src.op->>'contanti_operatore'), 0)
                ELSE COALESCE(public._analytics_safe_numeric(
                    COALESCE(src.closing_data->>'soldi_contanti', src.closing_data->>'incasso_contanti')
                ), 0)
            END AS contanti,
            CASE
                WHEN (jsonb_typeof(src.ss) = 'object' AND src.ss ? 'bancomat_erogati')
                  OR (jsonb_typeof(src.op) = 'object' AND src.op ? 'pos_operatore')
                THEN COALESCE(public._analytics_safe_numeric(src.ss->>'bancomat_erogati'), 0)
                   + COALESCE(public._analytics_safe_numeric(src.op->>'pos_operatore'), 0)
                ELSE COALESCE(public._analytics_safe_numeric(
                    COALESCE(src.closing_data->>'soldi_pos_totale', src.closing_data->>'incasso_pos')
                ), 0)
            END AS pos,
            CASE
                WHEN jsonb_typeof(src.op) = 'object' AND src.op ? 'crediti'
                THEN COALESCE(public._analytics_safe_numeric(src.op->>'crediti'), 0)
                ELSE COALESCE(public._analytics_safe_numeric(src.closing_data->>'soldi_crediti'), 0)
            END AS crediti,
            CASE
                WHEN jsonb_typeof(src.op) = 'object' AND src.op ? 'voucher'
                THEN COALESCE(public._analytics_safe_numeric(src.op->>'voucher'), 0)
                ELSE COALESCE(public._analytics_safe_numeric(src.closing_data->>'soldi_voucher'), 0)
            END AS voucher,
            CASE
                WHEN (jsonb_typeof(src.ss) = 'object' AND src.ss ? 'transazioni_uta')
                  OR (jsonb_typeof(src.op) = 'object' AND src.op ? 'uta_dkv_operatore')
                THEN COALESCE(public._analytics_safe_numeric(src.ss->>'transazioni_uta'), 0)
                   + COALESCE(public._analytics_safe_numeric(src.op->>'uta_dkv_operatore'), 0)
                ELSE COALESCE(public._analytics_safe_numeric(src.closing_data->>'incasso_uta_dkv'), 0)
            END AS uta_dkv,
            CASE
                WHEN jsonb_typeof(src.ss) = 'object' AND src.ss ? 'id_gestore'
                THEN COALESCE(public._analytics_safe_numeric(src.ss->>'id_gestore'), 0)
                ELSE COALESCE(public._analytics_safe_numeric(src.closing_data->>'incasso_id_gestore'), 0)
            END AS id_gestore
        FROM src
    ),
    daily_agg AS (
        SELECT
            day_key,
            COALESCE(SUM(revenue), 0) AS revenue,
            COALESCE(SUM(liters_benzina), 0) AS liters_benzina,
            COALESCE(SUM(liters_gasolio), 0) AS liters_gasolio,
            COUNT(*) AS row_count
        FROM pay
        GROUP BY day_key
    )
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'date', day_key,
                'revenue', revenue,
                'liters_benzina', liters_benzina,
                'liters_gasolio', liters_gasolio
            ) ORDER BY day_key
        ), '[]'::jsonb),
        COUNT(*)
    INTO v_daily, v_day_count
    FROM daily_agg;

    SELECT COUNT(*) INTO v_row_count FROM pay;

    SELECT jsonb_build_object(
        'benzina', COALESCE(SUM(liters_benzina), 0),
        'gasolio', COALESCE(SUM(liters_gasolio), 0),
        'contanti', COALESCE(SUM(contanti), 0),
        'pos', COALESCE(SUM(pos), 0),
        'crediti', COALESCE(SUM(crediti), 0),
        'voucher', COALESCE(SUM(voucher), 0),
        'utaDkv', COALESCE(SUM(uta_dkv), 0),
        'idGestore', COALESCE(SUM(id_gestore), 0),
        'revenue', COALESCE(SUM(revenue), 0)
    ) INTO v_totals
    FROM pay;

    RETURN jsonb_build_object(
        'daily', v_daily,
        'totals', v_totals,
        'metadata', jsonb_build_object(
            'complete', true,
            'row_count', v_row_count,
            'day_count', v_day_count,
            'start_iso', v_start::text,
            'end_exclusive_iso', v_end::text,
            'station_id', p_station_id,
            'generated_at', now()
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_aggregation(integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_aggregation(integer, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sales trend RPC (dashboard "andamento vendite" per day per station).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_sales_trend(integer, text, text);
DROP FUNCTION IF EXISTS public.get_sales_trend(integer, text);
DROP FUNCTION IF EXISTS public.get_sales_trend(integer);

CREATE OR REPLACE FUNCTION public.get_sales_trend(
    p_station_id integer DEFAULT NULL,
    p_start_iso text DEFAULT NULL,
    p_end_exclusive_iso text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id bigint;
    v_is_admin boolean;
    v_start timestamptz;
    v_end timestamptz;
    v_points jsonb;
    v_row_count bigint;
BEGIN
    -- Auth guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_user_id := public.current_user_id()::bigint;
    v_is_admin := public.is_admin();

    -- Authorization: admins may read any station (or the whole network);
    -- non-admins are strictly scoped to exactly one of their own stations.
    IF NOT v_is_admin THEN
        IF p_station_id IS NULL THEN
            RAISE EXCEPTION 'Unauthorized';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.user_stations us
            WHERE us.user_id = v_user_id
              AND us.station_id = p_station_id
        ) THEN
            RAISE EXCEPTION 'Unauthorized';
        END IF;
    END IF;

    v_start := COALESCE(p_start_iso::timestamptz, 'epoch'::timestamptz);
    v_end := COALESCE(p_end_exclusive_iso::timestamptz, now());

    SELECT COALESCE(jsonb_agg(t ORDER BY t.day_key, t.station_id), '[]'::jsonb)
    INTO v_points
    FROM (
        SELECT
            to_char(sc.closed_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS day_key,
            s.station_id,
            COALESCE(public._analytics_safe_numeric(sc.closing_data->>'ricavo_teorico'), 0) AS revenue
        FROM public.shift_closures sc
        JOIN public.shifts s ON s.id = sc.shift_id
        WHERE sc.closed_at >= v_start
          AND sc.closed_at < v_end
          AND (p_station_id IS NULL OR s.station_id = p_station_id)
        ORDER BY day_key, s.station_id
    ) t;

    SELECT COUNT(*) INTO v_row_count
    FROM public.shift_closures sc
    JOIN public.shifts s ON s.id = sc.shift_id
    WHERE sc.closed_at >= v_start
      AND sc.closed_at < v_end
      AND (p_station_id IS NULL OR s.station_id = p_station_id);

    RETURN jsonb_build_object(
        'points', v_points,
        'metadata', jsonb_build_object(
            'complete', true,
            'row_count', v_row_count,
            'start_iso', v_start::text,
            'end_exclusive_iso', v_end::text,
            'station_id', p_station_id,
            'generated_at', now()
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_trend(integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_trend(integer, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
