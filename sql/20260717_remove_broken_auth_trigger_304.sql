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

CREATE UNIQUE INDEX IF NOT EXISTS users_created_by_auth_key
  ON public.users (created_by_auth)
  WHERE created_by_auth IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON public.users (lower(username));

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

COMMIT;
