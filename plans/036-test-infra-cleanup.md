# Plan 036: Pulizia infrastruttura di test (mock morti + marker file)

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- tests/`

## Status

- **State**: DONE — PR #163, merged 2026-07-03
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/147

## Why this matters

La cartella `tests/` contiene detriti che confondono: due file mock Supabase mai
referenziati (`tests/mocks/supabase.js`, `tests/mocks/api-mock.ts`) e due marker
file di una pulizia rimasta a metà (`tests/CLEANING_IN_PROGRESS`,
`tests/DELETE_LEGACY_MARKER`). I mock realmente usati sono solo
`tests/mocks/supabase.ts` (via `tests/setup.ts`) e gli stub aliasati in
`config/vitest.config.ts` (`supabase-stub.ts`, `zod-stub.ts`). Ridurre i mock a
quelli vivi evita che qualcuno modifichi il file sbagliato.

## Current state

- Usati (NON toccare):
  - `tests/setup.ts:4` → `import { mockSupabase } from './mocks/supabase';` (=
    `tests/mocks/supabase.ts`).
  - `config/vitest.config.ts:91-92` → alias verso `tests/mocks/supabase-stub.ts`
    e `tests/mocks/zod-stub.ts`.
- Candidati morti (verificare zero riferimenti, poi rimuovere):
  - `tests/mocks/supabase.js` — vecchia versione JS, nessun import.
  - `tests/mocks/api-mock.ts` — nessun import.
  - `tests/CLEANING_IN_PROGRESS` — marker ("pulizia test legacy in corso").
  - `tests/DELETE_LEGACY_MARKER` — marker ("i file tests/utils.test.js e
    tests/rules.test.js verranno eliminati"); quei .js non esistono (i reali sono
    `.test.ts`).

## Commands you will need

| Scopo      | Comando                     | Atteso            |
|------------|-----------------------------|-------------------|
| Ref check  | `grep -rn "mocks/supabase\.js\|api-mock" tests/` | nessun match |
| Test       | `npm test`                  | tutti pass (invariato) |
| Typecheck  | `npm run type-check`        | exit 0            |

## Scope

**In scope** (rimuovere, dopo verifica zero-ref):
- `tests/mocks/supabase.js`
- `tests/mocks/api-mock.ts`
- `tests/CLEANING_IN_PROGRESS`
- `tests/DELETE_LEGACY_MARKER`

**Out of scope**:
- `tests/mocks/supabase.ts`, `supabase-stub.ts`, `zod-stub.ts` — vivi.
- `tests/setup.ts`, `config/vitest.config.ts` — non modificare.

## Git workflow

- Actual branch: `fix/146-147-149-cleanup`
- PR: [#163](https://github.com/B00RR/portale-distributori-neofuel/pull/163)
- Original branch: `advisor/036-test-infra-cleanup`
- Commit: `chore(tests): rimuovi mock morti e marker file di pulizia`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Conferma che i mock candidati sono davvero morti

**Verify**:
`grep -rn "api-mock" tests/ js/` → nessun match.
`grep -rn "mocks/supabase.js\|mocks/supabase\b" tests/ | grep -v "supabase.ts\|supabase-stub"` → nessun import verso il `.js`.
Se un file risulta importato, escludilo dallo scope e segnala.

### Step 2: Rimuovi i quattro file

Elimina i quattro path in scope.

**Verify**: `ls tests/mocks/` non contiene `supabase.js` né `api-mock.ts`;
`ls tests/CLEANING_IN_PROGRESS tests/DELETE_LEGACY_MARKER 2>/dev/null` → nessun file.

### Step 3: Suite invariata

**Verify**: `npm test` → stesso numero di test verdi di prima (nessuna
regressione); `npm run type-check` → exit 0.

## Test plan

- Nessun test nuovo. La suite deve restare verde e con lo stesso conteggio.

## Done criteria

- [x] I 4 file in scope non esistono più
- [ ] `npm test` verde, conteggio test invariato
- [ ] `npm run type-check` exit 0
- [ ] `grep -rn "api-mock\|mocks/supabase.js" tests/ js/` → nessun match
- [ ] Nessun file fuori scope modificato
- [x] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Uno dei candidati risulta importato da qualche test → escludilo e segnala.
- La rimozione fa cambiare il conteggio dei test → STOP (qualcosa dipendeva dai
  file rimossi in modo non ovvio).

## Maintenance notes

- Dopo questo piano resta un solo mock Supabase "runtime" (`supabase.ts`) più i
  due stub aliasati: documentare in CLAUDE.md quale usare (facoltativo, si lega al
  piano 040 se si aggiorna la doc).
