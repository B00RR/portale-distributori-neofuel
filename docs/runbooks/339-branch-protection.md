# Issue #339 — Runbook: Protezione branch, required check e deploy production

> Ultimo aggiornamento: 2026-08-07
> ⚠️ **Stato**: documentazione operativa + gate aggregato versionato in CI.
> La branch protection e il binding del deploy Vercel sono **impostazioni esterne al
> codice** e vanno attivate da un admin come descritto in questo runbook. Il gate
> aggregato (check `📊 Test Summary`) è già esposto dal workflow `quality-gate.yml`.

## Scopo

L'issue #339 vuole garantire che:

1. Le PR verso `main` siano **proteggibili**: nessun merge senza PR, branch aggiornato,
   conversazioni risolte e i **required check** verdi.
2. Il **deploy production** (Vercel) sia promosso **solo da `main`** dopo una PR mergiata
   con check verdi, e mai da branch non autorizzati.
3. I nomi esatti dei check siano documentati per evitare regole che smettono di bloccare
   dopo una rinomina di job.

La branch protection e le impostazioni deploy sono configurazione **esterna** al repository:
non possono essere committate in un workflow. Il codice di questa PR versiona invece:

- il **check aggregato** dei gate critici in `.github/workflows/quality-gate.yml` (job
  `report` / `📊 Test Summary`), pronto da marcare come required;
- questo **runbook operativo** con i nomi esatti dei context e la procedura di attivazione.

---

## 1. Check aggregato: `📊 Test Summary` (quality-gate.yml)

Il workflow `.github/workflows/quality-gate.yml` espone il job aggregato `report`
(display name **`📊 Test Summary`**), che:

- attende tutti i gate **bloccanti**: lint, type-check, deno-check, unit-tests,
  e2e-tests (matrix chromium/firefox/mobile), security-scan, build-check;
