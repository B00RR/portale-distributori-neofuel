# Issue #305 — migrazione controllata degli identificatori Auth

## Scopo e confini

Questo runbook allinea l'email tecnica di Supabase Auth e
`public.users.email` all'alias deterministico
`<username-normalizzato>@neofuel.local`. La password resta esclusivamente in
Supabase Auth: non viene letta, rigenerata o scritta. La migrazione non crea e
non cancella account e non modifica UUID, ruolo, stato attivo o relazioni.

Gli script sono artefatti operativi da eseguire in un change window separato,
**dopo il merge** e solo da una postazione amministrativa. La preparazione della
PR non autorizza alcuna esecuzione su Supabase live o Vercel production.

## Contratto e garanzie

- Il contratto username-alias è importato dallo stesso modulo versionato usato
  dal login e dal provisioning.
- `dry-run` è la modalità predefinita.
- L'inventario pagina sia `public.users` sia `auth.users`; non si limita alla
  prima pagina.
- L'unico aggiornamento Auth è
  `auth.admin.updateUserById(authUserId, { email })`. Non sono presenti
  `createUser`, `deleteUser`, password, `email_confirm` o metadata nella
  CLI di migrazione.
- Il profilo viene aggiornato con compare-and-swap su `user_id`,
  `created_by_auth` ed email precedente.
- Ogni record viene riletto verificando UUID Auth, user ID, username, ruolo,
  stato attivo ed `email_confirmed_at`.
- I report contengono solo riferimenti SHA-256 troncati: mai email o UUID
  completi, token, chiavi o password.
- Lo snapshot di rollback contiene i valori reversibili, ma è cifrato e
  autenticato con AES-256-GCM. La chiave non viene salvata nello snapshot.
- Snapshot e report devono usare percorsi assoluti esterni al repository; la
  CLI rifiuta percorsi sotto la working directory.

## Prerequisiti

1. Deno 2.9.3 o la versione fissata dalla CI.
2. PR applicativa approvata e testata in un progetto Supabase disposable.
3. Change freeze su creazione/modifica utenti.
4. Sessione break-glass già verificata e mantenuta aperta.
5. Signup pubblico disabilitato.
6. Directory sicura, esterna al clone e con backup cifrato, per snapshot e
   report.
7. Credenziali caricate da secret manager nelle seguenti variabili:

   - `SUPABASE_URL`;
   - `SUPABASE_PROJECT_REF`;
   - `SUPABASE_SERVICE_ROLE_KEY`;
   - `SUPABASE_ANON_KEY`, usata solo per verificare che una SELECT su
     `public.users` venga negata con SQLSTATE `42501`;
   - `SUPABASE_ACCESS_TOKEN` per leggere la configurazione Auth tramite
     Management API;
   - `AUTH_IDENTITY_SNAPSHOT_KEY_BASE64`, esattamente 32 byte casuali
     codificati Base64;
   - `AUTH_IDENTITY_SNAPSHOT_PATH`, percorso assoluto esterno al repository;
   - `AUTH_IDENTITY_REPORT_PATH`, percorso assoluto esterno al repository e
     diverso dal percorso snapshot.

Non usare variabili con prefisso `VITE_` per la service-role key. Non passare
segreti come argomenti di comando e non abilitare shell tracing. La CLI verifica
che l'host di `SUPABASE_URL` sia esattamente
`<SUPABASE_PROJECT_REF>.supabase.co` e fallisce se una variabile obbligatoria
manca.

## Comandi

Da PowerShell, dopo avere valorizzato le variabili da secret manager:

