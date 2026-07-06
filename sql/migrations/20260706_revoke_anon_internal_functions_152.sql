-- Issue #152 — security(db): revoke EXECUTE anon on internal functions
--
-- Goal: remove anonymous-user EXECUTE access on internal / privileged RPC helpers
-- that should never be callable without authentication. Only revokes from the
-- `anon` role; authenticated access is preserved. No function bodies are changed.
--
-- This migration is idempotent: REVOKE is safe to re-run.
--
-- Safety note: all listed functions are internal helpers (SECURITY DEFINER) or
-- admin/maintenance utilities (SECURITY INVOKER). None are intentionally
-- public anonymous endpoints.

BEGIN;

-- Rate-limit / internal cleanup helpers (SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_rate_limit(text, text) FROM anon;

-- Auth / authorization / current-user helpers (SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_station_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_operator() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_station_operator(bigint) FROM anon;

-- Trigger / lifecycle helpers (SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_created_by_auth() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_users_created_by_auth() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_admin_crediti_modifica() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_voucher_photo() FROM anon;

-- Admin / maintenance utilities (SECURITY INVOKER — internal use only)
REVOKE EXECUTE ON FUNCTION public.calculate_liters_dispensed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_table(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_index_if_column_exists(regclass, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_daily_closure_totals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;

COMMIT;
