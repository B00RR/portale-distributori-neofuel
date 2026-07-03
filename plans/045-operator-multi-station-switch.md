# Plan 045 [DIREZIONE]: Selettore stazione per operatori multi-stazione

> **Istruzioni per l'executor**: piano di direzione (feature). Design +
> implementazione. Rispetta le STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/operator js/core/auth.ts js/app.ts`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/156

## Why this matters

Il modello dati supporta l'assegnazione di più stazioni a un operatore
(`user_stations`, e `auth.ts` carica `assignedStations`), ma la UI operatore
prende **sempre la prima stazione** e non offre modo di cambiarla. Un operatore
assegnato a più impianti deve fare logout/login per cambiare contesto. Aggiungere
un selettore di stazione nell'header operatore sblocca il caso multi-stazione con
infrastruttura (dati, auth, RLS) già presente. Il lato admin ha già un pattern di
filtro-stazione globale da cui prendere spunto.

## Current state

- `js/operator/layout.ts:33-38` — la shell operatore sceglie la stazione così:
  ```ts
  export async function renderOperatorShell(container, handlers): Promise<void> {
    const user = store.getUser() as ExtendedUser | null;
    const stationId = user?.station_id || user?.assignedStations?.[0]?.id;  // <-- prima stazione
    // ...
  }
  interface ExtendedUser extends User { assignedStations?: Array<{ id: string }>; }
  ```
- `js/app.ts:206-224` e `274-293` — dopo il login/ripristino sessione, il codice
  legge la `station_id` autorevole da `user_stations` con `.maybeSingle()`
  (assume UNA stazione) e chiama `showOperatorMenu(userId, stationId)`.
- `js/operator/router.ts` — instrada le viste operatore usando lo `stationId`
  corrente.
- `js/core/auth.ts` (intorno a riga 320) — popola `assignedStations` dall'array
  `user_stations`.
- Pattern di riferimento lato admin: filtro stazione globale in `js/admin.ts`
  (selettore in header che aggiorna lo stato e ri-renderizza).

## Commands you will need

| Scopo      | Comando                        | Atteso            |
|------------|--------------------------------|-------------------|
| Typecheck  | `npm run type-check`           | exit 0            |
| Test       | `npm test`                     | tutti pass        |
| Lint       | `npm run lint`                 | exit 0, 0 warning |

## Scope

**In scope**:
- `js/operator/layout.ts` — rendere un `<select>` di stazione nell'header quando
  `assignedStations.length > 1`; alla selezione, persistere la scelta e
  ri-renderizzare.
- `js/operator/router.ts` — leggere la stazione selezionata (da store/localStorage)
  invece della prima.
- `js/app.ts` — al login recuperare TUTTE le `user_stations` (non `.maybeSingle()`)
  e inizializzare la stazione selezionata (persistita o prima).
- `tests/unit/operator-layout.test.ts` (o creare) per il selettore.

**Out of scope**:
- Le RLS (già scopano per stazione via `user_stations` — verifica ma non
  modificare).
- Il flusso admin.

## Steps

### Step 0: Design del contesto-stazione

Definisci dove vive la "stazione selezionata": consigliato `store` (stato app) +
persistenza `localStorage` (chiave es. `operator_selected_station`). Al boot:
usa la persistita se ancora tra le assegnate, altrimenti la prima. **Fai rivedere
il design** prima di implementare (STOP soft).

### Step 1: Recupera tutte le stazioni assegnate al login

In `js/app.ts`, dove oggi si fa `.from('user_stations').select('station_id').eq('user_id', ...).maybeSingle()`,
recupera l'elenco completo (senza `.maybeSingle()`), salvalo nello store come
`assignedStations`, e determina la stazione iniziale (persistita o prima).

**Verify**: `npm run type-check` exit 0; login operatore con 1 sola stazione
continua a funzionare identico (nessun selettore mostrato).

### Step 2: Aggiungi il selettore in header

In `js/operator/layout.ts`, se `assignedStations.length > 1`, renderizza un
`<select>` nell'header con le stazioni; al `change`, salva la scelta
(store + localStorage) e ri-renderizza la shell/vista corrente con la nuova
stazione. Usa gli helper UI esistenti; niente Lit.

**Verify**: con più stazioni compare il selettore; con una sola no.

### Step 3: Il router usa la stazione selezionata

Assicura che `js/operator/router.ts` e `showOperatorMenu` usino la stazione
selezionata corrente, non `assignedStations[0]`.

**Verify**: `npm run lint` 0 warning; `npm test` verde.

### Step 4: Test

`tests/unit/operator-layout.test.ts`: con `assignedStations` di lunghezza 1 → nessun
selettore; con lunghezza >1 → selettore presente, e il `change` aggiorna lo stato
e invoca il re-render con la stazione scelta.

**Verify**: `npm test -- operator-layout` → verde.

## Test plan

- Casi: 0/1/N stazioni assegnate; cambio selezione → nuova stazione usata dal
  router; persistenza sopravvive a un reload simulato (mock localStorage già in
  `tests/setup.ts`).
- Pattern: il filtro stazione admin in `js/admin.ts` come modello UX.

## Done criteria

- [ ] Login carica tutte le `user_stations` dell'operatore
- [ ] Header mostra il selettore solo con >1 stazione; la scelta persiste
- [ ] Router/menu usano la stazione selezionata, non la prima fissa
- [ ] Test per 1 e N stazioni presenti e verdi
- [ ] `npm run type-check` / `npm test` / `npm run lint` verdi
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Cambiando stazione, dati di un'altra stazione risultano visibili quando non
  dovrebbero (le RLS non scopano come atteso): STOP e segnala — è un problema di
  autorizzazione da chiarire prima di spedire.
- `showOperatorMenu` ha side-effect legati alla stazione che non si ripuliscono al
  cambio (es. listener non rimossi): segnala e gestisci il cleanup.

## Maintenance notes

- Un turno aperto è legato a una stazione: definire cosa succede al cambio
  stazione mentre un turno è aperto (probabilmente vietare il cambio o avvisare) —
  chiarire in review.
- La stazione selezionata è ora parte del contesto operatore: ogni nuova vista
  deve leggerla dallo store, non ricalcolare `assignedStations[0]`.
