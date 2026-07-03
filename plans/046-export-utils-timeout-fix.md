# Plan 046: Risolvere il timeout/flakiness di export_utils.test.ts (issue #139)

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- tests/unit/export_utils.test.ts js/utils/export_utils.ts`

## Status

- **State**: DONE — risolto insieme al piano 033 in PR #159, merged 2026-07-03
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: coincide con plans/033-real-tests-export-utils.md (STESSO file di test)
- **Category**: tests
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/139

## Why this matters

L'issue #139 segnala che `should generate excel` in
`tests/unit/export_utils.test.ts` va in timeout (`Test timed out in 10000ms`).
Verifica sul commit `36c3578`: in **locale** (ambiente happy-dom della config
Vitest reale) il test **passa** in ~4.3–4.9s con early-return, quindi la
premessa "fallisce sempre" non è confermata; **ma** il test carica davvero il
modulo `xlsx-populate` (~640kB) tramite `generateMultiClosureExcel` →
`ensureXlsxPopulate()`, restando appena sotto la soglia `testTimeout: 10000`. In
CI (macchine più lente / cache fredda) questo margine sparisce e diventa un
**timeout flaky** che rompe il gate a tolleranza zero. In più il test non
verifica nulla di reale (test-teatro). La causa e la cura coincidono con il
piano 033.

## Current state

- `tests/unit/export_utils.test.ts` — chiama la funzione pesante:
  ```ts
  it('should generate excel', async () => {
    const closures = [{ id: 1, data: 'test' }];
    try {
      await generateMultiClosureExcel(closures as unknown as Parameters<typeof generateMultiClosureExcel>[0]);
      expect(true).toBe(true);
    } catch (e) { expect(e).toBeUndefined(); }
  });
  it('should handle ZIP failure', async () => { /* corpo vuoto */ });
  ```
- `js/utils/export_utils.ts:532` — `ensureXlsxPopulate()` fa
  `await import('xlsx-populate/browser/xlsx-populate.js')` (modulo ~640kB); è
  questo import — non l'`eval` in sé — a rendere il test lento.
- `config/vitest.config.ts:66` — `testTimeout: 10000`.
- Funzione realmente testabile senza libreria: `computeExportSummaryMetrics(adminClient, closure, stationId)` (`export_utils.ts:145`).

## Commands you will need

| Scopo      | Comando                          | Atteso                         |
|------------|----------------------------------|--------------------------------|
| Typecheck  | `npm run type-check`             | exit 0                         |
| Test file  | `npm test -- export_utils`       | pass, file in <200ms           |
| Lint       | `npm run lint`                   | exit 0, 0 warning              |

## Scope

**In scope**:
- `tests/unit/export_utils.test.ts` (riscrittura)

**Out of scope**:
- `js/utils/export_utils.ts` — non modificare la logica di produzione.
- `config/vitest.config.ts` — NON alzare `testTimeout` per mascherare il
  problema; la cura è non caricare `xlsx-populate` nel test.

## Relazione con il piano 033

Questo piano e **plans/033-real-tests-export-utils.md** toccano lo STESSO file e
hanno la STESSA implementazione (riscrivere la suite su
`computeExportSummaryMetrics`). Regola operativa:
- Se **033 non è ancora stato eseguito**: esegui la riscrittura descritta in 033;
  soddisfa in più il criterio timeout qui sotto. Chiudi sia #144 (033) sia #139.
- Se **033 è già stato eseguito** (il file non chiama più `generateMultiClosureExcel`
  e ha assertion reali): questo piano è già risolto → marca REJECTED con nota
  "risolto da 033/#144" e chiudi #139.

## Steps

### Step 1: Rimuovi la chiamata alla funzione pesante

Riscrivi `tests/unit/export_utils.test.ts` seguendo il piano 033: elimina i due
test-teatro; NON chiamare più `generateMultiClosureExcel`/`ensureXlsxPopulate`;
testa invece `computeExportSummaryMetrics` con un `adminClient` mock che ritorna
dati deterministici (casi: happy path con totali attesi, inferenza tipo
carburante, chiusura vuota, robustezza numerica — vedi 033 per il dettaglio).

**Verify**: `npm test -- export_utils` → verde, e il file gira in **<200ms**
(nessun caricamento di `xlsx-populate`).

### Step 2: Conferma assenza dell'import pesante nel percorso di test

**Verify**: `grep -n "generateMultiClosureExcel\|ensureXlsxPopulate" tests/unit/export_utils.test.ts`
→ nessun match.

## Test plan

- Vedi plans/033 (stessi casi). Aggiunta specifica di #139: il criterio di
  durata (<200ms) e l'assenza dell'import di `xlsx-populate`.

## Done criteria

- [ ] `tests/unit/export_utils.test.ts` non chiama `generateMultiClosureExcel`/`ensureXlsxPopulate`
- [ ] `npm test -- export_utils` verde, file in <200ms
- [ ] `grep -n "expect(true).toBe(true)" tests/unit/export_utils.test.ts` → nessun match
- [ ] `npm run type-check` / `npm run lint` verdi
- [ ] Riga di stato aggiornata in `plans/README.md`; issue #139 (e #144 se contestuale) chiuse

## STOP conditions

- 033 è già stato eseguito → marca REJECTED ("risolto da 033/#144"), chiudi #139.
- Riscrivendo i test scopri che `computeExportSummaryMetrics` produce valori
  errati → segnala (bug a parte), non correggere qui il codice di produzione.

## Maintenance notes

- Non alzare `testTimeout` come "fix": maschererebbe la fragilità invece di
  rimuoverla. La regola è che i test unitari non devono caricare `xlsx-populate`.
- La verifica reale di `generateClosureExcel`/`generateMultiClosureExcel` resta
  demandata all'E2E/manuale. Nota post PR #160: non usano più
  `window.XlsxPopulate`; il timeout/flakiness unitario resta chiuso perché il
  test non percorre più l'export pesante.
