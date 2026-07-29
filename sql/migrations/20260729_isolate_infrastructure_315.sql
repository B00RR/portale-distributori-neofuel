-- Migration: issue #315 — Isolamento e policy fail-open dell'infrastruttura serbatoi
-- Description:
--   Replaces permissive/fail-open RLS policies on fuel_stations, islands,
--   pistole, tanks, tank_pump_links, tank_pump_usages and tank_readings with
--   station-scoped, admin-only management policies. Only tank_pump_usages keeps
--   a narrow operator INSERT path with cross-entity station coherence enforced.
--   Hardens every SECURITY DEFINER helper used by the final policies to use
--   SET search_path = '' and fully-qualified references.
-- Downtime: none.
-- Data backfill: none.

BEGIN;

-- ============================================================================
-- 0. HARDEN SECURITY DEFINER HELPERS USED BY FINAL POLICIES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = public.current_user_id()
      AND role IN ('admin', 'super_admin', 'full_admin')
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE created_by_auth = auth.uid()
      AND role IN ('operator', 'admin', 'super_admin', 'full_admin')
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_station_ids()
RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ARRAY(
    SELECT station_id
    FROM public.user_stations
    WHERE user_id = public.current_user_id()
  );
$$;

-- Policy subqueries run with the caller's RLS context. Resolve the shift
-- relation in a bounded helper so valid rows are not hidden by shifts RLS,
-- while still refusing probes for stations not assigned to the caller.
CREATE OR REPLACE FUNCTION public.shifts_match_current_user_station(
  p_shift_id bigint,
  p_station_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_station_id = ANY (public.current_user_station_ids())
    AND EXISTS (
      SELECT 1
      FROM public.shifts s
      WHERE s.id = p_shift_id
        AND s.station_id = p_station_id
    );
$$;

-- Preserve execute grants on helpers
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_operator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_station_ids() TO authenticated;
REVOKE ALL ON FUNCTION public.shifts_match_current_user_station(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shifts_match_current_user_station(bigint, bigint) TO authenticated;

-- ============================================================================
-- 1. FAIL-CLOSED PRE-CHECK: no existing cross-station conflicts
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pistole p
    JOIN public.islands i ON i.island_id = p.island_id
    WHERE p.station_id IS NOT NULL
      AND i.station_id IS NOT NULL
      AND p.station_id <> i.station_id
  ) THEN
    RAISE EXCEPTION 'Cannot harden pistole RLS: p.station_id conflicts with island.station_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tank_pump_links l
    JOIN public.tanks t ON t.id = l.tank_id
    JOIN public.pistole p ON p.id = l.pump_id
    LEFT JOIN public.islands i ON i.island_id = p.island_id
    WHERE l.station_id IS DISTINCT FROM t.station_id
       OR (i.station_id IS NOT NULL AND l.station_id IS DISTINCT FROM i.station_id)
  ) THEN
    RAISE EXCEPTION 'Cannot harden tank_pump_links RLS: station_id conflicts with tank or pump island';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tank_pump_usages u
    JOIN public.shifts s ON s.id = u.shift_id
    JOIN public.tanks t ON t.id = u.tank_id
    JOIN public.pistole p ON p.id = u.pump_id
    LEFT JOIN public.islands i ON i.island_id = p.island_id
    WHERE u.station_id IS DISTINCT FROM s.station_id
       OR u.station_id IS DISTINCT FROM t.station_id
       OR (i.station_id IS NOT NULL AND u.station_id IS DISTINCT FROM i.station_id)
  ) THEN
    RAISE EXCEPTION 'Cannot harden tank_pump_usages RLS: station_id conflicts with shift/tank/pump';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tank_readings r
    JOIN public.tanks t ON t.id = r.tank_id
    LEFT JOIN public.shifts s ON s.id = r.shift_id
    WHERE (s.id IS NOT NULL AND r.tank_id IS NOT NULL AND t.station_id IS DISTINCT FROM s.station_id)
  ) THEN
    RAISE EXCEPTION 'Cannot harden tank_readings RLS: tank.station_id conflicts with shift.station_id';
  END IF;
END $$;

-- ============================================================================
-- 2. REVOKE GRANTS on the seven infrastructure tables (table-by-table)
-- ============================================================================

REVOKE ALL ON public.fuel_stations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.islands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pistole FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tanks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tank_pump_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tank_pump_usages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tank_readings FROM PUBLIC, anon, authenticated;

-- Authenticated users receive only the core DML privileges that remain allowed
-- after migration #316. DELETE is intentionally NOT restored on islands,
-- pistole, tanks and tank_pump_usages because #316 revoked it permanently.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_stations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.islands TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pistole TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tanks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tank_pump_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tank_pump_usages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tank_readings TO authenticated;

