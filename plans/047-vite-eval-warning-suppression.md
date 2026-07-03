# Plan 047: Silenziare il warning rollup "eval in xlsx-populate" nel log di build (issue #140)

> **Istruzioni per l'executor**: segui i passi, esegui ogni verifica, rispetta le
> STOP conditions, aggiorna `plans/README.md`.
>
> **Drift check (esegui per primo)**:
> `git diff --stat 36c3578..HEAD -- vite.config.js`

## Status

- **State**: DONE — PR #159, merged 2026-07-03; SUPERSEDED da PR #160/#122
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (ma coordinare con #122 — vedi Maintenance)
- **Category**: tech-debt
- **Planned at**: commit `36c3578`, 2026-07-03
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/140

## Why this matters

`npm run build` (e il dev server / e2e) stampa il warning:
`node_modules/xlsx-populate/browser/xlsx-populate.js (110:0): Use of eval ... is strongly discouraged`.
È rumore prodotto da una dipendenza di terze parti (`xlsx-populate` usa `eval`
internamente) che inquina il log e può nascondere warning reali in un progetto
con gate a tolleranza zero e CSP. L'import è già lazy (post #136), quindi il
runtime non è impattato: la cura minima è **filtrare quello specifico warning**
via `rollupOptions.onwarn`, come workaround esplicito finché #122 non sostituisce
la libreria.

## Current state

- `vite.config.js` — export a funzione con `build.rollupOptions.output.manualChunks`
  già presente; **non** c'è un handler `onwarn`. Struttura (indentazione a 4
  spazi, stile del file da preservare):
  ```js
  export default defineConfig(({ mode }) => {
      // ...
      return {
          // ...
          build: {
              target: 'es2022',
              outDir: 'dist',
              assetsDir: 'assets',
              chunkSizeWarningLimit: 700,
              cssCodeSplit: true,
              rollupOptions: {
                  output: {
                      manualChunks(id) { /* split vendor #123 */ }
                  }
              }
          }
      };
  });
  ```

## Commands you will need

| Scopo      | Comando                                             | Atteso                          |
|------------|-----------------------------------------------------|---------------------------------|
| Build      | `npm run build`                                      | exit 0, nessun warning `eval`   |
| Typecheck  | `npm run type-check`                                 | exit 0                          |
| Lint       | `npm run lint`                                       | exit 0 (lint scansiona `js/`)   |

## Scope

**In scope**:
- `vite.config.js` (aggiungere `onwarn` dentro `build.rollupOptions`)

**Out of scope**:
- Sostituire/rimuovere `xlsx-populate` — quello è tracciato da #122 (piano a sé).
- Qualsiasi riformattazione del file (vedi STOP/Maintenance: prettier CI non
  copre `vite.config.js`, non riformattarlo).

## Git workflow

- Branch: `advisor/047-vite-eval-warning`
- Commit: `chore(build): silenzia il warning eval di xlsx-populate (workaround #140)`
- Niente push/PR salvo richiesta.

## Steps

### Step 1: Aggiungi `onwarn` mirato in build.rollupOptions

Dentro `build.rollupOptions` (allo stesso livello di `output`), aggiungi un
handler `onwarn` che ignora **solo** il warning `EVAL` proveniente da
`xlsx-populate` e ripassa tutto il resto a `warn`:
```js
rollupOptions: {
    onwarn(warning, warn) {
        if (warning.code === 'EVAL' && warning.id && warning.id.includes('xlsx-populate')) {
            return; // workaround temporaneo #140 — rimuovere quando #122 sostituisce la libreria
        }
        warn(warning);
    },
    output: {
        manualChunks(id) { /* invariato */ }
    }
}
```
Il doppio filtro (`code === 'EVAL'` **e** `id.includes('xlsx-populate')`) è
importante: NON silenziare `eval` proveniente da altro codice. Mantieni
l'indentazione a 4 spazi del file.

**Verify**: `npm run build` → exit 0 e nessuna riga `Use of eval` nell'output.

### Step 2: Conferma che altri warning restano visibili

Controlla che l'output di build mostri ancora eventuali altri warning (il filtro
è ristretto a `xlsx-populate`).

**Verify**: `npm run build 2>&1 | grep -i "eval"` → nessun match; il build
completa (exit 0).

## Test plan

- Nessun test unitario nuovo (config di build). La verifica è: build verde senza
  il warning `eval`, e nessun altro warning soppresso.

## Done criteria

- [ ] `npm run build` exit 0, nessun warning `Use of eval` in output
- [ ] `onwarn` filtra SOLO `code === 'EVAL'` + id `xlsx-populate` (non tutto)
- [ ] Commento nel `vite.config.js` che marca il workaround e rimanda a #122
- [ ] `vite.config.js` non è stato riformattato (diff minimo, solo l'aggiunta)
- [ ] `npm run type-check` / `npm run lint` verdi
- [ ] Riga di stato aggiornata in `plans/README.md`; issue #140 chiusa

## STOP conditions

- Aggiungendo `onwarn` la build inizia a fallire o a nascondere warning attesi →
  restringi ulteriormente il filtro o segnala.
- Se #122 è già stata risolta (xlsx-populate rimosso/sostituito) → il warning non
  esiste più: marca REJECTED e chiudi #140.

## Maintenance notes

- **Workaround superato**: #122 è stato chiuso in PR #160 rimuovendo
  `xlsx-populate`. L'handler `onwarn` mirato non è più necessario ed è stato
  rimosso con il fix strutturale.
- `vite.config.js` è un file root: la CI prettier copre solo `js/**`, quindi NON
  va riformattato (eviterebbe rumore di diff); il pre-commit hook lo linta
  comunque, ma senza `--max-warnings`, quindi warning non bloccano.
