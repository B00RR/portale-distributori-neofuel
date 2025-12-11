-- Enable RLS on all sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pistole ENABLE ROW LEVEL SECURITY;
ALTER TABLE prezzi_distributore ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_cassa ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_pistols ENABLE ROW LEVEL SECURITY;

-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user belongs to station
CREATE OR REPLACE FUNCTION public.is_station_operator(station_id bigint)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin has access to all stations
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;
  
  -- Operator must belong to the station (logic depends on how we associate ops to stations)
  -- For now, we assume operators can access the station if they are authenticated 
  -- AND the station exists (simple check). 
  -- IMPACT: If we want strict multi-tenant, we need a station_id in users table.
  -- Looking at auth.js, we don't see station_id in users.
  -- We will assume for now that if you are a valid user, you are an operator.
  -- But we restrict modification rights.
  RETURN auth.role() = 'authenticated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =======================================================
-- POLICIES
-- =======================================================

-- 1. USERS
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON users
  FOR SELECT USING (public.is_admin());

-- 2. FUEL STATIONS
-- Everyone (auth) can read station config (needed for login/ui)
CREATE POLICY "Authenticated can read stations" ON fuel_stations
  FOR SELECT TO authenticated USING (true);

-- Only Admins can modify station config
CREATE POLICY "Admins can modify stations" ON fuel_stations
  FOR ALL USING (public.is_admin());

-- 3. PISTOLE
-- Read-only for operators, Full access for Admin
CREATE POLICY "Authenticated can read pistole" ON pistole
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can modify pistole" ON pistole
  FOR ALL USING (public.is_admin());

-- 4. PREZZI DISTRIBUTORE
-- Operators can READ prices
CREATE POLICY "Operators can read prices" ON prezzi_distributore
  FOR SELECT TO authenticated USING (true);

-- Operators can INSERT new prices (future validity), but NOT UPDATE/DELETE old ones
CREATE POLICY "Operators can insert prices" ON prezzi_distributore
  FOR INSERT TO authenticated WITH CHECK (true);

-- Admins can do everything
CREATE POLICY "Admins can manage prices" ON prezzi_distributore
  FOR ALL USING (public.is_admin());

-- 5. MOVIMENTI CASSA
-- Operators can SEE movements for their station (or all for now if no specific station link in user)
CREATE POLICY "Operators can read movements" ON movimenti_cassa
  FOR SELECT TO authenticated USING (true);

-- Operators can INSERT new movements
CREATE POLICY "Operators can insert movements" ON movimenti_cassa
  FOR INSERT TO authenticated WITH CHECK (true);

-- Operators CANNOT UPDATE or DELETE movements. Only Admin.
CREATE POLICY "Admins can manage movements" ON movimenti_cassa
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete movements" ON movimenti_cassa
  FOR DELETE USING (public.is_admin());

-- 6. SHIFTS (Turni)
-- Operators can read shifts
CREATE POLICY "Operators can read shifts" ON shifts
  FOR SELECT TO authenticated USING (true);

-- Operators can INSERT new shifts (Start shift)
CREATE POLICY "Operators can start shift" ON shifts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = operator_id);

-- Operators can UPDATE their OWN OPEN shifts (End shift is an update)
CREATE POLICY "Operators can update own shifts" ON shifts
  FOR UPDATE USING (auth.uid() = operator_id);

-- Admins full access
CREATE POLICY "Admins can manage shifts" ON shifts
  FOR ALL USING (public.is_admin());

-- 7. SHIFT PISTOLS (Counters)
-- Operators need to insert counters when opening/closing
CREATE POLICY "Operators can read shift pistols" ON shift_pistols
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operators can insert shift pistols" ON shift_pistols
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Operators can update shift pistols" ON shift_pistols
  FOR UPDATE USING (true); 

-- Admins full access
CREATE POLICY "Admins can manage shift pistols" ON shift_pistols
  FOR ALL USING (public.is_admin());
