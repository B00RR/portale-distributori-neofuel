-- Migration: fix FK and type mismatches for tank_readings and pistole
-- Issue references: schema audit 2026-07-07
-- Author: Hermes Agent
-- Created: 2026-07-07

BEGIN;

-- ============================================================
-- 1. tank_readings.shift_id currently points to deprecated table
--    and uses integer instead of bigint.
-- ============================================================

ALTER TABLE public.tank_readings
  DROP CONSTRAINT IF EXISTS tank_readings_shift_id_fkey;

ALTER TABLE public.tank_readings
  ALTER COLUMN shift_id TYPE bigint USING shift_id::bigint;

ALTER TABLE public.tank_readings
  ADD CONSTRAINT tank_readings_shift_id_fkey
    FOREIGN KEY (shift_id) REFERENCES public.shifts(id)
    ON DELETE CASCADE;

-- ============================================================
-- 2. pistole.station_id is bigint while fuel_stations.station_id
--    is integer. Align to integer to keep FK types consistent.
-- ============================================================

ALTER TABLE public.pistole
  ALTER COLUMN station_id TYPE integer USING station_id::integer;

COMMIT;
