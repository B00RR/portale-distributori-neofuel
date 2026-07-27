import { describe, it, expect } from 'vitest';
import {
  isDbAvailable,
  getAdminClient,
  getOperator1Client,
  getInactiveClient,
  getNoProfileClient,
  getAnonClient
} from './setup';

describe('RPC Authorization Integration Tests', () => {
  describe('create_customer_refund RPC', () => {
    it('allows station operator to create refund for their station', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { data, error } = await client.rpc('create_customer_refund', {
        p_shift_id: 401,
        p_station_id: 1,
        p_amount: 15.50,
        p_receipt_date: '2026-07-27',
        p_method: 'cash',
        p_notes: 'Integration test refund'
      });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data.amount).toBe(15.50);
      expect(data.station_id).toBe(1);
    });

    it('blocks operator from creating refund for a different station', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.rpc('create_customer_refund', {
        p_shift_id: 402,
        p_station_id: 2,
        p_amount: 20.00,
        p_receipt_date: '2026-07-27',
        p_method: 'cash',
        p_notes: 'Unauthorized cross-station refund'
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/Unauthorized/i);
    });

    it('blocks unauthenticated anon call', async () => {
      if (!isDbAvailable) return;
      const client = getAnonClient();
      const { error } = await client.rpc('create_customer_refund', {
        p_shift_id: 401,
        p_station_id: 1,
        p_amount: 10.00,
        p_receipt_date: '2026-07-27',
        p_method: 'cash',
        p_notes: 'Anon call'
      });

      expect(error).not.toBeNull();
    });

    it('blocks inactive user or user without profile', async () => {
      if (!isDbAvailable) return;
      const inactiveClient = getInactiveClient();
      const { error: errInactive } = await inactiveClient.rpc('create_customer_refund', {
        p_shift_id: 401,
        p_station_id: 1,
        p_amount: 5.00,
        p_receipt_date: '2026-07-27',
        p_method: 'cash'
      });
      expect(errInactive).not.toBeNull();

      const noProfileClient = getNoProfileClient();
      const { error: errNoProfile } = await noProfileClient.rpc('create_customer_refund', {
        p_shift_id: 401,
        p_station_id: 1,
        p_amount: 5.00,
        p_receipt_date: '2026-07-27',
        p_method: 'cash'
      });
      expect(errNoProfile).not.toBeNull();
    });
  });

  describe('create_movement_v2 RPC', () => {
    it('allows authorized operator to create movement for their station', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { data, error } = await client.rpc('create_movement_v2', {
        p_station_id: 1,
        p_shift_id: 401,
        p_operator_id: 2,
        p_tipo: 'inflow',
        p_payment_method: 'cash',
        p_importo: 45.00,
        p_descrizione: 'Incasso integrazione',
        p_request_id: 'req-mov-001'
      });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data.success).toBe(true);
    });

    it('enforces request_id idempotency on create_movement_v2', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const requestId = 'req-idempotency-mov-100';

      const firstCall = await client.rpc('create_movement_v2', {
        p_station_id: 1,
        p_shift_id: 401,
        p_operator_id: 2,
        p_tipo: 'inflow',
        p_payment_method: 'cash',
        p_importo: 50.00,
        p_descrizione: 'First attempt',
        p_request_id: requestId
      });
      expect(firstCall.error).toBeNull();

      const secondCall = await client.rpc('create_movement_v2', {
        p_station_id: 1,
        p_shift_id: 401,
        p_operator_id: 2,
        p_tipo: 'inflow',
        p_payment_method: 'cash',
        p_importo: 50.00,
        p_descrizione: 'Second attempt (retry)',
        p_request_id: requestId
      });
      expect(secondCall.error).toBeNull();
      expect(secondCall.data).toEqual(firstCall.data);
    });

    it('blocks operator 1 from creating movement for station 2', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.rpc('create_movement_v2', {
        p_station_id: 2,
        p_shift_id: 402,
        p_operator_id: 2,
        p_tipo: 'inflow',
        p_payment_method: 'cash',
        p_importo: 100.00,
        p_descrizione: 'Cross station test'
      });

      expect(error).not.toBeNull();
    });
  });

  describe('submit_shift_closure_v2 RPC', () => {
    it('supports preview mode for open shift', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { data, error } = await client.rpc('submit_shift_closure_v2', {
        p_shift_id: 401,
        p_station_id: 1,
        p_preview: true
      });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data.preview).toBe(true);
    });

    it('blocks operator 1 from closing shift of station 2', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.rpc('submit_shift_closure_v2', {
        p_shift_id: 402,
        p_station_id: 2,
        p_preview: true
      });

      expect(error).not.toBeNull();
    });
  });

  describe('admin_delete_user RPC', () => {
    it('allows global admin to delete a user', async () => {
      if (!isDbAvailable) return;
      const adminClient = getAdminClient();
      const { error } = await adminClient.rpc('admin_delete_user', {
        p_user_id: 4
      });

      expect(error).toBeNull();
    });

    it('blocks regular operator from executing admin_delete_user', async () => {
      if (!isDbAvailable) return;
      const opClient = getOperator1Client();
      const { error } = await opClient.rpc('admin_delete_user', {
        p_user_id: 3
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/Unauthorized/i);
    });
  });
});
