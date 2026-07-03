# Plan 044 [DIREZIONE]: UI admin per il motore business-rules

> **Istruzioni per l'executor**: piano di direzione (feature). Design +
> implementazione. Rispetta le STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/core/business-logic-manager.ts js/core/business-rules-schema.ts js/admin`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/155

## Why this matters

Il motore delle regole di business è già cablato e **usato in produzione**:
`BusinessLogicManager` carica/salva un JSON di configurazione da Supabase Storage,
validato con Zod, e le soglie sono lette da `js/admin/notifications.ts` (alert
riserva carburante / turni fermi) e `js/admin/prices.ts` (limite massimo prezzo).
Manca però qualsiasi UI per modificarle: oggi si possono cambiare solo
manipolando direttamente lo storage Supabase. Una semplice pagina admin di
"Impostazioni" rende configurabili le soglie senza accesso backend.

## Current state

- `js/core/business-logic-manager.ts:20-60` — `BusinessLogicManager` con
  `loadRules()` (cache in `cachedRules`, download da bucket `system`, path
  `configs/business_rules.json`, fallback a `DEFAULT_BUSINESS_RULES`) e (più sotto)
  `saveRules()`.
- `js/core/business-rules-schema.ts` — `BusinessRulesSchema` (Zod),
  `DEFAULT_BUSINESS_RULES`, tipo `BusinessRules`. I campi includono soglie tipo
  `cash_error_threshold`, `max_price_limit`, `fuel_reserve_alert_liters`,
  `force_close_hours_threshold`, ecc. (leggi il file per l'elenco esatto).
- Consumatori: `js/admin/notifications.ts`, `js/admin/prices.ts` (chiamano
  `BusinessLogicManager.loadRules()`).
- Convenzione UI admin: pagine imperative con `document.createElement`/`textContent`,
  helper da `js/ui/ui.ts`, voce di menu registrata nel layout/router admin
  (`js/admin/layout.ts`, `js/admin/router.ts`). NON introdurre componenti Lit.

## Commands you will need

| Scopo      | Comando                        | Atteso            |
|------------|--------------------------------|-------------------|
| Typecheck  | `npm run type-check`           | exit 0            |
| Test       | `npm test`                     | tutti pass        |
| Lint       | `npm run lint`                 | exit 0, 0 warning |

## Scope

**In scope**:
- `js/admin/business-rules-settings.ts` (creare) — form che legge
  `loadRules()`, mostra un campo per ogni regola, salva con `saveRules()`.
- `js/admin/layout.ts` / `js/admin/router.ts` — aggiungere la voce di menu
  "Impostazioni" e il routing alla nuova vista.
- `tests/unit/admin-business-rules-settings.test.ts` (creare).

**Out of scope**:
- `business-logic-manager.ts` / `business-rules-schema.ts` — non modificare la
  logica di load/save né lo schema (usa i campi esistenti).
- Aggiungere nuove regole allo schema (feature a parte).

## Steps

### Step 0: Design del form dai campi dello schema

Leggi `business-rules-schema.ts` ed elenca i campi di `BusinessRules` con tipo e
range. Il form deve avere un input per campo, con validazione lato client
allineata allo schema Zod (numeri ≥ 0 dove previsto). **Fai rivedere l'elenco
campi** prima di costruire (STOP soft).

### Step 1: Costruisci la pagina imperativa

Crea `js/admin/business-rules-settings.ts` con una funzione tipo
`showBusinessRulesSettings(container)` che: chiama `await BusinessLogicManager.loadRules()`,
renderizza il form (helper `js/ui/ui.ts`, `createEl` da `js/ui/dom-helpers.ts` se
il piano 039 è già landato), e al submit chiama `await BusinessLogicManager.saveRules(nuoveRegole)`
con Toast di esito. Gestisci gli errori con `handleError`.

**Verify**: `npm run type-check` exit 0.

### Step 2: Registra la voce di menu e il routing

Aggiungi "Impostazioni" al menu admin e collega la vista nel router admin,
seguendo il pattern delle altre pagine admin.

**Verify**: la nuova vista è raggiungibile; `npm run lint` 0 warning.

### Step 3: Test

`tests/unit/admin-business-rules-settings.test.ts`: mock di `BusinessLogicManager.loadRules`/`saveRules`,
verifica render dei campi e che il submit chiami `saveRules` con i valori del form.

**Verify**: `npm test -- business-rules-settings` → verde.

## Test plan

- Casi: render popolato dai valori correnti; submit valido → `saveRules` chiamato
  con i valori aggiornati; input non valido → nessun salvataggio + messaggio.
- Pattern: una pagina admin esistente con form (es. `js/admin/prices.ts`) come
  modello strutturale + il relativo file di test.

## Done criteria

- [ ] Pagina `business-rules-settings.ts` esistente e raggiungibile dal menu admin
- [ ] Legge le regole correnti e le salva via `BusinessLogicManager.saveRules`
- [ ] Validazione client allineata allo schema Zod
- [ ] Test presenti e verdi
- [ ] `npm run type-check` / `npm test` / `npm run lint` verdi
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Solo utenti con ruolo admin devono poter salvare: se il salvataggio non è già
  protetto lato server (RLS/permessi sul bucket `system`), NON esporre la UI a
  ruoli non-admin e segnala la questione di autorizzazione.
- Lo schema ha campi non banali (enum/oggetti annidati) difficili da mappare a
  input semplici → segnala e proponi un sotto-insieme.

## Maintenance notes

- `loadRules()` mantiene una cache di modulo (`cachedRules`): dopo `saveRules()`
  la cache va invalidata perché gli altri consumatori (notifications/prices)
  vedano il nuovo valore. Verifica in review che il salvataggio aggiorni/pulisca
  `cachedRules` (se non lo fa già, è un miglioramento da includere).
