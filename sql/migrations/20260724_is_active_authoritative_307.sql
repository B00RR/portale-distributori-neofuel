-- Migration: 20260724_is_active_authoritative_307.sql
-- Resolves Issue #307: Rendere `is_active` autorevole end-to-end (PostgREST pre-request hook + restrictive RLS policies)
-- Downtime required: None
-- Data backfill: None

BEGIN;

-- 1. Helper SQL function public.current_user_is_active()
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_is_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT COUNT(*), bool_or(is_active IS DISTINCT FROM false)
  INTO v_count, v_is_active
  FROM public.users
  WHERE created_by_auth = auth.uid();

  IF v_count = 1 THEN
    RETURN COALESCE(v_is_active, false);
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated, service_role;

-- 2. PostgREST pre-request hook function
CREATE OR REPLACE FUNCTION public.pgrst_pre_request_check()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Only enforce for authenticated non-service-role requests
  IF auth.role() = 'authenticated' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'profile_missing' USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.users
    WHERE created_by_auth = auth.uid();

    IF v_count = 0 THEN
      RAISE EXCEPTION 'profile_missing' USING ERRCODE = 'P0001';
    ELSIF v_count <> 1 THEN
      RAISE EXCEPTION 'profile_ambiguous' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.users
      WHERE created_by_auth = auth.uid()
        AND is_active IS FALSE
    ) THEN
      RAISE EXCEPTION 'account_inactive' USING ERRCODE = 'P0001';
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pgrst_pre_request_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pgrst_pre_request_check() TO anon, authenticated, service_role;

-- Register PostgREST pre-request hook
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.pgrst_pre_request_check';

-- Notify PostgREST to reload configuration and schema
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- 3. Apply Restrictive RLS policies to all public business tables (excluding public.users)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'apertura_turno_pistole_deprecated',
    'audit_logs',
    'calculation_logs',
    'calculation_modules',
    'calculation_tests',
    'calculation_versions',
    'chiusura_turno_pistole_deprecated',
    'clienti_fatturazione',
    'closing_shift_deprecated',
    'crediti_clienti',
    'crediti_movimenti',
    'customer_refunds',
    'daily_reconciliations',
    'fuel_stations',
    'invoice_requests',
    'invoices',
    'islands',
    'movimenti_cassa',
    'notifiche',
    'opening_shift_deprecated',
    'operator_menu_options',
    'pistole',
    'prezzi_distributore',
    'processed_requests',
    'punti_riscatti',
    'rate_limit_attempts',
    'shift_pistols',
    'shift_tanks',
    'shifts',
    'tank_pump_links',
    'tank_pump_usages',
    'tank_readings',
    'tanks',
    'targhe_cliente',
    'ui_settings',
    'user_dashboard_config',
    'user_stations',
    'voucher_batches',
    'vouchers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS enforce_active_user ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY enforce_active_user ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.current_user_is_active()) WITH CHECK (public.current_user_is_active())',
        t
      );
    END IF;
  END LOOP;
END $$;

-- 4. Ensure public.users is member of publication supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END $$;

COMMIT;
