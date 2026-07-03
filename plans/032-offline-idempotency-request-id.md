# Plan 032: Idempotenza delle mutazioni offline via request-id (design + implementazione guidata)

> **Istruzioni per l'executor**: questo piano tocca sia il client sia le RPC del
> DB **live**. Procedi SOLO fino a dove indicato; alle sezioni marcate
> "RICHIEDE CONFERMA UMANA" fermati e segnala. Rispetta le STOP conditions.
> Aggiorna `plans/README.md` a fine lavoro.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/core/offline-queue.ts js/app.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/029-offline-queue-reentrancy-guard.md (il guard riduce la
  finestra; questo piano chiude il caso "RPC eseguita ma risposta persa")
- **Category**: bug
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/143

## Why this matters

Anche in esecuzione single-thread, un'azione offline può causare doppia
applicazione: se l'RPC (`redeem_voucher_validated`, `submit_shift_closure`)
committa lato server ma la risposta si perde (rete che cade), il client la
considera fallita, incrementa il retry e la riprova → doppio movimento cassa /
seconda chiusura. Le RPC attuali NON sono idempotenti rispetto a un id di
richiesta. La soluzione robusta è un **request-id** generato alla creazione
dell'azione in coda e deduplicato lato server.

> Questo è un intervento a rischio ALTO perché modifica RPC in produzione su cui
> girano dati reali. Va fatto in due fasi con conferma umana tra l'una e l'altra.

## Current state

- `js/core/offline-queue.ts` — `QueuedAction` (righe 13–19) ha già un `id`
  univoco per azione:
  ```ts
  export interface QueuedAction {
    id: string;               // es. `${type}_${Date.now()}_${random}`
    type: 'voucher_redeem' | 'shift_close' | 'movement_create' | 'generic';
    payload: Record<string, unknown>;
    createdAt: string;
    retryCount: number;
  }
  ```
  Questo `id` è un candidato naturale per il request-id: è stabile per l'intera
  vita dell'azione (non cambia tra i retry).

- `js/app.ts` (righe 127–176) — gli executor chiamano le RPC:
  ```ts
  const { data: result, error } = await supabase.rpc('redeem_voucher_validated', {
    p_voucher_code: payload.voucherCode,
    p_station_id: stationIdNum,
    p_operator_id: payload.operatorId
  });
  // ...
  const { data: res, error } = await supabase.rpc('submit_shift_closure', {
    p_shift_id: payload.shiftId, p_station_id: payload.stationId,
    p_closing_data: closingData, p_is_final: payload.isFinal,
    p_final_counters: finalCounters, p_tank_usage: []
  });
  ```

- **DB live** (progetto Supabase `ahlmgafaurossyghimxc`, source of truth; i file
  in `sql/` sono STALE). Le RPC sono `SECURITY DEFINER`, auth-gated via
  `auth.uid()` + `user_stations`. `redeem_voucher_validated` inserisce in
  `movimenti_cassa`; `submit_shift_closure` aggiorna `shifts`/`shift_pistols`.
  `submit_shift_closure` è **già parzialmente idempotente**: rifiuta con
  `'Turno gia chiuso'` se `closed_at IS NOT NULL`. `redeem_voucher_validated` è
  idempotente sul voucher (rifiuta `status='redeemed'`), MA il movimento cassa
  potrebbe essere inserito due volte se la seconda esecuzione avviene prima del
  commit della prima — finestra stretta ma esistente.

## Commands you will need

| Scopo      | Comando                          | Atteso            |
|------------|----------------------------------|-------------------|
| Typecheck  | `npm run type-check`             | exit 0            |
| Test       | `npm test -- offline-queue app`  | tutti pass        |
| Lint       | `npm run lint`                   | exit 0, 0 warning |

Ispezione DB live: usare il Supabase MCP (`execute_sql`, `get_advisors`) in sola
lettura per confermare firma e corpo attuale delle RPC PRIMA di qualsiasi
proposta di migrazione. NON applicare migrazioni senza conferma umana.

## Scope

