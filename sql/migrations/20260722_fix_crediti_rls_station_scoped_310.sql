-- Migration: Issue #310 — Crediti station-scoped e RPC-only
--
-- What it does:
-- 1. Enables RLS on crediti_clienti and crediti_movimenti (if not already enabled)
-- 2. Creates station-isolation policies for both tables
-- 3. Revokes direct DML for authenticated role on both tables
--
-- Requires downtime: No
-- Requires data backfill: No

BEGIN;

-- ==========================================
-- 1. RLS on crediti_clienti
-- ==========================================
ALTER TABLE public.crediti_clienti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crediti_clienti_station_isolation ON public.crediti_clienti;
CREATE POLICY crediti_clienti_station_isolation
    ON public.crediti_clienti
    FOR ALL
    TO authenticated
    USING (
        public.is_admin()
        OR station_id IN (
            SELECT us.station_id
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR station_id IN (
            SELECT us.station_id
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
        )
    );

-- ==========================================
-- 2. RLS on crediti_movimenti
-- ==========================================
ALTER TABLE public.crediti_movimenti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crediti_movimenti_station_isolation ON public.crediti_movimenti;
CREATE POLICY crediti_movimenti_station_isolation
    ON public.crediti_movimenti
    FOR ALL
    TO authenticated
    USING (
        public.is_admin()
        OR station_id IN (
            SELECT us.station_id
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR station_id IN (
            SELECT us.station_id
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
        )
    );

-- ==========================================
-- 3. Revoke direct DML for authenticated
-- ==========================================
REVOKE ALL ON public.crediti_clienti FROM PUBLIC, anon;
REVOKE ALL ON public.crediti_movimenti FROM PUBLIC, anon;

-- Re-grant SELECT to authenticated (read-only via REST, writes only via RPC)
GRANT SELECT ON public.crediti_clienti TO authenticated;
GRANT SELECT ON public.crediti_movimenti TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
