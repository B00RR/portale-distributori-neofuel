# Plan 034: Test unitari reali per il calculation-engine (matematica KPI finanziari)

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/utils/calculation-engine.ts js/utils/calculation-presets.ts`

## Status

- **State**: DONE — PR #162, merged 2026-07-03
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/145

## Why this matters

`js/utils/calculation-engine.ts` orchestra la valutazione dei KPI (revenue,
volumi, mix pagamenti) tramite un piccolo DSL con operatori. Oggi è mockato
ovunque (es. `tests/unit/dashboard.test.ts` sostituisce l'intero engine con
`{ run: vi.fn(() => Promise.resolve(1000)) }`), quindi la logica reale ha
copertura vicina allo zero: casi come divisione per zero, path/context mancanti,
precisione floating point sugli accumulatori non sono mai esercitati. Aggiungere
test è a rischio zero (non modifica il codice) e mette una rete sotto un modulo
finanziario critico.

## Current state

- `js/utils/calculation-engine.ts` — engine con cache per scope. Estratto della
  cache (righe 189–214):
  ```ts
  public async loadScope(scope: string, force = false): Promise<CompiledScope | null> {
    const now = Date.now();
    const lastFetch = this.lastFetchTime.get(scope) || 0;
    if (!force && this.cache.has(scope) && now - lastFetch < this.staleAfterMs) {
      return this.cache.get(scope) || null;
    }
    // ... fetchAndCompile + set cache/lastFetchTime ...
  }
  ```
  Il file espone gli operatori di default (cerca `DEFAULT_OPERATIONS` o simile) e
  una funzione di valutazione/`run`. **Leggi l'intero file prima di scrivere i
  test**: elenca gli operatori realmente implementati (es. constant/input/sum/
  multiply/subtract/divide/condition/pipeline/map/filter/aggregate — usa i nomi
  reali del file, non questa lista indicativa) e la firma pubblica usata dai
  chiamanti.
- `js/utils/calculation-presets.ts` — registra i preset/scope; usato in
  `js/app.ts` via `initializeCalculationPresets()`.
- Convenzione test: Vitest globals; niente rete (il DB è stubbato). Questi test
  devono usare payload DSL espliciti e context in-memory, senza Supabase.

## Commands you will need

| Scopo      | Comando                              | Atteso            |
|------------|--------------------------------------|-------------------|
| Typecheck  | `npm run type-check`                 | exit 0            |
| Test       | `npm test -- calculation-engine`     | tutti pass        |
| Coverage   | `npm run test:coverage`              | calculation-engine.ts ≥ 60% lines |
| Lint       | `npm run lint`                       | exit 0, 0 warning |

## Scope

**In scope**:
- `tests/unit/calculation-engine.test.ts` (creare)

**Out of scope**:
- `js/utils/calculation-engine.ts` e `calculation-presets.ts` — NON modificare la
  logica. Se emerge un bug (es. la cache che non invalida su clock all'indietro:
  `now - lastFetch < staleAfterMs` diventa sempre vero se `now < lastFetch`),
  fermati e segnalalo — non correggerlo qui.

## Git workflow

- Branch: `advisor/034-tests-calculation-engine`
- Commit: `test(calc): copri gli operatori del calculation-engine`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Mappa la superficie pubblica

Leggi `js/utils/calculation-engine.ts` per intero e annota: nome della classe/
oggetto esportato, la funzione di valutazione (`run`/`evaluate`/`evaluateNode`),
e la lista esatta degli operatori registrati. Se l'engine richiede uno scope
caricato via Supabase per funzionare, verifica se esiste un modo di valutare un
nodo DSL direttamente (senza `loadScope`) — è quello il target dei test unitari.

**Verify**: (nessun comando) — hai l'elenco reale di operatori e la firma di
valutazione.

### Step 2: Scrivi i test per ciascun operatore + edge case

Crea `tests/unit/calculation-engine.test.ts`. Copri, con payload DSL concreti:
- ogni operatore reale (input, costante, somma, prodotto, differenza, divisione,
  condizione, pipeline, ecc. — usa i nomi reali dallo Step 1) con un input e un
  output atteso calcolabile a mano;
- **divisione per zero** → comportamento reale del file (es. ritorna 0): asserisci
  il valore effettivo, documentando l'aspettativa;
- **path/context mancante** → nessuna eccezione non gestita, valore di fallback;
- **array vuoto** su map/filter/aggregate → risultato coerente (0 o `[]`);
- **precisione**: una catena di somme/prodotti su decimali (prezzi) con risultato
  atteso arrotondato come fa il codice.

**Verify**: `npm test -- calculation-engine` → tutti pass.

### Step 3: Conferma copertura

**Verify**: `npm run test:coverage` → `calculation-engine.ts` ≥ 60% lines (non
toccare le soglie globali del config).

## Test plan

- Un `describe` per gli operatori, uno per gli edge case (Step 2).
- Pattern: test già presenti che istanziano oggetti puri (es. `tests/unit/rules.test.ts`,
  che ha copertura 100% e asserzioni significative — usalo come modello di stile).
- Verifica: `npm test -- calculation-engine` → verde con assertion numeriche reali.

## Done criteria

- [ ] `npm run type-check` exit 0
- [ ] `npm run lint` exit 0, 0 warning
- [ ] `tests/unit/calculation-engine.test.ts` esiste e passa
- [x] `grep -c "expect(" tests/unit/calculation-engine.test.ts` ≥ 12
- [ ] `npm run test:coverage` → calculation-engine.ts ≥ 60% lines
- [ ] Nessun file fuori scope modificato
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- L'engine non è valutabile senza uno scope caricato da Supabase e non c'è modo
  di iniettare un nodo DSL direttamente: fermati e segnala (servirebbe un piccolo
  refactor di testabilità, fuori dallo scope di questo piano).
- Scopri un bug reale (divisione/precisione/cache): segnalalo con file:riga e
  input, NON correggerlo qui.

## Maintenance notes

- Questi test bloccano regressioni sui KPI: se si aggiunge un operatore, aggiungi
  il relativo caso.
- Il bug candidato "cache non invalida su clock all'indietro" (righe 189–214) è
  deliberatamente lasciato a un piano bug separato; qui va solo *documentato* dal
  test se lo si incontra.
