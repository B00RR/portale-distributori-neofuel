# Issue #306 — Runbook: Coerenza e Riconciliazione Ciclo Auth ↔ Profilo

## Scopo e Obiettivo

Questo runbook documenta la coerenza del ciclo `auth.users` ↔ `public.users` a seguito del completamento delle issue propedeutiche (#304, #305, #307):

- **Issue #304**: Rimozione del trigger legacy `on_auth_user_created` in favore della Edge Function `admin_create_user_v2` dotata di transazionalità e gestione di compensazione (rollback/cleanup automatico in caso di errore di provisioning profilo).
- **Issue #305**: Migrazione deterministica degli identificatori Auth verso l'alias `<username>@neofuel.local` e riconciliazione degli account orfani.
- **Issue #307**: Implementazione della verifica autorevole di `is_active` tramite l'hook pre-request di PostgREST (`pgrst_pre_request_check()`), policy RLS di tipo `RESTRICTIVE` (`enforce_active_user`), e sincronizzazione Realtime sulla tabella `public.users`.

Il ciclo Auth ↔ Profilo è garantito end-to-end e non sussistono più account orfani né possibilità che sessioni non attive accedano ai dati applicativi.

---

## Controlli e Verifiche Live sul DB

Per verificare lo stato del database in qualsiasi momento, eseguire le seguenti query SQL nel client amministrativo o tramite `npx supabase db query --linked`:

### 1. Conteggio Utenti Auth Attivi

```sql
SELECT count(*) AS total_active_auth_users
FROM auth.users
WHERE deleted_at IS NULL;
```

### 2. Conteggio Profili Pubblici

```sql
SELECT count(*) AS total_public_profiles
FROM public.users;
```

### 3. Ricerca Profili Orfani (senza account Auth corrispondente)

```sql
SELECT user_id, username, created_by_auth
FROM public.users
WHERE created_by_auth NOT IN (
  SELECT id FROM auth.users WHERE deleted_at IS NULL
);
-- Risultato atteso: 0 righe
```

### 4. Ricerca Utenti Auth Orfani (senza profilo public.users)

```sql
SELECT id, email
FROM auth.users
WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT created_by_auth FROM public.users WHERE created_by_auth IS NOT NULL
  );
-- Risultato atteso: 0 righe
```

---

## Scenari di Coerenza del Ciclo Auth ↔ Profilo

### 1. Creazione Utente (Admin Provisioning)

- **Flusso**: `admin_create_user_v2` Edge Function.
- **Garanzia**: Crea prima l'utente Auth, poi il profilo `public.users`. Se la creazione del profilo fallisce o risulta ambigua, la Edge Function attiva la routine di compensazione (`compensateAuthUser`) che elimina o disabilita l'utente Auth. Impossibile creare utenti Auth senza profilo.

### 2. Login Utente (`signInWithPassword`)

- **Flusso**: `js/core/auth.ts` -> `setupLoginForm`.
- **Garanzia**: Dopo il successo di `auth.signInWithPassword`, viene letto il profilo da `public.users` tramite `created_by_auth`. Se il profilo non esiste oppure se `is_active === false`, la sessione viene immediatamente invalidata (`quarantineUserActions`, `auth.signOut()`), mostrando l'errore "Account disattivato. Contatta un amministratore.".

### 3. Ripristino Sessione (`loadSession`)

- **Flusso**: `js/core/auth.ts` -> `loadSession`.
- **Garanzia**: Al caricamento/refresh della pagina, viene letto il profilo `public.users`. Se `is_active === false` o il profilo è assente/ambiguo, `loadSession()` invoca `clearSession()`, effettua il `signOut()` e restituisce `null`.

### 4. Hook Pre-Request PostgREST (`pgrst_pre_request_check`)

- **Flusso**: Eseguito lato PostgreSQL prima di ogni richiesta REST da client autenticati.
- **Garanzia**: Se `auth.uid()` appartiene a un utente disattivato o privo di profilo, PostgREST solleva immediatamente un'eccezione SQL (`account_inactive`, `profile_missing` o `profile_ambiguous`), bloccando qualsiasi lettura/scrittura sui dati.

### 5. Monitoraggio Realtime (`setupUserStatusMonitoring`)

- **Flusso**: Sottoscrizione Realtime su `public.users` per l'utente loggato.
- **Garanzia**: Se un amministratore imposta `is_active = false` nel DB, la variazione viene notificata via Realtime al client, scatenando `handleUserDeactivation()` che disconnette immediatamente l'operatore e pulisce lo stato locale.

---

## Test di Regressione Automatici

Un insieme completo di test unitari valida queste garanzie:

- `tests/unit/auth-profile-coherence-306.test.ts`
- `tests/unit/is-active-migration-307.test.ts`
- `tests/unit/admin-create-user-v2.test.ts`
