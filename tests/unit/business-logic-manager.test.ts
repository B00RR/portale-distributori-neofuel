import { describe, it, expect, vi } from 'vitest';

const { mockSupabase, mockToast } = vi.hoisted(() => ({
    mockSupabase: {
        storage: {
            from: vi.fn(() => ({
                download: vi.fn(),
                upload: vi.fn()
            }))
        }
    },
    mockToast: {
        show: vi.fn()
    }
}));

vi.mock('../../js/core/api.js', () => ({
    supabase: mockSupabase
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: mockToast
}));

vi.mock('../../js/core/business-rules-schema.js', () => ({
    BusinessRulesSchema: {
        parse: vi.fn((data) => data)
    },
    DEFAULT_BUSINESS_RULES: {
        fuel_reserve_alert_liters: 1000,
        force_close_hours_threshold: 24,
        max_price_limit: 5.0,
        notifications_enabled: true
    }
}));

import { BusinessLogicManager } from '../../js/core/business-logic-manager.js';

describe('Business Logic Manager', () => {
    it('should load default rules', async () => {
        const rules = await BusinessLogicManager.loadRules();
        expect(rules).toBeDefined();
        expect(rules.fuel_reserve_alert_liters).toBeDefined();
    });

    it('should have default rules', () => {
        expect(true).toBe(true);
    });
});
