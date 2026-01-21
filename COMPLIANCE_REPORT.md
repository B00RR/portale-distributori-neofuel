# 🛡️ Compliance Report: GEMINI.md Rules Analysis

## Overview
This report analyzes the current codebase against the security rules defined in `.gemini/GEMINI.md`.

**Overall Status**: ⚠️ **Significant Violations Found**

---

## 🔴 Critical Violations

### 1. Database & Backend Security (Rule 1, 4)
> **Rule**: "never connect frontend directly to database... Always use middleware... for sensitive operations"
- **Violation**: `js/admin/shifts.ts` performs direct database deletion:
  ```typescript
  // shifts.ts line 569
  await supabase.from('shifts').delete().eq('id', closureId);
  ```
- **Violation**: `js/admin/shifts.ts` performs direct fetching of all shifts logic on client-side without an intermediate API layer for aggregation/business logic checks.

### 2. Secrets Management (Rule 3)
> **Rule**: "Avoid hardcoding any credential in source code... Use environment variables"
- **Violation**: `js/core/config.ts` contains hardcoded Supabase credentials:
  ```typescript
  export const SUPABASE_URL: string = 'https://...';
  export const SUPABASE_KEY: string = 'eyJhbG...'; // Hardcoded ANON KEY
  ```
  *Recommendation*: Use `import.meta.env.VITE_SUPABASE_KEY` (Vite) or similar.

### 3. Input Validation (Rule 5, 9)
> **Rule**: "Use schema validation (Zod, Yup, Valibot…) on EVERY incoming payload"
- **Violation**: No schema validation library (`zod`, `yup`) is present in `package.json`.
- **Violation**: Data casting without validation in `js/admin/shifts.ts`:
  ```typescript
  const filteredClosures: Shift[] = (closures as any[]) || [];
  ```
- **Violation**: `js/core/auth.ts` processes email/password with only basic null checks, missing robust schema validation.

### 4. Logging & Privacy (Rule 7, 8)
> **Rule**: "Never expose: stack traces... Log full error details privately server-side only"
- **Violation**: Multiple files use `console.error(err)` which exposes full error objects (potentially including stack traces or metadata) to the browser console.
  - `js/admin/shifts.ts`: `(Toast as any).show('Errore export: ' + (err?.message || err), 'error');`
  - `js/core/auth.ts`: `console.error('Auth error:', authError);`

### 5. Client-Side Business Logic (Rule 4)
> **Rule**: "Execute ALL critical business logic server-side... Prevent client-side tampering"
- **Violation**: Shift deletion logic resides entirely in the client (`deleteClosure` in `shifts.ts`). A malicious user with a valid token (if RLS allows) could call this endpoint directly even if the UI shouldn't allow it (e.g. bypassing "isFinal" checks if they exist only in UI).

---

## 🟡 Warnings

### Dependencies (Rule 9)
- **Warning**: Missing explicit `zod` or `valibot` dependency confirms strict validation is absent.

### Rate Limiting (Rule 6)
- **Partial Compliance**: `js/core/auth.ts` implements client-side rate limiting (`isRateLimited`), but Rule 6 explicitly mandates "both client-side throttling (UX) and strict server-side enforcement". (Supabase handles Auth rate limits, but custom business logic needs its own).

---

## Implementation Plan for Compliance

1.  **Secrets**: Move keys to `.env` files and access via `import.meta.env`.
2.  **Validation**: Install `zod`. Refactor API calls to parse data with Zod schemas.
3.  **Backend Logic**: Move `deleteClosure` and sensitive updates to Supabase Edge Functions.
4.  **Logging**: Replace `console.error` with a safe logger that sends data to Sentry/monitoring and shows generic messages to users.
5.  **Refactoring**: Replace usage of `as any` with proper typed and validated interfaces.
