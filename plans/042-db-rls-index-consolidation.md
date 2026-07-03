# Plan 042: Consolidare policy RLS permissive e indici (advisor performance DB)

> **Istruzioni per l'executor**: modifica il DB **live** Supabase. Ogni intervento
> va prima analizzato in sola lettura e proposto; applicare solo con conferma
> umana. Rispetta le STOP conditions. Aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `get_advisors project_id=ahlmgafaurossyghimxc type=performance` (Supabase MCP).

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: può condividere la finestra di manutenzione con plans/041
- **Category**: perf
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/153

## Why this matters

Gli advisor performance del progetto Supabase segnalano ~179 lint: 79
`multiple_permissive_policies`, 58 `unused_index`, 30 `auth_rls_initplan`, 10
`unindexed_foreign_keys`, 2 `duplicate_index`. Sul dataset attuale (piccolo:
~10 turni, ~74 shift_pistols, 6 utenti) l'impatto è basso, ma i pattern crescono
con i dati: policy permissive multiple si combinano in OR e vengono valutate tutte
per ogni query; `auth_rls_initplan` ricalcola `auth.uid()`/funzioni per riga
invece di una volta; FK non indicizzate rallentano join e cascade. È debito che
conviene ridurre in modo controllato prima che il volume cresca.

## Current state (da confermare live)

- Advisor performance (conteggi al 2026-07-03): 79 multiple_permissive_policies,
  58 unused_index, 30 auth_rls_initplan, 10 unindexed_foreign_keys, 2
  duplicate_index.
- 11 tabelle hanno policy permissive multiple per lo stesso comando. Le policy su
  `users` sono già state consolidate (policy singole `consolidated_users_*`): usa
  quelle come **modello** del pattern target.
- `auth_rls_initplan`: policy che chiamano `auth.uid()`/funzioni senza wrapping in
  subquery `(select auth.uid())`, causando ri-valutazione per riga.
- I file `sql/*.sql` sono STALE — fonte di verità è il DB live (Supabase MCP).

## Commands / strumenti

- Supabase MCP:
  - `get_advisors ... type=performance` (lista completa con remediation URL).
  - `execute_sql` (read) per ispezionare policy/indici:
    `select * from pg_policies where schemaname='public';`
    `select indexrelid::regclass, idx_scan from pg_stat_user_indexes where idx_scan=0;`
  - `apply_migration` SOLO con conferma umana.

## Scope

**In scope** (DB live, con conferma, per priorità):
1. `auth_rls_initplan` (30): riscrivere le policy per usare
   `(select auth.uid())` / `(select public.current_user_id())` così la funzione è
   valutata una volta per query (InitPlan) invece che per riga. **Nessun cambio di
   semantica**, solo forma.
2. `unindexed_foreign_keys` (10): aggiungere indici sulle colonne FK indicate.
3. `duplicate_index` (2) e `unused_index` (58): rimuovere i duplicati e gli indici
   davvero inutilizzati (con cautela: "unused" può significare solo "non ancora
   usato" su un DB giovane — vedi STOP).
4. `multiple_permissive_policies` (79): consolidare, tabella per tabella, sul
   modello di `consolidated_users_*`, preservando ESATTAMENTE la logica di accesso.

**Out of scope**:
- Qualsiasi cambio che alteri CHI può leggere/scrivere COSA (la consolidazione
  deve essere equivalente in accesso, non solo in forma).
- Il codice del repo.

## Steps

### Step 1: Scarica e classifica i lint (sola lettura)

Esegui `get_advisors type=performance` e raggruppa i lint per tabella e per tipo.
Parti dai gruppi a rischio più basso e valore più alto: `auth_rls_initplan` e
`duplicate_index`.

**Verify**: hai la lista per-tabella con remediation URL.

### Step 2: PROPONI le migrazioni a basso rischio per prime (conferma umana)

Redigi migrazioni separate e piccole:
- (a) wrapping `auth.*`/funzioni in subquery nelle policy `auth_rls_initplan`;
- (b) `CREATE INDEX` per le FK non indicizzate;
- (c) `DROP INDEX` per i 2 duplicati.
**RICHIEDE CONFERMA UMANA** per ciascun gruppo prima di `apply_migration`.

**Verify**: migrazioni redatte, ognuna con il suo elenco di oggetti toccati.

### Step 3: Consolidamento policy permissive (per tabella, conferma umana)

Per ogni tabella con policy multiple: elenca le policy correnti e i loro `USING`/
`WITH CHECK`, poi proponi UNA policy per comando che sia l'OR logico equivalente
(come `consolidated_users_select`). NON procedere su più di una tabella per volta
senza validazione.

**RICHIEDE CONFERMA UMANA**. NON `apply_migration` senza ok.

### Step 4: `unused_index` — solo dopo revisione umana

Gli indici "unused" su un DB giovane possono servire a query non ancora eseguite.
Presenta la lista e chiedi conferma per ciascuno prima di rimuoverlo. Preferire
rimuovere solo quelli chiaramente ridondanti (già coperti da un altro indice).

## Test plan

- Post-ogni-migrazione (dopo conferma): ri-eseguire `get_advisors type=performance`
  e verificare la riduzione dei lint del gruppo trattato.
- Verifica funzionale: login + letture admin/operator principali (dashboard,
  turni, voucher) restano corrette e la visibilità dei dati è invariata (la
  consolidazione non deve né esporre né nascondere righe rispetto a prima).

## Done criteria

- [ ] Lista advisor performance scaricata e classificata per tabella/tipo
- [ ] Migrazioni a basso rischio (initplan, FK index, duplicate index) **redatte e
      segnalate**, applicate solo con conferma
- [ ] Piano di consolidamento policy per-tabella redatto sul modello
      `consolidated_users_*`
- [ ] `unused_index` presentati per revisione, non rimossi in blocco
- [ ] Riga di stato in `plans/README.md` = BLOCKED (in attesa conferma umana)

## STOP conditions

- Una consolidazione cambierebbe l'insieme di righe visibili/scrivibili per un
  ruolo → NON applicarla, segnala.
- Un indice "unused" è l'unico a coprire una FK o un vincolo unico → non
  rimuoverlo.
- Qualsiasi `apply_migration` senza conferma umana → STOP.

## Maintenance notes

- Ripetere `get_advisors type=performance` periodicamente man mano che i dati
  crescono; alcuni indici oggi "unused" diventeranno utili.
- Coordinare con plans/041 (stessa finestra di manutenzione DB).
