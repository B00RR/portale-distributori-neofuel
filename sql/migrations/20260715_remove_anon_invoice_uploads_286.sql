-- Issue #286: Remove legacy anonymous access policies for invoice uploads.
--
-- What it does:
-- Drops the four legacy policies ("rule1 bt2v9q_0", "rule1 bt2v9q_1",
-- "rule1 bt2v9q_2", "rule1 bt2v9q_3") on storage.objects. These legacy policies
-- incorrectly allow public/anonymous access to the 'fattura-uploads' bucket.
-- Crucially, it does not modify or recreate the secure authenticated-only policies.
--
-- Downtime / Backfill:
-- None required.
--
-- Verification SQL:
-- SELECT policyname FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'rule1 bt2v9q_%';
-- (Should return zero rows)

DROP POLICY IF EXISTS "rule1 bt2v9q_0" ON storage.objects;
DROP POLICY IF EXISTS "rule1 bt2v9q_1" ON storage.objects;
DROP POLICY IF EXISTS "rule1 bt2v9q_2" ON storage.objects;
DROP POLICY IF EXISTS "rule1 bt2v9q_3" ON storage.objects;
