# Issue #340 — Runbook: Ripristino, Rollback e Backup

> Ultimo aggiornamento: 2026-08-07
> ⚠️ **Stato**: documentazione operativa. Il pilot resta **NO-GO** finché i Gate 0 e Gate 1 dell'audit non sono chiusi (vedi `docs/PILOT_RUNBOOK.md`).
> ⚠️ **Non-obiettivo**: questo runbook **non** autorizza restore sul progetto production. Ogni restore avviene su un progetto isolato/disposable. Il rollback applicativo non sostituisce mai il backup dati.

## Scopo e confini

Questo runbook coordina backup, restore e rollback dell'intero stack Neofuel:

- **Database** Supabase (PostgreSQL + RLS + RPC + Storage + Auth)
- **Edge Functions** (Deno, deployate su Supabase)
- **Frontend** (SPA TypeScript, deployata su Vercel)

Definisce obiettivi operativi espliciti (RPO/RTO), inventaria le capacità reali del piano
Supabase/Vercel, e fornisce procedure eseguibili e verificabili per restore su progetto
isolato, verifica integrità, rollback e cutover. Preferisce sempre **migrazioni forward-fix**
a rollback DDL distruttivo.

## Contesto infrastrutturale (verificato live il 2026-08-07)

| Componente | Dettaglio |
|---|---|
| Supabase project ref | `ahlmgafaurossyghimxc` (eu-west-1) |
| Auth alias domain | `neofuel.local` (username → `username@neofuel.local`) |
| Vercel project | `portale-distributori-neofuel` (deploy automatico da `main` dopo merge) |
| Edge Functions | `admin_create_user_v2`, `admin_reset_password_v2`, `update-prices` (+ `_shared`) |
| Estensioni DB | `pg_cron`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp` |
| Cron attivi | `daily_cutoff_2130_cest` (`30 19 * * *`), `daily_cutoff_2130_cet` (`30 20 * * *`) |
| Tracking migrazioni | `public.schema_migrations` (verifica con `npm run db:migrations:verify`) |

### Bucket Storage (verificati live)

| Bucket | Pubblico | Limite dimensione | MIME consentiti |
|---|---|---|---|
| `system` | no | 1 MB (`1048576`) | `application/json` |
| `voucher-photo` | no | 5 MB (`5242880`) | `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` |
| `fattura-uploads` | no | 10 MB (`10485760`) | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` |

### Dimensioni dati (verificate live il 2026-08-07)

| Entità | Conteggio |
|---|---|
| `public.users` | 3 |
| `auth.users` | 3 |
| `public.fuel_stations` | 1 |
| `public.shifts` | 1 |
| `public.vouchers` | 22 |
| `public.invoices` | 0 |

> Questi conteggi sono il **baseline di integrità** per i drill di restore: dopo un restore
> su progetto isolato, i conteggi devono coincidere con lo snapshot pre-restore.

---

## 1. Obiettivi operativi (RPO/RTO) e owner

### 1.1 RPO/RTO proposti

| Ambiente | RPO (perdita dati accettabile) | RTO (tempo di ripristino) | Note |
|---|---|---|---|
| **Pilot** | ≤ 24 h | ≤ 4 h | Backup giornaliero + PITR se disponibile; restore su progetto isolato |
| **Produzione** | ≤ 1 h | ≤ 2 h | Richiede PITR attivo; verifica capacità piano prima di fissare |

> ⚠️ **Regola**: non promettere RPO/RTO non supportati dal piano/provider. Prima di fissare
> i valori di produzione, inventariare la retention effettiva dei backup automatici e la
> disponibilità di PITR nel piano Supabase corrente. Se PITR non è attivo, l'RPO di
> produzione scende a quello del backup giornaliero (≥ 24 h) finché non viene abilitato.

### 1.2 Owner e canale escalation

| Ruolo | Responsabilità |
|---|---|
| **Owner tecnico** | @B00RR — approva ogni restore/rollback, detiene le credenziali break-glass |
| **Operatore on-call** | Esegue il runbook, registra durata/esito del drill |
| **Canale coordinamento** | issue #367 (agenti Claude ⇄ Hermes) |
| **Emergenze live** | issue dedicata con label `pilot`, `critical` |

### 1.3 Prerequisiti approvati

- [ ] RPO/RTO approvati dall'owner per pilot e produzione.
- [ ] Backup automatico confermato attivo (dashboard Supabase).
- [ ] Canale escalation e sessione break-glass verificati.
- [ ] Progetto isolato/disposable disponibile per i drill di restore.

---

## 2. Inventario backup, retention ed export

### 2.1 Backup automatici Supabase

