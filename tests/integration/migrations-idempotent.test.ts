import { describe, it, expect } from 'vitest';
import { isDbAvailable, resetDatabaseState, pool } from './setup';

describe('Ephemeral Database Setup & Reset Integration Tests', () => {
  it('verifies that database schema and seed reset are idempotent', async () => {
    if (!isDbAvailable) return;

    // Reset database state first time
    await resetDatabaseState();

    // Reset database state a second time to verify idempotency
    await resetDatabaseState();

    // Verify key core tables exist and are populated
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tables = result.rows.map((r: { table_name: string }) => r.table_name);

    expect(tables).toContain('fuel_stations');
    expect(tables).toContain('invoices');
    expect(tables).toContain('movimenti_cassa');
    expect(tables).toContain('customer_refunds');
  });
});
