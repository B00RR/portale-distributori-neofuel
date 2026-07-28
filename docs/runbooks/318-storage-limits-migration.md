# Issue #318 — Runbook: Rollout Limiti Storage e Pulizia Policy Obsolete

## Scopo e Obiettivo

Questo runbook definisce la procedura operativa rigorosa per applicare la migrazione SQL `sql/migrations/20260728_storage_limits_obsolete_policies_318.sql` all'ambiente Supabase di produzione.

La migrazione:

1. Imposta i limiti di dimensione (`file_size_limit`) e i tipi MIME consentiti (`allowed_mime_types`) sui tre bucket:
   - `system`: 1 MB (`1048576` byte), MIME `['application/json']`
   - `voucher-photo`: 5 MB (`5242880` byte), MIME `['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']`
   - `fattura-uploads`: 10 MB (`10485760` byte), MIME `['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']`
2. Rimuove idempotentemente le 4 policy RLS obsolete che puntavano al bucket legacy inesistente `voucher-uploads`.
3. Preserva integralmente tutti gli oggetti storici e le 9 policy RLS valide.

---

## Prerequisiti e Sicurezza

- **Zero credenziali reali nei file del repository**: Utilizzare esclusivamente variabili d'ambiente o la Supabase CLI in sessioni autorizzate.
- **Transazionalità e Fail-Closed**: La migrazione viene eseguita in un blocco `BEGIN ... COMMIT;` con un pre-check fail-closed che interrompe immediatamente l'esecuzione se uno dei 3 bucket target è assente.
- **Impatto sugli oggetti esistenti**: Nessuno. I limiti agiscono esclusivamente sui nuovi upload via Storage API.
- **Verifica Automatizzata in CI**: La pipeline CI esercita la medesima configurazione contro Supabase Storage effimero con `service_role` locale per validare l'enforcement dei limiti MIME e dimensione prima del rollout in produzione (la procedura di produzione rimane invariata).

---

## Procedura di Rollout Live

### Fase 1: Snapshot Read-Only Pre-Applicazione (Policy e Bucket)

Prima di applicare la migrazione, eseguire dalla SQL Dashboard o tramite CLI la query di verifica preventiva sul progetto production collegato (linked).

#### 1.1 Verifica link del progetto (senza stampare segreti)

Verificare tramite la CLI che il progetto sia linked al project ref di produzione `ahlmgafaurossyghimxc`:

```bash
supabase projects list --output json | jq -e '[.[] | select(.linked == true) | .ref] == ["ahlmgafaurossyghimxc"]'
```

> ⚠️ **STOP CONDITION FAIL-CLOSED**: Se il comando sopra restituisce un exit code non-zero (es. `false` / errore), il progetto linked non corrisponde o il CLI non è autorizzato sul progetto di produzione corretto. **ARRESTARE IMMEDIATAMENTE LA PROCEDURA** e non applicare la migrazione. Non stampare o salvare segreti nei log.

#### 1.2 Snapshot dello stato corrente dei bucket

```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('system', 'voucher-photo', 'fattura-uploads');
-- Atteso prima della migrazione: file_size_limit e allowed_mime_types sono NULL
```

#### 1.3 Snapshot dettagliato delle 9 policy corrette e delle 4 obsolete

```sql
SELECT policyname, tablename, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
-- Salvare il risultato dello snapshot per il confronto post-migrazione.
-- Verificare la presenza delle 9 policy valide e delle 4 policy obsolete.
```

---

### Fase 2: Applicazione Migrazione

Eseguire il file di migrazione dal clone di `main` aggiornato e linked tramite il comando supportato dalla CLI installata:

```bash
npx supabase db query --linked -f sql/migrations/20260728_storage_limits_obsolete_policies_318.sql
```

---

### Fase 3: Test Storage API con Identità Sintetica

I test funzionali post-migrazione vanno eseguiti **esclusivamente sul progetto live con una identità SINTETICA di test esplicitamente autorizzata** (es. utente/operatore sintetico di test), e **MAI con account o dati aziendali reali**.

