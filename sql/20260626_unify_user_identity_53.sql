-- Migration: Unify User Identity Resolver
-- Resolves: #53
-- Description: Standardizes user identity lookup on current_user_id() returning integer.
-- Makes get_current_user_id() a thin wrapper/alias returning bigint via cast.
-- Redefines is_admin() and is_station_operator() to use current_user_id().
-- Ensures all functions are SECURITY DEFINER and have SET search_path = public, pg_temp.
-- Requires Downtime: No
-- Data Backfill: No

BEGIN;

-- 1. Standardize public.current_user_id() to lookup users.user_id via created_by_auth = auth.uid()
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.users
  WHERE created_by_auth = auth.uid()
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

-- 2. Make get_current_user_id() a thin wrapper/compatibility alias that calls current_user_id()
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.current_user_id()::bigint;
END;
$$;

-- 3. Redefine is_admin() using current_user_id() and keeping ('admin', 'super_admin') roles.
-- Checked codebase and update_rbac_roles.sql: the existing version checks for 'admin' and 'super_admin' roles,
-- so we preserve both roles for backward compatibility.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = public.current_user_id()
    AND role IN ('admin', 'super_admin')
  ) INTO v_is_admin;
  RETURN v_is_admin;
END;
$$;

-- 4. Redefine is_station_operator() to enforce correct search path and use the updated is_admin()
CREATE OR REPLACE FUNCTION public.is_station_operator(station_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Admin has access to all stations
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- Operator must belong to the station.
  -- For now, we assume operators can access the station if they are authenticated.
  RETURN auth.role() = 'authenticated';
END;
$$;

COMMIT;