-- ============================================================================
-- 3. FUEL_STATIONS — admin management + operator station-scoped SELECT
-- ============================================================================

DROP POLICY IF EXISTS "fuel_stations_admin_manage" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_operator_select" ON public.fuel_stations;
DROP POLICY IF EXISTS "consolidated_fuel_stations_select" ON public.fuel_stations;
DROP POLICY IF EXISTS "consolidated_fuel_stations_insert" ON public.fuel_stations;
DROP POLICY IF EXISTS "consolidated_fuel_stations_update" ON public.fuel_stations;
DROP POLICY IF EXISTS "consolidated_fuel_stations_delete" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_operators_select" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_admin_insert" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_operators_update" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_operators_delete" ON public.fuel_stations;

CREATE POLICY "fuel_stations_admin_manage"
    ON public.fuel_stations
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "fuel_stations_operator_select"
    ON public.fuel_stations
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR station_id = ANY (public.current_user_station_ids())
    );

-- ============================================================================
-- 4. ISLANDS — admin management + operator station-scoped SELECT
-- ============================================================================

DROP POLICY IF EXISTS "islands_admin_manage" ON public.islands;
DROP POLICY IF EXISTS "islands_operator_select" ON public.islands;
DROP POLICY IF EXISTS "islands_select_admin_or_operator" ON public.islands;
DROP POLICY IF EXISTS "islands_insert_admin_only" ON public.islands;
DROP POLICY IF EXISTS "islands_update_admin_only" ON public.islands;
DROP POLICY IF EXISTS "islands_delete_admin_only" ON public.islands;
DROP POLICY IF EXISTS "consolidated_islands_select" ON public.islands;
DROP POLICY IF EXISTS "islands_operators_select" ON public.islands;

CREATE POLICY "islands_admin_manage"
    ON public.islands
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "islands_operator_select"
    ON public.islands
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (station_id IS NOT NULL AND station_id = ANY (public.current_user_station_ids()))
    );

-- ============================================================================
-- 5. PISTOLE — admin management + operator SELECT via authoritative island
-- ============================================================================

DROP POLICY IF EXISTS "pistole_admin_manage" ON public.pistole;
DROP POLICY IF EXISTS "pistole_operator_select" ON public.pistole;
DROP POLICY IF EXISTS "consolidated_pistole_select" ON public.pistole;
DROP POLICY IF EXISTS "consolidated_pistole_insert" ON public.pistole;
DROP POLICY IF EXISTS "consolidated_pistole_update" ON public.pistole;
DROP POLICY IF EXISTS "consolidated_pistole_delete" ON public.pistole;
DROP POLICY IF EXISTS "pistole_operators_select" ON public.pistole;

CREATE POLICY "pistole_admin_manage"
    ON public.pistole
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "pistole_operator_select"
    ON public.pistole
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1
            FROM public.islands i
            WHERE i.island_id = pistole.island_id
              AND i.station_id = ANY (public.current_user_station_ids())
              AND (
                  pistole.station_id IS NULL
                  OR pistole.station_id = i.station_id
              )
        )
    );

-- ============================================================================
-- 6. TANKS — admin management + operator station-scoped SELECT
-- ============================================================================

DROP POLICY IF EXISTS "tanks_admin_manage" ON public.tanks;
DROP POLICY IF EXISTS "tanks_operator_select" ON public.tanks;
DROP POLICY IF EXISTS "Admins can manage tanks" ON public.tanks;
DROP POLICY IF EXISTS "Operators can read tanks" ON public.tanks;
DROP POLICY IF EXISTS "tanks_admins_manage" ON public.tanks;
DROP POLICY IF EXISTS "tanks_operators_select" ON public.tanks;
DROP POLICY IF EXISTS "tanks_operators_insert" ON public.tanks;
DROP POLICY IF EXISTS "tanks_operators_update" ON public.tanks;
DROP POLICY IF EXISTS "tanks_operators_delete" ON public.tanks;

CREATE POLICY "tanks_admin_manage"
    ON public.tanks
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "tanks_operator_select"
    ON public.tanks
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            station_id IS NOT NULL
            AND station_id = ANY (public.current_user_station_ids())
        )
    );

-- ============================================================================
-- 7. TANK_PUMP_LINKS — admin management + operator SELECT with FK coherence
-- ============================================================================

DROP POLICY IF EXISTS "tank_pump_links_admin_manage" ON public.tank_pump_links;
DROP POLICY IF EXISTS "tank_pump_links_operator_select" ON public.tank_pump_links;
DROP POLICY IF EXISTS "Admins can manage tank_pump_links" ON public.tank_pump_links;
DROP POLICY IF EXISTS "Operators can read tank_pump_links" ON public.tank_pump_links;
DROP POLICY IF EXISTS "tank_pump_links_operators_select" ON public.tank_pump_links;

