-- Migration: Issue #312 — Revoke direct UPDATE on shifts and shift_pistols
--
-- What it does:
-- 1. Revokes UPDATE privilege for authenticated on shifts and shift_pistols
-- 2. Keeps SELECT for authenticated (read-only via REST)
-- 3. All writes must go through RPC (open_shift, submit_shift_closure_v2, etc.)
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

-- Revoke UPDATE on shifts for authenticated
REVOKE UPDATE ON public.shifts FROM authenticated;
-- Keep SELECT (read-only via REST)
GRANT SELECT ON public.shifts TO authenticated;

-- Revoke UPDATE on shift_pistols for authenticated
REVOKE UPDATE ON public.shift_pistols FROM authenticated;
-- Keep SELECT (read-only via REST)
GRANT SELECT ON public.shift_pistols TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
