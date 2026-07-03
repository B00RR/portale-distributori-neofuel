# Plan 033: Sostituire il test-teatro di export_utils con test reali

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/utils/export_utils.ts tests/unit/export_utils.test.ts`

## Status

- **State**: DONE — PR #159, merged 2026-07-03
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/144

## Why this matters

`tests/unit/export_utils.test.ts` è un test che passa senza verificare nulla: il
primo caso fa `expect(true).toBe(true)` dentro un try/catch, il secondo ("should
handle ZIP failure") ha **il corpo vuoto** — nessuna assertion. `export_utils.ts`
è ~680 righe di logica di export Excel usata per l'audit delle chiusure
(matematica celle, blocchi isola, totali, fallback ZIP multi-chiusura). È
esattamente la classe di "test ingannevolmente verde" che ha già colpito questo
repo (#49, #64): la suite è verde ma il comportamento non è coperto. Servono test
che verifichino davvero la costruzione delle metriche e la struttura dell'output.

## Current state

- `tests/unit/export_utils.test.ts` (interamente):
  ```ts
  it('should generate excel', async () => {
    const closures = [{ id: 1, data: 'test' }];
    try {
      await generateMultiClosureExcel(closures as unknown as Parameters<typeof generateMultiClosureExcel>[0]);
      expect(true).toBe(true); // Passed without throwing
    } catch (e) {
      expect(e).toBeUndefined();
    }
  });
  it('should handle ZIP failure', async () => {
    // corpo vuoto: nessuna assertion
  });
  ```

- `js/utils/export_utils.ts` — funzioni testabili in modo puro. Nota storica:
  al commit di pianificazione l'export Excel dipendeva da `window.XlsxPopulate`;
  post PR #160 quella dipendenza è stata rimossa, ma per questo piano resta
  corretto testare la logica pura senza attraversare l'export file:
  - `computeExportSummaryMetrics(adminClient, closure, stationId)` (riga 145):
    trasforma una chiusura in `ExportMetrics` (sezioni isola, totali litri/euro,
    riepilogo incassi). **Questa è la logica da testare**: prende un client
    Supabase (mockabile) e un oggetto `closure`, restituisce metriche numeriche.
  - `ExportMetrics`/`ExportSection`/`ExportPistola` (righe 50–94) — le shape.
  - `generateClosureExcel`/`generateMultiClosureExcel` non sono il target di questo
    piano: al tempo dipendevano da `window.XlsxPopulate`, oggi usano JSZip, ma
    restano meglio verificati da E2E/manuale. Il test unitario doveva e deve
    puntare a `computeExportSummaryMetrics`.

- Convenzione test: Vitest + happy-dom; il client Supabase è stubbato via alias
  (`tests/mocks/supabase-stub.ts`) ma per questi test conviene passare un mock
  esplicito di `adminClient` con `.from().select().eq().single()` che ritorna dati
  noti (vedi come altri test costruiscono catene mock, es. `tests/unit/dashboard.test.ts`).

## Commands you will need

| Scopo      | Comando                     | Atteso            |
|------------|-----------------------------|-------------------|
| Typecheck  | `npm run type-check`        | exit 0            |
| Test       | `npm test -- export_utils`  | tutti pass        |
| Coverage   | `npm run test:coverage`     | export_utils.ts ≥ 60% lines |
| Lint       | `npm run lint`              | exit 0, 0 warning |

## Scope

**In scope**:
- `tests/unit/export_utils.test.ts` (riscrittura)

**Out of scope**:
- `js/utils/export_utils.ts` — NON modificare la logica di produzione in questo
  piano (è un piano di solo test). Se scopri un bug reale mentre scrivi i test,
  fermati e segnalalo (vedi STOP), non correggerlo qui.

## Git workflow

- Branch: `advisor/033-real-tests-export-utils`
- Commit: `test(export): copri computeExportSummaryMetrics con test reali`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Riscrivi la suite puntando a computeExportSummaryMetrics

Rimuovi i due test vuoti. Aggiungi test per `computeExportSummaryMetrics` con un
`adminClient` mock che restituisce dati deterministici. Copri almeno:
1. **Happy path**: una chiusura con `shift_pistols` inline (array già presente in
   `closure.shift_pistols`) → verifica che `metrics.meta.totals.ltGasolio`,
   `ltBenzina`, `euroGasolio`, `totalEuro` corrispondano alla somma attesa dai
   litri e prezzi forniti; che `metrics.sections` sia raggruppato per isola; che
   `metrics.summary` mappi gli incassi (`contanti`, `pos`→`cartePos`, ecc.).
2. **Inferenza tipo carburante**: pistola con nome contenente "gasolio" vs
   "benzina" vs "adblue" → verifica `tipo`/`tipoSigla` corretti (D/B/A).
3. **Chiusura vuota/parziale**: `closure` senza `shift_pistols` e senza `id` →
   `metrics.sections` vuoto, totali a 0, nessuna eccezione.
4. **Robustezza numerica**: valori `liters_dispensed`/`end_price` non numerici o
   assenti → `safeNumber` li tratta come 0 (nessun `NaN` nelle metriche).

Usa numeri semplici così l'atteso è calcolabile a mano nel test.

**Verify**: `npm test -- export_utils` → tutti pass; nessun `expect(true).toBe(true)`.

### Step 2: Alza la soglia locale (facoltativo ma consigliato)

Verifica la copertura del solo file con `npm run test:coverage` e conferma che
`export_utils.ts` superi ~60% di linee. Non modificare le soglie globali in
`config/vitest.config.ts` (di quello si occupa il piano 038 lato docs).

**Verify**: report coverage mostra `export_utils.ts` ≥ 60% lines.

## Test plan

- Casi elencati nello Step 1 (happy path, inferenza tipo, chiusura vuota,
  robustezza numerica).
- Pattern strutturale del mock Supabase a catena: vedi `tests/unit/dashboard.test.ts`.
- Verifica: `npm test -- export_utils` → verde, con assertion reali (grep sotto).

## Done criteria

- [ ] `npm run type-check` exit 0
- [ ] `npm run lint` exit 0, 0 warning
- [ ] `npm test -- export_utils` verde
- [ ] `grep -n "expect(true).toBe(true)" tests/unit/export_utils.test.ts` → nessun match
- [ ] `grep -c "expect(" tests/unit/export_utils.test.ts` ≥ 8
- [ ] Nessun file fuori scope modificato
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- L'estratto di `export_utils.test.ts` non corrisponde (drift): potrebbe essere
  già stato riscritto → verifica e, se coperto, marca REJECTED.
- Mentre scrivi i test scopri che `computeExportSummaryMetrics` produce un valore
  palesemente errato (es. totali sbagliati): NON correggere il codice qui;
  segnala il bug con file:riga e input riproducibile (aprirà un piano bug a sé).

## Maintenance notes

- `generateClosureExcel`/`generateMultiClosureExcel` restano non coperti in unit:
  la loro verifica reale è E2E o manuale. Nota aggiornata post PR #160: non
  dipendono più da `window.XlsxPopulate`; l'export modifica il template XLSX via
  JSZip lazy-loaded.
- In review: controllare che i test asseriscano su valori numerici concreti, non
  solo su "non lancia".
