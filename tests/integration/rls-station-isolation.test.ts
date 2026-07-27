import { describe, it, expect } from 'vitest';
import {
  isDbAvailable,
  getAdminClient,
  getOperator1Client,
  getOperator2Client,
  getAnonClient
} from './setup';

describe('RLS Station Isolation Integration Tests', () => {
  describe('Invoices RLS Isolation', () => {
    it('operator 1 can only see invoices from station 1', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { data, error } = await client.from('invoices').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every(inv => inv.station_id === 1)).toBe(true);
    });

    it('operator 2 can only see invoices from station 2', async () => {
      if (!isDbAvailable) return;
      const client = getOperator2Client();
      const { data, error } = await client.from('invoices').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every(inv => inv.station_id === 2)).toBe(true);
    });

    it('admin can see invoices from all stations', async () => {
      if (!isDbAvailable) return;
      const client = getAdminClient();
      const { data, error } = await client.from('invoices').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      const stationIds = new Set(data!.map(inv => inv.station_id));
      expect(stationIds.has(1)).toBe(true);
      expect(stationIds.has(2)).toBe(true);
    });

    it('anonymous user cannot see any invoices', async () => {
      if (!isDbAvailable) return;
      const client = getAnonClient();
      const { data } = await client.from('invoices').select('*');

      expect(data === null || data.length === 0).toBe(true);
    });
  });

  describe('Invoice Requests RLS Isolation', () => {
    it('denies operator 1 direct select on invoice_requests (42501)', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { data, error } = await client.from('invoice_requests').select('*');

      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
    });

    it('denies operator 2 direct select on invoice_requests (42501)', async () => {
      if (!isDbAvailable) return;
      const client = getOperator2Client();
      const { data, error } = await client.from('invoice_requests').select('*');

      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
    });

    it('denies admin (authenticated role) direct select on invoice_requests (42501)', async () => {
      if (!isDbAvailable) return;
      const client = getAdminClient();
      const { data, error } = await client.from('invoice_requests').select('*');

      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
    });
  });

  describe('Movimenti Cassa RLS Isolation', () => {
    it('operator 1 cannot see movimenti_cassa of station 2', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { data, error } = await client.from('movimenti_cassa').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.every(mov => mov.station_id === 1)).toBe(true);
      expect(data!.some(mov => mov.station_id === 2)).toBe(false);
    });

    it('operator 2 cannot see movimenti_cassa of station 1', async () => {
      if (!isDbAvailable) return;
      const client = getOperator2Client();
      const { data, error } = await client.from('movimenti_cassa').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.every(mov => mov.station_id === 2)).toBe(true);
      expect(data!.some(mov => mov.station_id === 1)).toBe(false);
    });

    it('admin can see movimenti_cassa from all stations', async () => {
      if (!isDbAvailable) return;
      const client = getAdminClient();
      const { data, error } = await client.from('movimenti_cassa').select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      const stationIds = new Set(data!.map(mov => mov.station_id));
      expect(stationIds.has(1)).toBe(true);
      expect(stationIds.has(2)).toBe(true);
    });
  });

  describe('Cross-Station Write Attempts Protection', () => {
    it('blocks operator 1 from inserting an invoice for station 2', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.from('invoices').insert({
        station_id: 2,
        invoice_number: 'FORGED-001',
        amount: 999.00,
        status: 'draft'
      });

      expect(error).not.toBeNull();
    });

    it('blocks operator 2 from inserting a movimenti_cassa row for station 1', async () => {
      if (!isDbAvailable) return;
      const client = getOperator2Client();
      const { error } = await client.from('movimenti_cassa').insert({
        station_id: 1,
        importo: 500.00,
        tipo: 'inflow',
        descrizione: 'Hack attempt'
      });

      expect(error).not.toBeNull();
    });

    it('blocks operator 1 from direct insert on invoices even for station 1 (42501)', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client
        .from('invoices')
        .insert({
          station_id: 1,
          invoice_number: 'VALID-NORD-002',
          amount: 150.00,
          status: 'draft'
        });

      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
    });
  });
});
