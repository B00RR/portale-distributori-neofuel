# AGENTS.md — Neofuel Rules for Coding Agents (Jules, Antigravity, Claude Code, etc.)

> **Read this BEFORE doing any work.** These rules are non-negotiable.
> Violating them produces broken migrations, security regressions, and wasted review time.

## 1. Branch and PR grouping rules

- **One issue per branch is the default**: each issue gets its own branch (`fix/<scope>-<issue-number>`) and its own PR when it is the only thing being fixed.
- **When closing multiple related issues in the same session, group them under a single branch/PR** with a descriptive branch name (e.g. `fix/124-125-a11y-logging`). The PR description must list every issue being closed.
- **NEVER** mix unrelated issues or migrations in one PR.
- If an issue is too large for one PR, split it into sub-tasks and say so in the PR description.

## 2. SQL Migration Rules

### 2.1 Idempotency and Safety

- Every `ALTER TABLE` migration must be **idempotent**:
  - Use `DROP COLUMN IF EXISTS`, `ADD CONSTRAINT IF NOT EXISTS`, etc.
  - If PostgreSQL doesn't support `IF NOT EXISTS` for a construct (e.g. `ALTER COLUMN ... SET NOT NULL`), wrap it in a `DO $$ ... EXCEPTION WHEN ... $$` block or a `IF EXISTS (...) THEN` guard.
- **NEVER** run `ALTER COLUMN ... SET NOT NULL` without first checking for NULL rows in a pre-check query. If rows with NULL exist, the migration will fail at runtime and block everything. Add a pre-check section:
  ```sql
  -- Pre-check: verify no NULL rows
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM public.movimenti_cassa WHERE station_id IS NULL) THEN
      RAISE EXCEPTION 'Cannot set NOT NULL: NULL values found in movimenti_cassa.station_id';
    END IF;
  END $$;
  ```
- **NEVER** run `ALTER COLUMN ... TYPE` without documenting what the current type is and why the cast is safe.
- **NEVER** run `ADD CONSTRAINT ... FOREIGN KEY` without `IF NOT EXISTS` or a guard block.
- **NEVER** run `ADD CONSTRAINT ... CHECK` without first verifying that all existing rows satisfy the condition.

### 2.2 Naming

- Migration files: `sql/YYYYMMDD_<short_description>_<issue_number>.sql`
- Use the **actual current date**, not a future date.
- Example: `sql/20260626_drop_password_hash_51.sql`

### 2.3 Formatting

- **No trailing whitespace** in SQL files. Run `git diff --check` before committing.
- Every migration file must start with a comment block explaining:
  - Which issue it resolves
  - What it does
  - Whether it requires downtime or a data backfill

### 2.4 RLS Policy Rules

- When dropping and recreating RLS policies, **always**:
  - Document the existing policy names being dropped
  - Provide both `USING` and `WITH CHECK` for `FOR ALL` and `FOR UPDATE` policies
  - Test that the new policies don't break existing access patterns
- **NEVER** create `FOR ALL` policies without `WITH CHECK` — users could reassign rows.
- **NEVER** use `SECURITY DEFINER` functions without `SET search_path = public, pg_temp` to prevent search path hijacking.
- When consolidating policies, preserve the existing authorization model. Do not accidentally widen access (e.g. `TO authenticated USING (true)` is rarely correct).
- If the issue mentions `auth_rls_initplan`, ensure the fix actually resolves the initplan — wrapping `auth.uid()` in a subquery does NOT fix initplan; use `SECURITY DEFINER` helper functions or materialized joins instead.

### 2.5 Function Rules

- When creating or replacing functions like `is_admin()`, `current_user_id()`, `is_station_operator()`:
  - **ALWAYS** check the existing implementation first (read the current `sql/*.sql` files and the live DB if possible)
  - **NEVER** remove roles from authorization checks. If the existing `is_admin()` checks for `role IN ('admin', 'super_admin')`, the replacement must also check for both
  - **ALWAYS** add `SET search_path = public, pg_temp` to `SECURITY DEFINER` functions
  - **NEVER** drop a function without checking for dependent policies, views, or other functions

## 3. Code Changes

- **NEVER** change source code in `js/` unless the issue explicitly requires it.
- When changing code, preserve existing logic and coverage. Do not silently remove fallback paths without documenting why.
- Run `npm run type-check` and `npm test` before committing. All existing tests must pass.
- **NEVER** leave `console.log`, `console.error`, or debug code in committed changes.
- Follow conventional commits: `type(scope): message (#issue)`.

## 4. Verification Checklist (run before finishing)

- [ ] `git diff --check` passes (no trailing whitespace)
- [ ] `npm run type-check` passes
- [ ] `npm test` passes (all existing tests green)
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] No `SECURITY DEFINER` without `SET search_path`
- [ ] No `ALTER ... SET NOT NULL` without NULL pre-check
- [ ] No `ADD CONSTRAINT` without `IF NOT EXISTS` or guard
- [ ] No `FOR ALL` / `FOR UPDATE` RLS policy without `WITH CHECK`
- [ ] Migration files use real dates, not future dates
- [ ] Only files relevant to the specific issue are changed
- [ ] Commit message follows conventional format with issue number

## 5. Don't Do This

- ❌ Batch multiple issues in one session/PR
- ❌ Drop and recreate all RLS policies in one migration without a rollback plan
- ❌ Assume unit tests validate SQL migrations (they use stubbed Supabase mocks)
- ❌ Create migration filenames with future dates
- ❌ Remove authorization roles from security functions
- ❌ Leave trailing whitespace in SQL files
- ❌ Push directly to `main` — always use a branch and PR

## 6. Context Files

- `CLAUDE.md` — project overview, commands, architecture notes, known traps
- `AGENTS.md` — this file, rules for coding agents
- `sql/` — existing migrations and RLS policies (may differ from live DB!)
- `supabase/database.types.ts` — generated types from live DB schema
- `js/types.ts` — hand-written TypeScript interfaces

**Note:** The live Supabase database may differ from `sql/*.sql` files. Always verify the live state before schema changes.
