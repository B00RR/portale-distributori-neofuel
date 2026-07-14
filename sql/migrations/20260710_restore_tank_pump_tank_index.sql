-- Performance fix: restore the index for the tank_pump_links.tank_id FK.
--
-- The unique index on (pump_id, tank_id) serves pump_id lookups through its
-- left-most prefix, but it cannot serve lookups, joins or cascades by tank_id
-- alone.
--
-- Downtime: a brief table lock; the live table is currently tiny.
-- Data backfill: none.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_tank_pump_tank
  ON public.tank_pump_links (tank_id);

COMMIT;
