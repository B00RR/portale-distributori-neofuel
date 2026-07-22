-- Migration: Issue #311 — Fix cross-station RLS on movimenti_cassa
--
-- What it does:
-- 1. Drops the old consolidated policies that had an unconstrained OR operator_id clause
-- 2. The correct policy movimenti_cassa_station_isolation (created in #387) remains active
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

-- Drop old consolidated policies that allow cross-station access
DROP POLICY IF EXISTS "consolidated_movimenti_cassa_select" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "consolidated_movimenti_cassa_insert" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "consolidated_movimenti_cassa_update" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "consolidated_movimenti_cassa_delete" ON public.movimenti_cassa;

-- Also drop any other legacy policy names that might exist
DROP POLICY IF EXISTS "Operators can read movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Operators can insert movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Admins can manage movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Admins can delete movements" ON public.movimenti_cassa;

NOTIFY pgrst, 'reload schema';

COMMIT;
