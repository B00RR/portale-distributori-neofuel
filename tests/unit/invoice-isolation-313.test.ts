import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

function extractFunction(sql: string, functionName: string): string {
  const startMarker = `CREATE OR REPLACE FUNCTION public.${functionName}(`;
  const start = sql.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Function ${functionName} not found`);
  }
  const bodyStart = sql.indexOf('AS $$', start);
  const end = sql.indexOf('\n$$;', bodyStart);
  if (bodyStart < 0 || end < 0) {
    throw new Error(`Function body ${functionName} not found`);
  }
  return sql.slice(start, end + 4);
}

describe('Issue #313 — Invoice Isolation and Security Hardening SQL Verification', () => {
  let sql: string;

  beforeAll(() => {
    sql = readFileSync(
      resolve(__dirname, '../../sql/migrations/20260724_invoice_isolation_313.sql'),
      'utf8'
    );
  });

  it('wraps migration in transaction block BEGIN and COMMIT', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });

  it('clienti_fatturazione and targhe_cliente do not receive station_id', () => {
    expect(sql).not.toMatch(
      /ALTER\s+TABLE\s+public\.clienti_fatturazione\s+ADD\s+COLUMN.*station_id/i
    );
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.targhe_cliente\s+ADD\s+COLUMN.*station_id/i);
  });

  it('adds nullable shift_id bigint, FK, index on invoices with no historical backfill', () => {
    expect(sql).toContain('ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS shift_id bigint;');
    expect(sql).toContain('FOREIGN KEY (shift_id) REFERENCES public.shifts(id)');
    expect(sql).toContain('CREATE INDEX idx_invoices_shift_id ON public.invoices(shift_id);');
    expect(sql).toContain('Schema drift: idx_invoices_shift_id has unexpected definition');
    expect(sql).toContain("c.confmatchtype = 's'");
    expect(sql).toContain('a.attgenerated');
    expect(sql).toContain('a.attidentity');
    expect(sql).toContain('a.atthasdef');
    expect(sql).toContain("c.confupdtype = 'a'");
    expect(sql).toContain("c.confdeltype = 'n'");
    expect(sql).toContain('AND NOT c.condeferrable');
    expect(sql).toContain('AND NOT i.indisunique');
    expect(sql).toContain('AND i.indpred IS NULL');
    expect(sql).toContain("opc.opcname = 'int8_ops'");
    expect(sql).not.toMatch(/UPDATE\s+public\.invoices\s+SET\s+shift_id/i);
  });

  it('revokes access to legacy invoice_requests, drops policies, and does not drop table', () => {
    expect(sql).toContain(
      'REVOKE ALL ON public.invoice_requests FROM PUBLIC, anon, authenticated;'
    );
    expect(sql).toContain('DROP POLICY IF EXISTS');
    expect(sql).toContain("tablename = 'invoice_requests'");
    expect(sql).not.toMatch(/DROP\s+TABLE.*invoice_requests/i);
  });

  it('enforces minimal table grants on all 4 tables', () => {
    expect(sql).toContain(
      'REVOKE ALL ON public.clienti_fatturazione FROM PUBLIC, anon, authenticated;'
    );
    expect(sql).toContain('REVOKE ALL ON public.targhe_cliente FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON public.invoices FROM PUBLIC, anon, authenticated;');

    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON public.clienti_fatturazione TO authenticated;'
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON public.targhe_cliente TO authenticated;'
    );
    expect(sql).toContain('GRANT SELECT ON public.invoices TO authenticated;');

    expect(sql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE)\s+ON\s+public\.invoices\s+TO\s+authenticated/i
    );
    expect(sql).not.toMatch(/GRANT\s+.*ON\s+public\.invoice_requests\s+TO\s+authenticated/i);
  });

  it('strengthens create_invoice_request with non-admin operator identity, server-side shift resolution, and idempotency', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_invoice_request(');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('p_operator_id <> public.current_user_id()');
    expect(sql).toContain('public.user_stations');

    // Server side shift resolution
    expect(sql).toContain('p_created_at timestamptz DEFAULT NULL');
    expect(sql).toContain('COALESCE(p_created_at, now())');
    expect(sql).toContain('opened_at <= v_target_created_at');
    expect(sql).toContain("s.status = 'closed'");
    expect(sql).toContain('s.closed_at IS NOT NULL');
    expect(sql).toContain('ORDER BY s.opened_at DESC, s.id DESC');
    expect(sql).toContain('LIMIT 1');
    expect(sql).toContain('No matching shift found');
    expect(sql).toContain('shift_id');

    // Idempotency
    expect(sql).toContain('check_request_idempotency');
    expect(sql).toContain('processed_requests');

    // Grants
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.create_invoice_request');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_invoice_request');
  });

  it('defines update_shift_invoice with auth, shift status check, validation, search_path, and proper grants', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_shift_invoice(');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('v_inv.operator_id <> public.current_user_id()');
    expect(sql).toContain("v_shift_status <> 'open'");
    expect(sql).toContain('v_shift_closed_at IS NOT NULL');
    expect(sql).toContain('p_amount <= 0');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.update_shift_invoice');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.update_shift_invoice');
  });

  it('defines delete_shift_invoice with auth, shift status check, search_path, and proper grants', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_shift_invoice(');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('v_inv.operator_id <> public.current_user_id()');
    expect(sql).toContain("v_shift_status <> 'open'");
    expect(sql).toContain('v_shift_closed_at IS NOT NULL');
    expect(sql).toContain('DELETE FROM public.invoices');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.delete_shift_invoice');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.delete_shift_invoice');
  });

  it('authorizes every backoffice invoice role through a hardened helper and RLS', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_manage_invoices()');
    expect(sql).toContain(
      "u.role IN ('admin', 'super_admin', 'full_admin', 'billing', 'accounting')"
    );
    expect(sql).toContain('u.is_active IS DISTINCT FROM FALSE');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('public.can_manage_invoices()');
    expect(sql).toContain('invoices_select_backoffice_or_station');
    expect(sql).toContain('clienti_fatturazione_select_invoice_backoffice');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.can_manage_invoices() FROM PUBLIC, anon;');
    expect(sql).toContain('TO authenticated, service_role;');
  });

  it('fails closed for idempotency collisions and in-progress requests in both lookup paths', () => {
    const body = extractFunction(sql, 'create_invoice_request');
    const firstLookup = body.indexOf('FROM public.check_request_idempotency(');
    const markerInsert = body.indexOf('INSERT INTO public.processed_requests');
    const conflictClause = body.indexOf('ON CONFLICT (request_id) DO NOTHING', markerInsert);
    const secondLookup = body.indexOf('FROM public.check_request_idempotency(', firstLookup + 1);

    expect(firstLookup).toBeGreaterThanOrEqual(0);
    expect(markerInsert).toBeGreaterThan(firstLookup);
    expect(conflictClause).toBeGreaterThan(markerInsert);
    expect(secondLookup).toBeGreaterThan(conflictClause);
    expect(body.indexOf('FROM public.check_request_idempotency(', secondLookup + 1)).toBe(-1);

    const initialBranch = body.slice(firstLookup, markerInsert);
    expect(initialBranch).toContain("'error', 'request_id_collision'");
    expect(initialBranch).toContain('IF v_existing IS NOT NULL THEN');
    expect(initialBranch).toContain("'error', 'request_in_progress'");

    const conflictBranch = body.slice(secondLookup);
    const collision = conflictBranch.indexOf("'error', 'request_id_collision'");
    const completedResponse = conflictBranch.indexOf('IF v_existing IS NOT NULL THEN');
    const inProgress = conflictBranch.indexOf("'error', 'request_in_progress'");
    expect(collision).toBeGreaterThanOrEqual(0);
    expect(completedResponse).toBeGreaterThan(collision);
    expect(inProgress).toBeGreaterThan(completedResponse);

    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.check_request_idempotency(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;'
    );
  });

  it('bounds offline timestamps and locks a valid selected shift', () => {
    const body = extractFunction(sql, 'create_invoice_request');
    expect(body).toContain("v_target_created_at > now() + interval '5 minutes'");
    expect(body).toContain("v_target_created_at < now() - interval '24 hours'");
    expect(body).toContain("s.status = 'closed'");
    expect(body).toContain('s.closed_at IS NOT NULL');
    expect(body).toMatch(/FROM public\.shifts s[\s\S]*LIMIT 1[\s\S]*FOR UPDATE;/);
  });

  it('allows create on an active partial shift while keeping partial shifts read-only', () => {
    const createBody = extractFunction(sql, 'create_invoice_request');
    const updateBody = extractFunction(sql, 'update_shift_invoice');
    const deleteBody = extractFunction(sql, 'delete_shift_invoice');

    expect(createBody).toContain("s.status IN ('open', 'partial')");
    expect(updateBody).toContain("v_shift_status <> 'open'");
    expect(deleteBody).toContain("v_shift_status <> 'open'");
    expect(updateBody).not.toContain("v_shift_status NOT IN ('open', 'partial')");
    expect(deleteBody).not.toContain("v_shift_status NOT IN ('open', 'partial')");
  });

  it.each([
    ['update_shift_invoice', 'UPDATE public.invoices'],
    ['delete_shift_invoice', 'DELETE FROM public.invoices']
  ])(
    'locks invoice then shift before lifecycle guard and mutation in %s',
    (functionName, mutation) => {
      const body = extractFunction(sql, functionName);
      const invoiceSelect = body.indexOf('FROM public.invoices i');
      const invoiceLock = body.indexOf('FOR UPDATE;', invoiceSelect);
      const shiftSelect = body.indexOf('FROM public.shifts s', invoiceLock);
      const shiftLock = body.indexOf('FOR UPDATE;', shiftSelect);
      const lifecycleGuard = body.indexOf("v_shift_status <> 'open'", shiftLock);
      const closedGuard = body.indexOf('v_shift_closed_at IS NOT NULL', lifecycleGuard);
      const mutationIndex = body.indexOf(mutation, closedGuard);

      expect(invoiceSelect).toBeGreaterThanOrEqual(0);
      expect(invoiceLock).toBeGreaterThan(invoiceSelect);
      expect(shiftSelect).toBeGreaterThan(invoiceLock);
      expect(shiftLock).toBeGreaterThan(shiftSelect);
      expect(lifecycleGuard).toBeGreaterThan(shiftLock);
      expect(closedGuard).toBeGreaterThan(lifecycleGuard);
      expect(mutationIndex).toBeGreaterThan(closedGuard);
    }
  );

  it('rejects non-finite amounts and null statuses', () => {
    expect(
      sql.match(/p_amount::text IN \('NaN', 'Infinity', '-Infinity'\)/g)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("p_new_status IS NULL OR p_new_status NOT IN ('pending', 'completed')");
  });

  it('defines set_invoice_status for authorized invoice backoffice with proper grants', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_invoice_status(');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('NOT public.can_manage_invoices()');
    expect(sql).toContain("p_new_status IS NULL OR p_new_status NOT IN ('pending', 'completed')");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.set_invoice_status');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.set_invoice_status');
  });
});
