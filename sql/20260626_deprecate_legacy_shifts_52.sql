-- Issue: #52
-- Resolves: GitHub issue #52 - Consolidate duplicate shift schema
-- Description: Renames legacy tables (opening_shift, closing_shift, apertura_turno_pistole, chiusura_turno_pistole) to *_deprecated.
-- Downtime Required: None
-- Data Backfill Required: None

ALTER TABLE IF EXISTS public.opening_shift RENAME TO opening_shift_deprecated;
ALTER TABLE IF EXISTS public.closing_shift RENAME TO closing_shift_deprecated;
ALTER TABLE IF EXISTS public.apertura_turno_pistole RENAME TO apertura_turno_pistole_deprecated;
ALTER TABLE IF EXISTS public.chiusura_turno_pistole RENAME TO chiusura_turno_pistole_deprecated;
