-- Integrity fix: deleting a gun must never erase historical shift counters.
--
-- The previous foreign key used ON DELETE CASCADE, so deleting a pistole row
-- also deleted every related shift_pistols row and changed past closures and
-- exports. Historical references now block physical deletion.
--
-- Downtime: brief table lock while the foreign key is replaced.
-- Data backfill: none.

BEGIN;

-- Preflight: the replacement FK must be valid for all historical rows before
-- the current constraint is removed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.shift_pistols sp
    LEFT JOIN public.pistole p ON p.id = sp.pistola_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot replace shift_pistols_pistola_id_fkey: orphan pistol references found';
  END IF;
END
$$;

ALTER TABLE public.shift_pistols
  DROP CONSTRAINT IF EXISTS shift_pistols_pistola_id_fkey;

ALTER TABLE public.shift_pistols
  ADD CONSTRAINT shift_pistols_pistola_id_fkey
  FOREIGN KEY (pistola_id)
  REFERENCES public.pistole (id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.shift_pistols
  VALIDATE CONSTRAINT shift_pistols_pistola_id_fkey;

COMMIT;
