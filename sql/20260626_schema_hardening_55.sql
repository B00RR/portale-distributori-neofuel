-- Migration: idempotent schema integrity hardening
-- Resolves: #55 and #214
-- Updated: 2026-07-10
-- Description:
--   - Converts six legacy timestamp without time zone columns to timestamptz,
--     interpreting existing wall-clock values in the Europe/Rome time zone.
--   - Adds the vouchers redemption foreign key, required NOT NULL attributes,
--     and positive-amount CHECK constraints.
--   - Performs every schema and data preflight before the first DDL statement,
--     then guards each change so replaying the migration is a no-op.
-- Downtime: No planned downtime. The first timestamp conversion can take an
--   ACCESS EXCLUSIVE lock while PostgreSQL rewrites affected tables; schedule
--   that first execution during low traffic if the tables are large.
-- Data backfill: No separate backfill. Legacy timestamps are converted inline.
-- Dependencies: public.users, public.fuel_stations, public.islands,
--   public.user_stations, public.movimenti_cassa, public.vouchers, auth.users.

BEGIN;

-- Preflight: fail before any schema change if the current schema or data cannot
-- be migrated safely.
DO $$
DECLARE
  target record;
  current_type text;
BEGIN
  FOR target IN
    SELECT *
    FROM (
      VALUES
        ('users', 'created_at'),
        ('users', 'updated_at'),
        ('fuel_stations', 'created_at'),
        ('fuel_stations', 'updated_at'),
        ('islands', 'created_at'),
        ('user_stations', 'assigned_at')
    ) AS timestamp_columns(table_name, column_name)
  LOOP
    SELECT columns.data_type
    INTO current_type
    FROM information_schema.columns
    WHERE columns.table_schema = 'public'
      AND columns.table_name = target.table_name
      AND columns.column_name = target.column_name;

    IF current_type IS NULL THEN
      RAISE EXCEPTION 'Cannot harden schema: missing column public.%.%',
        target.table_name, target.column_name;
    END IF;

    IF current_type NOT IN ('timestamp without time zone', 'timestamp with time zone') THEN
      RAISE EXCEPTION 'Cannot convert public.%.%: unexpected type %',
        target.table_name, target.column_name, current_type;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.movimenti_cassa
    WHERE station_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot set NOT NULL: NULL values found in public.movimenti_cassa.station_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.movimenti_cassa
    WHERE operator_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot set NOT NULL: NULL values found in public.movimenti_cassa.operator_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.movimenti_cassa
    WHERE importo < 0
  ) THEN
    RAISE EXCEPTION
      'Cannot add chk_movimenti_cassa_importo_positive: negative importo values found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vouchers
    WHERE amount <= 0
  ) THEN
    RAISE EXCEPTION
      'Cannot add chk_vouchers_amount_positive: non-positive amount values found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vouchers AS vouchers
    WHERE vouchers.redeemed_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users AS auth_users
        WHERE auth_users.id = vouchers.redeemed_by
      )
  ) THEN
    RAISE EXCEPTION
      'Cannot add fk_vouchers_redeemed_by: orphan redeemed_by values found';
  END IF;
END $$;

-- Convert only legacy timestamp without time zone columns. Columns already using
-- timestamptz are left untouched on replay.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.users
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'Europe/Rome';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.users
      ALTER COLUMN updated_at TYPE timestamptz
      USING updated_at AT TIME ZONE 'Europe/Rome';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fuel_stations'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.fuel_stations
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'Europe/Rome';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fuel_stations'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.fuel_stations
      ALTER COLUMN updated_at TYPE timestamptz
      USING updated_at AT TIME ZONE 'Europe/Rome';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'islands'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.islands
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'Europe/Rome';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_stations'
      AND column_name = 'assigned_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.user_stations
      ALTER COLUMN assigned_at TYPE timestamptz
      USING assigned_at AT TIME ZONE 'Europe/Rome';
  END IF;
END $$;

