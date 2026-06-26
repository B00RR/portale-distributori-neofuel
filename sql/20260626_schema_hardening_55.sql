-- Issue: #55
-- Schema integrity hardening: timestamptz conversion, FKs, NOT NULL, CHECKs

BEGIN;

-- 1. Convert timestamp without time zone to timestamptz
ALTER TABLE public.users ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'Europe/Rome';
ALTER TABLE public.users ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'Europe/Rome';
ALTER TABLE public.fuel_stations ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'Europe/Rome';
ALTER TABLE public.fuel_stations ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'Europe/Rome';
ALTER TABLE public.islands ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'Europe/Rome';
ALTER TABLE public.user_stations ALTER COLUMN assigned_at TYPE timestamptz USING assigned_at AT TIME ZONE 'Europe/Rome';

-- 2. FK on vouchers.redeemed_by referencing auth.users(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_vouchers_redeemed_by' AND table_name = 'vouchers'
    ) THEN
        ALTER TABLE public.vouchers ADD CONSTRAINT fk_vouchers_redeemed_by FOREIGN KEY (redeemed_by) REFERENCES auth.users(id);
    END IF;
END $$;

-- Note: vouchers.station_id and voucher_batches.station_id are bigint,
-- but fuel_stations.station_id is integer. Cannot add FK due to type mismatch.
-- This is a known issue documented for future resolution.

-- 3. NOT NULL pre-checks and constraints for movimenti_cassa
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.movimenti_cassa WHERE station_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot set NOT NULL: NULL values found in movimenti_cassa.station_id';
    END IF;
    IF EXISTS (SELECT 1 FROM public.movimenti_cassa WHERE operator_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot set NOT NULL: NULL values found in movimenti_cassa.operator_id';
    END IF;
END $$;

ALTER TABLE public.movimenti_cassa ALTER COLUMN station_id SET NOT NULL;
ALTER TABLE public.movimenti_cassa ALTER COLUMN operator_id SET NOT NULL;

-- 4. CHECK constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_movimenti_cassa_importo_positive' AND table_name = 'movimenti_cassa'
    ) THEN
        ALTER TABLE public.movimenti_cassa ADD CONSTRAINT chk_movimenti_cassa_importo_positive CHECK (importo >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_vouchers_amount_positive' AND table_name = 'vouchers'
    ) THEN
        ALTER TABLE public.vouchers ADD CONSTRAINT chk_vouchers_amount_positive CHECK (amount > 0);
    END IF;
END $$;

COMMIT;
