-- Migration: Delete all shift-related records in admin_delete_closure RPC
--
-- What it does:
-- 1. Recreates public.admin_delete_closure(closure_id bigint) with SECURITY DEFINER and SET search_path = ''
-- 2. Deletes from related tables referencing shifts(id) before deleting from shifts to prevent FK constraint violations:
--    - public.movimenti_cassa
--    - public.crediti_movimenti
--    - public.crediti_clienti
--    - public.vouchers
--    - public.punti_riscatti
--    - public.shift_pistols
--    - public.tank_pump_usages
--    - public.tank_readings
--    - public.shifts
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_delete_closure(closure_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.movimenti_cassa WHERE shift_id = closure_id;
  DELETE FROM public.crediti_movimenti WHERE shift_id = closure_id;
  DELETE FROM public.crediti_clienti WHERE shift_id = closure_id;
  DELETE FROM public.vouchers WHERE shift_id = closure_id;
  DELETE FROM public.punti_riscatti WHERE shift_id = closure_id;
  DELETE FROM public.shift_pistols WHERE shift_id = closure_id;
  DELETE FROM public.tank_pump_usages WHERE shift_id = closure_id;
  DELETE FROM public.tank_readings WHERE shift_id = closure_id;
  DELETE FROM public.shifts WHERE id = closure_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