-- Add or validate the vouchers redemption foreign key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraints
    JOIN pg_class AS relations ON relations.oid = constraints.conrelid
    JOIN pg_namespace AS namespaces ON namespaces.oid = relations.relnamespace
    WHERE namespaces.nspname = 'public'
      AND relations.relname = 'vouchers'
      AND constraints.conname = 'fk_vouchers_redeemed_by'
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT fk_vouchers_redeemed_by
      FOREIGN KEY (redeemed_by) REFERENCES auth.users(id)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.vouchers
  VALIDATE CONSTRAINT fk_vouchers_redeemed_by;

-- vouchers.station_id and voucher_batches.station_id are bigint, while
-- fuel_stations.station_id is integer. Their foreign keys remain intentionally
-- deferred until the column types are aligned.

-- Set NOT NULL only while the columns are still nullable. The preflight above
-- guarantees that the change cannot fail because of existing NULL rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'movimenti_cassa'
      AND column_name = 'station_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.movimenti_cassa
      ALTER COLUMN station_id SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'movimenti_cassa'
      AND column_name = 'operator_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.movimenti_cassa
      ALTER COLUMN operator_id SET NOT NULL;
  END IF;
END $$;

-- Add CHECK constraints only after validating all existing rows. NOT VALID
-- avoids holding an ACCESS EXCLUSIVE lock during the validation scan.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraints
    JOIN pg_class AS relations ON relations.oid = constraints.conrelid
    JOIN pg_namespace AS namespaces ON namespaces.oid = relations.relnamespace
    WHERE namespaces.nspname = 'public'
      AND relations.relname = 'movimenti_cassa'
      AND constraints.conname = 'chk_movimenti_cassa_importo_positive'
  ) THEN
    ALTER TABLE public.movimenti_cassa
      ADD CONSTRAINT chk_movimenti_cassa_importo_positive
      CHECK (importo >= 0)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.movimenti_cassa
  VALIDATE CONSTRAINT chk_movimenti_cassa_importo_positive;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraints
    JOIN pg_class AS relations ON relations.oid = constraints.conrelid
    JOIN pg_namespace AS namespaces ON namespaces.oid = relations.relnamespace
    WHERE namespaces.nspname = 'public'
      AND relations.relname = 'vouchers'
      AND constraints.conname = 'chk_vouchers_amount_positive'
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT chk_vouchers_amount_positive
      CHECK (amount > 0)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.vouchers
  VALIDATE CONSTRAINT chk_vouchers_amount_positive;

-- Postconditions: never report success with a partially hardened schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('users', 'created_at'),
        ('users', 'updated_at'),
        ('fuel_stations', 'created_at'),
        ('fuel_stations', 'updated_at'),
        ('islands', 'created_at'),
        ('user_stations', 'assigned_at')
    ) AS timestamp_columns(table_name, column_name)
    LEFT JOIN information_schema.columns AS columns
      ON columns.table_schema = 'public'
      AND columns.table_name = timestamp_columns.table_name
      AND columns.column_name = timestamp_columns.column_name
    WHERE columns.data_type IS DISTINCT FROM 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION
      'Schema hardening postcondition failed: timestamp conversion incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'movimenti_cassa'
      AND column_name IN ('station_id', 'operator_id')
      AND is_nullable <> 'NO'
  ) OR (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'movimenti_cassa'
      AND column_name IN ('station_id', 'operator_id')
  ) <> 2 THEN
    RAISE EXCEPTION
      'Schema hardening postcondition failed: movimenti_cassa identifiers remain nullable';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint AS constraints
    JOIN pg_class AS relations ON relations.oid = constraints.conrelid
    JOIN pg_namespace AS namespaces ON namespaces.oid = relations.relnamespace
    WHERE namespaces.nspname = 'public'
      AND (
        (relations.relname = 'vouchers'
          AND constraints.conname IN (
            'fk_vouchers_redeemed_by',
            'chk_vouchers_amount_positive'
          ))
        OR
        (relations.relname = 'movimenti_cassa'
          AND constraints.conname = 'chk_movimenti_cassa_importo_positive')
      )
      AND constraints.convalidated
  ) <> 3 THEN
    RAISE EXCEPTION
      'Schema hardening postcondition failed: required constraints missing or unvalidated';
  END IF;
END $$;

COMMIT;
