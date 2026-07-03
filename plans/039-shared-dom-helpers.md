# Plan 039: Estrarre `createEl`/`createIcon` in un helper DOM condiviso

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/admin js/ui`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/150

## Why this matters

Gli helper DOM `createEl<K>` (~40 righe) e `createIcon` (~5 righe) sono
reimplementati quasi identici in più pagine admin (`guns.ts`, `islands.ts`,
`tanks.ts`, `invoices.ts`). Ogni copia può divergere (le varianti hanno già
piccole differenze di firma), e ogni nuova pagina admin copia-incolla da una
esistente perpetuando la duplicazione. Un singolo helper condiviso riduce la
superficie di manutenzione e allinea il comportamento.

## Current state

- Copia di riferimento — `js/admin/guns.ts:27-74`:
  ```ts
  function createIcon(className: string): HTMLElement {
    const icon = document.createElement('i');
    icon.className = className;
    return icon;
  }
  function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: {
      id?: string; classes?: string[]; text?: string;
      attrs?: Record<string, string>; dataset?: Record<string, string>;
      style?: Record<string, string>; children?: (HTMLElement | Node)[];
    } = {}
  ): HTMLElementTagNameMap[K] { /* set id/classes/text/attrs/dataset/style/children */ }
  ```
- Copie con piccole differenze: `js/admin/islands.ts`, `js/admin/tanks.ts`,
  `js/admin/invoices.ts` (verifica ciascuna con il grep sotto prima di sostituire).
- Convenzione: gli helper UI condivisi vivono in `js/ui/` (es. `js/ui/ui.ts`).
  Crea `js/ui/dom-helpers.ts` ed esporta da lì.
- Sicurezza: `createIcon` accetta una stringa di classi; tutti i chiamanti
  passano stringhe Font Awesome hardcoded. `createEl` usa `textContent` (safe).

## Commands you will need

| Scopo      | Comando                              | Atteso            |
|------------|--------------------------------------|-------------------|
| Trova copie| `grep -rn "function createEl\|function createIcon" js/` | elenca i file |
| Typecheck  | `npm run type-check`                 | exit 0            |
| Test       | `npm test`                           | tutti pass        |
| Lint       | `npm run lint`                       | exit 0, 0 warning |

## Scope

**In scope**:
- `js/ui/dom-helpers.ts` (creare) — export `createEl`, `createIcon`.
- `js/admin/guns.ts`, `js/admin/islands.ts`, `js/admin/tanks.ts`,
  `js/admin/invoices.ts` — rimuovere la copia locale, importare dall'helper.
- `tests/unit/dom-helpers.test.ts` (creare).

**Out of scope**:
- Componenti Lit (`ClosureWizard`/`VoucherManager`/`ShiftOpener`) — costruiscono
  markup via template `html`, non usano questi helper.
- Qualsiasi cambiamento di comportamento visibile (l'helper unificato deve
  produrre lo stesso DOM delle copie).

## Git workflow

- Branch: `advisor/039-shared-dom-helpers`
- Commit: `refactor(ui): estrai createEl/createIcon in js/ui/dom-helpers.ts`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Individua tutte le copie e le loro firme

**Verify**: `grep -rn "function createEl\|function createIcon" js/` → elenca i
file. Apri ciascuno e confronta la firma di `createEl` con quella di `guns.ts`.
Se una variante ha opzioni in più/in meno, l'helper unificato deve essere il
**superset** compatibile (unione delle opzioni, default per quelle mancanti).

### Step 2: Crea l'helper condiviso

Crea `js/ui/dom-helpers.ts` con `createEl` (superset dallo Step 1) e `createIcon`
identici alla versione di `guns.ts`. Documenta con JSDoc che `createIcon` accetta
solo stringhe di classe hardcoded (mai input utente).

**Verify**: `npm run type-check` → exit 0.

### Step 3: Sostituisci le copie una pagina alla volta

Per ogni file in scope: rimuovi la definizione locale e aggiungi
`import { createEl, createIcon } from '../ui/dom-helpers.js';` (percorso relativo
corretto). Non cambiare i call site.

**Verify** dopo ogni file: `npm run type-check` → exit 0.
Alla fine: `grep -rn "function createEl\|function createIcon" js/admin/` → nessun
match (le uniche definizioni restano in `js/ui/dom-helpers.ts`).

### Step 4: Test dell'helper

Crea `tests/unit/dom-helpers.test.ts`: verifica che `createEl('div', {...})`
imposti id/classi/text/attrs/dataset/style/children correttamente e che
`createIcon('fas fa-plus')` produca un `<i class="fas fa-plus">`.

**Verify**: `npm test -- dom-helpers` → tutti pass.

## Test plan

- Nuovo `tests/unit/dom-helpers.test.ts` (casi Step 4).
- Le suite delle pagine admin toccate devono restare verdi: `npm test`.

## Done criteria

- [ ] `js/ui/dom-helpers.ts` esiste ed esporta `createEl` e `createIcon`
- [ ] Nessuna definizione locale di `createEl`/`createIcon` in `js/admin/`
- [ ] `npm run type-check` exit 0, `npm run lint` 0 warning
- [ ] `npm test` verde incl. `dom-helpers.test.ts`
- [ ] Nessun file fuori scope modificato
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Una variante di `createEl` ha una semantica divergente non riconducibile a un
  superset compatibile (es. gestisce `attrs` in modo diverso che cambia il DOM):
  fermati e segnala invece di forzare l'unificazione.
- Il DOM prodotto cambia per qualche pagina (test che diventa rosso): STOP.

## Maintenance notes

- Le nuove pagine admin devono importare da `js/ui/dom-helpers.ts`, non
  reimplementare gli helper.
- In review: confrontare il DOM prodotto prima/dopo su almeno una pagina.
