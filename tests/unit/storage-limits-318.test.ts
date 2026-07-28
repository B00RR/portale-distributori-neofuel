import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('Issue #318 — Storage Limits & Obsolete Policies Migration Structural Test', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'sql/migrations/20260728_storage_limits_obsolete_policies_318.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('file exists and contains required metadata header and transaction blocks', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(sql).toContain('Issue #318');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  it('contains pre-check guard validating that all 3 target buckets exist before applying changes', () => {
    expect(sql).toContain("ARRAY['system', 'voucher-photo', 'fattura-uploads']");
    expect(sql).toContain('FROM storage.buckets');
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('missing target bucket(s)');
  });

  it('enforces exact byte file size limits for each target bucket', () => {
    // system: 1 MB = 1048576 bytes
    expect(sql).toContain("WHERE id = 'system'");
    expect(sql).toContain('file_size_limit = 1048576');

    // voucher-photo: 5 MB = 5242880 bytes
    expect(sql).toContain("WHERE id = 'voucher-photo'");
    expect(sql).toContain('file_size_limit = 5242880');

    // fattura-uploads: 10 MB = 10485760 bytes
    expect(sql).toContain("WHERE id = 'fattura-uploads'");
    expect(sql).toContain('file_size_limit = 10485760');
  });

  it('enforces explicit allowed MIME types for each target bucket', () => {
    // system
    expect(sql).toContain("ARRAY['application/json']::text[]");

    // voucher-photo
    expect(sql).toContain(
      "ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]"
    );

    // fattura-uploads
    expect(sql).toContain(
      "ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]"
    );
  });

  it('disallows wildcard mime types and application/octet-stream in target allowlists', () => {
    expect(sql).not.toContain('image/*');
    expect(sql).not.toContain('*/*');
    expect(sql).not.toContain('application/octet-stream');
  });

  it('drops exclusively the 4 obsolete policies targeting legacy voucher-uploads bucket', () => {
    const dropMatches = Array.from(
      sql.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([^"\s]+)"?\s+ON\s+storage\.objects;/gi)
    );
    const droppedPolicyNames = dropMatches.map(m => m[1]);

    expect(droppedPolicyNames).toHaveLength(4);
    expect([...droppedPolicyNames].sort()).toEqual(
      [
        'voucher_insert_auth_owner',
        'voucher_read_auth_owner_or_admin',
        'voucher_update_auth_owner_or_admin',
        'voucher_delete_auth_owner_or_admin'
      ].sort()
    );
  });

  it('preserves valid live policies without modifying, altering or dropping them', () => {
    const validPolicies = [
      'Solo Admin possono gestire le regole',
      'Tutti i loggati leggono le regole',
      'fattura_insert_auth_owner',
      'fattura_read_auth_owner_or_admin',
      'fattura_update_auth_owner_or_admin',
      'fattura_delete_auth_owner_or_admin',
      'voucher_photo_insert_operator',
      'voucher_photo_select_admin',
      'voucher_photo_delete_auth_owner_or_admin'
    ];

    for (const policy of validPolicies) {
      expect(sql).not.toContain(`DROP POLICY IF EXISTS "${policy}"`);
      expect(sql).not.toContain(`CREATE POLICY "${policy}"`);
      expect(sql).not.toContain(`ALTER POLICY "${policy}"`);
    }
  });

  it('does not touch public.delete_voucher_photo() or mutate storage.objects records', () => {
    expect(sql).not.toContain('delete_voucher_photo');
    expect(sql).not.toContain('DELETE FROM storage.objects');
    expect(sql).not.toContain('UPDATE storage.objects');
  });

  it('does not contain schema_migrations auto-registration, file_hash or pending placeholders', () => {
    expect(sql).not.toContain('schema_migrations');
    expect(sql).not.toContain('file_hash');
    expect(sql).not.toContain('pending');
  });

  it('does not contain NOTIFY pgrst reload schema side effects', () => {
    expect(sql).not.toContain('NOTIFY pgrst');
    expect(sql).not.toContain('reload schema');
  });

  describe('Runbook Structural Verification', () => {
    const runbookPath = path.resolve(
      process.cwd(),
      'docs/runbooks/318-storage-limits-migration.md'
    );
    const runbookContent = fs.readFileSync(runbookPath, 'utf8');

    it('runbook file exists', () => {
      expect(fs.existsSync(runbookPath)).toBe(true);
    });

    it('does not contain direct SQL DELETE FROM storage.objects in runbook or SQL migration', () => {
      expect(sql).not.toContain('DELETE FROM storage.objects');
      expect(runbookContent).not.toContain('DELETE FROM storage.objects');
    });

    it('uses fail-closed linked project ref verification command instead of npx supabase status', () => {
      expect(runbookContent).not.toContain('npx supabase status');
      expect(runbookContent).toContain(
        `supabase projects list --output json | jq -e '[.[] | select(.linked == true) | .ref] == ["ahlmgafaurossyghimxc"]'`
      );
    });

    it('documents cleanup via Storage API / SDK and checks for remaining_test_objects = 0', () => {
      expect(runbookContent).toContain('Storage API / SDK');
      expect(runbookContent).toContain('remaining_test_objects = 0');
    });

    it('notes that CI exercises local ephemeral Storage with service-role', () => {
      expect(runbookContent).toContain('service_role');
      expect(runbookContent).toContain('CI');
    });
  });

  describe('Ephemeral Baseline Fixture Structural Verification', () => {
    const baseSchemaPath = path.resolve(
      process.cwd(),
      'tests/integration/fixtures/00_base_schema.sql'
    );
    const baseSchemaSql = fs.readFileSync(baseSchemaPath, 'utf8');

    it('base schema fixture contains idempotent insertion of the 3 target private buckets', () => {
      expect(baseSchemaSql).toContain('INSERT INTO storage.buckets');
      expect(baseSchemaSql).toContain("'system'");
      expect(baseSchemaSql).toContain("'voucher-photo'");
      expect(baseSchemaSql).toContain("'fattura-uploads'");
      expect(baseSchemaSql).toContain('ON CONFLICT (id) DO NOTHING');
    });
  });

  describe('Ephemeral Storage Integration Test Structural Verification', () => {
    const integrationTestPath = path.resolve(
      process.cwd(),
      'tests/integration/storage-limits-318.test.ts'
    );
    const integrationTestContent = fs.readFileSync(integrationTestPath, 'utf8');

    it('integration test file exists', () => {
      expect(fs.existsSync(integrationTestPath)).toBe(true);
    });

    it('uses getServiceRoleClient and tests allowed mime, disallowed mime, and size limits', () => {
      expect(integrationTestContent).toContain('getServiceRoleClient');
      expect(integrationTestContent).toContain('image/jpeg');
      expect(integrationTestContent).toContain('text/plain');
      expect(integrationTestContent).toContain('5 * 1024 * 1024 + 1');
    });

    it('cleans up test objects via Storage API remove and never uses direct SQL DELETE FROM storage.objects', () => {
      expect(integrationTestContent).toContain('.remove(');
      expect(integrationTestContent).not.toContain('DELETE FROM storage.objects');
    });

    it('enforces fail-closed behavior when Storage API is unreachable under CI environment', () => {
      expect(integrationTestContent).toContain('process.env.CI');
      expect(integrationTestContent).toContain('!isStorageApiReachable');
      expect(integrationTestContent).toMatch(
        /if\s*\(\s*!isStorageApiReachable\s*\)\s*\{\s*if\s*\(\s*process\.env\.CI\s*\)/
      );
    });

    it('uses real Storage API upload (.upload) and never uses DB queries to simulate uploads', () => {
      expect(integrationTestContent).toContain('.upload(');
      expect(integrationTestContent).not.toContain('INSERT INTO storage.objects');
      expect(integrationTestContent).not.toContain('UPDATE storage.objects');
    });
  });

  describe('Workflow and Integration Setup Structural Verification', () => {
    const workflowPath = path.resolve(
      process.cwd(),
      '.github/workflows/supabase-ephemeral-tests.yml'
    );
    const setupPath = path.resolve(process.cwd(), 'tests/integration/setup.ts');

    it('workflow reads storage credentials dynamically via supabase status -o env into $GITHUB_ENV', () => {
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      expect(workflowContent).toContain('supabase status -o env');
      expect(workflowContent).toContain('API_URL');
      expect(workflowContent).toContain('ANON_KEY');
      expect(workflowContent).toContain('SERVICE_ROLE_KEY');
      expect(workflowContent).toContain('$GITHUB_ENV');
      expect(workflowContent).not.toContain('DATABASE_URL=$DB_URL');
      expect(workflowContent).not.toContain('DB_URL missing from supabase status');
    });

    it('workflow uses explicit privileged DB DSN postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres in test step', () => {
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      expect(workflowContent).toContain(
        "DATABASE_URL: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'"
      );
    });

    it('workflow does not contain hardcoded SUPABASE_SERVICE_ROLE_KEY static token', () => {
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      expect(workflowContent).not.toContain(
        "SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
      );
    });

    it('helper service-role is fail-closed when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      const setupContent = fs.readFileSync(setupPath, 'utf8');
      expect(setupContent).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY || ''");
      expect(setupContent).toContain('!SUPABASE_SERVICE_ROLE_KEY');
      expect(setupContent).toContain('throw new Error(');
      expect(setupContent).not.toContain(
        "process.env.SUPABASE_SERVICE_ROLE_KEY ||\n  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
      );
    });
  });
});
