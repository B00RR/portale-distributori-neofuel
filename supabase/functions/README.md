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

Creates an email-confirmed Auth identity and its `public.users` profile using
the service-role key, so the admin's own session is preserved. This function is
the only supported provisioning writer; issue #304 removes the legacy
`handle_new_user` trigger.

- **`verify_jwt: true`** — a valid JWT is required to reach the function.
- **Authorization:** the JWT is verified with `auth.getUser()`, then the
  corresponding `public.users.created_by_auth` profile must have
  `is_active IS TRUE` and an admin role. Auth metadata is never authoritative.
- **Username-only login:** the request accepts username, password, full name and
  role — never an email address. The server validates and normalizes the
  username, then derives the invisible Auth alias
  `username@neofuel.local`.
- **Validation:** username syntax, password length (min 6), and `role` against
  the server-side whitelist kept in sync with `CreateUserSchema` in
  `js/core/schemas.ts`.
- **Compensation:** profile failure retries deletion of the exact new Auth ID,
  then disables that identity if deletion still fails. No pre-existing identity
  is ever deleted during duplicate handling.
- **Database invariants:** the issue #304 migration enforces one profile per
  non-null Auth ID and case-insensitive username uniqueness.
- **Maintenance mode:** `ADMIN_CREATE_USER_MAINTENANCE=true` returns `503`
  before JWT, database, or service-role work.
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
- `ADMIN_CREATE_USER_MAINTENANCE` (optional; set to `true` to suspend provisioning)

## Deployment

```bash
supabase functions deploy admin_create_user_v2
supabase functions deploy update-prices
```

`verify_jwt` stays enabled (the default) for both.

### Issue #304 change window and rollback

1. Freeze administrative user creation and snapshot Auth configuration, the
   exact three pre-existing orphan IDs, function version, trigger and function.
2. Set `disable_signup=true` through the Supabase Management API and verify an
   anonymous signup is rejected without creating an identity.
3. Set `ADMIN_CREATE_USER_MAINTENANCE=true`, deploy
   `admin_create_user_v2`, and verify the new version returns `503` before any
   privileged work.
4. Apply `sql/20260717_remove_broken_auth_trigger_304.sql` explicitly.
5. Verify function version, catalog objects, unique indexes and the exact
   orphan-ID set.
6. Set `ADMIN_CREATE_USER_MAINTENANCE=false`, run the authorized/unauthorized
   smoke tests, and only then lift the administrative freeze.

If any post-deploy check fails, keep public signup disabled and suspend the
endpoint with:

```bash
supabase secrets set ADMIN_CREATE_USER_MAINTENANCE=true \
  --project-ref ahlmgafaurossyghimxc
```

Do **not** redeploy the previous v7 function, restore the broken trigger, or
re-enable signup. Recovery requires a new forward-only migration and a verified
function deploy. Set the maintenance secret back to `false` only after those
checks pass.

## Testing

No emulator is wired into CI yet. Manual smoke tests with the Supabase CLI:

```bash
supabase functions serve update-prices
# then POST with a valid operator JWT and assert 200 + inserted row,
# and with malformed prices to assert 400.
```

For `admin_create_user_v2`, unit tests cover JWT/profile authorization,
server-authoritative roles, duplicate requests and compensation. CI also runs
`deno check` on the repository entrypoint that is deployed. Live smoke tests must verify a
non-admin JWT gets **403**, an active admin creates exactly one Auth identity and
one profile, and the pre-existing orphan-ID set remains unchanged.
