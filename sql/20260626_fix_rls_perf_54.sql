-- Migration: Fix RLS performance, consolidate permissive policies, and index FKs
-- Issue: #54
-- Description: Consolidate multiple overlapping policies on target tables into one per command type (SELECT, INSERT, UPDATE, DELETE).
-- Use current_user_id() and is_admin() SECURITY DEFINER helper functions instead of inline auth.uid() calls to resolve auth_rls_initplan performance issue.
-- Add covering indexes for FK columns on target tables.
-- Requirements:
-- - No downtime required.
-- - No data backfill required.

BEGIN;

-- ============================================================================
-- 1. DROP EXISTING POLICIES (Idempotent)
-- ============================================================================

-- users
DROP POLICY IF EXISTS "Admin can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read their own data" ON public.users;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "users_delete_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_admin_only" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.users;
DROP POLICY IF EXISTS "users_read_all" ON public.users;

-- fuel_stations
DROP POLICY IF EXISTS "Authenticated can read stations" ON public.fuel_stations;
DROP POLICY IF EXISTS "Admins can modify stations" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_select_policy" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_insert_policy" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_update_policy" ON public.fuel_stations;
DROP POLICY IF EXISTS "fuel_stations_delete_policy" ON public.fuel_stations;
DROP POLICY IF EXISTS "Admins can manage stations" ON public.fuel_stations;
DROP POLICY IF EXISTS "Admins can delete stations" ON public.fuel_stations;

-- pistole
DROP POLICY IF EXISTS "Authenticated can read pistole" ON public.pistole;
DROP POLICY IF EXISTS "Admins can modify pistole" ON public.pistole;
DROP POLICY IF EXISTS "pistole_select_policy" ON public.pistole;
DROP POLICY IF EXISTS "pistole_insert_policy" ON public.pistole;
DROP POLICY IF EXISTS "pistole_update_policy" ON public.pistole;
DROP POLICY IF EXISTS "pistole_delete_policy" ON public.pistole;

-- prezzi_distributore
DROP POLICY IF EXISTS "Operators can read prices" ON public.prezzi_distributore;
DROP POLICY IF EXISTS "Operators can insert prices" ON public.prezzi_distributore;
DROP POLICY IF EXISTS "Admins can manage prices" ON public.prezzi_distributore;
DROP POLICY IF EXISTS "prezzi_distributore_select_policy" ON public.prezzi_distributore;
DROP POLICY IF EXISTS "prezzi_distributore_insert_policy" ON public.prezzi_distributore;
DROP POLICY IF EXISTS "prezzi_distributore_update_policy" ON public.prezzi_distributore;
DROP POLICY IF EXISTS "prezzi_distributore_delete_policy" ON public.prezzi_distributore;

-- movimenti_cassa
DROP POLICY IF EXISTS "Operators can read movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Operators can insert movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Admins can manage movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "Admins can delete movements" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "movimenti_cassa_select_policy" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "movimenti_cassa_insert_policy" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "movimenti_cassa_update_policy" ON public.movimenti_cassa;
DROP POLICY IF EXISTS "movimenti_cassa_delete_policy" ON public.movimenti_cassa;

-- shifts
DROP POLICY IF EXISTS "Operators can read shifts" ON public.shifts;
DROP POLICY IF EXISTS "Operators can start shift" ON public.shifts;
DROP POLICY IF EXISTS "operator_can_insert_shifts" ON public.shifts;
DROP POLICY IF EXISTS "Operators can update own shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins can manage shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins and Accounting can manage shifts" ON public.shifts;
DROP POLICY IF EXISTS "shifts_select_policy" ON public.shifts;
DROP POLICY IF EXISTS "shifts_insert_policy" ON public.shifts;
DROP POLICY IF EXISTS "shifts_update_policy" ON public.shifts;
DROP POLICY IF EXISTS "shifts_delete_policy" ON public.shifts;

