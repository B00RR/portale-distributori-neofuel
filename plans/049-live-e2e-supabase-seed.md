# Plan 049: Seed opt-in per E2E contro Supabase live (issue #131)

> **Istruzioni per l'executor**: piano retro-documentato dopo esecuzione; tenere
> allineato `plans/README.md`.

## Status

- **State**: DONE — PR #161, merged 2026-07-03
- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: tests
- **Implemented at**: merge commit `daccf53360b8ea63cd51dc23093ea3842721c27d`
- **Issue**: https://github.com/B00RR/portale-distributori-neofuel/issues/131
- **PR**: https://github.com/B00RR/portale-distributori-neofuel/pull/161

## Why this matters

I test E2E contro Supabase live fallivano o erano flaky perché non esisteva un
setup deterministico di dati/utenti test. La suite default resta ermetica e
mockata, ma serve un percorso opt-in per validare contro un progetto Supabase live.

## Implementazione eseguita

- Aggiunto `scripts/e2e-live-seed.mjs`:
  - crea/aggiorna utenti auth admin/operator via service-role;
  - crea/aggiorna righe `public.users` corrispondenti;
  - crea/aggiorna una stazione E2E;
  - assegna admin/operator alla stazione in `user_stations`.
- Aggiunto `config/playwright.global-setup.js`:
  - esegue il seed solo con `E2E_SUPABASE_MODE=live`.
- Aggiornato `config/playwright.config.js`:
  - default mock/hermetic con credenziali stub;
  - live mode usa env reali e global setup.
- Aggiornato `e2e/helpers/mock-supabase.js`:
  - in live mode non registra route mock;
  - login usa credenziali env per admin/operator.
- Aggiornati `package.json` e `.env.example` con `test:e2e:live` e variabili richieste.

## Variabili live richieste

- `E2E_SUPABASE_MODE=live`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo server/setup, mai client)
- opzionali: `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_OPERATOR_EMAIL`,
  `TEST_OPERATOR_PASSWORD`, `TEST_STATION_NAME`, `TEST_STATION_LOCATION`

## Verifiche eseguite

- `git diff --check`
- `npm run type-check`
- `npm run lint`
- `node scripts/e2e-live-seed.mjs` senza credenziali live → fail-fast corretto
  con soli nomi env richiesti, nessun secret loggato
- `npm run test:e2e -- --project=chromium` — 6 passed in modalità mock default
- `npm test` — 70 file / 424 test passed
- `npm run build`
- CI PR #161 tutta verde prima del merge

## Done criteria

- [x] live E2E opt-in documentato
- [x] seed idempotente per utenti/stazione/assegnazioni
- [x] default E2E resta mockato e deterministico
- [x] nessun secret committato o loggato
- [x] issue #131 chiusa
- [x] riga di stato aggiornata in `plans/README.md`

## Maintenance notes

- Non mettere `SUPABASE_SERVICE_ROLE_KEY` in env pubbliche Vite/Vercel client.
- Il seed è idempotente ma modifica il DB live: usare solo su ambienti controllati
  o progetto live esplicitamente autorizzato.
- Se si aggiungono E2E data-driven, estendere questo script invece di creare seed
  ad hoc nei test.
