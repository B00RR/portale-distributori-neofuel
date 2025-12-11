-- Enable RLS on all sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pistole ENABLE ROW LEVEL SECURITY;
ALTER TABLE prezzi_distributore ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_cassa ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_pistols ENABLE ROW LEVEL SECURITY;

-- Helper: Get current user's email safely
-- Note: auth.jwt() ->> 'email' is the standard way to get email in RLS
-- We assume public.users table has a unique 'email' column linking to auth.users

-- Create helper function to check if user is admin matching by EMAIL
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE email = (auth.jwt() ->> 'email')
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user belongs to station
CREATE OR REPLACE FUNCTION public.is_station_operator(station_id bigint)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin has access
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;
  
  -- Operator access: Just check they are authenticated for now 
  -- (since we don't have station_id in users yet)
  RETURN auth.role() = 'authenticated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper to get current public.users.user_id (Integer) from Auth Email
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS BIGINT AS $$
DECLARE
  current_email text;
  uid bigint;
BEGIN
  current_email := auth.jwt() ->> 'email';
  SELECT user_id INTO uid FROM users WHERE email = current_email;
  RETURN uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =======================================================
-- POLICIES (Updated to use Email / get_current_user_id)
-- =======================================================

-- 1. USERS
-- Users can read their own profile (Match by Email)
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (email = (auth.jwt() ->> 'email'));

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON users
  FOR SELECT USING (public.is_admin());

-- 2. FUEL STATIONS
CREATE POLICY "Authenticated can read stations" ON fuel_stations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can modify stations" ON fuel_stations
  FOR ALL USING (public.is_admin());

-- 3. PISTOLE
CREATE POLICY "Authenticated can read pistole" ON pistole
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can modify pistole" ON pistole
  FOR ALL USING (public.is_admin());

-- 4. PREZZI DISTRIBUTORE
CREATE POLICY "Operators can read prices" ON prezzi_distributore
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operators can insert prices" ON prezzi_distributore
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can manage prices" ON prezzi_distributore
  FOR ALL USING (public.is_admin());

-- 5. MOVIMENTI CASSA
CREATE POLICY "Operators can read movements" ON movimenti_cassa
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operators can insert movements" ON movimenti_cassa
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can manage movements" ON movimenti_cassa
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete movements" ON movimenti_cassa
  FOR DELETE USING (public.is_admin());

-- 6. SHIFTS (Turni)
CREATE POLICY "Operators can read shifts" ON shifts
  FOR SELECT TO authenticated USING (true);

-- Operators can INSERT new shifts. 
-- Condition: The inserted 'operator_id' must match the executing user's PUBLIC ID via email lookup
CREATE POLICY "Operators can start shift" ON shifts
  FOR INSERT TO authenticated WITH CHECK (
    operator_id = public.get_current_user_id()
  );

-- Operators can UPDATE their OWN shifts
CREATE POLICY "Operators can update own shifts" ON shifts
  FOR UPDATE USING (
    operator_id = public.get_current_user_id()
  );

CREATE POLICY "Admins can manage shifts" ON shifts
  FOR ALL USING (public.is_admin());

-- 7. SHIFT PISTOLS
CREATE POLICY "Operators can read shift pistols" ON shift_pistols
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operators can insert shift pistols" ON shift_pistols
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Operators can update shift pistols" ON shift_pistols
  FOR UPDATE USING (true); 

CREATE POLICY "Admins can manage shift pistols" ON shift_pistols
  FOR ALL USING (public.is_admin());
