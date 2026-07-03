# Plan 035: Rimuovere lo scaffold Storybook morto

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- package.json .storybook`

## Status

- **State**: DONE — PR #163, merged 2026-07-03
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/146

## Why this matters

Il repo contiene uno scaffold Storybook completamente morto: la cartella
`.storybook/` con `main.js`, `preview.js` e storie per `CardBox`, `DataTable`,
`FormField` — componenti **cancellati nella PR #118** (piano 023). Non è
installata alcuna dipendenza `@storybook/*`, quindi gli script `npm run storybook`
/ `build-storybook` falliscono con "command not found". Le storie importano
moduli inesistenti (`../../../js/ui/components/CardBox.js`). È codice morto che
confonde e contraddice la convenzione in CLAUDE.md ("non reintrodurre una
libreria di componenti presentazionali senza un consumatore concreto").

## Current state

- `.storybook/main.js`, `.storybook/preview.js` — config Storybook.
- `.storybook/stories/CardBox.stories.js` (riga 2): `import '../../../js/ui/components/CardBox.js';`
  → il file importato NON esiste più (componente rimosso in #118). Idem
  `DataTable.stories.js`, `FormField.stories.js`.
- `package.json` (righe 17–18):
  ```json
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build",
  ```
- `npm ls storybook` → nessun pacchetto storybook installato.
- CI (`.github/workflows/quality-gate.yml`) non invoca Storybook.

## Commands you will need

| Scopo      | Comando                     | Atteso            |
|------------|-----------------------------|-------------------|
| Install    | `npm ci`                    | exit 0            |
| Typecheck  | `npm run type-check`        | exit 0            |
| Test       | `npm test`                  | tutti pass        |
| Lint       | `npm run lint`              | exit 0, 0 warning |
| Build      | `npm run build`             | exit 0            |

## Scope

**In scope**:
- Cancellare l'intera cartella `.storybook/`.
- Rimuovere gli script `storybook` e `build-storybook` da `package.json`.

**Out of scope**:
- Le dipendenze `@percy/*` (piano 037) e qualsiasi altro script.
- I componenti Lit vivi (`ClosureWizard`, `VoucherManager`, `ShiftOpener`).

## Git workflow

- Actual branch: `fix/146-147-149-cleanup`
- PR: [#163](https://github.com/B00RR/portale-distributori-neofuel/pull/163)
- Original branch: `advisor/035-remove-dead-storybook`
- Commit: `chore: rimuovi scaffold Storybook morto (componenti già eliminati in #118)`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Elimina la cartella .storybook

Rimuovi ricorsivamente `.storybook/` (main.js, preview.js, stories/).

**Verify**: `test -d .storybook && echo ESISTE || echo RIMOSSA` → `RIMOSSA`.

### Step 2: Rimuovi i due script da package.json

Elimina le righe `"storybook": ...` e `"build-storybook": ...` dalla sezione
`scripts` di `package.json`. Attento a virgole/JSON valido.

**Verify**: `node -e "const p=require('./package.json'); if(p.scripts.storybook||p.scripts['build-storybook']) process.exit(1); console.log('OK')"` → `OK`.

### Step 3: Nessun riferimento residuo

**Verify**: `grep -rn "storybook" --include=*.json --include=*.md --include=*.yml . | grep -v node_modules | grep -v plans/` → nessun riferimento operativo (eventuali menzioni in CLAUDE.md/README vanno aggiornate se descrivono Storybook come attivo).

## Test plan

- Nessun test nuovo (rimozione codice morto). Verifica che la suite e la build
  restino verdi: `npm test && npm run build`.

## Done criteria

- [ ] `.storybook/` non esiste più
- [ ] `package.json` non contiene script storybook
- [ ] `npm run type-check` exit 0, `npm run lint` 0 warning
- [ ] `npm test` verde, `npm run build` exit 0
- [ ] Nessun file fuori scope modificato
- [x] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Se scopri che una dipendenza `@storybook/*` è stata nel frattempo installata e
  le storie puntano a componenti esistenti → lo scaffold non è più morto: fermati
  e segnala (marca REJECTED).
- Se `.storybook/` è già stato rimosso (drift) → marca DONE/REJECTED e segnala.

## Maintenance notes

- Se in futuro serve davvero Storybook, va reinstallato con dipendenze reali e
  storie per i 3 componenti Lit vivi — non ripristinando questo scaffold.