> ⚠️ **STOP CONDITION PREVENTIVA**: Se l'identità sintetica di test non è disponibile o non possiede le autorizzazioni coerenti per l'upload sul bucket `voucher-photo`, **NON IMPROVVISARE CREDENZIALI E NON CREARE UTENTI SENZA AUTORIZZAZIONE**. La procedura deve essere immediatamente sospesa.

Tutti e tre i test di seguito utilizzano il solo bucket `voucher-photo` e un prefisso univoco esatto basato su UUID (es. `__issue318_verification/<UUID>/`), affinché l'identità sintetica dell'operatore superi i controlli RLS della policy `voucher_photo_insert_operator` e la differenza di comportamento osservata dipenda unicamente dai limiti definiti sul bucket.

> ℹ️ **Nota Tipi MIME**: Il controllo del MIME type valida l'header HTTP `Content-Type` inviato nella richiesta di upload, non l'estensione del nome file.

Generare un UUID univoco per la sessione di verifica (es. `UUID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"`).

#### Test 3.1: JPEG valido sotto 5 MiB (Atteso: SUCCESS / HTTP 200)

- **Bucket**: `voucher-photo`
- **Path**: `__issue318_verification/<UUID>/test_valid.jpg`
- **Payload**: File JPEG valido di 100 KB
- **Header**: `Content-Type: image/jpeg`
- **Esito atteso**: Upload completato con successo (HTTP 200/201).

#### Test 3.2: Payload piccolo con Content-Type non consentito (Atteso: FAILURE / MIME Error)

- **Bucket**: `voucher-photo`
- **Path**: `__issue318_verification/<UUID>/test_invalid_mime.jpg`
- **Payload**: File piccolo di 1 KB
- **Header**: `Content-Type: text/plain`
- **Esito atteso**: Upload rifiutato dalla Storage API per tipo MIME non consentito.

#### Test 3.3: Payload > 5 MiB con Content-Type valido (Atteso: FAILURE / Size Limit Error)

- **Bucket**: `voucher-photo`
- **Path**: `__issue318_verification/<UUID>/test_too_large.jpg`
- **Payload**: File JPEG di 6 MB (6,291,456 byte)
- **Header**: `Content-Type: image/jpeg`
- **Esito atteso**: Upload rifiutato dalla Storage API per superamento limite dimensione (HTTP 413 / 400).

---

### Fase 4: Verifica Esatta in `storage.objects` e Cleanup Immediato

Verificare in `storage.objects` **esclusivamente i tre path UUID esatti** utilizzati durante la verifica. **NON utilizzare filtri basati su intervalli temporali (`created_at > now() - interval ...`)**, per evitare di includere upload legittimi di utenti in produzione.

#### 4.1 Verifica presenza esclusiva dell'oggetto valido

```sql
SELECT bucket_id, name, path_tokens, metadata, created_at
FROM storage.objects
WHERE bucket_id = 'voucher-photo'
  AND name IN (
    '__issue318_verification/<UUID>/test_valid.jpg',
    '__issue318_verification/<UUID>/test_invalid_mime.jpg',
    '__issue318_verification/<UUID>/test_too_large.jpg'
  );
-- Risultato atteso: Esattamente 1 riga (soltanto '__issue318_verification/<UUID>/test_valid.jpg')
```

#### 4.2 Cleanup dell'oggetto di verifica tramite Storage API / SDK

Rimuovere immediatamente l'unico oggetto di test riuscito (`__issue318_verification/<UUID>/test_valid.jpg`) **esclusivamente tramite Storage API / SDK autenticata** utilizzando la medesima identità sintetica di test.

> ⚠️ **IMPORTANTE**: **NON eseguire mai la cancellazione con query SQL dirette sulla tabella storage.objects**. Eliminare righe direttamente dalla tabella `storage.objects` rischia di lasciare oggetti orfani sul provider di storage sottostante. Le query SQL devono rimanere esclusivamente read-only per le verifiche.

Esempio di cancellazione via SDK Supabase JS (identità sintetica):

```typescript
const { error } = await supabase.storage
  .from('voucher-photo')
  .remove(['__issue318_verification/<UUID>/test_valid.jpg']);
```

