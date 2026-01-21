# 🛡️ Compliance Report: GEMINI.md Rules Analysis

## Overview
This report analyzes the current codebase against the security rules defined in `.gemini/GEMINI.md`.

**Audit Date**: 2026-01-21
**Overall Status**: ⚠️ **Significant Violations Found**

---

## 🔴 Critical Violations

### 1. Database & Backend Security (Rule 1, 4)
> **Rule**: "Never connect frontend directly to database... Always use middleware... for sensitive operations"

**Violation**: Direct Database Mutations found across multiple Admin modules.
-   **`js/admin/shifts.ts`**: `delete()` on `shifts` table.
-   **`js/admin/operators.ts`**:
    -   `insert()` on `user_stations` (Assignment logic).
    -   `delete()` on `users` and `user_stations`.
    -   `update()` on `users` (Role/Name updates).
-   **`js/admin/prices.ts`**: `insert()` on `prezzi_distributore` (Price updates).
-   **`js/admin/stations.ts`, `tanks.ts`**: (inferred from identical patterns) Direct CRUD operations.

**Risk**: Malicious users could potentially alter data they shouldn't (e.g., assigning themselves to a station, changing prices) if RLS policies are not perfectly sealed. Business logic (like "can only change price if...") is completely client-side and bypassable.

### 2. Secrets Management (Rule 3)
> **Rule**: "Avoid hardcoding any credential in source code... Use environment variables"

**Violation**: Hardcoded Credentials.
-   **`js/core/config.ts`**:
    ```typescript
    export const SUPABASE_URL: string = 'https://...';
    export const SUPABASE_KEY: string = 'eyJhbG...'; // Hardcoded ANON KEY
    ```
-   **Remediation**: Must use `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### 3. Input Validation (Rule 5, 9)
> **Rule**: "Use schema validation (Zod, Yup, Valibot…) on EVERY incoming payload"

**Violation**: Missing Schema Validation Library.
-   No `zod`, `yup`, or `valibot` in `package.json`.
-   **`js/admin/operators.ts`**: Uses weak custom `validateForm` helper.
-   **`js/admin/prices.ts`**: Uses `parseFloat(...) || 0`. Invalid types might result in `0` silently.
-   **`js/core/auth.ts`**: Manual null/empty checks instead of schema validation.

### 4. Client-Side Business Logic (Rule 4)
> **Rule**: "Execute ALL critical business logic server-side"

**Violation**: Critical logic exposed in Client.
-   **Price Updates**: `js/admin/prices.ts` calculates valid_from dates and inserts directly.
-   **Shift Management**: `js/admin/shifts.ts` computes aggregations on the client (fetching all shifts).
-   **User Management**: `js/admin/operators.ts` handles role assignment logic client-side.

### 5. Logging & Error Handling (Rule 7, 8)
> **Rule**: "Never expose: stack traces... Log full error details privately server-side only"

**Violation**: Unsafe Logging / Error Exposure.
-   **`js/core/auth.ts`**: `console.error('Auth error:', authError);` (dumps full object).
-   **`js/admin/shifts.ts`**: `(Toast as any).show('Errore export: ' + (err?.message || err))` (shows raw error message to user).

---

## 🟡 Code Quality Warnings

### Type Safety
-   Rampant usage of `as any` to bypass TS checks (e.g., `(Toast as any)`, `(supabase as any)`).
-   **`js/admin/shifts.ts`**: `const filteredClosures: Shift[] = (closures as any[]) || [];`

### Project Structure
-   API calls are scattered inside UI components (`operators.ts`, `prices.ts`) rather than centralized in a Service Layer.

---

## �️ Remediation Plan (Fase 10)

### Step 1: Secure Configuration
- [ ] Create `.env` file.
- [ ] Refactor `js/core/config.ts` to use `import.meta.env`.

### Step 2: Validation Layer
- [ ] Install `zod`.
- [ ] Create `js/core/schemas.ts` for User, Price, Shift entities.
- [ ] Apply Zod parsing to all API inputs/outputs.

### Step 3: Backend Migration (Edge Functions)
- [ ] Create Supabase Edge Function `admin-actions`:
    -   Action: `delete_shift`
    -   Action: `update_price`
    -   Action: `manage_operator` (create/delete/assign)
- [ ] Refactor frontend to call `supabase.functions.invoke('admin-actions')` instead of direct DB calls.

### Step 4: Secure Logging
- [ ] Create `js/core/logger.ts` (wrapper around console).
- [ ] Implement production mode check (strip logs in prod).
- [ ] Sanitize errors before logging.

### Step 5: Type Safety
- [ ] Remove `ts-ignore` and `as any`.
- [ ] Define proper interfaces for all Supabase responses.
