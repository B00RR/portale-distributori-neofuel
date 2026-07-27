-- Base schema for Ephemeral Supabase Database Integration Tests
-- Provides core schema, tables, and auth functions prior to applying sql/migrations/*.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Setup auth schema & helpers
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text;
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- 2. Core domain tables
CREATE TABLE IF NOT EXISTS public.fuel_stations (
  station_id serial PRIMARY KEY,
  station_name text NOT NULL,
  address text,
  city text,
  cap text,
  provincia text,
  created_by_auth uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  user_id serial PRIMARY KEY,
  username text,
  email text,
  role text NOT NULL DEFAULT 'operator',
  is_active boolean DEFAULT true,
  created_by_auth uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_stations (
  id serial PRIMARY KEY,
  user_id integer REFERENCES public.users(user_id) ON DELETE CASCADE,
  station_id integer REFERENCES public.fuel_stations(station_id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.islands (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tanks (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  name text,
  fuel_type text,
  capacity numeric,
  current_level numeric,
  water_level numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pistole (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  numero_pistola integer,
  tipo_carburante text,
  ultima_lettura numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tank_pump_links (
  id serial PRIMARY KEY,
  tank_id integer REFERENCES public.tanks(id),
  pump_id integer REFERENCES public.pistole(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shifts (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  operator_id integer REFERENCES public.users(user_id),
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  status text DEFAULT 'open',
  opening_notes text,
  closing_notes text,
  closing_data jsonb,
  opened_by integer REFERENCES public.users(user_id),
  closed_by integer REFERENCES public.users(user_id)
);

CREATE TABLE IF NOT EXISTS public.shift_pistols (
  id serial PRIMARY KEY,
  shift_id integer REFERENCES public.shifts(id),
  pistol_id integer REFERENCES public.pistole(id),
  initial_counter numeric,
  final_counter numeric,
  total_liters numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tank_readings (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  tank_id integer REFERENCES public.tanks(id),
  shift_id integer REFERENCES public.shifts(id),
  operator_id integer REFERENCES public.users(user_id),
  start_level numeric,
  end_level numeric,
  water_level numeric,
  reading_type text,
  reading_time timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tank_pump_usages (
  id serial PRIMARY KEY,
  shift_id integer REFERENCES public.shifts(id),
  tank_id integer REFERENCES public.tanks(id),
  pump_id integer REFERENCES public.pistole(id),
  liters_dispensed numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  number text,
  date date DEFAULT current_date,
  customer_name text,
  customer_piva text,
  customer_cf text,
  amount numeric,
  vat_amount numeric,
  status text DEFAULT 'draft',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by integer REFERENCES public.users(user_id)
);

CREATE TABLE IF NOT EXISTS public.invoice_requests (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  request_date timestamptz DEFAULT now(),
  customer_name text,
  customer_piva text,
  customer_cf text,
  amount numeric,
  status text DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.movimenti_cassa (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  shift_id integer REFERENCES public.shifts(id),
  operator_id integer REFERENCES public.users(user_id),
  tipo_movimento text,
  importo numeric,
  causale text,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crediti_clienti (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  ragione_sociale text NOT NULL,
  codice_fiscale text,
  partita_iva text,
  saldo_attuale numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crediti_movimenti (
  id serial PRIMARY KEY,
  cliente_id integer REFERENCES public.crediti_clienti(id),
  station_id integer REFERENCES public.fuel_stations(station_id),
  shift_id integer REFERENCES public.shifts(id),
  tipo_movimento text,
  importo numeric,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clienti_fatturazione (
  id serial PRIMARY KEY,
  ragione_sociale text,
  partita_iva text,
  codice_fiscale text,
  sdi text,
  pec text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.targhe_cliente (
  id serial PRIMARY KEY,
  cliente_id integer REFERENCES public.clienti_fatturazione(id),
  targa text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prezzi_distributore (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  tipo_carburante text,
  prezzo_servito numeric,
  prezzo_self numeric,
  prezzo_costo numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.voucher_batches (
  batch_id serial PRIMARY KEY,
  customer_name text,
  total_quantity integer,
  amount_per_voucher numeric,
  expiration_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vouchers (
  id serial PRIMARY KEY,
  batch_id integer REFERENCES public.voucher_batches(batch_id),
  code text UNIQUE,
  amount numeric,
  status text DEFAULT 'active',
  expiration_date date,
  redeemed_at timestamptz,
  redeemed_by_station integer REFERENCES public.fuel_stations(station_id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calculation_modules (
  id serial PRIMARY KEY,
  module_key text,
  name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calculation_versions (
  id serial PRIMARY KEY,
  module_id integer REFERENCES public.calculation_modules(id),
  version text,
  code text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calculation_tests (
  id serial PRIMARY KEY,
  module_id integer REFERENCES public.calculation_modules(id),
  name text,
  input_data jsonb,
  expected_output jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calculation_logs (
  id serial PRIMARY KEY,
  module_id integer REFERENCES public.calculation_modules(id),
  version_id integer REFERENCES public.calculation_versions(id),
  execution_time numeric,
  status text,
  log_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Basic RLS enablement
ALTER TABLE public.fuel_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimenti_cassa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crediti_clienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crediti_movimenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

COMMIT;
