-- Base schema for Ephemeral Supabase Database Integration Tests
-- Provides core schema, tables, and auth functions prior to applying sql/migrations/*.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Setup auth schema & helpers
CREATE SCHEMA IF NOT EXISTS auth;

GRANT USAGE, CREATE ON SCHEMA auth TO postgres, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE '
      CREATE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $func$
        SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid;
      $func$;
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'role'
  ) THEN
    EXECUTE '
      CREATE FUNCTION auth.role()
      RETURNS text
      LANGUAGE sql
      STABLE
      AS $func$
        SELECT NULLIF(current_setting(''request.jwt.claim.role'', true), '''')::text;
      $func$;
    ';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz DEFAULT now()
);

GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO postgres, service_role;

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

-- User context helper functions (stubs for RLS/migrations)
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT user_id FROM public.users WHERE created_by_auth = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_user_id();
$$;

CREATE OR REPLACE FUNCTION public.current_user_station_ids()
RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ARRAY(
    SELECT station_id FROM public.user_stations
    WHERE user_id = public.current_user_id()
  );
$$;


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

CREATE TABLE IF NOT EXISTS public.user_dashboard_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  kpi_layout jsonb DEFAULT '[]'::jsonb,
  grid_columns integer DEFAULT 4,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.processed_requests (
  request_id text PRIMARY KEY,
  endpoint text,
  action_type text,
  payload jsonb,
  response jsonb,
  payload_fingerprint text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limit_attempts (
  id serial PRIMARY KEY,
  identifier text NOT NULL,
  endpoint text NOT NULL,
  attempts integer DEFAULT 0,
  window_start timestamptz DEFAULT now(),
  last_attempt timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifiche (
  id serial PRIMARY KEY,
  tipo text NOT NULL,
  titolo text,
  messaggio text,
  letta boolean DEFAULT false,
  operatore_id integer REFERENCES public.users(user_id),
  soggetto_id integer,
  data_creazione timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operator_menu_options (
  id serial PRIMARY KEY,
  function_key text NOT NULL,
  label text NOT NULL,
  created_by_auth uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.ui_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now(),
  updated_by integer REFERENCES public.users(user_id)
);

CREATE TABLE IF NOT EXISTS public.customer_refunds (
  id serial PRIMARY KEY,
  shift_id integer REFERENCES public.shifts(id) ON DELETE CASCADE,
  station_id integer REFERENCES public.fuel_stations(station_id),
  operator_id integer REFERENCES public.users(user_id),
  amount numeric(12,2) NOT NULL,
  receipt_date date NOT NULL,
  method text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.punti_riscatti (
  id serial PRIMARY KEY,
  station_id integer REFERENCES public.fuel_stations(station_id),
  shift_id integer REFERENCES public.shifts(id),
  operator_id integer REFERENCES public.users(user_id),
  importo numeric(12,2) NOT NULL,
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
ALTER TABLE public.user_dashboard_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifiche ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_menu_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punti_riscatti ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

COMMIT;