```powershell
$issue305Host = "$($env:SUPABASE_PROJECT_REF).supabase.co"
$issue305NetAllow = "api.supabase.com,$issue305Host"
$issue305CommonEnvNames = @(
  'SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUTH_IDENTITY_SNAPSHOT_KEY_BASE64',
  'AUTH_IDENTITY_SNAPSHOT_PATH',
  'AUTH_IDENTITY_REPORT_PATH'
)
$issue305PreflightEnvAllow = (
  $issue305CommonEnvNames + @('SUPABASE_ANON_KEY', 'SUPABASE_ACCESS_TOKEN')
) -join ','
$issue305RollbackEnvAllow = $issue305CommonEnvNames -join ','

function New-Issue305PhasePermissions([switch]$IncludeSnapshotWrite) {
  $readAllow = @(
    (Get-Location).Path,
    [IO.Path]::GetDirectoryName($env:AUTH_IDENTITY_SNAPSHOT_PATH),
    [IO.Path]::GetDirectoryName($env:AUTH_IDENTITY_REPORT_PATH)
  ) | Sort-Object -Unique
  $writeAllow = @($env:AUTH_IDENTITY_REPORT_PATH)
  if ($IncludeSnapshotWrite) {
    $writeAllow += $env:AUTH_IDENTITY_SNAPSHOT_PATH
  }
  [PSCustomObject]@{
    Read = $readAllow -join ','
    Write = $writeAllow -join ','
  }
}

# Default: dry-run. Crea uno snapshot nuovo e rifiuta di sovrascriverne uno esistente.
$issue305Permissions = New-Issue305PhasePermissions -IncludeSnapshotWrite
deno run "--allow-env=$issue305PreflightEnvAllow" "--allow-net=$issue305NetAllow" "--allow-read=$($issue305Permissions.Read)" "--allow-write=$($issue305Permissions.Write)" scripts/auth-identity-migration/cli.ts dry-run

# Applicazione controllata dello snapshot già approvato.
$issue305Permissions = New-Issue305PhasePermissions
deno run "--allow-env=$issue305PreflightEnvAllow" "--allow-net=$issue305NetAllow" "--allow-read=$($issue305Permissions.Read)" "--allow-write=$($issue305Permissions.Write)" scripts/auth-identity-migration/cli.ts apply

# Verifica post-migrazione.
$issue305Permissions = New-Issue305PhasePermissions
deno run "--allow-env=$issue305PreflightEnvAllow" "--allow-net=$issue305NetAllow" "--allow-read=$($issue305Permissions.Read)" "--allow-write=$($issue305Permissions.Write)" scripts/auth-identity-migration/cli.ts verify

# Rollback idempotente verso i valori cifrati nello snapshot.
$issue305Permissions = New-Issue305PhasePermissions
deno run "--allow-env=$issue305RollbackEnvAllow" "--allow-net=$issue305Host" "--allow-read=$($issue305Permissions.Read)" "--allow-write=$($issue305Permissions.Write)" scripts/auth-identity-migration/cli.ts rollback
```

Prima di **ogni** invocazione impostare `AUTH_IDENTITY_REPORT_PATH` a un nuovo
percorso assoluto esterno al repository e ricreare `$issue305Permissions`: la
CLI usa creazione esclusiva e rifiuta di sovrascrivere un report precedente.
Archiviare separatamente i report `dry-run`, `apply`, `verify` e `rollback`.

Non riusare lo stesso percorso snapshot per un nuovo dry-run: conserva lo
snapshot approvato immutato fino alla chiusura del periodo di osservazione.
Il rollback non interroga la Management API né esegue il probe anonimo e non
richiede `SUPABASE_ACCESS_TOKEN`/`SUPABASE_ANON_KEY`: resta disponibile durante
un incidente, ma continua a verificare target, snapshot, inventario e
post-condizioni usando la service-role key.

## Blocchi fail-closed dell'inventario

La CLI non applica modifiche se trova anche una sola delle condizioni seguenti:

- username non valido secondo il contratto;
- collisione fra username dopo trim/lowercase;
- alias atteso già occupato da un altro UUID Auth;
- profilo senza `created_by_auth` o senza identità Auth corrispondente;
- identità Auth senza profilo;
- più profili collegati allo stesso UUID Auth;
- email Auth o profilo mancante;
- email Auth/profilo discordanti senza che uno dei due lati sia già l'alias
  atteso;
- drift di conteggi, identità, alias o campi immutabili rispetto allo snapshot;
- stato parziale trovato da un nuovo dry-run senza lo snapshot originario;
- `disable_signup !== true` letto dalla Management API;
- una SELECT REST anonima che non fallisce con SQLSTATE `42501`.

Un report con blocker è redatto e termina con exit code non zero. Risolvere e
rieseguire l'inventario; non modificare manualmente il report o lo snapshot.

## Test disposable obbligatorio

`scripts/auth-identity-migration/disposable-smoke.ts` prova realmente la
password prima e dopo la migrazione. Per sicurezza:

- rifiuta il project ref dichiarato come production;
- richiede l'ack esplicito
  `ALLOW_DISPOSABLE_AUTH_SMOKE=issue-305-disposable-only`;
- richiede un progetto completamente vuoto;
- verifica che `anon` non possa leggere `public.users`;
- crea un solo account e una relazione stazione sintetici;
- migra con la CLI reale, ripete `apply` come no-op, verifica la relazione,
  accede con la **stessa password**, esegue il rollback e riprova la password
  legacy;
- elimina soltanto le fixture esatte nel `finally`.

Il seed/delete appartiene solo all'harness disposable, mai alla CLI di
migrazione. Oltre alle variabili precedenti richiede
`PRODUCTION_SUPABASE_PROJECT_REF` e
`AUTH_IDENTITY_SMOKE_PASSWORD`, tutte da secret manager.

