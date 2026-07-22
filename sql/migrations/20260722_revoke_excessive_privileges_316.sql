-- Migration: Issue #316 — Revoke excessive PostgreSQL privileges for authenticated
--
-- What it does:
-- 1. Revokes TRUNCATE, TRIGGER, REFERENCES on all operational tables for authenticated
-- 2. Revokes DELETE on tables where direct delete is not needed
-- 3. Keeps only the minimum privileges required for each table
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

-- ==========================================
-- 1. Revoke TRUNCATE, TRIGGER, REFERENCES on ALL tables
-- ==========================================
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- ==========================================
-- 2. Revoke DELETE on tables where direct delete is not needed
--    (deletions go through RPC or admin-only)
-- ==========================================
REVOKE DELETE ON public.shifts FROM authenticated;
REVOKE DELETE ON public.shift_pistols FROM authenticated;
REVOKE DELETE ON public.movimenti_cassa FROM authenticated;
REVOKE DELETE ON public.vouchers FROM authenticated;
REVOKE DELETE ON public.crediti_clienti FROM authenticated;
REVOKE DELETE ON public.crediti_movimenti FROM authenticated;
REVOKE DELETE ON public.punti_riscatti FROM authenticated;
REVOKE DELETE ON public.invoices FROM authenticated;
REVOKE DELETE ON public.prezzi_distributore FROM authenticated;
REVOKE DELETE ON public.processed_requests FROM authenticated;
REVOKE DELETE ON public.tank_pump_usages FROM authenticated;
REVOKE DELETE ON public.tanks FROM authenticated;
REVOKE DELETE ON public.pistole FROM authenticated;
REVOKE DELETE ON public.islands FROM authenticated;

-- ==========================================
-- 3. Ensure SELECT is granted (read-only via REST)
-- ==========================================
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
