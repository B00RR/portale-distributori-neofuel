-- Issue #153 — perf(db): consolidate RLS permissive policies and indexes (advisor)
--
-- Scope: safe, high-impact consolidations only. We do NOT refactor all 79
-- permissive policies in one migration.
--
-- Changes:
--   1. Drop duplicated / deprecated old policies where a consolidated replacement
--      already exists (fuel_stations, prezzi_distributore).
--   2. Replace deprecated `auth.role() = 'authenticated'` with `TO authenticated`
--      on calculation_* tables, tank_readings and tanks.
--   3. Consolidate user_dashboard_config 4 separate policies into one FOR ALL policy.
--   4. Consolidate user_stations SELECT policies into a single deterministic rule
--      using current_user_id().
--   5. Drop exact duplicate btree indexes on shift_pistols.
--   6. Drop unused / duplicate indexes on tank_pump_links only where covered by
--      another index. Other ambiguous unused indexes are intentionally skipped.
--
-- Safety: every DROP has IF EXISTS. Every recreated ALL/UPDATE policy keeps
-- WITH CHECK. No access is widened; `TO authenticated` only replaces the old
-- `auth.role() = 'authenticated'` role check.

BEGIN;

-- ============================================================================
-- 1. Drop duplicated/deprecated old policies superseded by consolidated_* ones
-- ============================================================================

-- fuel_stations: old per-command policies are redundant with consolidated_fuel_stations_*.
DROP POLICY IF EXISTS "fuel_stations_delete" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_insert" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_select" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_update" ON public.fuel_stations;
-- The admin-only select policy also relies on raw_user_meta_data (user-editable),
-- so it is removed in favour of the consolidated policy (is_admin() / created_by).
DROP POLICY IF EXISTS "Admin can view all fuel_stations" ON public.fuel_stations;

-- prezzi_distributore: old admin-only insert policy is narrower than the
-- consolidated one (which also allows station operators). Dropping it lets the
-- consolidated rule handle both cases without a conflicting PERMISSIVE policy.
DROP POLICY IF EXISTS "Admins can insert prices" ON public.prezzi_distributore;

-- ============================================================================
-- 2. Replace `auth.role() = 'authenticated'` pattern with `TO authenticated`
-- ============================================================================

-- calculation_logs: internal calculation-system logs; all authenticated users.
DROP POLICY IF EXISTS "calculation logs authenticated" ON public.calculation_logs;
CREATE POLICY "calculation_logs_authenticated_all"
    ON public.calculation_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- calculation_modules: same authenticated-wide access.
DROP POLICY IF EXISTS "calculation modules authenticated" ON public.calculation_modules;
CREATE POLICY "calculation_modules_authenticated_all"
    ON public.calculation_modules
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- calculation_tests: same authenticated-wide access.
DROP POLICY IF EXISTS "calculation tests authenticated" ON public.calculation_tests;
CREATE POLICY "calculation_tests_authenticated_all"
    ON public.calculation_tests
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- calculation_versions: same authenticated-wide access.
DROP POLICY IF EXISTS "calculation versions authenticated" ON public.calculation_versions;
CREATE POLICY "calculation_versions_authenticated_all"
    ON public.calculation_versions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- tank_readings: same authenticated-wide access.
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tank_readings;
CREATE POLICY "tank_readings_authenticated_all"
    ON public.tank_readings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- tanks: the old deprecated policy co-existed with an admin-only ALL policy and
-- a public SELECT (true). We replace only the deprecated auth.role() ALL policy
-- with an authenticated-only ALL policy that preserves the same row visibility
-- (authenticated can see all tanks) while keeping the admin policy in place.
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tanks;
CREATE POLICY "tanks_authenticated_all"
    ON public.tanks
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 3. Consolidate user_dashboard_config policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own dashboard" ON public.user_dashboard_config;
DROP POLICY IF EXISTS "Users can insert own dashboard config" ON public.user_dashboard_config;
DROP POLICY IF EXISTS "Users can view own dashboard config" ON public.user_dashboard_config;
DROP POLICY IF EXISTS "Users can update own dashboard config" ON public.user_dashboard_config;

CREATE POLICY "user_dashboard_config_own_all"
    ON public.user_dashboard_config
    FOR ALL
    TO authenticated
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- 4. Consolidate user_stations SELECT policies
-- ============================================================================

-- user_stations.user_id is integer (internal user id), auth.uid() is uuid.
-- current_user_id() maps the authenticated uuid to the integer users.user_id,
-- so `user_id = current_user_id()` is deterministic and equivalent to the
-- previous email-based lookup, without relying on auth.jwt() ->> 'email'.
DROP POLICY IF EXISTS "Operators can read own assignments" ON public.user_stations;
DROP POLICY IF EXISTS "user_stations_select" ON public.user_stations;

CREATE POLICY "user_stations_select_own"
    ON public.user_stations
    FOR SELECT
    TO authenticated
    USING (user_id = current_user_id());

-- The write policies (insert/update/delete) already use created_by_auth checks
-- and are intentionally left untouched.

-- ============================================================================
-- 5. Drop exact duplicate indexes
-- ============================================================================

-- shift_pistols: idx_shift_pistols_pistola already covers (pistola_id).
DROP INDEX IF EXISTS public.idx_shift_pistols_pistola_id;

-- shift_pistols: idx_shift_pistols_shift already covers (shift_id).
DROP INDEX IF EXISTS public.idx_shift_pistols_shift_id;

-- tank_pump_links: idx_tank_pump_unique is btree(pump_id, tank_id), which fully
-- covers searches on (pump_id, tank_id) and also satisfies queries on pump_id
-- alone. The single-column pump and tank indexes are therefore redundant for
-- this table. The station/mode indexes are kept because they cover independent
-- access patterns not served by the unique index.
DROP INDEX IF EXISTS public.idx_tank_pump_pump;
DROP INDEX IF EXISTS public.idx_tank_pump_tank;

-- ============================================================================
-- 6. Notify PostgREST so policy changes are picked up immediately
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