```powershell
$env:ALLOW_DISPOSABLE_AUTH_SMOKE = 'issue-305-disposable-only'
$issue305DisposableEnvAllow = (
  $issue305CommonEnvNames + @(
    'SUPABASE_ANON_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'PRODUCTION_SUPABASE_PROJECT_REF',
    'AUTH_IDENTITY_SMOKE_PASSWORD',
    'ALLOW_DISPOSABLE_AUTH_SMOKE'
  )
) -join ','
deno run "--allow-env=$issue305DisposableEnvAllow" "--allow-net=$issue305NetAllow" --allow-read --allow-write scripts/auth-identity-migration/disposable-smoke.ts
```

Non eseguire lo smoke se il progetto non è una branch/disposable dedicata.

## Ordine esatto del change window

1. Rieseguire l'inventario live in sola lettura e conservare il report redatto.
2. Leggere la configurazione Auth via Management API e richiedere
   `disable_signup === true`.
3. Eseguire il dry-run; bloccare la finestra per collisioni, orphan, mismatch o
   qualsiasi altro blocker.
4. Conservare snapshot cifrato, checksum del file cifrato e chiave in sistemi
   separati; approvare l'insieme esatto delle identità.
5. Eseguire `disposable-smoke.ts` su ambiente vuoto e archiviare soltanto
   l'esito redatto.
6. Distribuire e verificare `admin_create_user_v2` allineato allo stesso
   contratto; mantenere il freeze sul provisioning.
7. Eseguire `apply`, poi `verify`, usando lo snapshot approvato.
8. Distribuire il frontend che deriva l'alias senza lookup anonimo.
9. Aprire un browser con storage/cookie vuoti e verificare il login username +
   password.
10. Verificare nuovamente che `anon` e `PUBLIC` non abbiano SELECT su
    `public.users` e che non esistano policy anonime.
11. Confermare accesso admin, caricamento profilo tramite
    `created_by_auth`, ruolo e stato attivo server-authoritative.
12. Rimuovere il freeze e monitorare errori Auth/profilo per tutto il periodo
    concordato.
13. Al primo fallimento di autenticazione o caricamento profilo, riattivare il
    freeze e seguire il rollback sotto.

Controlli SQL read-only del punto 10:

```sql
select
  has_table_privilege('anon', 'public.users', 'select') as anon_has_select,
  has_table_privilege('public', 'public.users', 'select') as public_has_select;

select count(*) as anonymous_policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'users'
  and ('anon' = any (roles) or 'public' = any (roles));
```

Entrambi i privilegi devono essere `false` e il conteggio policy deve essere
`0`.

## Gap non atomico e compensazione

Supabase Admin API e Postgres non partecipano alla stessa transazione:

1. `apply` aggiorna prima l'email Auth;
2. aggiorna poi il profilo con compare-and-swap;
3. rilegge entrambi i lati e tutti i campi immutabili.

Se il CAS del profilo fallisce, la saga ripristina subito l'email Auth
precedente. Se una risposta è ambigua, rilegge lo stato prima di decidere. Se
una compensazione fallisce, interrompe l'intero batch con exit code non zero:
non prosegue con altre identità. Il rerun con lo stesso snapshot riconosce
`legacy`, stato parziale o `aligned` e non duplica account.

Il rollback usa l'ordine inverso: profilo verso il valore precedente, poi Auth.
Se Auth fallisce, il profilo viene compensato di nuovo verso l'alias. Nessun
passaggio cambia password, UUID, conferma email, ruolo o stato attivo.

## Rollback

1. Bloccare provisioning e accesso al portale; mantenere signup disabilitato.
2. Conservare log e report redatti del fallimento.
3. Ripristinare la release frontend precedente durante la finestra bloccata.
4. Eseguire `rollback` con **lo stesso snapshot e la stessa chiave**.
5. Rieseguire l'inventario e verificare esattamente email precedenti, UUID,
   `email_confirmed_at`, ruoli, stato attivo e collegamenti.
6. Verificare ancora assenza di SELECT/policy anonime e signup disabilitato.
7. Usare la sessione break-glass per le attività operative e preparare un
   roll-forward corretto.

La release precedente conserva il difetto di login fresh-session: il rollback
ripristina lo stato pre-change, non risolve #305. Per questo la finestra deve
restare bloccata finché il roll-forward non è validato; non concedere SELECT
anonimo come misura temporanea e non ricreare password/account.

## Custodia e distruzione degli artefatti

Conservare snapshot cifrato, chiave e checksum in sistemi separati con accesso
auditato. Al termine del periodo di osservazione, seguire la retention
aziendale; la cancellazione deve essere esplicita e approvata. I report redatti
possono essere allegati al change record, ma non lo snapshot né la chiave.
