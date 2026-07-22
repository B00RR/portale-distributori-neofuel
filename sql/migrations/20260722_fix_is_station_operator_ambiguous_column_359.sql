-- Migration: fix ambiguous station_id column parameter in is_station_operator
-- Resolves: #359
--
-- What it does:
-- 1. Drops and recreates public.is_station_operator(bigint) with parameter p_station_id
--    to prevent PL/pgSQL error 42702 (ambiguous column reference) during RLS policy evaluation.
--
-- Requires downtime: No.
-- Requires data backfill: No.

BEGIN;

DROP POLICY IF EXISTS consolidated_prezzi_distributore_insert ON public.prezzi_distributore;
DROP FUNCTION IF EXISTS public.is_station_operator(bigint);

CREATE FUNCTION public.is_station_operator(p_station_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id integer;
BEGIN
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;

    v_user_id := public.current_user_id();

    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_user_id
          AND us.station_id = p_station_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_station_operator(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_station_operator(bigint) TO authenticated;

CREATE POLICY consolidated_prezzi_distributore_insert ON public.prezzi_distributore
FOR INSERT
TO authenticated
WITH CHECK (is_admin() OR is_station_operator((station_id)::bigint));

COMMIT;
