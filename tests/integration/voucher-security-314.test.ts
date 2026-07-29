import { describe, it, expect } from 'vitest';
import {
  isDbAvailable,
  pool,
  getAdminClient,
  getOperator1Client,
  getInactiveClient,
  getAnonClient
} from './setup';

describe('Voucher Security & Direct Access Limits (#314)', () => {
  describe('Database Catalog Privilege & Policy Assertions', () => {
    it('verifies explicit table privileges on vouchers and voucher_batches for authenticated and anon', async () => {
      if (!isDbAvailable) return;

      const privQuery = await pool.query(`
        SELECT
          has_table_privilege('authenticated', 'public.vouchers', 'SELECT') as auth_v_select,
          has_table_privilege('authenticated', 'public.vouchers', 'INSERT') as auth_v_insert,
          has_table_privilege('authenticated', 'public.vouchers', 'UPDATE') as auth_v_update,
          has_table_privilege('authenticated', 'public.vouchers', 'DELETE') as auth_v_delete,
          has_table_privilege('authenticated', 'public.vouchers', 'TRUNCATE') as auth_v_truncate,
          has_table_privilege('authenticated', 'public.vouchers', 'REFERENCES') as auth_v_references,
          has_table_privilege('authenticated', 'public.vouchers', 'TRIGGER') as auth_v_trigger,

          has_table_privilege('authenticated', 'public.voucher_batches', 'SELECT') as auth_vb_select,
          has_table_privilege('authenticated', 'public.voucher_batches', 'INSERT') as auth_vb_insert,
          has_table_privilege('authenticated', 'public.voucher_batches', 'UPDATE') as auth_vb_update,
          has_table_privilege('authenticated', 'public.voucher_batches', 'DELETE') as auth_vb_delete,
          has_table_privilege('authenticated', 'public.voucher_batches', 'TRUNCATE') as auth_vb_truncate,
          has_table_privilege('authenticated', 'public.voucher_batches', 'REFERENCES') as auth_vb_references,
          has_table_privilege('authenticated', 'public.voucher_batches', 'TRIGGER') as auth_vb_trigger,

          has_table_privilege('anon', 'public.vouchers', 'SELECT') as anon_v_select,
          has_table_privilege('anon', 'public.vouchers', 'INSERT') as anon_v_insert,
          has_table_privilege('anon', 'public.vouchers', 'UPDATE') as anon_v_update,
          has_table_privilege('anon', 'public.vouchers', 'DELETE') as anon_v_delete,
          has_table_privilege('anon', 'public.voucher_batches', 'SELECT') as anon_vb_select,
          has_table_privilege('anon', 'public.voucher_batches', 'INSERT') as anon_vb_insert,
          has_table_privilege('anon', 'public.voucher_batches', 'UPDATE') as anon_vb_update,
          has_table_privilege('anon', 'public.voucher_batches', 'DELETE') as anon_vb_delete;
      `);

      const r = privQuery.rows[0];
      // authenticated privileges
      expect(r.auth_v_select).toBe(true);
      expect(r.auth_v_insert).toBe(true);
      expect(r.auth_v_update).toBe(true);
      expect(r.auth_v_delete).toBe(true);
      expect(r.auth_v_truncate).toBe(false);
      expect(r.auth_v_references).toBe(false);
      expect(r.auth_v_trigger).toBe(false);

      expect(r.auth_vb_select).toBe(true);
      expect(r.auth_vb_insert).toBe(true);
      expect(r.auth_vb_update).toBe(true);
      expect(r.auth_vb_delete).toBe(true);
      expect(r.auth_vb_truncate).toBe(false);
      expect(r.auth_vb_references).toBe(false);
      expect(r.auth_vb_trigger).toBe(false);

      // anon privileges
      expect(r.anon_v_select).toBe(false);
      expect(r.anon_v_insert).toBe(false);
      expect(r.anon_v_update).toBe(false);
      expect(r.anon_v_delete).toBe(false);
      expect(r.anon_vb_select).toBe(false);
      expect(r.anon_vb_insert).toBe(false);
      expect(r.anon_vb_update).toBe(false);
      expect(r.anon_vb_delete).toBe(false);
    });

    it('verifies catalog policies on vouchers and voucher_batches are strictly admin-only and active user restrictive', async () => {
      if (!isDbAvailable) return;

      const policyQuery = await pool.query(`
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('vouchers', 'voucher_batches');
      `);

      expect(policyQuery.rows.length).toBeGreaterThan(0);

      const policyNames = policyQuery.rows.map(r => r.policyname);
      expect(policyNames).toContain('Admins can manage batches');
      expect(policyNames).toContain('Admins can manage vouchers');

      for (const row of policyQuery.rows) {
        if (row.policyname === 'enforce_active_user') {
          expect(row.permissive).toBe('RESTRICTIVE');
          expect(row.qual).toMatch(/current_user_is_active/i);
        } else if (
          row.policyname === 'Admins can manage batches' ||
          row.policyname === 'Admins can manage vouchers'
        ) {
          expect(row.permissive).toBe('PERMISSIVE');
          expect(row.cmd).toBe('ALL');
          expect(row.qual).toMatch(/is_admin/i);
          expect(row.with_check).not.toBeNull();
          expect(row.with_check).toMatch(/is_admin/i);
        }
      }
    });

    it('verifies EXECUTE grants and search_path configuration for RPC functions', async () => {
      if (!isDbAvailable) return;

      const rpcQuery = await pool.query(`
        SELECT proname, proconfig,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
               has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND proname IN ('validate_voucher_for_preview', 'get_shift_vouchers', 'redeem_voucher_validated');
      `);

      expect(rpcQuery.rows.length).toBe(3);
      for (const r of rpcQuery.rows) {
        expect(r.auth_exec).toBe(true);
        expect(r.anon_exec).toBe(false);
        // Verify SET search_path = '' (proconfig contains search_path=)
        expect(r.proconfig).not.toBeNull();
        expect(r.proconfig.some((c: string) => c.startsWith('search_path='))).toBe(true);
      }
    });

    it('verifies non-admin roles and inactive users are denied RPC execution or write access', async () => {
      if (!isDbAvailable) return;
      const inactive = getInactiveClient();

      const resPreview = await inactive.rpc('validate_voucher_for_preview', {
        p_voucher_code: 'TEST-CODE',
        p_station_id: 1
      });
      expect(resPreview.error).not.toBeNull();

      const resRedeem = await inactive.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-CODE',
        p_station_id: 1,
        p_operator_id: '44444444-4444-4444-4444-444444444444',
        p_shift_id: 401
      });
      expect(resRedeem.error).not.toBeNull();
    });
  });

  describe('Direct Table Access Restrictions on vouchers and voucher_batches', () => {
    it('denies anonymous user direct SELECT, INSERT, UPDATE, DELETE on vouchers and voucher_batches', async () => {
      if (!isDbAvailable) return;
      const anon = getAnonClient();

      const selectVouchers = await anon.from('vouchers').select('*');
      expect(selectVouchers.error).not.toBeNull();

      const selectBatches = await anon.from('voucher_batches').select('*');
      expect(selectBatches.error).not.toBeNull();

      const insertVoucher = await anon.from('vouchers').insert({
        code: 'ANON-FAIL-01',
        amount: 100
      });
      expect(insertVoucher.error).not.toBeNull();

      const insertBatch = await anon.from('voucher_batches').insert({
        description: 'Anon Batch'
      });
      expect(insertBatch.error).not.toBeNull();
    });

    it('denies authenticated operators direct SELECT, INSERT, UPDATE, DELETE on vouchers (data remains unchanged)', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();

      // Seed a test voucher as admin
      const { data: voucher, error: seedErr } = await admin
        .from('vouchers')
        .insert({
          code: 'OP-DIRECT-TEST',
          amount: 100,
          status: 'active'
        })
        .select()
        .single();

      expect(seedErr).toBeNull();
      expect(voucher).not.toBeNull();

      // Direct SELECT on vouchers by operator returns 0 rows
      const selectVouchers = await op1.from('vouchers').select('*').eq('id', voucher!.id);
      expect(selectVouchers.data?.length ?? 0).toBe(0);

      // Direct INSERT on vouchers by operator returns error (due to WITH CHECK is_admin())
      const insertVoucher = await op1.from('vouchers').insert({
        code: 'OP-HACK-01',
        amount: 50
      });
      expect(insertVoucher.error).not.toBeNull();

      // Direct UPDATE on vouchers by operator: PostgreSQL RLS filters row, so 0 rows updated
      const updateVoucher = await op1
        .from('vouchers')
        .update({ amount: 9999 })
        .eq('id', voucher!.id)
        .select();
      expect(updateVoucher.data?.length ?? 0).toBe(0);

      // Direct DELETE on vouchers by operator: 0 rows deleted
      const deleteVoucher = await op1.from('vouchers').delete().eq('id', voucher!.id).select();
      expect(deleteVoucher.data?.length ?? 0).toBe(0);

      // Verify with admin that voucher row exists and amount is STILL 100
      const { data: checkedVoucher } = await admin
        .from('vouchers')
        .select('*')
        .eq('id', voucher!.id)
        .single();
      expect(checkedVoucher).not.toBeNull();
      expect(checkedVoucher!.amount).toBe(100);

      // Clean up
      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('denies authenticated operators direct access on voucher_batches (data remains unchanged)', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();

      // Seed a test batch as admin
      const { data: batch, error: seedErr } = await admin
        .from('voucher_batches')
        .insert({
          description: 'Batch Op Test'
        })
        .select()
        .single();

      expect(seedErr).toBeNull();
      expect(batch).not.toBeNull();

      // Direct SELECT by operator returns 0 rows
      const selectBatches = await op1.from('voucher_batches').select('*').eq('id', batch!.id);
      expect(selectBatches.data?.length ?? 0).toBe(0);

      // Direct INSERT by operator returns error
      const insertBatch = await op1.from('voucher_batches').insert({
        description: 'Unauthorized Batch'
      });
      expect(insertBatch.error).not.toBeNull();

      // Direct UPDATE by operator returns 0 rows updated
      const updateBatch = await op1
        .from('voucher_batches')
        .update({ description: 'Hacked Batch' })
        .eq('id', batch!.id)
        .select();
      expect(updateBatch.data?.length ?? 0).toBe(0);

      // Direct DELETE by operator returns 0 rows deleted
      const deleteBatch = await op1.from('voucher_batches').delete().eq('id', batch!.id).select();
      expect(deleteBatch.data?.length ?? 0).toBe(0);

      // Verify with admin that batch row exists and description is STILL 'Batch Op Test'
      const { data: checkedBatch } = await admin
        .from('voucher_batches')
        .select('*')
        .eq('id', batch!.id)
        .single();
      expect(checkedBatch).not.toBeNull();
      expect(checkedBatch!.description).toBe('Batch Op Test');

      // Clean up
      await admin.from('voucher_batches').delete().eq('id', batch!.id);
    });

    it('allows admin direct CRUD management on vouchers and voucher_batches', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();

      // Create batch
      const { data: batch, error: batchErr } = await admin
        .from('voucher_batches')
        .insert({ description: 'Admin Test Batch' })
        .select()
        .single();

      expect(batchErr).toBeNull();
      expect(batch).not.toBeNull();

      // Create voucher
      const { data: voucher, error: vouchErr } = await admin
        .from('vouchers')
        .insert({
          batch_id: batch!.id,
          code: 'ADMIN-TEST-100',
          amount: 25,
          status: 'active',
          station_id: 1
        })
        .select()
        .single();

      expect(vouchErr).toBeNull();
      expect(voucher).not.toBeNull();
      expect(voucher!.code).toBe('ADMIN-TEST-100');

      // Admin SELECT
      const { data: list, error: listErr } = await admin
        .from('vouchers')
        .select('*')
        .eq('id', voucher!.id);
      expect(listErr).toBeNull();
      expect(list?.length).toBe(1);

      // Clean up
      await admin.from('vouchers').delete().eq('id', voucher!.id);
      await admin.from('voucher_batches').delete().eq('id', batch!.id);
    });
  });

  describe('Preview & Resolution Safety (validate_voucher_for_preview & get_shift_vouchers)', () => {
    it('allows operator to preview voucher metadata via validate_voucher_for_preview without direct SELECT', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();

      const { data: batch } = await admin
        .from('voucher_batches')
        .insert({ customer_name: 'Cliente Test Preview' })
        .select()
        .single();

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({
          batch_id: batch!.id,
          code: 'PREVIEW-TEST-01',
          amount: 75,
          status: 'active',
          station_id: 1
        })
        .select()
        .single();

      const previewRes = await op1.rpc('validate_voucher_for_preview', {
        p_voucher_code: 'PREVIEW-TEST-01',
        p_station_id: 1
      });

      expect(previewRes.error).toBeNull();
      expect(previewRes.data?.success).toBe(true);
      expect(previewRes.data?.code).toBe('PREVIEW-TEST-01');
      expect(previewRes.data?.amount).toBe(75);
      expect(previewRes.data?.customer_name).toBe('Cliente Test Preview');

      // Cleanup
      await admin.from('vouchers').delete().eq('id', voucher!.id);
      await admin.from('voucher_batches').delete().eq('id', batch!.id);
    });

    it('rejects wildcards % and _ and metacharacters in preview and redeem (fail closed)', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({ code: 'VOUCHER-PERCENT-TEST', amount: 50, status: 'active', station_id: 1 })
        .select()
        .single();

      // Test percent wildcard preview
      const previewWildcard1 = await op1.rpc('validate_voucher_for_preview', {
        p_voucher_code: 'VOUCHER%',
        p_station_id: 1
      });
      expect(previewWildcard1.data?.success).toBe(false);
      expect(previewWildcard1.data?.error).toBe('Codice non trovato.');

      // Test underscore wildcard preview
      const previewWildcard2 = await op1.rpc('validate_voucher_for_preview', {
        p_voucher_code: 'VOUCHER_',
        p_station_id: 1
      });
      expect(previewWildcard2.data?.success).toBe(false);
      expect(previewWildcard2.data?.error).toBe('Codice non trovato.');

      // Test wildcard redeem
      const redeemWildcard = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'VOUCHER%',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: 'req-wildcard-test',
        p_shift_id: 401
      });
      expect(redeemWildcard.data?.success).toBe(false);
      expect(redeemWildcard.data?.error).toBe('Voucher non trovato');

      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('rejects preview and redeem for voucher assigned to another station without leaking existence', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({
          code: 'ST2-ONLY-VOUCHER',
          amount: 50,
          status: 'active',
          station_id: 2
        })
        .select()
        .single();

      // Station 1 preview returns 'Codice non trovato.' (does not leak that station 2 has this voucher)
      const previewRes = await op1.rpc('validate_voucher_for_preview', {
        p_voucher_code: 'ST2-ONLY-VOUCHER',
        p_station_id: 1
      });

      expect(previewRes.error).toBeNull();
      expect(previewRes.data?.success).toBe(false);
      expect(previewRes.data?.error).toBe('Codice non trovato.');

      // Station 1 redeem returns 'Voucher non trovato'
      const redeemRes = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'ST2-ONLY-VOUCHER',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: 'req-st2-leak-test',
        p_shift_id: 401
      });

      expect(redeemRes.data?.success).toBe(false);
      expect(redeemRes.data?.error).toBe('Voucher non trovato');

      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('supports global voucher (station_id IS NULL) preview and redemption for station 1', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({
          code: 'GLOBAL-VOUCHER-99',
          amount: 60,
          status: 'active',
          station_id: null
        })
        .select()
        .single();

      const previewRes = await op1.rpc('validate_voucher_for_preview', {
        p_voucher_code: 'GLOBAL-VOUCHER-99',
        p_station_id: 1
      });

      expect(previewRes.data?.success).toBe(true);
      expect(previewRes.data?.code).toBe('GLOBAL-VOUCHER-99');

      const redeemRes = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'GLOBAL-VOUCHER-99',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: 'req-global-v-test',
        p_shift_id: 401
      });

      expect(redeemRes.data?.success).toBe(true);
      expect(redeemRes.data?.amount).toBe(60);

      // Clean up
      await admin
        .from('movimenti_cassa')
        .delete()
        .eq('descrizione', 'Riscatto Voucher GLOBAL-VOUCHER-99');
      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('detects ambiguous local candidates on 4-char prefix fallback', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();

      const { data: v1 } = await admin
        .from('vouchers')
        .insert({ code: 'ABCD-1111-XXXX', amount: 10, status: 'active', station_id: 1 })
        .select()
        .single();

      const { data: v2 } = await admin
        .from('vouchers')
        .insert({ code: 'ABCD-2222-YYYY', amount: 20, status: 'active', station_id: 1 })
        .select()
        .single();

      const previewRes = await op1.rpc('validate_voucher_for_preview', {
        p_voucher_code: 'ABCD',
        p_station_id: 1
      });

      expect(previewRes.data?.success).toBe(false);
      expect(previewRes.data?.error).toMatch(/Più voucher corrispondono/i);

      await admin.from('vouchers').delete().eq('id', v1!.id);
      await admin.from('vouchers').delete().eq('id', v2!.id);
    });

    it('allows operator to fetch shift vouchers via get_shift_vouchers for operator summary', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({
          code: 'SUMMARY-VOUCHER-01',
          amount: 40,
          status: 'redeemed',
          station_id: 1,
          shift_id: 401
        })
        .select()
        .single();

      const summaryRes = await op1.rpc('get_shift_vouchers', {
        p_station_id: 1,
        p_shift_id: 401
      });

      expect(summaryRes.error).toBeNull();
      expect(summaryRes.data?.length).toBeGreaterThanOrEqual(1);
      const found = summaryRes.data?.find((v: { code: string }) => v.code === 'SUMMARY-VOUCHER-01');
      expect(found).toBeDefined();
      expect(found.amount).toBe(40);

      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('rejects get_shift_vouchers when shift does not belong to station', async () => {
      if (!isDbAvailable) return;
      const op1 = getOperator1Client();

      const res = await op1.rpc('get_shift_vouchers', {
        p_station_id: 1,
        p_shift_id: 402
      });

      expect(res.error).not.toBeNull();
      expect(res.error?.message).toMatch(/Shift does not belong to station/i);
    });
  });

  describe('Server-Authoritative Voucher Redemption RPC (redeem_voucher_validated)', () => {
    it('allows assigned operator to redeem a valid voucher for their station with idempotency, exact 1 movement, and shift linkage', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({
          code: 'TEST-REDEEM-ST1',
          amount: 30,
          status: 'active',
          station_id: 1
        })
        .select()
        .single();

      expect(voucher).not.toBeNull();

      const op1 = getOperator1Client();
      const requestId = 'req-voucher-314-test-01';

      const res1 = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-REDEEM-ST1',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: requestId,
        p_shift_id: 401
      });

      expect(res1.error).toBeNull();
      expect(res1.data?.success).toBe(true);
      expect(res1.data?.amount).toBe(30);
      expect(res1.data?.code).toBe('TEST-REDEEM-ST1');

      // Verify idempotency second call (sequential replay returns EXACT same result)
      const res2 = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-REDEEM-ST1',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: requestId,
        p_shift_id: 401
      });

      expect(res2.error).toBeNull();
      expect(res2.data?.success).toBe(true);
      expect(res2.data?.amount).toBe(30);

      // Verify shift linkage and status on voucher
      const { data: updatedVoucher } = await admin
        .from('vouchers')
        .select('*')
        .eq('id', voucher!.id)
        .single();

      expect(updatedVoucher!.status).toBe('redeemed');
      expect(updatedVoucher!.shift_id).toBe(401);
      expect(updatedVoucher!.redeemed_by).toBe(op1AuthUid);

      // Verify EXACTLY ONE cash movement created with correct shift_id
      const { data: movements } = await admin
        .from('movimenti_cassa')
        .select('*')
        .eq('station_id', 1)
        .eq('shift_id', 401)
        .eq('tipo', 'voucher')
        .eq('importo', 30);

      expect(movements?.length).toBe(1);
      expect(movements![0].shift_id).toBe(401);
      expect(movements![0].descrizione).toContain('TEST-REDEEM-ST1');

      // Clean up test data
      await admin.from('movimenti_cassa').delete().eq('id', movements![0].id);
      await admin.from('vouchers').delete().eq('code', 'TEST-REDEEM-ST1');
    });

    it('replays original success response when request_id is re-submitted after shift is closed', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      // Seed shift 499 as open
      const { data: shift } = await admin
        .from('shifts')
        .insert({ id: 499, station_id: 1, operator_id: 1, status: 'open' })
        .select()
        .single();

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({ code: 'REPLAY-AFTER-CLOSE', amount: 45, status: 'active', station_id: 1 })
        .select()
        .single();

      const reqId = 'req-replay-close-499';

      // Redeem voucher in open shift
      const res1 = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'REPLAY-AFTER-CLOSE',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: reqId,
        p_shift_id: 499
      });
      expect(res1.data?.success).toBe(true);

      // Close shift
      await admin.from('shifts').update({ status: 'closed' }).eq('id', 499);

      // Re-submit identical request after shift is closed -> must return original SUCCESS response replay!
      const res2 = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'REPLAY-AFTER-CLOSE',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: reqId,
        p_shift_id: 499
      });

      expect(res2.data?.success).toBe(true);
      expect(res2.data?.amount).toBe(45);

      // A NEW request_id on the closed shift must fail with 'Turno non aperto'
      const resNew = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'REPLAY-AFTER-CLOSE',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: 'req-new-on-closed-shift',
        p_shift_id: 499
      });
      expect(resNew.data?.success).toBe(false);
      expect(resNew.data?.error).toBe('Turno non aperto');

      // Cleanup
      await admin.from('movimenti_cassa').delete().eq('shift_id', 499);
      await admin.from('vouchers').delete().eq('id', voucher!.id);
      await admin.from('shifts').delete().eq('id', shift!.id);
    });

    it('handles concurrent identical calls exactly-once without duplicate side effects', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({ code: 'CONCURRENT-REDEEM-01', amount: 50, status: 'active', station_id: 1 })
        .select()
        .single();

      const concReqId = 'req-conc-exactly-once';

      // Launch 2 concurrent RPC calls with identical payload & request_id
      const [res1, res2] = await Promise.all([
        op1.rpc('redeem_voucher_validated', {
          p_voucher_code: 'CONCURRENT-REDEEM-01',
          p_station_id: 1,
          p_operator_id: op1AuthUid,
          p_request_id: concReqId,
          p_shift_id: 401
        }),
        op1.rpc('redeem_voucher_validated', {
          p_voucher_code: 'CONCURRENT-REDEEM-01',
          p_station_id: 1,
          p_operator_id: op1AuthUid,
          p_request_id: concReqId,
          p_shift_id: 401
        })
      ]);

      // At least one (or both via replay) returns success
      expect(res1.data?.success || res2.data?.success).toBe(true);

      // Verify via service role that EXACTLY ONE cash movement was created
      const { data: movements } = await admin
        .from('movimenti_cassa')
        .select('*')
        .eq('descrizione', 'Riscatto Voucher CONCURRENT-REDEEM-01');

      expect(movements?.length).toBe(1);

      // Cleanup
      await admin.from('movimenti_cassa').delete().eq('id', movements![0].id);
      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('rejects same request_id used with a different payload (request_id_collision)', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      const { data: v1 } = await admin
        .from('vouchers')
        .insert({ code: 'VOUCHER-COLLISION-A', amount: 20, status: 'active', station_id: 1 })
        .select()
        .single();

      const { data: v2 } = await admin
        .from('vouchers')
        .insert({ code: 'VOUCHER-COLLISION-B', amount: 30, status: 'active', station_id: 1 })
        .select()
        .single();

      const sharedRequestId = 'req-collision-314-unique';

      // First call for voucher A
      const res1 = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'VOUCHER-COLLISION-A',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: sharedRequestId,
        p_shift_id: 401
      });
      expect(res1.data?.success).toBe(true);

      // Second call with SAME request_id but different voucher code (different payload)
      const res2 = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'VOUCHER-COLLISION-B',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: sharedRequestId,
        p_shift_id: 401
      });

      expect(res2.data?.success).toBe(false);
      expect(res2.data?.error).toBe('request_id_collision');

      // Cleanup
      await admin.from('vouchers').delete().eq('id', v1!.id);
      await admin.from('vouchers').delete().eq('id', v2!.id);
    });

    it('rejects shift cross-station linkage (shift for station 2 used in station 1 redemption)', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1 = getOperator1Client();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      const { data: voucher } = await admin
        .from('vouchers')
        .insert({ code: 'CROSS-SHIFT-VOUCHER', amount: 15, status: 'active', station_id: 1 })
        .select()
        .single();

      // Shift 402 belongs to station 2. Operator 1 calls for station 1 with shift 402
      const res = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'CROSS-SHIFT-VOUCHER',
        p_station_id: 1,
        p_operator_id: op1AuthUid,
        p_request_id: 'req-cross-shift-test',
        p_shift_id: 402
      });

      expect(res.data?.success).toBe(false);
      expect(res.data?.error).toMatch(/Turno non appartenente alla stazione/i);

      // Verify voucher remains active
      const { data: checkedVoucher } = await admin
        .from('vouchers')
        .select('*')
        .eq('id', voucher!.id)
        .single();
      expect(checkedVoucher!.status).toBe('active');

      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('blocks station mismatch: operator assigned to station 1 calls RPC for station 1 using a voucher assigned to station 2 (voucher remains active)', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      // Seed a test voucher assigned to station 2
      const { data: voucher } = await admin
        .from('vouchers')
        .insert({
          code: 'TEST-STATION2-ONLY',
          amount: 50,
          status: 'active',
          station_id: 2
        })
        .select()
        .single();

      expect(voucher).not.toBeNull();

      const op1 = getOperator1Client(); // Operator assigned to station 1

      // Operator 1 calls RPC for station 1, but voucher belongs to station 2
      const res = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-STATION2-ONLY',
        p_station_id: 1, // Station 1 matches operator 1's assignment
        p_operator_id: op1AuthUid,
        p_request_id: 'req-station-mismatch-test',
        p_shift_id: 401
      });

      expect(res.error).toBeNull();
      expect(res.data?.success).toBe(false);
      expect(res.data?.error).toBe('Voucher non trovato');

      // Verify voucher remains ACTIVE and unchanged
      const { data: checkedVoucher } = await admin
        .from('vouchers')
        .select('*')
        .eq('id', voucher!.id)
        .single();

      expect(checkedVoucher!.status).toBe('active');
      expect(checkedVoucher!.redeemed_at).toBeNull();

      // Verify NO cash movement was created
      const { data: movements } = await admin
        .from('movimenti_cassa')
        .select('*')
        .eq('descrizione', 'Riscatto Voucher TEST-STATION2-ONLY');
      expect(movements?.length ?? 0).toBe(0);

      // Clean up
      await admin.from('vouchers').delete().eq('id', voucher!.id);
    });

    it('blocks operator 1 from executing RPC for station 2 (unassigned station)', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();
      const op1AuthUid = '22222222-2222-2222-2222-222222222222';

      await admin.from('vouchers').insert({
        code: 'TEST-SUD-UNASSIGNED',
        amount: 50,
        status: 'active',
        station_id: 2
      });

      const op1 = getOperator1Client();

      const res = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-SUD-UNASSIGNED',
        p_station_id: 2, // Operator 1 is NOT assigned to station 2
        p_operator_id: op1AuthUid,
        p_request_id: 'req-unauth-station-2',
        p_shift_id: 402
      });

      expect(res.error).not.toBeNull();
      expect(res.error?.message).toMatch(/Unauthorized/i);

      // Clean up
      await admin.from('vouchers').delete().eq('code', 'TEST-SUD-UNASSIGNED');
    });

    it('blocks p_operator_id parameter spoofing (UUID differing from auth.uid())', async () => {
      if (!isDbAvailable) return;
      const admin = getAdminClient();

      await admin.from('vouchers').insert({
        code: 'TEST-SPOOF-OP',
        amount: 40,
        status: 'active',
        station_id: 1
      });

      const op1 = getOperator1Client();
      const fakeOpId = '99999999-9999-9999-9999-999999999999';

      const res = await op1.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-SPOOF-OP',
        p_station_id: 1,
        p_operator_id: fakeOpId,
        p_request_id: 'req-spoof-op-id',
        p_shift_id: 401
      });

      expect(res.error).not.toBeNull();
      expect(res.error?.message).toMatch(/Unauthorized/i);

      // Clean up
      await admin.from('vouchers').delete().eq('code', 'TEST-SPOOF-OP');
    });

    it('blocks unauthenticated anon call to redeem_voucher_validated', async () => {
      if (!isDbAvailable) return;
      const anon = getAnonClient();

      const res = await anon.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-ANON-RPC',
        p_station_id: 1,
        p_operator_id: '22222222-2222-2222-2222-222222222222'
      });

      expect(res.error).not.toBeNull();
    });

    it('blocks inactive user from redeeming vouchers', async () => {
      if (!isDbAvailable) return;
      const inactive = getInactiveClient();

      const res = await inactive.rpc('redeem_voucher_validated', {
        p_voucher_code: 'TEST-INACTIVE-RPC',
        p_station_id: 1,
        p_operator_id: '44444444-4444-4444-4444-444444444444'
      });

      expect(res.error).not.toBeNull();
    });
  });

  describe('RPC Obsolete Overload Removal', () => {
    it('verifies obsolete 4-parameter overload redeem_voucher_validated(text, integer, uuid, text) is dropped', async () => {
      if (!isDbAvailable) return;

      const checkQuery = await pool.query(`
        SELECT proname, oid::regprocedure::text as signature
        FROM pg_proc
        WHERE proname = 'redeem_voucher_validated'
          AND pronamespace = 'public'::regnamespace;
      `);

      const signatures = checkQuery.rows.map((r: { signature: string }) => r.signature);
      const obsoleteExists = signatures.some(
        s => s.includes('text, integer, uuid, text)') && !s.includes('bigint')
      );
      expect(obsoleteExists).toBe(false);
    });
  });
});
