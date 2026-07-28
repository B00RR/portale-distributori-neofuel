-- Migration: Issue #318 — Enforce storage bucket upload limits and drop obsolete policies
--
-- What it does:
-- 1. Pre-checks existence of target storage buckets: system, voucher-photo, fattura-uploads. Aborts if missing.
-- 2. Sets file_size_limit and allowed_mime_types on target buckets:
--    - system: 1 MB (1048576 bytes), allowed MIME: application/json
--    - voucher-photo: 5 MB (5242880 bytes), allowed MIME: image/jpeg, image/png, image/webp, image/heic, image/heif
--    - fattura-uploads: 10 MB (10485760 bytes), allowed MIME: application/pdf, image/jpeg, image/png, image/webp, image/heic, image/heif
-- 3. Idempotently drops 4 obsolete storage policies targeting non-existent 'voucher-uploads' bucket:
--    - voucher_insert_auth_owner
--    - voucher_read_auth_owner_or_admin
--    - voucher_update_auth_owner_or_admin
--    - voucher_delete_auth_owner_or_admin
-- 4. Preserves all valid policies intact (system policies, fattura-uploads policies, voucher-photo policies).
--
-- Requires downtime: No
-- Requires data backfill: No
--
-- Verification SQL:
-- SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets
-- WHERE id IN ('system', 'voucher-photo', 'fattura-uploads');
--
-- SELECT policyname FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'voucher_%';
--
-- Rollback (Manual, if required - DO NOT RUN AUTOMATICALLY):
-- UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
-- WHERE id IN ('system', 'voucher-photo', 'fattura-uploads');

BEGIN;

-- ==========================================
-- 1. Pre-check: verify all 3 target buckets exist
-- ==========================================
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT ARRAY_AGG(b_id) INTO v_missing
  FROM (
    SELECT unnest(ARRAY['system', 'voucher-photo', 'fattura-uploads']) AS b_id
  ) expected
  WHERE b_id NOT IN (SELECT id FROM storage.buckets);

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Storage limits migration aborted: missing target bucket(s): %', array_to_string(v_missing, ', ');
  END IF;
END $$;

-- ==========================================
-- 2. Update Storage Bucket Upload Limits
-- ==========================================

-- 2.1 Bucket 'system': limit 1 MB (1048576 bytes), MIME: application/json
UPDATE storage.buckets
SET
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['application/json']::text[]
WHERE id = 'system';

-- 2.2 Bucket 'voucher-photo': limit 5 MB (5242880 bytes), MIME: images only
UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
WHERE id = 'voucher-photo';

-- 2.3 Bucket 'fattura-uploads': limit 10 MB (10485760 bytes), MIME: pdf + images
UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
WHERE id = 'fattura-uploads';

-- ==========================================
-- 3. Drop obsolete policies targeting legacy 'voucher-uploads' bucket
-- ==========================================
DROP POLICY IF EXISTS "voucher_insert_auth_owner" ON storage.objects;
DROP POLICY IF EXISTS "voucher_read_auth_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "voucher_update_auth_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "voucher_delete_auth_owner_or_admin" ON storage.objects;

COMMIT;
