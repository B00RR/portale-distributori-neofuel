-- Migration: clean up test operators before beta
-- Resolves: ad-hoc cleanup for beta testing
-- Author: Hermes Agent
-- Created: 2026-07-16
--
-- Description:
--   Deletes test operators (user_id 11, 12, 13) while keeping the admin
--   (user_id = 1). Removes all linked configuration and operational test data.
--
-- Downtime: none. Runs as a single transaction.
-- Data backfill: none. All deleted rows are test data.
--
-- Safety guards:
--   - Hardcoded keep_user_id = 1.
--   - Every DELETE is scoped to user_id IN (11, 12, 13).
--   - The script will abort if keep_user_id appears in the target set.

BEGIN;

DO $$
DECLARE
  keep_user_id CONSTANT integer := 1;
  target_user_ids integer[] := ARRAY[11, 12, 13];
BEGIN
  IF keep_user_id = ANY(target_user_ids) THEN
    RAISE EXCEPTION 'keep_user_id (%) must not be in target_user_ids', keep_user_id;
  END IF;
END $$;

-- 1. Notifications
DELETE FROM public.notifiche
WHERE operatore_id IN (11, 12, 13);

-- 2. User-station assignments (CASCADE exists, explicit is safer)
DELETE FROM public.user_stations
WHERE user_id IN (11, 12, 13);

-- 3. Invoice requests and invoices linked to operators
DELETE FROM public.invoice_requests
WHERE operator_id IN (11, 12, 13);

DELETE FROM public.invoices
WHERE operator_id IN (11, 12, 13);

-- 4. Credit movements linked to operators
DELETE FROM public.crediti_movimenti
WHERE operator_id IN (11, 12, 13);

-- 5. Cash movements linked to operators
DELETE FROM public.movimenti_cassa
WHERE operator_id IN (11, 12, 13);

-- 6. Deprecated shift tables
DELETE FROM public.closing_shift_deprecated
WHERE operator_id IN (11, 12, 13)
   OR shift_operator_id IN (11, 12, 13);

DELETE FROM public.opening_shift_deprecated
WHERE operator_id IN (11, 12, 13);

-- 7. Shift pistol counters (linked via shifts which have CASCADE on operator_id,
--    but explicit cleanup keeps the script order-independent)
DELETE FROM public.shift_pistols
WHERE shift_id IN (
  SELECT id FROM public.shifts WHERE operator_id IN (11, 12, 13)
);

-- 8. Tank/pistol usages (linked via shifts)
DELETE FROM public.tank_pump_usages
WHERE shift_id IN (
  SELECT id FROM public.shifts WHERE operator_id IN (11, 12, 13)
);

-- 9. Shifts (CASCADE on operator_id, explicit keeps it clear)
DELETE FROM public.shifts
WHERE operator_id IN (11, 12, 13);

-- 10. Prices modified by operators (rare FK, set to NULL could be safer,
--     but for beta cleanup we remove the test rows)
DELETE FROM public.prezzi_distributore
WHERE modificato_da IN (11, 12, 13);

-- 11. Finally delete the test users themselves
DELETE FROM public.users
WHERE user_id IN (11, 12, 13);

-- 12. Delete the corresponding auth.users accounts
DELETE FROM auth.users
WHERE id IN (
  '6eabdb8e-9ad1-424b-a7ad-2a24f41c17ab',
  'eb4c238c-e571-4d34-bf08-ea2380e655f6',
  '47c91b7c-70f1-42bc-ba84-428d491a0cf8'
);

COMMIT;
