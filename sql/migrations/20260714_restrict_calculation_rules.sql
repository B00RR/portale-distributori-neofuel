-- Security fix: calculation DSL and active versions are financial business
-- rules. Authenticated users may execute published rules, but only admins may
-- mutate modules, versions, tests or logs.
--
-- This also removes TRUNCATE/TRIGGER/REFERENCES privileges that bypass or sit
-- outside row-level security semantics.
--
-- Downtime: none expected (brief policy locks only).
-- Data backfill: none.

BEGIN;

ALTER TABLE public.calculation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculation_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculation_logs ENABLE ROW LEVEL SECURITY;

ALTER VIEW public.calculation_modules_with_active SET (security_invoker = true);

DROP POLICY IF EXISTS "calculation logs authenticated" ON public.calculation_logs;
DROP POLICY IF EXISTS "calculation_logs_authenticated_all" ON public.calculation_logs;
DROP POLICY IF EXISTS "calculation_logs_admin_all" ON public.calculation_logs;

DROP POLICY IF EXISTS "calculation modules authenticated" ON public.calculation_modules;
DROP POLICY IF EXISTS "calculation_modules_authenticated_all" ON public.calculation_modules;
DROP POLICY IF EXISTS "calculation_modules_authenticated_select" ON public.calculation_modules;
DROP POLICY IF EXISTS "calculation_modules_admin_insert" ON public.calculation_modules;
DROP POLICY IF EXISTS "calculation_modules_admin_update" ON public.calculation_modules;
DROP POLICY IF EXISTS "calculation_modules_admin_delete" ON public.calculation_modules;

DROP POLICY IF EXISTS "calculation tests authenticated" ON public.calculation_tests;
DROP POLICY IF EXISTS "calculation_tests_authenticated_all" ON public.calculation_tests;
DROP POLICY IF EXISTS "calculation_tests_admin_all" ON public.calculation_tests;

DROP POLICY IF EXISTS "calculation versions authenticated" ON public.calculation_versions;
DROP POLICY IF EXISTS "calculation_versions_authenticated_all" ON public.calculation_versions;
DROP POLICY IF EXISTS "calculation_versions_authenticated_select" ON public.calculation_versions;
DROP POLICY IF EXISTS "calculation_versions_admin_insert" ON public.calculation_versions;
DROP POLICY IF EXISTS "calculation_versions_admin_update" ON public.calculation_versions;
DROP POLICY IF EXISTS "calculation_versions_admin_delete" ON public.calculation_versions;

CREATE POLICY "calculation_modules_authenticated_select"
  ON public.calculation_modules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "calculation_modules_admin_insert"
  ON public.calculation_modules
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "calculation_modules_admin_update"
  ON public.calculation_modules
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "calculation_modules_admin_delete"
  ON public.calculation_modules
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY "calculation_versions_authenticated_select"
  ON public.calculation_versions
  FOR SELECT
  TO authenticated
  USING (status = 'published' OR (SELECT public.is_admin()));

CREATE POLICY "calculation_versions_admin_insert"
  ON public.calculation_versions
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "calculation_versions_admin_update"
  ON public.calculation_versions
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "calculation_versions_admin_delete"
  ON public.calculation_versions
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY "calculation_tests_admin_all"
  ON public.calculation_tests
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "calculation_logs_admin_all"
  ON public.calculation_logs
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

REVOKE ALL PRIVILEGES ON TABLE
  public.calculation_modules,
  public.calculation_versions,
  public.calculation_tests,
  public.calculation_logs
FROM PUBLIC, anon;

REVOKE ALL PRIVILEGES ON TABLE
  public.calculation_modules,
  public.calculation_versions,
  public.calculation_tests,
  public.calculation_logs
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.calculation_modules,
  public.calculation_versions,
  public.calculation_tests,
  public.calculation_logs
TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.calculation_modules_with_active
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.calculation_modules_with_active
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
