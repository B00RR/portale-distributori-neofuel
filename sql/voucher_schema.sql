-- CLEANUP FIRST (BE CAREFUL: THIS DELETES EXISTING VOUCHER DATA)
DROP TABLE IF EXISTS public.vouchers CASCADE;
DROP TABLE IF EXISTS public.voucher_batches CASCADE;

-- Create Voucher Batches Table
CREATE TABLE public.voucher_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    description TEXT,
    customer_name TEXT, 
    expiration_date DATE,
    station_id BIGINT 
);

-- Create Vouchers Table
CREATE TABLE public.vouchers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    batch_id UUID REFERENCES public.voucher_batches(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    serial_number INTEGER, 
    amount DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'void')),
    expiration_date DATE,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    redeemed_by UUID, 
    station_id BIGINT 
);

-- Indexes 
CREATE INDEX idx_vouchers_code ON public.vouchers(code);
CREATE INDEX idx_vouchers_batch ON public.vouchers(batch_id);
CREATE INDEX idx_vouchers_status ON public.vouchers(status);

-- Enable RLS
ALTER TABLE public.voucher_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'voucher_batches' AND policyname = 'Allow all access to authenticated users'
    ) THEN
        CREATE POLICY "Allow all access to authenticated users" ON public.voucher_batches
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vouchers' AND policyname = 'Allow all access to authenticated users'
    ) THEN
        CREATE POLICY "Allow all access to authenticated users" ON public.vouchers
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END
$$;
