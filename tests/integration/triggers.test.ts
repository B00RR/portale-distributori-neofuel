import { describe, it, expect } from 'vitest';
import { isDbAvailable, pool } from './setup';

describe('Database Triggers Integration Tests', () => {
  it('updates customer_refunds.updated_at automatically on UPDATE via trigger', async () => {
    if (!isDbAvailable) return;

    const historicalTimestamp = '2000-01-01 00:00:00+00';

    const insertRes = await pool.query(
      `INSERT INTO public.customer_refunds (
        shift_id, station_id, operator_id, amount, receipt_date, method, notes, created_at, updated_at
      ) VALUES (
        401, 1, 2, 10.00, '2026-07-27', 'cash', 'Initial test refund', NOW(), $1
      ) RETURNING id, updated_at`,
      [historicalTimestamp]
    );

    const refundId = insertRes.rows[0].id;
    const initialUpdatedAt = new Date(insertRes.rows[0].updated_at).getTime();
    expect(new Date(historicalTimestamp).getTime()).toBe(initialUpdatedAt);

    await pool.query(
      `UPDATE public.customer_refunds SET notes = 'Updated test refund' WHERE id = $1`,
      [refundId]
    );

    const selectRes = await pool.query(
      `SELECT updated_at FROM public.customer_refunds WHERE id = $1`,
      [refundId]
    );

    const newUpdatedAt = new Date(selectRes.rows[0].updated_at).getTime();
    expect(newUpdatedAt).toBeGreaterThan(initialUpdatedAt);
    expect(Date.now() - newUpdatedAt).toBeLessThan(60000);
  });
});
