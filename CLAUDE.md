# CLAUDE.md – Neofuel Contributor Guide

## Overview

**Portale Distributori Neofuel** is a fuel-station management portal for operators and admins. It is a **PWA** built with:
- **Vite 6** (build)
- **Vanilla TypeScript** (strict mode)
- **Lit 3** (web components)
- **Supabase** (`@supabase/supabase-js`) with RPC functions and Row-Level Security (RLS)
- **Workbox** and `vite-plugin-pwa` (offline support)
- **Zod 4** (validation)

## Layout

```
js/
  core/          # RPC/auth logic, offline queue, core domain
  admin/         # Admin features
  operator/      # Operator features
  shared/        # Shared logic (auth, state, etc.)
  ui/            # Lit components
  utils/         # Helpers (sanitizer, cache, etc.)

sql/             # Postgres RPC functions and RLS policies

config/
  vitest.config.ts        # Unit test config
  playwright.config.js    # E2E test config

tests/           # Vitest unit tests
e2e/             # Playwright E2E tests
```

## Commands

```bash
npm ci              # Clean install dependencies
npm run dev         # Start dev server
npm test            # Run Vitest suite (config/vitest.config.ts)
npm run test:e2e    # Run Playwright (config/playwright.config.js)
npm run type-check  # TypeScript strict check
npm run lint        # ESLint with max-warnings 0
```

## Architecture Notes

**Server Logic = RPC + RLS, NOT Edge Functions**  
- Server-side validation, authorization, and data logic live in Postgres RPC functions + Row-Level Security policies in `sql/`.
- The `supabase/functions/` folder exists only to hold `database.types.ts` (generated types).
- All business logic talks to the database via RPC.

**Offline Support**  
- `js/core/offline-queue.ts` queues mutations when offline; syncs on reconnect.

**PWA**  
- Configured via `vite-plugin-pwa` and `workbox-window`; allows offline access to cached routes and assets.

## Conventions

- **TypeScript strict mode** — no `any`, no implicit `unknown`.
- **Lit components** — use `@lit/reactive-element` for component state.
- **HTML sanitization required** — all dynamic HTML must pass through `setSafeHTML()` or `escapeHtml()` from `js/utils/sanitizer.ts`. XSS security enforced.
- **Conventional commits** — commit messages follow the format: `type(scope): message` (e.g., `feat: add fuel tracking`, `fix(auth): handle token expiry`).

## Known Traps for Agents

1. **Two cache modules exist — use `js/utils/cache.ts`**  
   - `js/utils/cache.ts` is the active cache layer (class `Cache`).
   - `js/core/cache.ts` is unused and should not be imported.

2. **Production Supabase differs from repo `sql/*.sql`**  
   - RPC functions and RLS policies may differ between the live database and files in `sql/`.
   - Always verify the live database state before trusting a repo SQL file.

3. **Supabase stubs in tests**  
   - `config/vitest.config.ts` aliases `@supabase/supabase-js` and `zod` to test mocks.
   - Validation and Supabase calls are stubbed, so unit tests do not exercise true end-to-end behavior.
   - E2E tests (`e2e/`) are the source of truth for real integrations.

4. **CI "Elite Quality Gate" is strict (zero-tolerance)**  
   - `lint` (eslint `--max-warnings 0`), `type-check`, `unit-tests`, `e2e-tests`, `security-scan` (npm audit `--audit-level=high` + Snyk), and `build-check` all hard-fail the gate.
   - No `continue-on-error` and no ratchet baselines: any new lint warning, prettier diff, type error, or high/critical vuln blocks the merge.

## Safety

- **Never commit `.env`** — credentials and secrets must not be in the repo.
- **Verify deployed DB state before schema changes** — Always confirm live Supabase state matches intent before applying migrations.