- riporta come **informativi** (non bloccanti) `🗄️ Database Types Check` e
  `📜 Migration Chain Check` (fase 1 di #336/#331);
- fallisce (`exit 1`) se **uno qualunque** dei gate bloccanti fallisce o viene saltato.

**Regola**: si marca **solo** `📊 Test Summary` come required check nella branch
protection. **Non** si marcano i singoli job del workflow come required — `report` li
incapsula già e fallisce se uno di essi fallisce. In questo modo la regola di merge è un
singolo context, stabile rispetto ai dettagli interni.

> ⚠️ Se in futuro `db-types-check` o `migration-chain-check` diventano bloccanti,
> aggiungerli alla condizione di exit di `report` prima di considerarli required.

---

## 2. Attivazione branch protection su `main`

Da **admin** del repo, applicare i required status checks. Il payload esatto per l'API
(equivalente alla UI *Settings → Branches → Branch protection rule*):

```bash
gh api -X PUT repos/B00RR/portale-distributori-neofuel/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "📊 Test Summary",
      "🧪 Ephemeral Database Integration Tests",
      "lighthouse"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null
}
JSON
```

> **`strict: true`**: richiede che il branch sia aggiornato con `main` prima del merge
> (evita merge obsoleti). Se una PR risulta "out of date", aggiornare/rebasingare il
> branch su `main`.

### Nomi esatti dei context (verificati sulle PR recenti, 2026-08-07)

Questi sono i nomi di check che GitHub usa oggi. Usarli **letteralmente** (con emoji) nella
regola di required status check; una rinomina di job rompe la regola, quindi aggiornare
questo runbook insieme a eventuali rename.

| Context (required check) | Workflow / job | Bloccante | Note |
|---|---|---|---|
| `📊 Test Summary` | `quality-gate.yml` → `report` | **Sì (gate aggregato)** | Da marcare required per primo |
| `🧪 Ephemeral Database Integration Tests` | `supabase-ephemeral-tests.yml` → `ephemeral-db-tests` | **Sì** | Supabase integration su DB effimero |
| `lighthouse` | `lighthouse.yml` → `lighthouse` | **Sì** (dopo stabilizzazione) | Auditing performance/browser |
| `🔍 Code Quality` | `quality-gate.yml` → `lint` | Via gate aggregato | ESLint + Prettier |
| `🧩 TypeScript` | `quality-gate.yml` → `type-check` | Via gate aggregato | `npm run type-check` |
| `🦕 Edge Function Deno Check` | `quality-gate.yml` → `deno-check` | Via gate aggregato | Deno/Edge functions |
| `🧪 Unit & Integration Tests` | `quality-gate.yml` → `unit-tests` | Via gate aggregato | Vitest + coverage |
| `🎭 End-to-End Tests (chromium)` | `quality-gate.yml` → `e2e-tests` | Via gate aggregato | Playwright |
| `🎭 End-to-End Tests (firefox)` | `quality-gate.yml` → `e2e-tests` | Via gate aggregato | Playwright |
| `🎭 End-to-End Tests (mobile)` | `quality-gate.yml` → `e2e-tests` | Via gate aggregato | Playwright (webkit) |
| `🔒 Security Audit` | `quality-gate.yml` → `security-scan` | Via gate aggregato | npm audit + Snyk |
| `build-check` | `quality-gate.yml` → `build-check` | Via gate aggregato | `npm run build` |
| `🗄️ Database Types Check` | `quality-gate.yml` → `db-types-check` | Informativo (non bloccante) | Fase 1 #336 |
| `📜 Migration Chain Check` | `quality-gate.yml` → `migration-chain-check` | Informativo (non bloccante) | Fase 1 #331 |
| `Vercel` / `Vercel Preview Comments` | Integrazione Vercel | — | Deploy preview per PR |

### Altre opzioni di protezione (consigliate)

Nella stessa *branch protection rule* abilitare:

- **Require a pull request before merging** — ✅ (obbliga PR, blocca push diretto).
- **Require status checks to pass** — ✅ (come sopra, `strict: true`).
- **Require conversation resolution before merging** — ✅.
- **Do not allow bypassing the above settings** (blocca il bypass degli admin, tranne
  via procedura break-glass auditata, vedi §4).

---

## 3. Deploy production su Vercel: vincolare a `main` + check verdi

Vercel è collegato al repo: `portale-distributori-neofuel` (homepage
`https://portale-distributori-neofuel.vercel.app`). Attualmente il deploy production è
automatico da `main` dopo il merge.

### 3.1 Impostazioni consigliate su Vercel

1. **Production Branch = `main`** (Vercel → *Settings → Git → Production Branch*).
   Nessun altro branch deve poter essere promosso a production.
2. **Ignored Build Step** (opzionale ma consigliato): per non costruire preview su branch
   banali, o usare l'integrazione GitHub Actions.
3. **Disabilitare `Deploy Hooks` non auditati** che aggirano la CI, oppure limitarli.
4. Verificare che **non** esistano branch con *Production* attivo oltre a `main`.

### 3.2 Vincolo a PR revisionata + backend verificato + release manifest

La sequenza di promozione corretta è:

1. PR verso `main` con tutti i required check verdi (**`📊 Test Summary`**, integration,
   lighthouse) e **review approvata** (branch protection, §2).
2. Merge della PR in `main` (solo a `mergeStateStatus == CLEAN`).
3. Vercel deploya **automaticamente** il `main` aggiornato come **Production** (production
   branch = `main`).
4. Il **backend** è verificato dalla CI (ephemeral integration + migration chain + deno)
   **prima** del merge; nessuna migrazione viene auto-applicata al DB live (vedi AGENTS.md).

**Release manifest**: il progetto non ha ancora un `release-manifest` versionato (tracciato
dall'Issue 35 del piano). Finché non esiste, il "manifest" coerente è l'insieme dei file
versionati della PR (workflow + codice + migrazioni). Quando verrà introdotto, il deploy
production dovrà **rifiutare** un merge il cui manifest non corrisponde a `main`.

---

## 4. Procedura break-glass (auditata)

In caso di emergenza che richiede bypass della protezione:

1. **Registrare** motivo, autorizzazione e operatore (issue/commento dedicato,
   es. "Break-glass #339 — <data>").
2. Applicare il bypass **temporaneo** (disabilitare `Do not allow bypassing` o usare un
   merge admin), eseguire l'operazione, **ripristinare** la regola immediatamente dopo.
3. **Verificare a posteriori** che la protezione sia tornata attiva
   (`gh api .../branches/main/protection`) e che non siano stati introdotti merge senza
   check.
4. Nessun bypass anonimo o non tracciato.

---

## 5. Verifica post-attivazione

- **PR di prova con check fallito**: una PR che tocca un file TS con un errore intenzionale
  deve risultare **non mergiabile** (required check `📊 Test Summary` rosso).
- **Push diretto a `main`**: un push ordinario a `main` deve essere **rifiutato**.
- **Promozione production**: un branch non autorizzato non deve poter promuovere production
  su Vercel (production branch = `main`).
- Verifica API regole branch:
  ```bash
  gh api repos/B00RR/portale-distributori-neofuel/branches/main/protection
  ```

---

## 6. Snapshot iniziale (stato live al 2026-08-07)

- **Branch protection su `main`**: **assente** (HTTP 404 su `/branches/main/protection`;
  nessuna ruleset). Da attivare con il payload di §2.
- **Rulesets repository**: vuote (`[]`).
- **CI**: `quality-gate.yml`, `security.yml`, `lighthouse.yml`,
  `supabase-ephemeral-tests.yml` attivi; run recenti verdi.
- **Vercel**: deploy automatico da `main`; production branch da verificare/forzare a `main`.

> Questo snapshot è l'evidenza di partenza richiesta dall'issue; rileggere lo stato live
> al momento dell'attivazione e non assumerlo dai workflow.
