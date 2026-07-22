-- Migration: Issue #320 — Add max price limit to admin_update_price
--
-- What it does:
-- 1. Replaces admin_update_price to enforce max_price_limit from business_rules
-- 2. Rejects prices above the configured ceiling
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

-- Drop older version of the function to avoid overload conflict or ambiguity
-- with the new signature (which takes integer p_station_id and returns jsonb).
DROP FUNCTION IF EXISTS public.admin_update_price(bigint, numeric, numeric, timestamp with time zone);
DROP FUNCTION IF EXISTS public.admin_update_price(integer, numeric, numeric, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.admin_update_price(
    p_station_id integer,
    p_benzina numeric,
    p_gasolio numeric,
    p_data_validita timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_max_price numeric;
    v_result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Set safety max price limit (2.50 EUR/L)
    v_max_price := 2.5;

    -- Validate prices against ceiling
    IF p_benzina IS NOT NULL AND (p_benzina <= 0 OR p_benzina > v_max_price) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Prezzo benzina non valido o supera il tetto massimo di ' || round(v_max_price, 2));
    END IF;

    IF p_gasolio IS NOT NULL AND (p_gasolio <= 0 OR p_gasolio > v_max_price) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Prezzo gasolio non valido o supera il tetto massimo di ' || round(v_max_price, 2));
    END IF;

    INSERT INTO public.prezzi_distributore (station_id, prezzo_benzina, prezzo_gasolio, data_validita, modificato_da)
    VALUES (p_station_id, p_benzina, p_gasolio, p_data_validita, public.current_user_id())
    RETURNING jsonb_build_object('success', true, 'id', id) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_price(integer, numeric, numeric, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_price(integer, numeric, numeric, timestamp with time zone) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
