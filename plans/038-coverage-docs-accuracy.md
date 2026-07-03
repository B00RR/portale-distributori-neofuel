# Plan 038: Allineare la documentazione di copertura test alla realtà

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- README.md config/vitest.config.ts`

## Status

- **State**: DONE — PR #163, merged 2026-07-03
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/149

## Why this matters

Il README dichiara una copertura test "~70% sui path critici" e soglie "≥ 70%",
ma le soglie reali del gate in `config/vitest.config.ts` sono
statements 45 / branches 34 / functions 43 / lines 47. Un contributore legge il
README per primo: l'incongruenza gli fa credere che il gate sia molto più severo
di quanto sia, e non capisce perché la CI passi sotto il 50%. Va allineato il
testo ai numeri effettivi (chiarendo che il 70% è un obiettivo, non lo stato).

## Current state

- `config/vitest.config.ts:54-59` (fonte autorevole):
  ```ts
  thresholds: {
    statements: 45,
    branches: 34,
    functions: 43,
    lines: 47
  }
  ```
  Con commento (righe 52–53): "Ratchet floor: set just below current real
  coverage so the gate is meaningful but not flaky. Raise over time."
- `README.md` — contiene affermazioni tipo "Coverage attuale: ~70% sui path
  critici", "Code coverage ≥ 70% su nuovi file", e una tabella con "Test Coverage
  | 70%+". (Cerca le occorrenze esatte con il grep sotto — i numeri di riga
  possono variare.)

## Commands you will need

| Scopo      | Comando                                     | Atteso            |
|------------|---------------------------------------------|-------------------|
| Trova ref  | `grep -n "70" README.md`                    | mostra le righe copertura |
| Coverage   | `npm run test:coverage`                     | stampa i totali reali |

## Scope

**In scope**:
- `README.md` (solo le frasi/tabella sulla copertura)

**Out of scope**:
- `config/vitest.config.ts` — NON cambiare le soglie in questo piano (è un fix
  documentale; alzare le soglie è un intervento a parte, dipende dai piani test 033/034).

## Git workflow

- Actual branch: `fix/146-147-149-cleanup`
- PR: [#163](https://github.com/B00RR/portale-distributori-neofuel/pull/163)
- Original branch: `advisor/038-coverage-docs-accuracy`
- Commit: `docs(readme): allinea le percentuali di copertura al gate reale`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Rileva i numeri reali

Esegui `npm run test:coverage` e annota i totali effettivi (statements/branches/
functions/lines) e le soglie del gate (45/34/43/47 dal config).

**Verify**: hai i numeri correnti sotto mano.

### Step 2: Correggi il README

Sostituisci le affermazioni "~70%"/"≥ 70%" con i valori reali: soglie del gate
45/34/43/47 e copertura corrente misurata allo Step 1. Riformula il 70% come
**obiettivo a tendere** ("target di lungo periodo"), non come stato attuale.
Mantieni tono e struttura del README.

**Verify**: `grep -n "70%" README.md` → il 70% compare solo come obiettivo
dichiarato, non come stato/soglia corrente.

## Test plan

- Nessun test (modifica solo documentazione).

## Done criteria

- [x] Il README riporta le soglie reali (45/34/43/47) e la copertura corrente
- [x] Nessuna affermazione residua che presenti il 70% come stato/soglia attuale
- [ ] `grep -n "70" README.md` mostra solo l'uso "obiettivo"
- [x] Nessun file fuori scope modificato
- [x] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Le soglie in `config/vitest.config.ts` sono cambiate rispetto a 45/34/43/47
  (drift): usa i valori reali del config, non quelli citati qui.
- Il README non contiene più affermazioni sul 70% (già corretto) → marca REJECTED.

## Maintenance notes

- Quando i piani 033/034 alzano la copertura, aggiornare qui i numeri e valutare
  se alzare le soglie del config (intervento separato, va coordinato con la CI a
  tolleranza zero).
