-- Security fix: prevent authenticated users from changing their own role.
--
-- The previous consolidated_users_update policy allowed a user to update their
-- own users row and therefore self-promote to an administrative role. This
-- migration makes users updates admin-only and aligns is_admin() with the
-- application's canonical admin roles.
--
-- Downtime: a brief ACCESS EXCLUSIVE lock is required while replacing the
-- role constraint. The table is currently small, so validation is expected to
-- complete quickly.
-- Data backfill: none.

BEGIN;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'operator', 'accounting', 'billing', 'super_admin', 'full_admin'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_id = public.current_user_id()
      AND role IN ('admin', 'super_admin', 'full_admin')
  ) INTO v_is_admin;

  RETURN v_is_admin;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

DROP POLICY IF EXISTS "consolidated_users_update" ON public.users;

CREATE POLICY "consolidated_users_update"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "users_select_own" ON public.users;

CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR created_by_auth = (SELECT auth.uid())
  );

-- RLS does not protect TRUNCATE. Remove the legacy ALL grants before restoring
-- only the row-level operations governed by the policies above.
REVOKE ALL PRIVILEGES ON TABLE public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
