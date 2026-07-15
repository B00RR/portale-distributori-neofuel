-- Issue #278: rimozione dei 15 grant EXECUTE residui a PUBLIC/anon sulle
-- funzioni SECURITY DEFINER. Verificato sul DB live il 2026-07-15:
-- nessuna di queste funzioni è invocata in contesto anonimo.
--
-- Classificazione (chiamanti reali verificati su codice + catalogo):
--   RPC admin (client, check is_admin() interno): admin_assign_station,
--     admin_delete_user
--   Helper RLS (usati nelle policy, servono ad authenticated):
--     current_user_id, current_user_station_ids, get_current_user_id,
--     is_operator, is_station_operator
--   Funzioni trigger (EXECUTE del chiamante non richiesto al fire):
--     handle_new_user (auth.users), set_created_by_auth (fuel_stations),
--     set_users_created_by_auth (users), notify_admin_crediti_modifica
--     (crediti_clienti), delete_voucher_photo (movimenti_cassa)
--   Sistema rate-limit orfano (zero chiamanti in js/): check_rate_limit,
--     cleanup_old_rate_limits, reset_rate_limit
--
-- Effetto collaterale documentato: le policy con roles={public} (shifts,
-- shift_pistols, movimenti_cassa, prezzi_distributore) referenziano gli
-- helper RLS; una query anonima su quelle tabelle ora fallisce con
-- permission denied invece di restituire un set vuoto. Comportamento
-- desiderato: anon non deve interrogarle affatto.
--
-- NOTA per migrazioni future: CREATE OR REPLACE preserva le ACL, ma un
-- DROP+CREATE ripristina il default EXECUTE a PUBLIC. Quando si ricrea una
-- funzione, includere sempre le REVOKE esplicite nella stessa migrazione.

REVOKE EXECUTE ON FUNCTION public.admin_assign_station(integer, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_station_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_voucher_photo() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_operator() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_station_operator(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_admin_crediti_modifica() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_rate_limit(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_created_by_auth() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_users_created_by_auth() FROM PUBLIC, anon;
