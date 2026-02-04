import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create fresh mocks for each test to avoid cache pollution
const createFreshMocks = () => ({
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
});

// Module-level state that gets reset per test
let mocks: ReturnType<typeof createFreshMocks>;

// Use dynamic imports to reset module cache
beforeEach(async () => {
    mocks = createFreshMocks();

    vi.resetModules();

    // Re-mock dependencies with fresh instances
    vi.doMock('../../js/core/api.js', () => ({ supabase: mocks.mockSupabase }));
    vi.doMock('../../js/ui/toast.js', () => ({ Toast: mocks.mockToast }));
    vi.doMock('../../js/core/business-rules-schema.js', () => ({
        BusinessRulesSchema: {
            parse: vi.fn((data) => data)
        },
        DEFAULT_BUSINESS_RULES: {
            fuel_reserve_threshold_liters: 1000,
            shift_stale_hours: 24,
            updated_at: '2024-01-01T00:00:00Z'
        }
    }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('Business Logic Manager - Cache Isolation', () => {
    it('should load rules from storage when not cached', async () => {
        const mockBlob = new Blob([JSON.stringify({
            fuel_reserve_threshold_liters: 800,
            shift_stale_hours: 18,
            updated_at: '2024-03-01T00:00:00Z'
        })], { type: 'application/json' });

        mocks.mockSupabase.storage.from.mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null })
        });

        const { BusinessLogicManager } = await import('../../js/core/business-logic-manager.js');
        const result = await BusinessLogicManager.loadRules();

        expect(result.fuel_reserve_threshold_liters).toBe(800);
        expect(result.shift_stale_hours).toBe(18);
    });

    it('should return defaults if file not found (404)', async () => {
        mocks.mockSupabase.storage.from.mockReturnValue({
            download: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Object not found', status: 404 }
            })
        });

        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => { });
        const { BusinessLogicManager } = await import('../../js/core/business-logic-manager.js');
        const result = await BusinessLogicManager.loadRules();

        expect(result.fuel_reserve_threshold_liters).toBe(1000);
        expect(result.shift_stale_hours).toBe(24);
        consoleSpy.mockRestore();
    });

    it('should return defaults if download fails with error', async () => {
        mocks.mockSupabase.storage.from.mockReturnValue({
            download: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Download error', status: 500 }
            })
        });

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const { BusinessLogicManager } = await import('../../js/core/business-logic-manager.js');
        const result = await BusinessLogicManager.loadRules();

        expect(result.fuel_reserve_threshold_liters).toBe(1000);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should handle JSON parse errors gracefully', async () => {
        const invalidBlob = new Blob(['invalid json'], { type: 'application/json' });

        mocks.mockSupabase.storage.from.mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: invalidBlob, error: null })
        });

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const { BusinessLogicManager } = await import('../../js/core/business-logic-manager.js');
        const result = await BusinessLogicManager.loadRules();

        expect(result).toEqual(expect.objectContaining({
            fuel_reserve_threshold_liters: 1000,
            shift_stale_hours: 24
        }));
        consoleSpy.mockRestore();
    });

    it('should successfully save rules to storage', async () => {
        const currentRules = {
            fuel_reserve_threshold_liters: 1000,
            shift_stale_hours: 24,
            updated_at: '2024-01-01T00:00:00Z'
        };

        const mockBlob = new Blob([JSON.stringify(currentRules)], { type: 'application/json' });

        mocks.mockSupabase.storage.from.mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
            upload: vi.fn().mockResolvedValue({ data: {}, error: null })
        });

        const { BusinessLogicManager } = await import('../../js/core/business-logic-manager.js');
        await BusinessLogicManager.saveRules({ fuel_reserve_threshold_liters: 1200 });

        expect(mocks.mockSupabase.storage.from).toHaveBeenCalledWith('system');
        expect(mocks.mockToast.show).toHaveBeenCalledWith(
            'Regole di business aggiornate con successo',
            'success'
        );
    });
});
