# Lighthouse CI — Authenticated Journeys Audit (#342)

## Overview

This runbook documents the deterministic Lighthouse CI audit configuration for authenticated user journeys on **Portale Distributori Neofuel**.

The audit expands public shell measurements to cover core authenticated application view renderings without connecting to live Supabase backends, risking production data, or exposing sensitive credentials.

---

## Journeys Audited

The Lighthouse CI configuration (`config/lighthouse/lighthouserc.json`) measures page rendering and interactive shell performance for:

1. **Public Login Shell** (`/`): Login form, initial PWA loading, guest layout.
2. **Admin Dashboard** (`/#admin/dashboard`): Control center, KPI overview, summary metrics.
3. **Shift Closures & Register** (`/#admin/shifts`): Apertura/chiusura registro, closure history, tabular metrics.
4. **Voucher Management** (`/#admin/vouchers`): Batch generation controls, voucher listing, state indicators.
5. **Invoices View & Export Actions** (`/#admin/invoices`): Invoice request management route rendering, exposing export action controls (PDF/CSV export button components rendering and layout metrics; does not automate button clicks or file downloads during Lighthouse performance measurement).
6. **Operator Shift Opening** (`/#operator/apertura`): Station operator shift opener view.

---

## Architecture: Hermetic Audit & Fail-Closed Isolation

- **Hermetic Network Interception**: `@lhci/cli` executes `scripts/lighthouse-auth.cjs` via `puppeteerScript`. Network calls to the configured Supabase stub host are intercepted at browser level and served with synthetic JSON fixtures.
- **Pre-set Session Storage**: Authenticated routes inject a synthetic Supabase session into `localStorage` before page rendering (`sb-<subdomain>-auth-token`).
- **Fail-Closed Domain & Protocol Guards**: Requests targeting unexpected Supabase project hosts, external third-party domains, or Realtime/WebSocket connections (`/realtime/v1`, `ws://`, `wss://`) are blocked fail-closed before receiving network traffic.
- **Storage Graceful Fallback**: System storage requests (`/storage/v1/*`) return deterministic HTTP 404 responses, keeping application fallback logic intact.
- **End-to-End Execution**: Full end-to-end browser auditing and performance assertion checking occur automatically within the Lighthouse CI GitHub Actions workflow (`.github/workflows/lighthouse.yml`).

---

## Safety Guards (Fail-Closed)

The script enforces strict non-negotiable guards:

1. **No Live Mode**: Fails immediately if `E2E_SUPABASE_MODE=live` or `LHCI_ALLOW_LIVE=true`.
2. **No Production Project Ref**: Fails immediately if `VITE_SUPABASE_URL` or `SUPABASE_URL` contains `ahlmgafaurossyghimxc`.
3. **No Secrets in CI Workflow**: `.github/workflows/lighthouse.yml` uses non-sensitive stub credentials (`https://stub-project.supabase.co`) for both build and LHCI steps.
4. **Strict Token Verification**: REST and Auth endpoints strictly validate the synthetic bearer token (`Bearer lhci-stub-access-token`) and reject unauthorized or malformed headers.
5. **No PII or Real Secrets**: Synthetic test identities use `@neofuel.local` domains and stub UUIDs (`00000000-0000-0000-0000-000000000001`).

---

## Running Verification Tests Locally

To test the Lighthouse configuration, allowlist completeness, network request classification, and fail-closed safety guards locally:

```bash
# Run unit tests (includes #342 suite)
npm test

# Run TypeScript type check
npm run type-check
```

---

## CI Artifacts & Inspection

In GitHub Actions PR workflows, the `treosh/lighthouse-ci-action` job executes the actual end-to-end browser Lighthouse audit and produces downloadable HTML/JSON Lighthouse audit reports stored as workflow artifacts. Reports contain no sensitive tokens or PII.
