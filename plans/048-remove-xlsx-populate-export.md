# Plan 048: Rimuovere xlsx-populate/eval dall'export Excel (issue #122)

> **Istruzioni per l'executor**: piano retro-documentato dopo esecuzione; tenere
> allineato `plans/README.md`.

## Status

- **State**: DONE — PR #160, merged 2026-07-03
- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: 047 (workaround warning eval, poi superato)
- **Category**: security
- **Implemented at**: merge commit `c59c9cb3868725a2d8f3f14595b79713e7ccdc40`
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/122
- **PR**: https://github.com/B00RR/portale-distributori-neofuel/pull/160

## Why this matters

`xlsx-populate` generava warning `Use of eval` durante la build e introduceva
rumore/security smell nel gate. Il piano 047 aveva mitigato temporaneamente il
warning, ma la soluzione definitiva era rimuovere la dipendenza.

## Implementazione eseguita

- Rimossa `xlsx-populate` dal grafo dipendenze.
- Riscritto l'export Excel per modificare il template XLSX via JSZip lazy-loaded.
- Rimosso il workaround `rollupOptions.onwarn` che filtrava il warning `EVAL`.
- Aggiornati chunk/commenti vendor: niente vendor dedicato a `xlsx-populate`.

## Verifiche eseguite

- `git diff --check`
- `npm run type-check`
- `npm run lint`
- `npm test -- export_utils`
- `npm test` — 70 file / 424 test passed
- `npm run test:e2e -- --project=chromium` — 6 passed
- `npm audit --audit-level=high --production` — 0 vulnerabilità
- `npm run build` — exit 0, nessun `xlsx-populate`, nessun `Use of eval`, nessun
  chunk-size warning bloccante
- CI PR #160 tutta verde prima del merge

## Done criteria

- [x] `xlsx-populate` non è più dipendenza runtime
- [x] build senza warning `Use of eval`
- [x] workaround 047 rimosso/superato
- [x] issue #122 chiusa
- [x] riga di stato aggiornata in `plans/README.md`

## Maintenance notes

- Non reintrodurre librerie XLSX browser che usano `eval` senza motivazione
  esplicita e verifica build/security.
- Se in futuro si cambia libreria export, verificare sempre build, audit e E2E
  mockato almeno su Chromium.
