-- Migration: clean up test fuel stations before beta
-- Resolves: ad-hoc cleanup for beta testing
-- Author: Hermes Agent
-- Created: 2026-07-16
--
-- Description:
--   Deletes test distributors (Avellino, Morra De Sanctis, Napoli,
--   Frattamaggiore) while keeping Sant'Antimo (station_id = 12).
--   Removes all linked configuration and operational test data for the
--   targeted stations only. Leaves Sant'Antimo and any unrelated rows untouched.
--
-- Downtime: none. Runs as a single transaction.
-- Data backfill: none. All deleted rows are test data.
--
-- Safety guards:
--   - Hardcoded keep_station_id = 12.
--   - Every DELETE is scoped to station_id IN (13, 16, 17, 18).
--   - The script will abort if any shift is currently open in the target set.

BEGIN;

DO $$
DECLARE
  keep_station_id CONSTANT integer := 12;
  target_station_ids integer[] := ARRAY[13, 16, 17, 18];
BEGIN
  -- Safety guard: never delete the keep station.
  IF keep_station_id = ANY(target_station_ids) THEN
    RAISE EXCEPTION 'keep_station_id (%) must not be in target_station_ids', keep_station_id;
  END IF;

  -- Safety guard: do not proceed if a target station has an open shift.
  IF EXISTS (
    SELECT 1
    FROM public.shifts
    WHERE station_id = ANY(target_station_ids)
      AND status <> 'closed'
  ) THEN
    RAISE EXCEPTION 'Cannot delete test stations: at least one target shift is still open';
  END IF;
END $$;

-- 1. Station-user assignments (cascade delete exists, but explicit is safer)
DELETE FROM public.user_stations
WHERE station_id IN (13, 16, 17, 18);

-- 2. Credit movements and credit customers (test-only rows)
DELETE FROM public.crediti_movimenti
WHERE station_id IN (13, 16, 17, 18);

DELETE FROM public.crediti_clienti
WHERE station_id IN (13, 16, 17, 18);

-- 3. Cash movements linked to test stations
DELETE FROM public.movimenti_cassa
WHERE station_id IN (13, 16, 17, 18);

-- 4. Tank/pistol usages (cascade via shift_id already removes these when shifts go,
--    but we make the cleanup explicit and order-independent)
DELETE FROM public.tank_pump_usages
WHERE station_id IN (13, 16, 17, 18);

-- 5. Tank/pistol configuration links
DELETE FROM public.tank_pump_links
WHERE station_id IN (13, 16, 17, 18);

-- 6. Shift pistol counters / historical counters
DELETE FROM public.shift_pistols sp
WHERE sp.shift_id IN (
  SELECT id FROM public.shifts WHERE station_id IN (13, 16, 17, 18)
);

-- 7. Shifts (closed test shifts)
DELETE FROM public.shifts
WHERE station_id IN (13, 16, 17, 18);

-- 8. Tanks
DELETE FROM public.tanks
WHERE station_id IN (13, 16, 17, 18);

-- 9. Pistols (islands have CASCADE, but explicit keeps order clear)
DELETE FROM public.pistole
WHERE station_id IN (13, 16, 17, 18);

-- 10. Islands
DELETE FROM public.islands
WHERE station_id IN (13, 16, 17, 18);

-- 11. Distributor prices
DELETE FROM public.prezzi_distributore
WHERE station_id IN (13, 16, 17, 18);

-- 12. Vouchers and batches linked to test stations
DELETE FROM public.vouchers
WHERE station_id IN (13, 16, 17, 18);

DELETE FROM public.voucher_batches
WHERE station_id IN (13, 16, 17, 18);

-- 13. Deprecated opening/closing shift tables (if any test rows exist)
DELETE FROM public.closing_shift_deprecated
WHERE station_id IN (13, 16, 17, 18);

DELETE FROM public.opening_shift_deprecated
WHERE station_id IN (13, 16, 17, 18);

-- 14. Invoice requests and invoices (none currently exist, but keep cleanup complete)
DELETE FROM public.invoice_requests
WHERE station_id IN (13, 16, 17, 18);

DELETE FROM public.invoices
WHERE station_id IN (13, 16, 17, 18);

-- 15. Finally delete the test fuel stations themselves
DELETE FROM public.fuel_stations
WHERE station_id IN (13, 16, 17, 18);

COMMIT;
