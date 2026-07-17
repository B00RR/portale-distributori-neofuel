-- Issue #304: remove broken Auth provisioning trigger
--
-- What this does:
--   Removes auth.users.on_auth_user_created and public.handle_new_user().
--   Profile provisioning becomes the exclusive responsibility of the
--   admin_create_user_v2 Edge Function.
--
-- Downtime:
--   Administrative user provisioning is intentionally fail-closed between
--   deployment of the new Edge Function and completion of this migration.
--
-- Data backfill:
--   None. Existing Auth identities and public.users rows are not modified.
--   In particular, the three known Auth identities without profiles are kept.
--   Unique indexes are added only after the pre-deploy duplicate checks pass.
--
-- Rollback:
--   Forward-only. Do not restore the incompatible trigger and do not re-enable
--   public signup. If provisioning must be suspended, leave signup disabled
--   and deploy a separate repair migration/function version.

BEGIN;

CREATE OR REPLACE FUNCTION public.lookup_auth_user_for_provisioning(p_email text)
RETURNS TABLE (
  id uuid,
  email_confirmed_at timestamptz,
  provisioning_request_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth_user.id,
    auth_user.email_confirmed_at,
    auth_user.raw_app_meta_data ->> 'provisioning_request_id'
  FROM auth.users AS auth_user
  WHERE lower(auth_user.email) = lower(p_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_auth_user_for_provisioning(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_auth_user_for_provisioning(text) FROM anon;
REVOKE ALL ON FUNCTION public.lookup_auth_user_for_provisioning(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_auth_user_for_provisioning(text) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS users_created_by_auth_key
  ON public.users (created_by_auth)
  WHERE created_by_auth IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON public.users (lower(username));

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

COMMIT;
