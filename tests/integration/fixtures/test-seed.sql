-- Seed data fixture for Ephemeral Supabase Integration Tests
-- Provides deterministic test data with known UUIDs and IDs

BEGIN;

-- Truncate existing test data safely
TRUNCATE TABLE public.customer_refunds, public.movimenti_cassa, public.invoice_requests,
  public.invoices, public.shift_pistols, public.shifts, public.tank_pump_usages,
  public.tank_readings, public.tank_pump_links, public.pistole, public.tanks,
  public.islands, public.user_stations, public.users, public.fuel_stations,
  public.crediti_movimenti, public.crediti_clienti CASCADE;

DELETE FROM auth.users WHERE email LIKE '%@neofuel.test';

-- 1. Create Stations
INSERT INTO public.fuel_stations (station_id, station_name, location, is_active, allow_partial_closure)
VALUES
  (1, 'Stazione Test Nord', 'Milano', true, false),
  (2, 'Stazione Test Sud', 'Roma', true, false)
ON CONFLICT (station_id) DO UPDATE SET station_name = EXCLUDED.station_name;

ALTER SEQUENCE public.fuel_stations_station_id_seq RESTART WITH 10;

-- 2. Create Auth Users & Public Users Profiles
-- Global Admin
INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'admin@neofuel.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (user_id, username, email, role, is_active, created_by_auth)
VALUES (1, 'admin_user', 'admin@neofuel.test', 'admin', true, '11111111-1111-1111-1111-111111111111')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;

