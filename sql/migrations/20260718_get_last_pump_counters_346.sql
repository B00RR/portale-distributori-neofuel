-- Migration: fetch last closure counter per pump server-side
-- Resolves: #346
--
-- ShiftOpener currently loads every historical shift_pistols row with a non-null
-- closed_at_counter, orders by created_at DESC, and deduplicates in the browser.
-- As the station history grows, this fetches increasingly more data than needed.
--
-- This migration adds a narrow RPC `get_last_pump_counters(p_station_id)` that
-- returns the most recent `closed_at_counter` for each configured pump at the
-- station, letting the client request exactly one row per pump.
--
-- Downtime: brief lock while creating the partial index.
-- Data backfill: none.
-- NOTE: PostgREST schema cache reload is performed manually from the dashboard
-- after deployment.

BEGIN;

-- Partial index that covers exactly the RPC lookup:
-- one row per (pistola_id, created_at DESC) where a closure counter exists.
CREATE INDEX IF NOT EXISTS idx_shift_pistols_pistola_closed_created
ON public.shift_pistols (pistola_id, created_at DESC)
WHERE closed_at_counter IS NOT NULL;

-- Drop legacy broad index if the new partial index supersedes it.
-- The previous index (pistola_id, created_at DESC) without the WHERE clause
-- was used by the client-side deduplication query; the RPC makes it redundant
-- for shift opening lookups.
DROP INDEX IF EXISTS public.idx_shift_pistols_pistola_created;

-- RPC: return the last closed counter for every pump belonging to a station.
-- Uses DISTINCT ON over shift_pistols joined to shifts so we only consider
-- closed shifts (closed_at IS NOT NULL) and avoid reading counters from
-- still-open or half-closed turns.
CREATE OR REPLACE FUNCTION public.get_last_pump_counters(
    p_station_id integer
)
RETURNS TABLE (
    pistola_id integer,
    closed_at_counter numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path TO ''
AS $$
    SELECT DISTINCT ON (sp.pistola_id)
        sp.pistola_id,
        sp.closed_at_counter
    FROM public.shift_pistols sp
    JOIN public.shifts s ON s.id = sp.shift_id
    WHERE s.station_id = p_station_id
      AND s.closed_at IS NOT NULL
      AND sp.closed_at_counter IS NOT NULL
    ORDER BY sp.pistola_id, sp.created_at DESC;
$$;

-- Permissions: keep the function callable only by authenticated users.
-- The function is SECURITY INVOKER so it respects RLS on the underlying tables.
REVOKE ALL ON FUNCTION public.get_last_pump_counters(integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_last_pump_counters(integer)
    TO authenticated;

COMMIT;
