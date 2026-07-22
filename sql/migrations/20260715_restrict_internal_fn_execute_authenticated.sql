-- Issue #279: restrizione EXECUTE per authenticated sulle funzioni SECURITY
-- DEFINER esclusivamente interne.

DO $$
BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.set_created_by_auth() FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.set_users_created_by_auth() FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.notify_admin_crediti_modifica() FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.delete_voucher_photo() FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.reset_rate_limit(text, text) FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
