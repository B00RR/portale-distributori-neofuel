> Verificato sul commit `$(git rev-parse --short HEAD)`.

## Severità / Confidenza / Effort
Severità: Media
Confidenza: Confermato
Effort: Medio

## Diagnosi (causa radice)
Il piano numero 040 in `plans/040-standardize-error-handling.md` documenta l'intenzione di uniformare l'uso di `handleError` al posto di `Toast.show(..., 'error')` all'interno dei blocchi `catch`.
Attualmente, diverse funzioni in `js/admin/*.ts` e `js/operator/*.ts` (anche se non esplicitamente dentro un `catch` generico, ma come gestione di errori di validazione logica o chiamate `error` senza throw come in `js/admin/dashboard-config.ts:249`, `js/admin/shifts.ts:584`, `js/admin/operators.ts:277`, `js/admin/credits.ts:271`) usano ancora `Toast.show(..., 'error')` senza fare leva sul sistema di log centralizzato che provvede al mascheramento dei dati sensibili e alla UX uniforme e coerente, contravvenendo a quanto stabilito nelle guideline.

Inoltre, dai log di esecuzione dei test unitari (`npm test`), si evincono degli errori "swallowed" relativi a operazioni sul database per le funzioni:
- `showExtraIncomeMenu_submit` (ID: ERR-MR5JVHIL)
- `showOutflowMenu_submit` (ID: ERR-MR5JVHMZ)

Tali errori vengono stampati come `ERROR [neofuel][showExtraIncomeMenu_submit] [Object]` e vengono generati silenziosamente (tramite proxy mock Supabase falliti o mancata cattura in `tests/unit/extra-income.test.ts` e `tests/unit/outflows.test.ts`), il che costituisce un pattern di errore "swallowed", dove l'eccezione non viene gestita correttamente o non viene fatta fallire l'asserzione del test.

## Evidenza
Eseguendo `grep -rn "Toast.show(.*'error'" js/admin js/operator`:
```
js/admin/dashboard-config.ts:249:    Toast.show('Utente non autenticato', 'error');
js/admin/dashboard-config.ts:286:    Toast.show('Utente non autenticato', 'error');
js/admin/shifts.ts:584:        Toast.show('Seleziona entrambe le date.', 'error');
js/admin/operators.ts:277:        Toast.show('Dati non validi: ' + validation.error, 'error');
js/admin/credits.ts:271:        Toast.show('Errore validazione: ' + formatErrorMessages(errors), 'error');
```

Output log test (tramite `npm run test > test.log 2>&1; cat test.log | grep ERROR`):
```
2026-07-03T23:14:05.805Z ERROR [neofuel][showExtraIncomeMenu_submit] [Object] (ID: ERR-MR5JVHIL)
2026-07-03T23:14:05.964Z ERROR [neofuel][showOutflowMenu_submit] [Object] (ID: ERR-MR5JVHMZ)
```

## Perché è un bug (impatto)
Manca uniformità nel logging. Errori mostrati tramite `Toast.show` direttamente non passano attraverso il logger protetto di `error-handler.ts`, perdendo visibilità nei log di sistema o rischiando di non essere gestiti in base al context (es. dev vs production) come fa `handleError`. Questo aumenta il debito tecnico ed è classificato come un tech-debt da sanare in `plans/040-standardize-error-handling.md`.
Gli errori swallowed nei test coprono problemi silenti che andrebbero esposti o gestiti, diminuendo l'affidabilità della suite unitaria.

## Piano di fix chirurgico
1. Sostituire le chiamate a `Toast.show(msg, 'error')` con `handleError(new Error(msg), 'contesto_specifico')` nei file elencati nell'evidenza. Alternativamente, se si tratta di pure validazioni di forma e non "errori imprevisti", modificare il tipo da `'error'` a `'warning'`.
2. Aggiungere in `CLAUDE.md`, sotto la sezione "Conventions", l'istruzione: "Gestione errori: nei \`catch\`, usare \`handleError(err, context, target?)\` da \`js/shared/error-handler.ts\` (logga in sicurezza e mostra un messaggio utente). \`Toast.show\` diretto solo per messaggi di flusso non-errore."
3. Negli unit test `tests/unit/extra-income.test.ts` e `tests/unit/outflows.test.ts`, correggere i test "should handle database errors" affinché asseriscano correttamente il fallimento senza causare uno `swallow` (ad esempio inserendo un mock di `logger.error` o verificando il throw), oppure impedendo che il log inquini lo standard output se è un comportamento atteso.

## Criteri di accettazione
- `grep -rn "Toast.show(.*'error'" js/admin js/operator` non restituisce alcun risultato.
- I test unitari completano senza loggare `ERROR [neofuel]...` in console a meno che non falliscano esplicitamente.
- `npm run type-check` restituisce exit 0.
- `npm run lint` restituisce 0 warning.

## Correlate / dipendenze
- Piano: `plans/040-standardize-error-handling.md`