O via chiamata HTTP Storage API DELETE:

```bash
# DELETE /storage/v1/object/voucher-photo/__issue318_verification/<UUID>/test_valid.jpg
```

#### 4.3 Seconda query di conferma cleanup (`remaining_test_objects = 0`)

Eseguire la query SQL in sola lettura per verificare la completa rimozione dell'oggetto di test:

```sql
SELECT count(*) AS remaining_test_objects
FROM storage.objects
WHERE bucket_id = 'voucher-photo'
  AND name IN (
    '__issue318_verification/<UUID>/test_valid.jpg',
    '__issue318_verification/<UUID>/test_invalid_mime.jpg',
    '__issue318_verification/<UUID>/test_too_large.jpg'
  );
-- Risultato atteso: 1 riga restituita con valore remaining_test_objects = 0
```

---

### Fase 5: Verifica Lettura Invariata `system/business_rules.json`

Verificare **esclusivamente in sola lettura** che il file di configurazione `system/business_rules.json` continui ad essere accessibile e scaricabile. **NON SOVRASCRIVERE IL FILE**.

```sql
SELECT id, bucket_id, name, metadata, created_at
FROM storage.objects
WHERE bucket_id = 'system' AND name = 'business_rules.json';
-- Risultato atteso: 1 riga presente e accessibile in lettura
```

---

### Fase 6: Post-Check Policy RLS (Confronto Dettagliato)

Eseguire la query di post-check includendo anche `cmd`, `roles`, `qual` e `with_check` per confermare che la semantica delle 9 policy corrette sia rimasta immutata e che le 4 obsolete siano state rimosse.

```sql
-- 1. Verifica che le 4 policy obsolete siano ASSENTI (deve restituire 0 righe)
SELECT policyname
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'voucher_insert_auth_owner',
    'voucher_read_auth_owner_or_admin',
    'voucher_update_auth_owner_or_admin',
    'voucher_delete_auth_owner_or_admin'
  );
-- Risultato atteso: 0 righe

-- 2. Verifica che le 9 policy valide abbiano dettagli immutati rispetto allo snapshot della Fase 1
SELECT policyname, tablename, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'Solo Admin possono gestire le regole',
    'Tutti i loggati leggono le regole',
    'fattura_insert_auth_owner',
    'fattura_read_auth_owner_or_admin',
    'fattura_update_auth_owner_or_admin',
    'fattura_delete_auth_owner_or_admin',
    'voucher_photo_insert_operator',
    'voucher_photo_select_admin',
    'voucher_photo_delete_auth_owner_or_admin'
  )
ORDER BY policyname;
-- Risultato atteso: 9 righe con cmd, roles, qual e with_check identici allo snapshot iniziale.
```

---

## Rollback e Condizioni di STOP

### Condizioni di STOP (Rollback Trigger)

Interrompere immediatamente la procedura ed eseguire il rollback manuale nei seguenti casi:

- Errore SQL durante l'applicazione della migrazione.
- Identità sintetica di test non disponibile o sprovvista di autorizzazioni coerenti.
- Impossibilità dell'applicazione di leggere `system/business_rules.json`.
- Rifiuto improprio di upload legittimi rispettanti i limiti di dimensione e i tipi MIME definiti.

### Procedura di Rollback Manuale (SOLO SE NECESSARIO)

Se si attiva una condizione di STOP, ripristinare i limiti originali (`NULL`) sui tre bucket interessati.

```sql
BEGIN;

-- Ripristino limiti a NULL sui 3 bucket target
UPDATE storage.buckets
SET file_size_limit = NULL, allowed_mime_types = NULL
WHERE id IN ('system', 'voucher-photo', 'fattura-uploads');

COMMIT;
```

> ⚠️ **IMPORTANTE**: Ripristinare `file_size_limit` e `allowed_mime_types` a `NULL` è sufficiente per il rollback. **NON ricreare automaticamente le 4 policy obsolete**, in quanto puntavano ad un bucket legacy non esistente (`voucher-uploads`) e non devono essere reintrodotte.