-- Super Admin
INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'super@neofuel.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (user_id, username, email, role, is_active, created_by_auth)
VALUES (10, 'super_admin_user', 'super@neofuel.test', 'super_admin', true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;

-- Operator Station 1
INSERT INTO auth.users (id, email)
VALUES ('22222222-2222-2222-2222-222222222222', 'op1@neofuel.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (user_id, username, email, role, is_active, created_by_auth)
VALUES (2, 'operator_nord', 'op1@neofuel.test', 'operator', true, '22222222-2222-2222-2222-222222222222')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;

INSERT INTO public.user_stations (user_id, station_id)
VALUES (2, 1);

-- Operator Station 2
INSERT INTO auth.users (id, email)
VALUES ('33333333-3333-3333-3333-333333333333', 'op2@neofuel.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (user_id, username, email, role, is_active, created_by_auth)
VALUES (3, 'operator_sud', 'op2@neofuel.test', 'operator', true, '33333333-3333-3333-3333-333333333333')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;

INSERT INTO public.user_stations (user_id, station_id)
VALUES (3, 2);

-- Active operator without station assignments
INSERT INTO auth.users (id, email)
VALUES ('66666666-6666-6666-6666-666666666666', 'opnoassign@neofuel.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (user_id, username, email, role, is_active, created_by_auth)
VALUES (6, 'operator_no_assignments', 'opnoassign@neofuel.test', 'operator', true, '66666666-6666-6666-6666-666666666666')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;

-- Inactive User (Station 1)
INSERT INTO auth.users (id, email)
VALUES ('44444444-4444-4444-4444-444444444444', 'inactive@neofuel.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (user_id, username, email, role, is_active, created_by_auth)
VALUES (4, 'inactive_user', 'inactive@neofuel.test', 'operator', false, '44444444-4444-4444-4444-444444444444')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;

INSERT INTO public.user_stations (user_id, station_id)
VALUES (4, 1);

-- User Without Profile (auth only)
INSERT INTO auth.users (id, email)
VALUES ('55555555-5555-5555-5555-555555555555', 'noprofile@neofuel.test')
ON CONFLICT (id) DO NOTHING;

ALTER SEQUENCE public.users_user_id_seq RESTART WITH 100;

-- 3. Sample Domain Data for Isolation Testing
-- Open Shifts
INSERT INTO public.shifts (id, station_id, operator_id, opened_at, status, opened_by)
VALUES
  (401, 1, 2, NOW(), 'open', 2),
  (402, 2, 3, NOW(), 'open', 3);

ALTER SEQUENCE public.shifts_id_seq RESTART WITH 500;

-- Invoices
INSERT INTO public.invoices (id, station_id, operator_id, invoice_number, invoice_date, customer_name, amount, status, payment_method)
VALUES
  (101, 1, 2, 'INV-NORD-001', CURRENT_DATE, 'Cliente Nord Srl', 100.00, 'issued', 'cash'),
  (102, 2, 3, 'INV-SUD-001', CURRENT_DATE, 'Cliente Sud Srl', 200.00, 'issued', 'cash');

ALTER SEQUENCE public.invoices_id_seq RESTART WITH 200;

-- Invoice Requests
INSERT INTO public.invoice_requests (id, station_id, operator_id, customer_name, amount, status)
VALUES
  (201, 1, 2, 'Richiesta Nord', 50.00, 'pending'),
  (202, 2, 3, 'Richiesta Sud', 75.00, 'pending');

ALTER SEQUENCE public.invoice_requests_id_seq RESTART WITH 300;

-- Movimenti Cassa
INSERT INTO public.movimenti_cassa (id, station_id, operator_id, tipo, importo, descrizione, payment_method, shift_id)
VALUES
  (301, 1, 2, 'inflow', 30.00, 'Incasso cassa Nord', 'cash', 401),
  (302, 2, 3, 'inflow', 40.00, 'Incasso cassa Sud', 'cash', 402);

ALTER SEQUENCE public.movimenti_cassa_id_seq RESTART WITH 400;

-- Infrastructure seed for issue #315
-- Islands (one per station)
INSERT INTO public.islands (island_id, station_id, island_name, nome, is_active)
VALUES
  (1001, 1, 'Isola Nord 1', 'Isola Nord 1', true),
  (1002, 2, 'Isola Sud 1', 'Isola Sud 1', true);

ALTER SEQUENCE public.islands_island_id_seq RESTART WITH 2000;

-- Tanks (one per station)
INSERT INTO public.tanks (id, station_id, name, fuel_type, capacity)
VALUES
  (601, 1, 'Tank Nord 1', 'benzina', 10000.00),
  (602, 2, 'Tank Sud 1', 'benzina', 10000.00);

ALTER SEQUENCE public.tanks_id_seq RESTART WITH 700;

-- Pistole (linked to islands; station_id is nullable legacy)
INSERT INTO public.pistole (id, station_id, island_id, nome, tipo_carburante, numero_litri)
VALUES
  (501, NULL, 1001, 'Pistola Nord 1', 'benzina', 0),
  (502, NULL, 1002, 'Pistola Sud 1', 'benzina', 0),
  -- Cross-station adversarial pump: station_id 1 but island belongs to station 2
  (503, 1, 1002, 'Pistola Adversarial', 'benzina', 0);

ALTER SEQUENCE public.pistole_id_seq RESTART WITH 600;

-- Tank-pump links
INSERT INTO public.tank_pump_links (id, station_id, tank_id, pump_id, mode, ratio, is_active)
VALUES
  (701, 1, 601, 501, 'primary', 1.0, true),
  (702, 2, 602, 502, 'primary', 1.0, true);

ALTER SEQUENCE public.tank_pump_links_id_seq RESTART WITH 800;

-- Tank pump usages
INSERT INTO public.tank_pump_usages (id, shift_id, station_id, pump_id, tank_id, liters, mode, ratio)
VALUES
  (801, 401, 1, 501, 601, 100.00, 'dispensed', 1.0),
  (802, 402, 2, 502, 602, 100.00, 'dispensed', 1.0);

ALTER SEQUENCE public.tank_pump_usages_id_seq RESTART WITH 900;

-- Tank readings
INSERT INTO public.tank_readings (id, tank_id, shift_id, level_mm, liters, reading_type)
VALUES
  (901, 601, 401, 1200, 100.00, 'opening'),
  (902, 602, 402, 1200, 100.00, 'opening');

ALTER SEQUENCE public.tank_readings_id_seq RESTART WITH 1000;

COMMIT;