**Fase A — client (in scope, rischio basso)**:
- `js/core/offline-queue.ts` — esporre l'`id` dell'azione all'executor (già lo
  riceve: `executor(action)` passa l'intera `QueuedAction`).
- `js/app.ts` — passare `p_request_id: action.id` alle chiamate RPC.
- `tests/unit/offline-queue.test.ts`, `tests/unit/app.test.ts` (se presente).

**Fase B — DB (RICHIEDE CONFERMA UMANA, rischio alto)**:
- Migrazione che aggiunge parametro `p_request_id` alle RPC e una tabella/colonna
  di dedup (es. `processed_requests(request_id text primary key, created_at)`),
  con `INSERT ... ON CONFLICT DO NOTHING` come guardia early-return.

**Out of scope**:
- Cambiare la semantica di business delle RPC oltre la deduplica.
- Toccare `sql/*.sql` (stale) come se fosse lo stato deployato.

## Steps

### Step 1 (Fase A): propaga il request-id dal client

In `js/app.ts`, negli executor `voucher_redeem` e `shift_close`, aggiungi ai
parametri RPC un campo `p_request_id: action.id`. L'executor già riceve `action`,
quindi `action.id` è disponibile. Le RPC **ignoreranno** il parametro extra
finché la Fase B non è applicata? NO: PostgREST rifiuta parametri non previsti
dalla firma. Perciò la Fase A **da sola non deve essere deployata** prima della
Fase B. Implementa la Fase A dietro il completamento della Fase B, oppure
mantienila su branch fino all'ok umano.

**Verify**: `npm run type-check` → exit 0. (Il deploy resta bloccato: vedi STOP.)

### Step 2 (Fase B): PROPONI la migrazione, NON applicarla

Redigi (in un file `sql/migrations/NNN_request_id_idempotency.sql` a scopo
documentale, dato che i file `sql/` sono comunque stale) la migrazione che:
1. crea `processed_requests(request_id text primary key, endpoint text, created_at timestamptz default now())`;
2. aggiunge il parametro `p_request_id text default null` alle due RPC;
3. all'inizio del corpo RPC: `INSERT INTO processed_requests(request_id, endpoint) VALUES (p_request_id, '<nome>') ON CONFLICT DO NOTHING;` e se `NOT FOUND` (già presente) ritorna un esito "già processato" senza rieseguire gli effetti.

**RICHIEDE CONFERMA UMANA**: fermati qui e segnala la migrazione proposta.
NON eseguire `apply_migration`.

## Test plan

- Fase A: test in `tests/unit/app.test.ts`/`offline-queue.test.ts` che verifichi
  che l'executor passi `p_request_id` uguale ad `action.id` (mock di `supabase.rpc`
  che cattura i parametri).
- Fase B: test di idempotenza va fatto su un branch DB o progetto di staging, non
  in unit test (le RPC sono stubbate nei test). Documenta il piano di verifica
  manuale: chiamare la RPC due volte con lo stesso `p_request_id` → un solo
  effetto.

## Done criteria (Fase A soltanto — Fase B dopo conferma)

- [ ] `npm run type-check` exit 0
- [ ] `npm run lint` exit 0
- [ ] Gli executor in `js/app.ts` passano `p_request_id: action.id`
- [ ] Test client che verifica il passaggio del request-id
- [ ] Migrazione Fase B **redatta e segnalata**, NON applicata
- [ ] Riga di stato in `plans/README.md` = BLOCKED (in attesa conferma umana Fase B)

## STOP conditions

- Non deployare la Fase A finché la Fase B non è applicata al DB live (mismatch
  di firma RPC → errori in produzione).
- Se l'ispezione del DB live mostra che le RPC hanno già un parametro di
  idempotenza → segnala e marca REJECTED.
- Qualsiasi tentazione di eseguire `apply_migration` senza ok umano → STOP.

## Maintenance notes

- Preferire l'`id` di coda già esistente come request-id (stabile tra retry).
- `processed_requests` va ripulita periodicamente (cron/retention) per non
  crescere indefinitamente.
- In review: la guardia di dedup deve stare PRIMA di ogni effetto collaterale
  (insert movimento, update shift), non dopo.
