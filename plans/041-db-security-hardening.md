# Plan 041: Hardening sicurezza DB (revoca EXECUTE anon su funzioni interne + leaked-password)

> **Istruzioni per l'executor**: questo piano modifica il DB **live** Supabase.
> Procedi solo con conferma; ogni migrazione va prima proposta e validata in sola
> lettura. Rispetta le STOP conditions. Aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**: verifica lo stato live con il Supabase MCP
> (`get_advisors type=security`) PRIMA di qualsiasi modifica.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/152

## Why this matters

Gli advisor di sicurezza del progetto Supabase `ahlmgafaurossyghimxc` segnalano
funzioni `SECURITY DEFINER` interne eseguibili dal ruolo `anon` (non
autenticato), tra cui utilità di rate-limit e helper d'identità che non hanno
motivo di essere invocabili pubblicamente:
- `reset_rate_limit(text, text)` — **eseguibile da anon**: cancella i tentativi in
  `rate_limit_attempts` per un identifier/endpoint. Un anonimo potrebbe azzerare i
  contatori di rate-limit di chiunque.
- `cleanup_old_rate_limits()` — eseguibile da anon.
- Diversi helper (`current_user_id`, `is_admin`, `is_operator`, `handle_new_user`,
  `set_*`, ecc.) sono `granted_to anon,authenticated` pur essendo interni.

Impatto reale attuale **basso** (la tabella `rate_limit_attempts` non risulta
usata per enforcement dal client: `js/utils/rate-limiter.ts` è in-memory, e
`check_rate_limit`/`reset_rate_limit` non sono referenziati in `js/`), ma è
difesa-in-profondità dovuta su un'API pubblica. Inoltre la protezione
"leaked password" (HaveIBeenPwned) è disattivata in Auth.

## Current state (da confermare live prima di agire)

- Advisor security (estratto): `anon_security_definer_function_executable` su
  `check_rate_limit`, `cleanup_old_rate_limits`, `current_user_id`,
  `current_user_station_ids`, `delete_voucher_photo`, `get_current_user_id`,
  `handle_new_user`, `is_admin`, `is_operator`, `is_station_operator`,
  `notify_admin_crediti_modifica`, `reset_rate_limit`, `set_created_by_auth`,
  `set_users_created_by_auth`. Più `auth_leaked_password_protection` = disabled.
- `reset_rate_limit` (corpo live) cancella righe di `rate_limit_attempts` per
  `identifier`+`endpoint` e ritorna `true`; è `SECURITY DEFINER`,
  `granted_to anon,authenticated`.
- Le RPC di business (`submit_shift_closure`, `redeem_voucher_validated`) sono già
  auth-gated (`auth.uid()` + `user_stations`) e ristrette ad `authenticated`:
  **NON** vanno toccate qui.
- I file `sql/*.sql` sono STALE: non usarli come stato deployato; il DB live è la
  fonte di verità (usa il Supabase MCP).

## Commands / strumenti

- Supabase MCP (sola lettura prima, poi migrazione con conferma):
  - `get_advisors project_id=ahlmgafaurossyghimxc type=security`
  - `execute_sql` (read) per confermare i grant correnti:
    `select proname, proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in (...);`
  - `apply_migration` SOLO dopo conferma umana.
- Nessun comando repo (non tocca il codice del repo).

## Scope

**In scope** (DB live, con conferma):
- `REVOKE EXECUTE ... FROM anon` (ed eventualmente `authenticated` dove è helper
  puramente interno) sulle funzioni interne che non devono essere pubbliche —
  prioritariamente `reset_rate_limit`, `cleanup_old_rate_limits`, `check_rate_limit`.
- Abilitare la leaked-password protection in Auth (impostazione di progetto).

**Out of scope**:
- Le RPC di business auth-gated (`submit_shift_closure`, `redeem_voucher_validated`,
  `admin_*`) — restano invocabili da `authenticated`.
- Helper richiamati dalle policy RLS (`current_user_id`, `is_admin`, `is_operator`,
  `current_user_station_ids`, `is_station_operator`): le policy li invocano nel
  contesto del ruolo del chiamante — **verifica** se revocare EXECUTE ad anon/
  authenticated ne rompe la valutazione RLS PRIMA di toccarli. In dubbio, NON
  revocarli (STOP).
- Il codice del repo.

## Steps

### Step 1: Fotografa lo stato (sola lettura)

Con il Supabase MCP, esegui `get_advisors ... type=security` e un `execute_sql`
che elenchi `proname`, `prosecdef`, `proacl` per le funzioni sospette. Salva
l'elenco delle funzioni realmente `anon`-eseguibili.

**Verify**: hai la lista confermata dal DB live (non dagli advisor cached soltanto).

### Step 2: Verifica che revocare NON rompa le RLS

Per ciascun helper candidato alla revoca, controlla se compare in una policy RLS
(`select polname, pg_get_expr(polqual, polrelid) from pg_policy ...`). Le funzioni
usate SOLO come utilità applicative (`reset_rate_limit`, `cleanup_old_rate_limits`,
`check_rate_limit`, `delete_voucher_photo`, `notify_admin_crediti_modifica`,
`set_*`, `handle_new_user`) sono candidate sicure alla revoca da anon. Gli helper
usati DENTRO le policy vanno lasciati (revocare l'EXECUTE diretto ad anon in
genere è ok perché la policy gira con SECURITY DEFINER, ma va verificato — in
dubbio, STOP).

**Verify**: hai due liste: "revoca sicura" e "da lasciare/dubbie".

### Step 3: PROPONI la migrazione (conferma umana)

Redigi una migrazione con i soli `REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM anon;`
(e da `authenticated` solo per utilità puramente interne come le rate-limit fn).
Esempio prioritario:
```sql
REVOKE EXECUTE ON FUNCTION public.reset_rate_limit(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM anon;
```
**RICHIEDE CONFERMA UMANA**: fermati e segnala la migrazione. NON eseguire
`apply_migration` senza ok.

### Step 4: Abilita leaked-password protection

Segnala all'operatore di abilitare la protezione password compromesse in
Auth → Settings (impostazione di progetto, non SQL). Documenta il link advisor.

## Test plan

- Post-migrazione (dopo conferma): ri-eseguire `get_advisors type=security` e
  verificare che le voci `anon_security_definer_function_executable` per le
  funzioni revocate siano sparite.
- Verifica funzionale: login + un giro operatore/admin restano funzionanti (le RLS
  e le RPC di business non sono state toccate).

## Done criteria

- [ ] Lista funzioni anon-eseguibili confermata dal DB live
- [ ] Migrazione di REVOKE **redatta e segnalata** (non applicata senza conferma)
- [ ] Nota per abilitare leaked-password protection consegnata all'operatore
- [ ] Riga di stato in `plans/README.md` = BLOCKED (in attesa conferma umana)

## STOP conditions

- Una funzione candidata alla revoca è usata dentro una policy RLS e la revoca ne
  romperebbe la valutazione → NON revocarla, segnala.
- Qualsiasi tentazione di `apply_migration` senza ok umano → STOP.
- Gli advisor non mostrano più queste voci (già risolto) → marca REJECTED/DONE.

## Maintenance notes

- Se in futuro il rate-limit lato DB verrà davvero usato per enforcement (oggi non
  lo è), la revoca su `reset_rate_limit`/`check_rate_limit` diventa ancora più
  importante.
- Convergenza con il piano 042 (consolidamento RLS/indici): possono essere
  applicati nella stessa finestra di manutenzione DB.
