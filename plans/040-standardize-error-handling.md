# Plan 040: Standardizzare la gestione errori sull'helper `handleError`

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- js/admin js/operator js/shared/error-handler.ts`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/151

## Why this matters

Convivono tre pattern di gestione errori nelle pagine admin/operator: (1)
`Toast.show((err as Error).message, 'error')` senza logging; (2)
`logger.error(...)` + `handleError(err, context, target)`; (3) `handleError(...)`
senza logging preventivo. Esiste già un helper centralizzato robusto —
`handleError` in `js/shared/error-handler.ts` — che logga in modo sicuro
(mascherando dati sensibili), mappa gli errori noti a messaggi utente e può
renderizzare uno stato d'errore. Diverse pagine non lo usano, perdendo logging e
coerenza UX, ed esponendo talvolta messaggi DB grezzi. Standardizzare riduce il
rischio di errori critici non loggati.

## Current state

- Helper canonico — `js/shared/error-handler.ts:52-108`:
  ```ts
  export function handleError(error: unknown, context = '', renderTarget: HTMLElement | null = null): void {
    const errorId = logger.error(context, error); void errorId;
    // mappa PGRST116 / network / AppError / generico → messaggio utente sicuro
    // Toast.show(userMessage, type)
    // se renderTarget: rende uno stato d'errore con escapeHtml(userMessage)
  }
  ```
  Espone anche la classe `AppError`.
- Pattern presenti (verifica con i grep sotto — le righe possono variare):
  - Adottano `handleError`: es. `js/admin/stations.ts`, `js/admin/operators.ts`.
  - NON lo adottano (Toast diretto, spesso senza logger): es. `js/admin/islands.ts`,
    `js/admin/guns.ts`, `js/admin/prices.ts`, e varie pagine operator.
- Convenzione target: nel blocco `catch`, chiamare `handleError(err, '<contextName>', target?)`;
  usare `Toast.show` diretto SOLO per messaggi non-errore (info/success/warning di
  flusso), non per errori catturati.

## Commands you will need

| Scopo      | Comando                                            | Atteso            |
|------------|----------------------------------------------------|-------------------|
| Mappa uso  | `grep -rn "handleError\|Toast.show(.*error" js/admin js/operator` | elenca i siti |
| Typecheck  | `npm run type-check`                               | exit 0            |
| Test       | `npm test`                                         | tutti pass        |
| Lint       | `npm run lint`                                     | exit 0, 0 warning |

## Scope

**In scope**:
- File `js/admin/*.ts` e `js/operator/*.ts` che catturano errori con Toast diretto
  senza logging → convertiti a `handleError`.
- Aggiornare CLAUDE.md con la convenzione (sezione "Conventions" o "Known Traps").

**Out of scope**:
- `js/shared/error-handler.ts` — l'helper è corretto, non modificarlo.
- I `Toast.show` di flusso non-errore (info/success/warning) — restano.
- Componenti Lit (gestione errori interna al componente) — non in questo giro,
  salvo casi ovvi.

## Git workflow

- Branch: `advisor/040-standardize-error-handling`
- Commit: `refactor: uniforma la gestione errori su handleError`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Inventaria i siti da convertire

**Verify**: `grep -rn "Toast.show(" js/admin js/operator | grep -i "error"` →
elenca i candidati. Per ciascuno, controlla se è dentro un `catch` di un errore
catturato (da convertire) o è un messaggio di flusso (da lasciare).

### Step 2: Converti i catch a handleError, pagina per pagina

In ogni `catch (err)` che oggi fa `Toast.show(<messaggio d'errore>)` senza
logging, sostituisci con `handleError(err, '<nomeFunzione>')` (o con
`handleError(err, '<nomeFunzione>', container)` se esiste già un elemento target
in cui rendere lo stato d'errore). Importa `handleError` da
`'../shared/error-handler.js'` (percorso relativo corretto). Rimuovi eventuali
`logger.error` ridondanti immediatamente adiacenti (handleError già logga).

**Verify** dopo ogni file: `npm run type-check` → exit 0; `npm run lint` → 0 warning.

### Step 3: Documenta la convenzione

In `CLAUDE.md`, sezione "Conventions", aggiungi una riga: "Gestione errori: nei
`catch`, usare `handleError(err, context, target?)` da
`js/shared/error-handler.ts` (logga in sicurezza e mostra un messaggio utente).
`Toast.show` diretto solo per messaggi di flusso non-errore."

**Verify**: `grep -n "handleError" CLAUDE.md` → la riga è presente.

## Test plan

- Nessun nuovo comportamento: le suite esistenti delle pagine toccate devono
  restare verdi (`npm test`). Se una pagina ha un test che asserisce su
  `Toast.show` con un messaggio specifico d'errore, aggiornalo per riflettere il
  messaggio prodotto da `handleError` (o asserisci che `handleError`/`logger.error`
  sia stato invocato). Documenta questi adattamenti nel commit.

## Done criteria

- [ ] I `catch` con Toast d'errore senza logging in `js/admin`/`js/operator` usano `handleError`
- [ ] `npm run type-check` exit 0, `npm run lint` 0 warning
- [ ] `npm test` verde (con test adattati dove necessario)
- [ ] CLAUDE.md documenta la convenzione
- [ ] Nessun file fuori scope modificato
- [ ] Riga di stato aggiornata in `plans/README.md`

## STOP conditions

- Un sito usa `Toast.show` d'errore ma con logica utente specifica che
  `handleError` non replica (es. messaggio localizzato ad hoc importante):
  lascialo e segnalalo, non forzare la conversione.
- La conversione fa cadere >5 test che asseriscono su messaggi Toast specifici:
  STOP e segnala (serve una decisione su come testare gli errori).

## Maintenance notes

- Dopo questo piano, `handleError` è l'unico ingresso per errori catturati: i
  reviewer devono rifiutare nuovi `Toast.show` d'errore senza logging.
- Possibile follow-up: un lint rule custom che vieta `Toast.show(..., 'error')`
  fuori da `error-handler.ts` (non incluso qui).
