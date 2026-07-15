-- Issue #279: restrizione EXECUTE per authenticated sulle funzioni SECURITY
-- DEFINER esclusivamente interne. Le funzioni trigger non richiedono
-- l'EXECUTE del chiamante al momento del fire (viene verificato solo alla
-- creazione del trigger), e il sistema rate-limit è orfano (zero chiamanti
-- in js/, il rate limiting client è in-memory). get_current_user_role non è
-- referenziata da policy, funzioni o client (candidata a rimozione futura).
--
-- Restano volutamente eseguibili da authenticated (matrice completa nella
-- issue #279): admin_assign_station, admin_delete_closure, admin_delete_user,
-- admin_update_price, redeem_voucher_validated, submit_shift_closure (RPC di
-- business con check interni), is_admin (chiamata via rpc dal client) e gli
-- helper RLS current_user_id, current_user_station_ids, get_current_user_id,
-- is_operator, is_station_operator (la valutazione delle policy richiede
-- l'EXECUTE del ruolo interrogante).

-- Funzioni trigger
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_created_by_auth() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_users_created_by_auth() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_crediti_modifica() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_voucher_photo() FROM authenticated;

-- Sistema rate-limit orfano
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_rate_limit(text, text) FROM authenticated;

-- Helper mai referenziato (0 policy, 0 funzioni, 0 client)
REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM authenticated;