Supabase fornisce backup automatici gestiti (dashboard → Database → Backups). La retention
dipende dal piano:

- **Free / Pro**: backup giornalieri con retention limitata (tipicamente 7 giorni).
- **Team / Enterprise**: retention estesa e PITR (point-in-time recovery) disponibile.

> ⚠️ **Verifica obbligatoria prima di fissare RPO/RTO**: aprire la dashboard Supabase →
> Database → Backups e registrare:
> - frequenza dei backup automatici;
> - retention effettiva (giorni);
> - stato PITR (abilitato/disabilitato);
> - dimensione del database e quota del piano.

### 2.2 Export manuali (backup off-site)

Oltre ai backup gestiti, eseguire export periodici **fuori dal provider** (off-site) per
proteggersi da incidenti a livello di account/progetto:

```bash
# Dump schema + dati (esclude auth e storage, che vanno gestiti separatamente)
supabase db dump --linked --schema public --data-only > /backup/neofuel_public_$(date +%Y%m%d).sql
supabase db dump --linked --schema public > /backup/neofuel_public_schema_$(date +%Y%m%d).sql
```

> ⚠️ **Nota**: `supabase db dump` non esporta `auth.users` (password hash) né gli oggetti
> Storage. Questi richiedono procedure dedicate (sezioni 2.3 e 2.4). Conservare i dump in
> una directory **esterna al repository** e cifrata.

### 2.3 Dipendenze Auth

`auth.users` contiene le identità e gli hash password. Un restore del solo schema `public`
**non** ripristina Auth. Per un restore completo dello stack:

- **Auth**: gli account vengono ricreati tramite `admin_create_user_v2` (provisioning
  autorizzato) oppure ripristinati dal backup gestito Supabase che include lo schema `auth`.
- **Contratto**: `public.users.created_by_auth` deve puntare all'UUID Auth corretto;
  `public.users.email` = `username@neofuel.local`. Verificare l'allineamento dopo il restore
  (vedi `docs/runbooks/305-auth-alias-migration.md`).

### 2.4 Dipendenze Storage

Gli oggetti Storage (bucket `system`, `voucher-photo`, `fattura-uploads`) **non** sono
inclusi in `supabase db dump`. Per esportarli:

```bash
# Elenco oggetti per bucket (read-only)
supabase db query --linked "SELECT bucket_id, name, metadata FROM storage.objects ORDER BY bucket_id, name;"
```

Per il backup off-site degli oggetti, usare la Storage API/SDK autenticata (service-role)
e scaricare ogni oggetto. **Non** cancellare mai oggetti con query SQL dirette su
`storage.objects` (rischio oggetti orfani sul provider).

### 2.5 Inventario riepilogativo

| Risorsa | Backup automatico | Export off-site | Restore su progetto isolato |
|---|---|---|---|
| Schema `public` + dati | Sì (gestito) | `supabase db dump` | Sì (sezione 3) |
| `auth.users` | Sì (gestito) | No (solo via provisioning) | Parziale (sezione 2.3) |
| Storage objects | Sì (gestito) | SDK/API | Sì (sezione 3.5) |
| Edge Functions | No (codice in repo) | Git | Redeploy (sezione 5) |
| Frontend | No (codice in repo) | Git | Rollback Vercel (sezione 4) |

---

## 3. Restore del database su progetto isolato

> ⚠️ **Regola fail-closed**: il restore avviene **sempre** su un progetto Supabase
> **isolato/disposable**, mai su production. Prima di ogni operazione verificare che il
> progetto linked sia quello corretto.

### 3.1 Verifica del progetto linked (fail-closed)

```bash
supabase projects list --output json | jq -e '[.[] | select(.linked == true) | .ref] == ["ahlmgafaurossyghimxc"]'
```

> ⚠️ **STOP CONDITION**: se il comando restituisce exit code non-zero, il progetto linked
> non è production. **Arrestare immediatamente** e non procedere. Non stampare segreti.

### 3.2 Snapshot pre-restore (baseline di integrità)

