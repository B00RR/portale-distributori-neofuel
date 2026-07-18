/**
 * Contratto di BusinessRulesSchema contro Zod REALE (#334).
 *
 * Lo storico stub permissivo di `zod-client` faceva passare qualunque payload
 * (`parse: (x) => x || {}`): questi test esercitano i vincoli veri usati in
 * produzione — default, minimi, massimi, tipi errati — e il fallback del
 * BusinessLogicManager quando le regole remote non superano la validazione.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { downloadMock, uploadMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  uploadMock: vi.fn()
}));

vi.mock('../../js/core/api.js', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ download: downloadMock, upload: uploadMock }))
    }
  }
}));
vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: vi.fn() } }));
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: vi.fn() }));

import {
  BusinessRulesSchema,
  DEFAULT_BUSINESS_RULES
} from '../../js/core/business-rules-schema.js';
import { BusinessLogicManager } from '../../js/core/business-logic-manager.js';

describe('BusinessRulesSchema (real Zod, #334)', () => {
  describe('defaults', () => {
    it('parses an empty payload into the documented defaults', () => {
      const rules = BusinessRulesSchema.parse({});

      expect(rules.cash_error_threshold).toBe(10);
      expect(rules.max_price_limit).toBe(2.5);
      expect(rules.fuel_reserve_alert_liters).toBe(2000);
      expect(rules.force_close_hours_threshold).toBe(24);
      expect(rules.notifications_enabled).toBe(true);
      expect(rules.critical_discrepancy_alert).toBe(50);
      expect(rules.last_updated_by).toBeUndefined();
      expect(rules.updated_at).toBeUndefined();
    });

    it('keeps DEFAULT_BUSINESS_RULES aligned with the schema defaults', () => {
      expect(DEFAULT_BUSINESS_RULES).toEqual(BusinessRulesSchema.parse({}));
    });
  });

  describe('boundaries', () => {
    it('accepts values exactly on the min/max boundaries', () => {
      const rules = BusinessRulesSchema.parse({
        cash_error_threshold: 1000,
        max_price_limit: 5,
        fuel_reserve_alert_liters: 0,
        force_close_hours_threshold: 168,
        critical_discrepancy_alert: 5000
      });

      expect(rules.cash_error_threshold).toBe(1000);
      expect(rules.max_price_limit).toBe(5);
      expect(rules.fuel_reserve_alert_liters).toBe(0);
      expect(rules.force_close_hours_threshold).toBe(168);
      expect(rules.critical_discrepancy_alert).toBe(5000);
    });

    it.each([
      ['cash_error_threshold below min', { cash_error_threshold: -1 }],
      ['cash_error_threshold above max', { cash_error_threshold: 1001 }],
      ['max_price_limit above max', { max_price_limit: 5.01 }],
      ['fuel_reserve_alert_liters above max', { fuel_reserve_alert_liters: 50001 }],
      ['force_close_hours_threshold below min', { force_close_hours_threshold: 0 }],
      ['critical_discrepancy_alert above max', { critical_discrepancy_alert: 5001 }]
    ])('rejects %s', (_label, payload) => {
      expect(BusinessRulesSchema.safeParse(payload).success).toBe(false);
    });
  });

  describe('types and metadata', () => {
    it.each([
      ['a string where a number is expected', { cash_error_threshold: '10' }],
      ['a string where a boolean is expected', { notifications_enabled: 'yes' }],
      ['a non-datetime updated_at', { updated_at: 'ieri' }],
      ['a numeric last_updated_by', { last_updated_by: 42 }]
    ])('rejects %s', (_label, payload) => {
      expect(BusinessRulesSchema.safeParse(payload).success).toBe(false);
    });

    it('accepts valid optional metadata', () => {
      const rules = BusinessRulesSchema.parse({
        last_updated_by: 'admin',
        updated_at: '2026-07-17T10:00:00.000Z'
      });

      expect(rules.last_updated_by).toBe('admin');
      expect(rules.updated_at).toBe('2026-07-17T10:00:00.000Z');
    });

    it('rejects a payload the old permissive stub let through', () => {
      // Con lo stub `parse` restituiva l'input così com'era: questo payload
      // fuori contratto sarebbe arrivato intatto alla UI e ai calcoli.
      const res = BusinessRulesSchema.safeParse({
        cash_error_threshold: 'tanto',
        max_price_limit: -3,
        notifications_enabled: 1
      });

      expect(res.success).toBe(false);
    });
  });
});

describe('BusinessLogicManager with invalid remote rules (#334)', () => {
  beforeEach(() => {
    BusinessLogicManager.invalidateCache();
    uploadMock.mockResolvedValue({ error: null });
  });

  it('falls back to the defaults when the downloaded payload fails validation', async () => {
    downloadMock.mockResolvedValue({
      data: new Blob([JSON.stringify({ max_price_limit: 99 })], {
        type: 'application/json'
      }),
      error: null
    });

    const rules = await BusinessLogicManager.loadRules();

    expect(rules).toEqual(DEFAULT_BUSINESS_RULES);
  });

  it('falls back to the defaults when the downloaded payload is not JSON', async () => {
    downloadMock.mockResolvedValue({
      data: new Blob(['not-json'], { type: 'application/json' }),
      error: null
    });

    const rules = await BusinessLogicManager.loadRules();

    expect(rules).toEqual(DEFAULT_BUSINESS_RULES);
  });
});
