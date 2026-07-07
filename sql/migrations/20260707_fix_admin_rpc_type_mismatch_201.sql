-- Migration: Fix admin RPC type mismatches and authorization
-- Resolves: #201
-- Description:
--   Admin RPC functions were comparing users.user_id (integer) with auth.uid() (uuid),
--   causing PostgreSQL error 42883 "operator does not exist: integer = uuid".
--   This migration:
--     1. Fixes authorization checks in admin_* functions to use public.is_admin(),
--        which already resolves auth.uid() -> users.user_id correctly.
--     2. Changes admin_delete_user and admin_assign_station parameter p_user_id
--        from uuid to integer to match users.user_id / user_stations.user_id.
--     3. Hardens is_station_operator() to verify actual station assignment.
-- Requires Downtime: No
-- Data Backfill: No

BEGIN;

-- 1. admin_update_price: use is_admin() for authorization
CREATE OR REPLACE FUNCTION public.admin_update_price(
  p_station_id bigint,
  p_benzina numeric,
  p_gasolio numeric,
  p_data_validita timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_benzina < 0 OR p_gasolio < 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  INSERT INTO public.prezzi_distributore (
    station_id, prezzo_benzina, prezzo_gasolio, prezzo_gpl, prezzo_metano, data_validita
  )
  VALUES (p_station_id, p_benzina, p_gasolio, NULL, NULL, p_data_validita);
END;
$$;

-- 2. admin_delete_closure: use is_admin() for authorization
CREATE OR REPLACE FUNCTION public.admin_delete_closure(closure_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.shift_pistols WHERE shift_id = closure_id;
  DELETE FROM public.tank_pump_usages WHERE shift_id = closure_id;
  DELETE FROM public.shifts WHERE id = closure_id;
END;
$$;

-- 3. admin_delete_user: use is_admin() and integer user id to match schema
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.user_stations WHERE user_id = p_user_id;
  DELETE FROM public.users WHERE user_id = p_user_id;
END;
$$;

-- 4. admin_assign_station: use is_admin() and integer user id to match schema
CREATE OR REPLACE FUNCTION public.admin_assign_station(
  p_user_id integer,
  p_station_id bigint DEFAULT NULL::bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.user_stations WHERE user_id = p_user_id;

  IF p_station_id IS NOT NULL THEN
    INSERT INTO public.user_stations (user_id, station_id)
    VALUES (p_user_id, p_station_id);
  END IF;
END;
$$;

-- 5. Harden is_station_operator() to verify actual station assignment.
--    The previous fallback returned true for any authenticated user, which was
--    too permissive. Now operators must be assigned to the station (or be admin).
CREATE OR REPLACE FUNCTION public.is_station_operator(station_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    FROM public.user_stations
    WHERE user_id = v_user_id
      AND station_id = is_station_operator.station_id
  );
END;
$$;

COMMIT;