-- shift_pistols
DROP POLICY IF EXISTS "Operators can read shift pistols" ON public.shift_pistols;
DROP POLICY IF EXISTS "Operators can insert shift pistols" ON public.shift_pistols;
DROP POLICY IF EXISTS "Operators can update shift pistols" ON public.shift_pistols;
DROP POLICY IF EXISTS "Admins can manage shift pistols" ON public.shift_pistols;
DROP POLICY IF EXISTS "shift_pistols_select_policy" ON public.shift_pistols;
DROP POLICY IF EXISTS "shift_pistols_insert_policy" ON public.shift_pistols;
DROP POLICY IF EXISTS "shift_pistols_update_policy" ON public.shift_pistols;
DROP POLICY IF EXISTS "shift_pistols_delete_policy" ON public.shift_pistols;

-- ============================================================================
-- 2. CREATE CONSOLIDATED RLS POLICIES (One per command type)
-- ============================================================================

-- ---------- users ----------
CREATE POLICY "consolidated_users_select" ON public.users
  FOR SELECT
  USING (public.is_admin() OR user_id = public.current_user_id() OR email = (auth.jwt() ->> 'email'));

CREATE POLICY "consolidated_users_insert" ON public.users
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "consolidated_users_update" ON public.users
  FOR UPDATE
  USING (public.is_admin() OR email = (auth.jwt() ->> 'email') OR user_id = public.current_user_id())
  WITH CHECK (public.is_admin() OR email = (auth.jwt() ->> 'email') OR user_id = public.current_user_id());

CREATE POLICY "consolidated_users_delete" ON public.users
  FOR DELETE
  USING (public.is_admin());

-- ---------- fuel_stations ----------
CREATE POLICY "consolidated_fuel_stations_select" ON public.fuel_stations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "consolidated_fuel_stations_insert" ON public.fuel_stations
  FOR INSERT
  WITH CHECK (public.is_admin() OR created_by_auth = (SELECT created_by_auth FROM public.users WHERE user_id = public.current_user_id()));

CREATE POLICY "consolidated_fuel_stations_update" ON public.fuel_stations
  FOR UPDATE
  USING (public.is_admin() OR created_by_auth = (SELECT created_by_auth FROM public.users WHERE user_id = public.current_user_id()))
  WITH CHECK (public.is_admin() OR created_by_auth = (SELECT created_by_auth FROM public.users WHERE user_id = public.current_user_id()));

CREATE POLICY "consolidated_fuel_stations_delete" ON public.fuel_stations
  FOR DELETE
  USING (public.is_admin() OR created_by_auth = (SELECT created_by_auth FROM public.users WHERE user_id = public.current_user_id()));

-- ---------- pistole ----------
CREATE POLICY "consolidated_pistole_select" ON public.pistole
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "consolidated_pistole_insert" ON public.pistole
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "consolidated_pistole_update" ON public.pistole
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "consolidated_pistole_delete" ON public.pistole
  FOR DELETE
  USING (public.is_admin());

-- ---------- prezzi_distributore ----------
CREATE POLICY "consolidated_prezzi_distributore_select" ON public.prezzi_distributore
  FOR SELECT
  USING (public.is_admin() OR public.is_station_operator(station_id));

CREATE POLICY "consolidated_prezzi_distributore_insert" ON public.prezzi_distributore
  FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_station_operator(station_id));

CREATE POLICY "consolidated_prezzi_distributore_update" ON public.prezzi_distributore
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "consolidated_prezzi_distributore_delete" ON public.prezzi_distributore
  FOR DELETE
  USING (public.is_admin());

-- ---------- movimenti_cassa ----------
CREATE POLICY "consolidated_movimenti_cassa_select" ON public.movimenti_cassa
  FOR SELECT
  USING (public.is_admin() OR public.is_station_operator(station_id) OR operator_id = public.current_user_id());

CREATE POLICY "consolidated_movimenti_cassa_insert" ON public.movimenti_cassa
  FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_station_operator(station_id) OR operator_id = public.current_user_id());

CREATE POLICY "consolidated_movimenti_cassa_update" ON public.movimenti_cassa
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "consolidated_movimenti_cassa_delete" ON public.movimenti_cassa
  FOR DELETE
  USING (public.is_admin());

