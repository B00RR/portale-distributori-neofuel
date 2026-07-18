# Onboarding Guide - Portale Distributori Neofuel

> Ultimo aggiornamento: 2026-07-18

## Cosa è questo progetto

Sistema di gestione per distributori di carburante, con moduli per operatori (apertura/chiusura turni, cassa, cisterne), amministratori (gestione stazioni, operatori, prezzi, voucher) e reportistica.

## Stack e prerequisiti

- **Node.js**: versione indicata in `.nvmrc` / `engines` di `package.json` (attualmente 22.x).
- **Package manager**: npm con lockfile `package-lock.json`.
- **Build**: Vite 6 + PWA (`vite-plugin-pwa`).
- **Frontend**: TypeScript strict, Lit 3 per i componenti complessi.
- **Backend**: Supabase (PostgreSQL + RLS + RPC + Edge Functions).
- **Test**: Vitest per unit/integrazione, Playwright per E2E.
- **CI/CD**: GitHub Actions (`.github/workflows/`).

## Setup locale

```bash
# Clona il repo
git clone https://github.com/B00RR/portale-distributori-neofuel.git
cd portale-distributori-neofuel

# Installa le dipendenze
npm ci

# Crea il file .env
cp .env.example .env
# Compila VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# Avvia il dev server
npm run dev
```

## Comandi essenziali

```bash
npm test            # test unit/integrazione
npm run test:e2e    # E2E Playwright (richiede build e .env)
npm run type-check  # TypeScript strict --noEmit
npm run lint        # ESLint con max-warnings 0
npm run build       # build produzione
```

## Struttura del codice

```
js/
  core/          # API Supabase, auth, logger, offline queue, schemi Zod
  admin/         # Pannello admin (operatori, stazioni, prezzi, turni, voucher)
  operator/      # Pannello operatore (apertura, chiusura, cassa, scontrini)
  shared/        # error-handler, state, hash-router, ruoli
  ui/            # componenti Lit (ShiftOpener, ClosureWizard, VoucherManager) + toast/modal
  utils/         # sanitizer, calculation-engine, cache, export, helpers
  types.ts       # interfacce TypeScript
docs/            # documentazione (questa cartella)
sql/             # migrazioni e funzioni RPC/RLS
supabase/        # Edge Functions e tipi generati
tests/           # test Vitest
e2e/             # test Playwright
config/          # vitest, playwright
vite.config.js   # configurazione Vite (root)
eslint.config.js # configurazione ESLint (root)
```

## Convenzioni obbligatorie

- **TypeScript strict**: nessun `any` implicito.
- **HTML dinamico**: usare `setSafeHTML()` o `escapeHtml()` da `js/utils/sanitizer.ts`.
- **Error handling**: usare `handleError(error, context)` da `js/shared/error-handler.ts`.
- **Sanitizzazione**: nessun `innerHTML` diretto su contenuto non fidato.
- **Segreti**: mai hardcodare API key, password o Service Role Key.
- **Commit**: formato `type(scope): message (#issue)`.

## Audit trail & sicurezza

- Prima di modificare RLS/RPC/Edge Functions, verificare lo stato **live** di Supabase: i file in `sql/` e `supabase/` possono non essere perfettamente sincroni con il database remoto.
- Non deployare migrazioni su Supabase live senza approvazione esplicita del owner.
- Ogni PR deve passare lint, type-check, test unit e build check.

## Risorse utili

- `CLAUDE.md` - panoramica architetturale e trappole comuni
- `AGENTS.md` - regole non negoziabili per agenti di coding
- `docs/adr/README.md` - decisioni architetturali (ADR)
- `docs/API_DOCUMENTATION.md` - API RPC principali
- `docs/SECURITY_GUIDELINES.md` - linee guida sicurezza

## Chi contattare

- Owner: @B00RR
- Per domande su dominio business: aprire issue con label `question`.
