import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Issue #307 - SQL Migration Structural Test', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'sql/migrations/20260724_is_active_authoritative_307.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('exists and is properly formatted', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(sql.startsWith('-- Migration: 20260724_is_active_authoritative_307.sql')).toBe(true);
    expect(sql).toContain('Resolves Issue #307');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  it('defines helper SQL function public.current_user_is_active with SECURITY DEFINER and SET search_path = ""', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.current_user_is_active()');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('STABLE');
    expect(sql).toContain('is_active IS DISTINCT FROM false');
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.current_user_is_active() FROM PUBLIC, anon;'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated, service_role;'
    );
  });

  it('defines PostgREST pre-request hook public.pgrst_pre_request_check with SECURITY DEFINER and SET search_path = ""', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pgrst_pre_request_check()');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("auth.role() = 'authenticated'");
    expect(sql).toContain("RAISE EXCEPTION 'profile_missing'");
    expect(sql).toContain('ELSIF v_count <> 1 THEN');
    expect(sql).toContain("RAISE EXCEPTION 'profile_ambiguous'");
    expect(sql).toContain("RAISE EXCEPTION 'account_inactive'");
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.pgrst_pre_request_check() FROM PUBLIC;'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.pgrst_pre_request_check() TO anon, authenticated, service_role;'
    );
  });

  it('registers PostgREST pre-request hook and notifies PostgREST for config and schema reload', () => {
    expect(sql).toContain(
      "ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.pgrst_pre_request_check';"
    );
    expect(sql).toContain("NOTIFY pgrst, 'reload config';");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it('creates restrictive policy enforce_active_user on public business tables and excludes public.users', () => {
    expect(sql).toContain('CREATE POLICY enforce_active_user ON public.');
    expect(sql).toContain('AS RESTRICTIVE FOR ALL TO authenticated');
    expect(sql).toContain('USING (public.current_user_is_active())');
    expect(sql).toContain('WITH CHECK (public.current_user_is_active())');

    // Verify all 36 live non-users public business tables with RLS
    const expectedTables = [
      'apertura_turno_pistole_deprecated',
      'calculation_logs',
      'calculation_modules',
      'calculation_tests',
      'calculation_versions',
      'chiusura_turno_pistole_deprecated',
      'clienti_fatturazione',
      'closing_shift_deprecated',
      'crediti_clienti',
      'crediti_movimenti',
      'customer_refunds',
      'fuel_stations',
      'invoice_requests',
      'invoices',
      'islands',
      'movimenti_cassa',
      'notifiche',
      'opening_shift_deprecated',
      'operator_menu_options',
      'pistole',
      'prezzi_distributore',
      'processed_requests',
      'punti_riscatti',
      'rate_limit_attempts',
      'shift_pistols',
      'shifts',
      'tank_pump_links',
      'tank_pump_usages',
      'tank_readings',
      'tanks',
      'targhe_cliente',
      'ui_settings',
      'user_dashboard_config',
      'user_stations',
      'voucher_batches',
      'vouchers'
    ];
    for (const table of expectedTables) {
      expect(sql).toContain(`'${table}'`);
    }

    // Must NOT contain policy guard created on public.users, and 'users' must not be in RLS tables array
    expect(sql).not.toContain('CREATE POLICY enforce_active_user ON public.users ');
    expect(sql).not.toMatch(/'users'\s*[,\]]/);
  });

  it('ensures public.users is idempotently added to supabase_realtime publication', () => {
    expect(sql).toContain("pubname = 'supabase_realtime'");
    expect(sql).toContain("tablename = 'users'");
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.users;');
  });
});