CREATE POLICY "tank_pump_links_admin_manage"
    ON public.tank_pump_links
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "tank_pump_links_operator_select"
    ON public.tank_pump_links
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            station_id = ANY (public.current_user_station_ids())
            AND EXISTS (
                SELECT 1
                FROM public.tanks t
                WHERE t.id = tank_pump_links.tank_id
                  AND t.station_id = tank_pump_links.station_id
            )
            AND EXISTS (
                SELECT 1
                FROM public.pistole p
                JOIN public.islands i ON i.island_id = p.island_id
                WHERE p.id = tank_pump_links.pump_id
                  AND (
                      p.station_id IS NULL
                      OR p.station_id = tank_pump_links.station_id
                  )
                  AND i.station_id = tank_pump_links.station_id
            )
        )
    );

-- ============================================================================
-- 8. TANK_PUMP_USAGES — admin manage + operator SELECT + narrow INSERT
-- ============================================================================

DROP POLICY IF EXISTS "tank_pump_usages_admin_manage" ON public.tank_pump_usages;
DROP POLICY IF EXISTS "tank_pump_usages_operator_select" ON public.tank_pump_usages;
DROP POLICY IF EXISTS "tank_pump_usages_operator_insert" ON public.tank_pump_usages;
DROP POLICY IF EXISTS "Admins can manage tank_usages" ON public.tank_pump_usages;
DROP POLICY IF EXISTS "Operators can read tank_usages" ON public.tank_pump_usages;
DROP POLICY IF EXISTS "tank_pump_usages_operators_insert" ON public.tank_pump_usages;

CREATE POLICY "tank_pump_usages_admin_manage"
    ON public.tank_pump_usages
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "tank_pump_usages_operator_select"
    ON public.tank_pump_usages
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            station_id = ANY (public.current_user_station_ids())
            AND public.shifts_match_current_user_station(
                tank_pump_usages.shift_id,
                tank_pump_usages.station_id
            )
            AND EXISTS (
                SELECT 1
                FROM public.tanks t
                WHERE t.id = tank_pump_usages.tank_id
                  AND t.station_id = tank_pump_usages.station_id
            )
            AND EXISTS (
                SELECT 1
                FROM public.pistole p
                JOIN public.islands i ON i.island_id = p.island_id
                WHERE p.id = tank_pump_usages.pump_id
                  AND (
                      p.station_id IS NULL
                      OR p.station_id = tank_pump_usages.station_id
                  )
                  AND i.station_id = tank_pump_usages.station_id
            )
        )
    );

CREATE POLICY "tank_pump_usages_operator_insert"
    ON public.tank_pump_usages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_operator()
        AND station_id = ANY (public.current_user_station_ids())
        AND public.shifts_match_current_user_station(
            tank_pump_usages.shift_id,
            tank_pump_usages.station_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.tanks t
            WHERE t.id = tank_pump_usages.tank_id
              AND t.station_id = tank_pump_usages.station_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.pistole p
            JOIN public.islands i ON i.island_id = p.island_id
            WHERE p.id = tank_pump_usages.pump_id
              AND (
                  p.station_id IS NULL
                  OR p.station_id = tank_pump_usages.station_id
              )
              AND i.station_id = tank_pump_usages.station_id
        )
    );

-- ============================================================================
-- 9. TANK_READINGS — admin management + operator SELECT via tank/shift coherence
-- ============================================================================

DROP POLICY IF EXISTS "tank_readings_admin_manage" ON public.tank_readings;
DROP POLICY IF EXISTS "tank_readings_operator_select" ON public.tank_readings;
DROP POLICY IF EXISTS "tank_readings_admins_manage" ON public.tank_readings;
DROP POLICY IF EXISTS "tank_readings_operators_select" ON public.tank_readings;

CREATE POLICY "tank_readings_admin_manage"
    ON public.tank_readings
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "tank_readings_operator_select"
    ON public.tank_readings
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            EXISTS (
                SELECT 1
                FROM public.tanks t
                WHERE t.id = tank_readings.tank_id
                  AND t.station_id = ANY (public.current_user_station_ids())
            )
            AND (
                tank_readings.shift_id IS NULL
                OR public.shifts_match_current_user_station(
                    tank_readings.shift_id,
                    (
                        SELECT t2.station_id
                        FROM public.tanks t2
                        WHERE t2.id = tank_readings.tank_id
                    )
                )
            )
        )
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
