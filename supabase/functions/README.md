# Supabase Edge Functions

Source of truth for the Edge Functions invoked by the client. Server-side
business logic normally lives in Postgres RPC + RLS (see `sql/`); these two
functions exist because they need privileges or side effects that a plain RPC
cannot provide.

> **Deployed vs repo state** — the first commit under this folder captured the
> functions exactly as they were running in production. The current files are
> the **hardened** versions and must be redeployed for the fixes to take effect
> (see _Deployment_). Until then, production still runs the old behaviour.

## Functions

### `admin_create_user_v2`
Creates an auth user (email pre-confirmed) using the service-role key, so the
admin's own session is preserved. The DB trigger `handle_new_user` then
populates `public.users`.

- **`verify_jwt: true`** — a valid JWT is required to reach the function.
- **Authorization:** the caller must be an admin. The function calls the
  `is_admin()` RPC through a client scoped to the caller's JWT *before* doing any
  privileged work. This closes a privilege-escalation hole: previously any
  authenticated user could call the function with `role: "admin"` and the
  service-role key would create the account.
- **Validation:** email format, password length (min 6), and `role` against the
  `ALLOWED_ROLES` whitelist — kept in sync with `CreateUserSchema` in
  `js/core/schemas.ts`.
- **Caller:** `js/admin/operators.ts`.

### `update-prices`
Inserts a new row in `prezzi_distributore`. The client is initialised with the
caller's `Authorization` header, so it acts as the user and **RLS governs the
write**.

- **`verify_jwt: true`**.
- **Validation:** `station_id` must be a positive integer; prices must be finite
  numbers in `[0, 100]`. (The old `benzina < 0` guard let non-numeric values
  through.)
- **Effective date:** `next_day`/`prossima` → next local midnight, otherwise now.
- **Caller:** `js/operator/prices.ts`.

## Environment variables (set in the Supabase dashboard, never committed)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (only `admin_create_user_v2`)

## Deployment
```bash
supabase functions deploy admin_create_user_v2
supabase functions deploy update-prices
```
`verify_jwt` stays enabled (the default) for both.

## Testing
No emulator is wired into CI yet. Manual smoke tests with the Supabase CLI:
```bash
supabase functions serve update-prices
# then POST with a valid operator JWT and assert 200 + inserted row,
# and with malformed prices to assert 400.
```
For `admin_create_user_v2`, verify a non-admin JWT gets **403** and an admin JWT
creates the user (200). Adding automated tests against `supabase start` is
tracked as follow-up work.
