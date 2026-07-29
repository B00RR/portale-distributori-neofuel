import fs from 'fs';
import path from 'path';

describe('Issue #315 - RLS isolation migration', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'sql/migrations/20260729_isolate_infrastructure_315.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('contains no fail-open COALESCE pattern', () => {
    expect(sql).not.toContain(
      'COALESCE(NULLIF(current_user_station_ids(), ARRAY[]::integer[]), ARRAY[station_id])'
    );
  });

  it('uses station-scoped ANY pattern for SELECT policies', () => {
    const pattern = /station_id\s*=\s*ANY\s*\(public\.current_user_station_ids\(\)\)/;
    expect(pattern.test(sql)).toBe(true);
  });

  it('has admin fallback in policies where appropriate', () => {
    expect(sql).toContain('public.is_admin()');
  });

  it('drops all vulnerable policy names listed in REVIEW_FIX_2', () => {
    const vulnerableNames = [
      'consolidated_fuel_stations_select',
      'consolidated_fuel_stations_insert',
      'consolidated_fuel_stations_update',
      'consolidated_fuel_stations_delete',
      'fuel_stations_operators_select',
      'fuel_stations_admin_insert',
      'fuel_stations_operators_update',
      'fuel_stations_operators_delete',
      'islands_select_admin_or_operator',
      'islands_insert_admin_only',
      'islands_update_admin_only',
      'islands_delete_admin_only',
      'consolidated_islands_select',
      'islands_operators_select',
      'consolidated_pistole_select',
      'consolidated_pistole_insert',
      'consolidated_pistole_update',
      'consolidated_pistole_delete',
      'pistole_operators_select',
      'Admins can manage tanks',
      'Operators can read tanks',
      'tanks_admins_manage',
      'tanks_operators_select',
      'tanks_operators_insert',
      'tanks_operators_update',
      'tanks_operators_delete',
      'Admins can manage tank_pump_links',
      'Operators can read tank_pump_links',
      'tank_pump_links_operators_select',
      'Admins can manage tank_usages',
      'Operators can read tank_usages',
      'tank_pump_usages_operators_insert',
      'tank_readings_admins_manage',
      'tank_readings_operators_select'
    ];
    vulnerableNames.forEach(name => {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${name}"`);
    });
  });

  it('has a single admin management policy per scoped table', () => {
    const adminPolicies = [
      'fuel_stations_admin_manage',
      'islands_admin_manage',
      'pistole_admin_manage',
      'tanks_admin_manage',
      'tank_pump_links_admin_manage',
      'tank_pump_usages_admin_manage',
      'tank_readings_admin_manage'
    ];
    adminPolicies.forEach(name => expect(sql).toContain(`"${name}"`));
  });

  it('does not create FOR INSERT policies with USING', () => {
    const insertMatches = sql.match(/CREATE POLICY[^;]*FOR INSERT[^;]*;/g) || [];
    insertMatches.forEach(statement => {
      expect(statement).not.toContain('USING');
    });
  });

  it('hardens security definer helpers used by final policies', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.is_admin()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.is_operator()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.current_user_station_ids()');
    expect(sql).toContain("SET search_path = ''");
  });

  it('has fail-closed pre-checks before policy changes', () => {
    expect(sql).toContain('Cannot harden pistole RLS');
    expect(sql).toContain('Cannot harden tank_pump_links RLS');
    expect(sql).toContain('Cannot harden tank_pump_usages RLS');
    expect(sql).toContain('Cannot harden tank_readings RLS');
  });

  it('does not restore DELETE on tables revoked by migration #316', () => {
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.islands');
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.pistole');
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.tanks');
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.tank_pump_usages');
  });

  it('ends with NOTIFY pgrst reload schema', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
