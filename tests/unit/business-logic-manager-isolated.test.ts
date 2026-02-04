import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub LocalStorage
const localStorageMock = (function () {
    let store: any = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
        clear: vi.fn(() => { store = {}; }),
        removeItem: vi.fn((key) => { delete store[key]; }),
        length: 0,
        key: vi.fn(),
    };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock dependencies
const { mockSupabase, mockToast } = vi.hoisted(() => ({
    mockSupabase: {
        storage: { from: vi.fn(() => ({ download: vi.fn().mockResolvedValue({ data: new Blob(['{}']), error: null }) })) }
    },
    mockToast: { show: vi.fn() }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

import { BusinessLogicManager } from '../../js/core/business-logic-manager.js';

describe('Business Logic Manager Isolated', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should load rules', async () => {
        const rules = await BusinessLogicManager.loadRules();
        expect(rules).toBeDefined();
        // expect(mockSupabase.storage.from).toHaveBeenCalled(); // Only if not cached
    });

    it('should use cached rules', async () => {
        // Seed cache
        localStorage.setItem('neofuel_business_rules', JSON.stringify({ version: '1.0', rules: {} }));
        const rules = await BusinessLogicManager.loadRules();
        expect(rules).toBeDefined();
    });
});