-- ---------- shifts ----------
CREATE POLICY "consolidated_shifts_select" ON public.shifts
  FOR SELECT
  USING (
    public.is_admin()
    OR operator_id = public.current_user_id()
    OR EXISTS (
      SELECT 1 FROM public.user_stations us
      WHERE us.user_id = public.current_user_id()
        AND us.station_id = shifts.station_id
    )
    OR (SELECT role FROM public.users WHERE user_id = public.current_user_id()) = 'accounting'
  );

CREATE POLICY "consolidated_shifts_insert" ON public.shifts
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      operator_id = public.current_user_id()
      AND EXISTS (
        SELECT 1 FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = shifts.station_id
      )
    )
  );

CREATE POLICY "consolidated_shifts_update" ON public.shifts
  FOR UPDATE
  USING (
    public.is_admin()
    OR operator_id = public.current_user_id()
    OR (SELECT role FROM public.users WHERE user_id = public.current_user_id()) = 'accounting'
  )
  WITH CHECK (
    public.is_admin()
    OR operator_id = public.current_user_id()
    OR (SELECT role FROM public.users WHERE user_id = public.current_user_id()) = 'accounting'
  );

CREATE POLICY "consolidated_shifts_delete" ON public.shifts
  FOR DELETE
  USING (
    public.is_admin()
    OR (SELECT role FROM public.users WHERE user_id = public.current_user_id()) = 'accounting'
  );

-- ---------- shift_pistols ----------
CREATE POLICY "consolidated_shift_pistols_select" ON public.shift_pistols
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_pistols.shift_id
        AND (
          s.operator_id = public.current_user_id()
          OR EXISTS (
            SELECT 1 FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = s.station_id
          )
        )
    )
  );

CREATE POLICY "consolidated_shift_pistols_insert" ON public.shift_pistols
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_pistols.shift_id
        AND (
          s.operator_id = public.current_user_id()
          OR EXISTS (
            SELECT 1 FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = s.station_id
          )
        )
    )
  );

CREATE POLICY "consolidated_shift_pistols_update" ON public.shift_pistols
  FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_pistols.shift_id
        AND (
          s.operator_id = public.current_user_id()
          OR EXISTS (
            SELECT 1 FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = s.station_id
          )
        )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_pistols.shift_id
        AND (
          s.operator_id = public.current_user_id()
          OR EXISTS (
            SELECT 1 FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = s.station_id
          )
        )
    )
  );

CREATE POLICY "consolidated_shift_pistols_delete" ON public.shift_pistols
  FOR DELETE
  USING (public.is_admin());

-- ============================================================================
-- 3. COVERING INDEXES FOR FOREIGN KEYS (Idempotent)
-- ============================================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_created_by_auth ON public.users (created_by_auth);

-- fuel_stations
CREATE INDEX IF NOT EXISTS idx_fuel_stations_created_by_auth ON public.fuel_stations (created_by_auth);

-- pistole
CREATE INDEX IF NOT EXISTS idx_pistole_island_id ON public.pistole (island_id);
CREATE INDEX IF NOT EXISTS idx_pistole_station_id ON public.pistole (station_id);

-- prezzi_distributore
CREATE INDEX IF NOT EXISTS idx_prezzi_distributore_station_id ON public.prezzi_distributore (station_id);
CREATE INDEX IF NOT EXISTS idx_prezzi_distributore_modificato_da ON public.prezzi_distributore (modificato_da);

-- movimenti_cassa
CREATE INDEX IF NOT EXISTS idx_movimenti_cassa_station_id ON public.movimenti_cassa (station_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_cassa_operator_id ON public.movimenti_cassa (operator_id);

-- shifts
CREATE INDEX IF NOT EXISTS idx_shifts_station_id ON public.shifts (station_id);
CREATE INDEX IF NOT EXISTS idx_shifts_operator_id ON public.shifts (operator_id);

-- shift_pistols
CREATE INDEX IF NOT EXISTS idx_shift_pistols_shift_id ON public.shift_pistols (shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_pistols_pistola_id ON public.shift_pistols (pistola_id);

COMMIT;
