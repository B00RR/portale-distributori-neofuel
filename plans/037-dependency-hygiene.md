# Plan 037: Igiene delle dipendenze (dotenv, @types/qrcode, Percy)

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- package.json package-lock.json config/.percy.yml`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/148

## Why this matters

Il manifest ha tre voci fuori posto o inutilizzate: `dotenv` e `@types/qrcode`
sono in `dependencies` (produzione) pur essendo solo strumenti da build/tipi, e
`@percy/cli` + `@percy/playwright` (+ `config/.percy.yml`) non sono referenziati
da alcun workflow CI o config Playwright. Spostare i primi in `devDependencies` e
rimuovere Percy se davvero morto pulisce il manifest e riduce il tempo di install
in CI, senza toccare il runtime.

## Current state

- `package.json`:
  - riga 61: `"@types/qrcode": "^1.5.6"` in `dependencies` — pacchetto di soli
    tipi, mai importato a runtime (l'app usa `qrcode` a runtime). Va in `devDependencies`.
  - riga 63: `"dotenv": "^17.2.3"` in `dependencies` — usato solo da
    `scripts/setup_e2e_users.ts` (script Node non spedito). Vite usa `loadEnv()`
    nativo; nessun import in `js/`. Va in `devDependencies`.
  - righe 31–32: `"@percy/cli"`, `"@percy/playwright"` in `devDependencies`.
- `config/.percy.yml` — config Percy.
- Percy: `grep -rn percy .github config e2e` → nessun uso (verificare, vedi Step 1).

## Commands you will need

| Scopo      | Comando                                  | Atteso            |
|------------|------------------------------------------|-------------------|
| Uso Percy  | `grep -rni "percy" .github e2e config package.json` | solo le righe di package.json/.percy.yml |
| Install    | `npm install`                            | exit 0, lockfile aggiornato |
| Typecheck  | `npm run type-check`                     | exit 0            |
| Test       | `npm test`                               | tutti pass        |
| Build      | `npm run build`                          | exit 0            |
| Audit      | `npm audit --audit-level=high`           | 0 high/critical   |

## Scope

**In scope**:
- `package.json` (spostare 2 dep, rimuovere 2 devDep Percy)
- `package-lock.json` (rigenerato da `npm install`)
- `config/.percy.yml` (rimuovere se Percy non usato)

**Out of scope**:
- Script `storybook` (piano 035).
- Qualsiasi upgrade di versione major (TS/Vite/Vitest) — non in questo piano.
- L'override `fast-uri`/`minimatch` in package.json — giustificato, non toccare.

## Git workflow

- Branch: `advisor/037-dependency-hygiene`
- Commit: `chore(deps): sposta dotenv/@types-qrcode in devDeps e rimuovi Percy inutilizzato`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Conferma che Percy è inutilizzato

**Verify**: `grep -rni "percy\|percySnapshot" .github/ e2e/ config/playwright.config.js`
→ nessun match (a parte eventuale `config/.percy.yml`). Se `lighthouse.yml` o un
altro workflow invoca Percy, ESCLUDI Percy dallo scope e segnala.

### Step 2: Sposta dotenv e @types/qrcode in devDependencies

Nel `package.json` rimuovi le due voci da `dependencies` e aggiungile a
`devDependencies` mantenendo le stesse versioni.

**Verify**: `node -e "const p=require('./package.json'); if(p.dependencies.dotenv||p.dependencies['@types/qrcode']) process.exit(1); if(!p.devDependencies.dotenv||!p.devDependencies['@types/qrcode']) process.exit(2); console.log('OK')"` → `OK`.

### Step 3: Rimuovi Percy (se Step 1 conferma morto)

Rimuovi `@percy/cli` e `@percy/playwright` da `devDependencies` ed elimina
`config/.percy.yml`.

**Verify**: `node -e "const p=require('./package.json'); if(p.devDependencies['@percy/cli']||p.devDependencies['@percy/playwright']) process.exit(1); console.log('OK')"` → `OK`.

### Step 4: Rigenera lockfile e valida

Esegui `npm install` per aggiornare `package-lock.json`, poi la catena di verifica.

**Verify**: `npm run type-check` exit 0; `npm test` verde; `npm run build` exit 0;
`npm audit --audit-level=high` → 0 high/critical.

## Test plan

- Nessun test nuovo. La verifica è che install/typecheck/test/build/audit restino
  verdi con lo `setup_e2e_users.ts` ancora eseguibile (dotenv resta disponibile in
  devDependencies).

## Done criteria

- [ ] `dotenv` e `@types/qrcode` in `devDependencies`, non più in `dependencies`
- [ ] `@percy/*` rimossi e `config/.percy.yml` eliminato (se confermato morto)
- [ ] `npm install` rigenera il lockfile senza errori
- [ ] `npm run type-check` / `npm test` / `npm run build` verdi
- [ ] `npm audit --audit-level=high` → 0 high/critical
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- `lighthouse.yml` o altro workflow usa Percy → non rimuovere Percy, segnala.
- `npm install` introduce un vuln high/critical o cambia molte versioni → STOP e
  segnala il diff del lockfile.

## Maintenance notes

- `dotenv` deve restare in `devDependencies` perché `scripts/setup_e2e_users.ts`
  lo importa a build/test time.
- Non toccare gli `overrides` (`fast-uri` è un fix CVE giustificato).
