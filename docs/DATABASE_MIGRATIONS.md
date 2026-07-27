# Database Migrations Guide

## Overview

This repository uses a canonical SQL migration chain tracked in `sql/migrations/`.
All schema changes, RLS policy updates, and RPC function modifications must be created as individual SQL migration files and verified against live environments.

## Migration File Conventions

- **Directory:** `sql/migrations/`
- **Naming Pattern:** `YYYYMMDD_<short_description>_<issue_number>.sql`
- **Date Requirement:** Always use the actual current date (UTC/local date when created).
- **Example:** `20260727_schema_migrations_tracking_331.sql`

### Migration Header Format

Every migration file must start with an explanatory comment block:

```sql
-- Issue: #<issue_number>
-- Description: <Clear summary of what this migration does>
-- Downtime required: Yes / No
-- Backfill required: Yes / No
```

### Safety & Idempotency Rules

1. **Idempotent DDL:** Use `IF NOT EXISTS` / `IF EXISTS` guards for table/column/constraint creation and deletion.
2. **NULL Pre-checks:** Never execute `ALTER COLUMN ... SET NOT NULL` without a pre-check verification:
   ```sql
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM public.my_table WHERE my_column IS NULL) THEN
       RAISE EXCEPTION 'Cannot set NOT NULL: NULL values found in my_table.my_column';
     END IF;
   END $$;
   ```
3. **RLS Policies:** When defining RLS policies for `FOR ALL` or `FOR UPDATE`, always include both `USING` and `WITH CHECK` clauses.
4. **Security Functions:** Functions created with `SECURITY DEFINER` must specify `SET search_path = ''`.
5. **PostgREST Schema Reload:** Include `NOTIFY pgrst, 'reload schema';` at the bottom of schema migrations.

## Applying Migrations

### Local & Linked Supabase Database

To apply a migration manually to a linked Supabase project:

```bash
supabase db query --linked --file sql/migrations/<migration_file>.sql
```

After applying a migration, record its application in `public.schema_migrations`.

## Tracking & Verification

Migration state and drift detection are managed via the script `scripts/verify-migrations.ts`.

### Verification Command

Run the migration verification check:

```bash
npm run db:migrations:verify
```

### How Verification Works

1. Reads all migration files in `sql/migrations/*.sql` in alphabetical order.
2. Computes the SHA-256 hash of each local migration file.
3. Queries `public.schema_migrations` from the live database.
4. Reports:
   - **Unapplied migrations:** Files present locally but not recorded in the DB.
   - **Drift / Mismatched hashes:** Files whose current content hash differs from the recorded DB hash.
   - **Inverse drift:** Live database functions or policies not accounted for in migration files.

### Resolving Drift Conflicts

- **Unapplied File:** If a migration file is listed as unapplied, apply it via your deployment pipeline or `supabase db query` and register the filename in `public.schema_migrations`.
- **Hash Mismatch:** If a migration file hash differs, verify if the file was edited post-deployment. Migrations should be immutable once applied. If changes are needed, issue a new forward-fix migration file rather than altering historical files.
