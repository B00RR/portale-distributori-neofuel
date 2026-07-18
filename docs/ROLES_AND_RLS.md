# Ruoli & RLS - Portale Distributori Neofuel

> Ultimo aggiornamento: 2026-07-18  
> ⚠️ **Nota**: questo riepilogo si basa sul codice sorgente in `sql/`, `js/shared/roles.ts` e `supabase/functions/`. Lo stato live di Supabase può differire: verificare sempre prima di modificare policy o funzioni di autorizzazione.

## Ruoli utente

| Ruolo | Permessi tipici | Definito in |
|---|---|---|
| `operator` | Apre/chiude turni, gestisce cassa, vede solo le proprie stazioni assegnate | `public.users.role` |
| `admin` | Gestisce stazioni, operatori, prezzi, voucher; vede tutte le stazioni | `public.users.role` |
| `super_admin` | Come admin, con privilegi estesi su configurazioni sensibili | `public.users.role` |
| `full_admin` | Privilegi amministrativi completi (inclusi nella tassonomia `ADMIN_ROLES`) | `public.users.role` |
| `accounting` | Accesso in lettura a report e chiusure | `public.users.role` |
| `billing` | Gestione fatturazione e export | `public.users.role` |

## Mappatura ruoli → UI

- `js/shared/roles.ts` contiene helper come `isAdmin(role)` / `isOperator(role)` usati dai router di admin e operator per decidere quali viste renderizzare.
- Il pannello admin (`js/admin/`) è accessibile solo agli utenti con ruolo `admin`, `super_admin` o `full_admin` (tutti gli `ADMIN_ROLES`).
- Il pannello operatore (`js/operator/`) è accessibile agli operatori e agli admin.

## Autorizzazione lato server

Le funzioni RPC e le policy RLS utilizzano helper SQL per mappare l'utente autenticato Supabase (`auth.uid()`) al record in `public.users`:

- `public.current_user_id()` → ritorna `public.users.id` per la sessione attuale.
- `public.is_admin()` → verifica che il ruolo sia tra `admin`, `super_admin` o `full_admin` (tutti gli `ADMIN_ROLES`).
- `public.is_station_operator(p_station_id integer)` → verifica che l'utente sia assegnato alla stazione tramite `public.user_stations`.

Queste funzioni sono definite nelle migrazioni in `sql/` e possono differire dallo stato live.

## Row-Level Security (RLS): principi

- Le tabelle sensibili (`shifts`, `shift_pistols`, `tank_readings`, `vouchers`, `prices`, `users`, `user_stations`, ecc.) hanno RLS abilitato.
- Gli operatori vedono solo i dati delle stazioni a cui sono assegnati in `user_stations`.
- Gli admin vedono i dati di tutte le stazioni.
- Le operazioni di scrittura sensibili (creazione utenti, cancellazione chiusure, aggiornamento prezzi, apertura/chiusura turni) passano attraverso RPC o Edge Functions, che eseguono controlli espliciti prima di toccare le tabelle.

## Edge Functions con privilegi elevati

Alcune operazioni richiedono il Service Role Key e sono isolate in `supabase/functions/`:

- `admin_create_user_v2` → provisioning unico e autoritativo di identità Auth + profilo `public.users`.
- `admin_reset_password_v2` → reset password controllato.
- `update-prices` → aggiornamento prezzi con validazioni.

Queste funzioni non sono esposte direttamente al client; vengono invocate solo dopo i controlli di ruolo.

## Audit e tracciabilità

- La tabella `public.audit_logs` registra azioni amministrative critiche.
- Il campo `opening_data` in `public.shifts` memorizza lo stato completo all'apertura per ricostruibilità.

## Linee guida per modifiche

1. Non allargare mai i permessi RLS da `authenticated` a `public`/`anon` senza review del owner.
2. **Non rimuovere mai controlli di ruolo da funzioni di autorizzazione**: se l'`is_admin()` esistente controlla `admin`, `super_admin` e `full_admin`, la sostituzione deve controllare tutti e tre.
3. Quando si crea una nuova policy, fornire sia `USING` che `WITH CHECK` per `FOR ALL`/`FOR UPDATE`.
4. Ogni funzione `SECURITY DEFINER` deve includere `SET search_path = public, pg_temp` (o equivalente).
5. Verificare lo stato live di Supabase prima di applicare nuove policy o modificare funzioni esistenti.
