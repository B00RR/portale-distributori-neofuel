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
    mockToast: { show: vi.fn() }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

// Ensure this path matches where you think the schema is
vi.mock('../../js/core/business-rules-schema.js', () => ({
    BusinessRulesSchema: { parse: (d: any) => d },
    DEFAULT_BUSINESS_RULES: {}
}));

import { BusinessLogicManager } from '../../js/core/business-logic-manager.js';

describe('Business Logic Manager', () => {
    it('should load rules', async () => {
        mockSupabase.storage.from().download.mockResolvedValue({
            data: new Blob([JSON.stringify({})], { type: 'application/json' }),
            error: null
        });

        const rules = await BusinessLogicManager.loadRules();
        expect(rules).toBeDefined();
    });
});
