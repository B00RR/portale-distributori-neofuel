-- Integrity fix: deleting a gun must never erase historical shift counters.
--
-- The previous foreign key used ON DELETE CASCADE, so deleting a pistole row
-- also deleted every related shift_pistols row and changed past closures and
-- exports. Historical references now block physical deletion.
--
-- Downtime: brief table lock while the foreign key is replaced.
-- Data backfill: none.

BEGIN;

ALTER TABLE public.shift_pistols
  DROP CONSTRAINT IF EXISTS shift_pistols_pistola_id_fkey;

ALTER TABLE public.shift_pistols
  ADD CONSTRAINT shift_pistols_pistola_id_fkey
  FOREIGN KEY (pistola_id)
  REFERENCES public.pistole (id)
  ON DELETE RESTRICT;

COMMIT;
