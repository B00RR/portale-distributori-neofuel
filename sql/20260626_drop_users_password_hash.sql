-- Drop unused password_hash column from public.users table
ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;
