# Plan 043 [DIREZIONE]: Estendere la coda offline a crediti, uscite, extra-income, fatture

> **Istruzioni per l'executor**: questo è un piano di direzione (feature). È
> strutturato come design + implementazione incrementale. Rispetta le STOP
> conditions e aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/core/offline-queue.ts js/app.ts js/operator`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/029 (guard di re-entrancy) e idealmente plans/032
  (idempotenza) per le nuove mutazioni finanziarie
- **Category**: direction
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/154

## Why this matters

Il portale è una PWA offline-first pensata per stazioni di servizio con
connettività scarsa, ma la coda offline copre solo 2 mutazioni: `voucher_redeem`
e `shift_close` (gli unici executor registrati in `js/app.ts`). Le altre azioni
operatore che toccano i soldi — crediti, uscite (outflows), extra-income,
richieste fattura — chiamano Supabase direttamente senza passare dalla coda:
se l'operatore è offline mentre le registra, l'azione fallisce (o peggio, l'utente
crede sia salvata). Estendere la coda a queste mutazioni chiude la lacuna di
affidabilità più concreta del prodotto.

## Current state

- `js/core/offline-queue.ts:13-19` — `QueuedAction.type` ammette:
  `'voucher_redeem' | 'shift_close' | 'movement_create' | 'generic'`. Esiste già
  un tipo generico `movement_create` non ancora sfruttato.
- `js/app.ts:127-176` — registra executor solo per `voucher_redeem` e
  `shift_close`; chiama `setupAutoSync()` (riga 178).
- Moduli operatore che inseriscono direttamente (candidati): `js/operator/credits.ts`,
  `js/operator/outflows.ts`, `js/operator/extra-income.ts`, `js/operator/invoices.ts`.
  Ognuno chiama `supabase.from(...).insert(...)` o una RPC senza guardia
  `isOffline()` (helper già esportato da `offline-queue.ts`).
- Pattern esistente da imitare: gli executor già registrati in `js/app.ts` +
  l'uso di `queueAction(type, payload)` + `isOffline()`.

## Commands you will need

| Scopo      | Comando                          | Atteso            |
|------------|----------------------------------|-------------------|
| Typecheck  | `npm run type-check`             | exit 0            |
| Test       | `npm test`                       | tutti pass        |
| Lint       | `npm run lint`                   | exit 0, 0 warning |

## Scope

**In scope**:
- `js/core/offline-queue.ts` — estendere l'unione `QueuedAction['type']` con i
  nuovi tipi (es. `'credit_create' | 'outflow_create' | 'extra_income_create' | 'invoice_request'`).
- `js/app.ts` — registrare un executor per ciascun nuovo tipo (replay dell'insert/
  RPC corrispondente).
- `js/operator/credits.ts`, `outflows.ts`, `extra-income.ts`, `invoices.ts` —
  incapsulare l'insert in `if (isOffline()) { await queueAction(...) } else { ...insert... }`.
- Test unitari per ogni nuovo executor.

**Out of scope**:
- Cambiare la logica di business/validazione di quelle mutazioni.
- Le RPC lato DB (a meno che l'idempotenza del piano 032 non venga applicata in
  parallelo — coordinare).

## Steps (incrementali, un tipo per volta)

### Step 0: Design — mappa payload ed executor

Per ciascuna delle 4 mutazioni, documenta: la tabella/RPC di destinazione, la
shape del payload necessario per replicarla offline, e l'executor che la
riesegue. Verifica che il payload sia serializzabile (niente riferimenti a DOM/
funzioni). **Fermati e fai rivedere questo design** prima di implementare tutti e
quattro (STOP soft).

### Step 1..4: Implementa un tipo alla volta

Per ogni mutazione (inizia da `credit_create`):
1. aggiungi il tipo all'unione in `offline-queue.ts`;
2. registra l'executor in `js/app.ts` (replica l'insert/RPC, ritorna `true`/`false`
   come gli executor esistenti);
3. nel modulo operatore, avvolgi l'insert con la guardia `isOffline()` +
   `queueAction`;
4. aggiungi un test unitario dell'executor (mock `supabase`).

**Verify** dopo ogni tipo: `npm run type-check` exit 0; `npm test` verde.

## Test plan

- Un test per executor in `tests/unit/` (mock di `supabase.from().insert()` /
  `supabase.rpc()`), modellato sui test offline esistenti.
- Un test per modulo che verifichi il branch `isOffline()` → `queueAction`
  chiamata con il payload atteso.

## Done criteria

- [ ] `QueuedAction['type']` include i 4 nuovi tipi
- [ ] `js/app.ts` registra un executor per ciascuno
- [ ] I 4 moduli operatore accodano quando offline
- [ ] Test per ogni nuovo executor + branch offline
- [ ] `npm run type-check` / `npm test` / `npm run lint` verdi
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Il design (Step 0) rivela che una mutazione non è replicabile in modo
  idempotente e il piano 032 non è ancora applicato → implementa prima solo le
  mutazioni sicure e segnala il resto come dipendente da 032.
- Una mutazione richiede dati non serializzabili nel payload → ripensa il payload,
  non forzare.

## Maintenance notes

- Ogni nuova mutazione operatore d'ora in poi deve valutare se accodarsi offline.
- Le mutazioni finanziarie accodate amplificano il rischio di doppia applicazione:
  vanno di pari passo con l'idempotenza del piano 032.
