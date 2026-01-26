-- Migration: Admin RPC Functions
-- Created: 2026-01-26
-- Description: Functions for secure admin operations (retrieved from production)

-- 1. admin_update_price
CREATE OR REPLACE FUNCTION admin_update_price(
    p_station_id INT, 
    p_benzina NUMERIC, 
    p_gasolio NUMERIC, 
    p_data_validita TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check Admin Permissions
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validation
  IF p_benzina < 0 OR p_gasolio < 0 THEN 
    RAISE EXCEPTION 'Invalid price'; 
  END IF;

  -- Insert
  INSERT INTO prezzi_distributore (station_id, prezzo_benzina, prezzo_gasolio, prezzo_gpl, prezzo_metano, data_validita)
  VALUES (p_station_id, p_benzina, p_gasolio, NULL, NULL, p_data_validita);
END;
$$;

-- 2. admin_delete_closure
CREATE OR REPLACE FUNCTION admin_delete_closure(closure_id INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check Admin Permissions
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Cascade Delete (Manual)
  DELETE FROM shift_pistols WHERE shift_id = closure_id;
  DELETE FROM tank_pump_usages WHERE shift_id = closure_id;
  DELETE FROM shifts WHERE id = closure_id;
END;
$$;

-- 3. admin_assign_station
CREATE OR REPLACE FUNCTION admin_assign_station(p_user_id UUID, p_station_id INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check Admin Permissions
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Update Assignment
  DELETE FROM user_stations WHERE user_id = p_user_id;
  IF p_station_id IS NOT NULL THEN
    INSERT INTO user_stations (user_id, station_id) VALUES (p_user_id, p_station_id);
  END IF;
END;
$$;