Prima di iniziare il drill, registrare i conteggi di baseline (vedi sezione "Dimensioni
dati") e gli hash dei file di configurazione:

```bash
# Conteggi baseline (devono coincidere dopo il restore)
supabase db query --linked "SELECT 'users' AS t, count(*) AS n FROM public.users UNION ALL SELECT 'auth_users', count(*) FROM auth.users UNION ALL SELECT 'stations', count(*) FROM public.fuel_stations UNION ALL SELECT 'shifts', count(*) FROM public.shifts UNION ALL SELECT 'vouchers', count(*) FROM public.vouchers UNION ALL SELECT 'invoices', count(*) FROM public.invoices;"

# Hash dei file di configurazione Storage
supabase db query --linked "SELECT id, bucket_id, name, metadata FROM storage.objects ORDER BY bucket_id, name;"
```

### 3.3 Restore su progetto isolato

Il metodo dipende dalla disponibilità di PITR e dal tipo di backup:

**Opzione A — PITR (se abilitato):** usare la dashboard Supabase del progetto isolato →
Database → Backups → Restore, selezionando il punto nel tempo desiderato. Questo ripristina
l'intero database (incluso `auth`).

**Opzione B — Dump SQL:** applicare il dump al progetto isolato:

```bash
# Link al progetto isolato (NON production)
supabase link --project-ref <PROJECT_ISOLATO_REF> --yes

# Applica schema + dati
supabase db query --linked --file /backup/neofuel_public_$(date +%Y%m%d).sql
```

> ⚠️ **Nota Windows/Git-Bash**: se `supabase db query --linked --file` fallisce con
> `42601: syntax error` su file SQL validi, normalizzare i fine riga a CRLF e passare via
> stdin:
> ```bash
> sed 's/$/\r/' /backup/neofuel_public_$(date +%Y%m%d).sql | supabase db query --linked
> ```

### 3.4 Verifica integrità post-restore

Dopo il restore, verificare che i conteggi coincidano con il baseline e che i flussi
critici funzionino:

```bash
# 1. Conteggi coincidono con il baseline
supabase db query --linked "SELECT 'users' AS t, count(*) AS n FROM public.users UNION ALL SELECT 'auth_users', count(*) FROM auth.users UNION ALL SELECT 'stations', count(*) FROM public.fuel_stations UNION ALL SELECT 'shifts', count(*) FROM public.shifts UNION ALL SELECT 'vouchers', count(*) FROM public.vouchers UNION ALL SELECT 'invoices', count(*) FROM public.invoices;"

# 2. RLS attiva sulle tabelle critiche
supabase db query --linked "SELECT tablename, count(*) AS policies FROM pg_policies WHERE schemaname='public' GROUP BY tablename ORDER BY tablename;"

# 3. Funzioni RPC presenti
supabase db query --linked "SELECT proname FROM pg_proc WHERE proname IN ('submit_shift_closure','submit_shift_closure_v2','open_shift','create_invoice_request','admin_delete_closure') ORDER BY proname;"

# 4. Cron attivi
supabase db query --linked "SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;"
```

**Smoke test dei flussi critici** (su progetto isolato, con identità sintetica):

- [ ] Login username + password (alias `username@neofuel.local`).
- [ ] Apertura turno con contatori e livelli cisterna.
- [ ] Chiusura turno con calcolo totale e discrepanza.
- [ ] Redemption voucher.
- [ ] Upload/lettura oggetto Storage su `voucher-photo`.

### 3.5 Restore Storage su progetto isolato

Dopo il restore del DB, ripristinare gli oggetti Storage sul progetto isolato tramite
Storage API/SDK autenticata (service-role), usando l'elenco catturato nello snapshot
pre-restore. Verificare che ogni oggetto sia leggibile e che i limiti MIME/dimensione dei
bucket siano applicati (vedi `docs/runbooks/318-storage-limits-migration.md`).

---

## 4. Rollback frontend (Vercel)

Il frontend è una SPA deployata su Vercel da `main`. Il rollback frontend **non** annulla
migrazioni/dati DB: è un'operazione indipendente.

### 4.1 Rollback a una release precedente

```bash
# Elenca i deploy del progetto
vercel ls portale-distributori-neofuel

# Promuovi un deploy precedente a production
vercel promote <deployment-url> --yes
```

> ⚠️ **Nota**: il rollback frontend ripristina il codice precedente ma **non** ripristina
> lo stato del database. Se la release precedente dipendeva da uno schema DB che è stato
> modificato, il rollback frontend può rompere il login o i flussi. In tal caso preferire
> un **forward-fix** (nuova release compatibile) piuttosto che un rollback frontend.

### 4.2 Rollback via Git (alternativa)

```bash
git revert <commit-sha>
# oppure, per tornare a una release nota:
git checkout <release-tag>
```

Poi pushare su un branch e aprire PR (mai pushare direttamente su `main`). Vercel
deploya automaticamente dopo il merge.

---

## 5. Rollback Edge Functions

Le Edge Functions (`admin_create_user_v2`, `admin_reset_password_v2`, `update-prices`)
sono codice in repo, deployate su Supabase. Il rollback consiste nel **redeploy di una
versione precedente** o nel **disattivare la funzione** in caso di incidente.

### 5.1 Disattivazione rapida (fail-closed)

Per sospendere immediatamente una funzione senza redeploy:

```bash
# Esempio: sospende il provisioning utenti (admin_create_user_v2)
supabase secrets set ADMIN_CREATE_USER_MAINTENANCE=true --project-ref ahlmgafaurossyghimxc
```

> ⚠️ **Nota**: `ADMIN_CREATE_USER_MAINTENANCE=true` fa restituire `503` alla funzione prima
> di qualsiasi lavoro privilegiato. È il meccanismo di sospensione documentato in
> `supabase/functions/README.md` (issue #304). Non riattivare finché il forward-fix non è
> verificato.

### 5.2 Redeploy di una versione precedente

```bash
# Da un checkout del commit precedente
supabase functions deploy admin_create_user_v2
supabase functions deploy update-prices
```

> ⚠️ **Regola**: preferire sempre un **forward-fix** (nuova versione verificata) al
> redeploy di una versione precedente che conserva il difetto. Il redeploy di una versione
> vecchia è un'eccezione solo quando il forward-fix non è pronto e la funzione è bloccante.

### 5.3 Verifica post-rollback

```bash
# Verifica che la funzione risponda come atteso
curl -s -X POST "https://ahlmgafaurossyghimxc.supabase.co/functions/v1/update-prices" \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"station_id":1,"benzina":1.5}'
```

---

## 6. Cutover

Il cutover è il passaggio del traffico al sistema ripristinato. Si applica solo dopo che
il restore su progetto isolato ha superato la verifica integrità e gli smoke test.

### 6.1 Sequenza di cutover

1. **Freeze**: bloccare le scritture (apertura/chiusura turno, voucher, crediti) durante
   la finestra di cutover.
2. **Snapshot finale**: catturare un ultimo dump del DB production come punto di rollback.
3. **Promozione**: se il restore è avvenuto su un progetto isolato, riconfigurare il
   frontend (Vercel env vars) per puntare al progetto ripristinato, oppure applicare il
   dump al progetto production (solo con approvazione owner).
4. **Verifica live**: eseguire gli smoke test dei flussi critici sul sistema promosso.
5. **Riapertura**: rimuovere il freeze e riprendere l'operatività normale.
6. **Monitoraggio**: osservare errori e discrepanze per il periodo concordato.

> ⚠️ **Regola**: il cutover verso production richiede **approvazione esplicita dell'owner**
> e una sessione break-glass verificata. Non eseguire cutover su production durante un
> drill.

---

## 7. Checklist di verifica (pre/post drill)

### Pre-drill

- [ ] Progetto isolato/disposable disponibile e linked.
- [ ] Baseline di integrità catturato (conteggi + hash Storage).
- [ ] Backup automatico confermato attivo.
- [ ] Canale escalation e sessione break-glass verificati.
- [ ] RPO/RTO approvati dall'owner.

### Post-restore

- [ ] Conteggi coincidono con il baseline.
- [ ] RLS attiva sulle tabelle critiche.
- [ ] RPC presenti e funzionanti.
- [ ] Cron attivi.
- [ ] Smoke test flussi critici superati (login, apertura, chiusura, voucher, storage).
- [ ] Nessun dato sensibile nei log/report (solo riferimenti SHA-256 troncati).

### Post-rollback

- [ ] Frontend servito è la release prevista.
- [ ] Edge Functions rispondono come atteso (o sospese con maintenance mode).
- [ ] Nessuna migrazione DDL distruttiva eseguita senza backup verificato.

---

## 8. Drill periodico e registrazione esiti

Ogni drill deve produrre evidenza e azioni correttive, senza dati sensibili:

- **Frequenza**: almeno trimestrale, o dopo ogni cambio infrastrutturale rilevante
  (migrazione schema, cambio piano, nuova Edge Function).
- **Manifest**: usare un'issue dedicata (es. "Drill restore #340 — <data>") per tracciare
  durata, esito e azioni correttive.
- **Registrazione**: durata totale, RTO raggiunto, RPO verificato, esito (PASS/FAIL),
  azioni correttive. Nessun dato sensibile (email, UUID completi, token, password).

> ⚠️ **Regola**: se un drill fallisce, mantenere lo stato **NO-GO** e correggere prima di
> procedere al pilot. Non dichiarare il pilot pronto finché un restore completo non ha
> superato la verifica integrità.

---

## 9. Rollback di questo runbook

Non applicabile: è documentazione. Se una procedura descritta qui si rivela errata o
incompleta, correggerla con un forward-fix (nuova versione del runbook) e registrare la
lezione nel drill successivo.
