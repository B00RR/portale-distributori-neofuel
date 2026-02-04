import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockSupabase, mockToast } = vi.hoisted(() => {
    return {
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
    };
});

// Mock dependencies
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
        fuel_reserve_threshold_liters: 1000,
        shift_stale_hours: 24,
        updated_at: '2024-01-01T00:00:00Z'
    }
}));

// Import module under test
import { BusinessLogicManager } from '../../js/core/business-logic-manager.js';

describe('Business Logic Manager', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
    });

    describe('loadRules', () => {
        it('should return cached rules if available', async () => {
            // First load to populate cache
            const mockBlob = new Blob([JSON.stringify({
                fuel_reserve_threshold_liters: 500,
                shift_stale_hours: 12,
                updated_at: '2024-02-01T00:00:00Z'
            })], { type: 'application/json' });

            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({ data: mockBlob, error: null })
            });

            const firstResult = await BusinessLogicManager.loadRules();
            expect(firstResult.fuel_reserve_threshold_liters).toBe(500);

            // Second call should use cache
            const secondResult = await BusinessLogicManager.loadRules();
            expect(secondResult).toEqual(firstResult);
            expect(mockSupabase.storage.from).toHaveBeenCalledTimes(1); // Only called once
        });

        it('should fetch from storage if not cached', async () => {
            const mockBlob = new Blob([JSON.stringify({
                fuel_reserve_threshold_liters: 800,
                shift_stale_hours: 18,
                updated_at: '2024-03-01T00:00:00Z'
            })], { type: 'application/json' });

            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({ data: mockBlob, error: null })
            });

            const result = await BusinessLogicManager.loadRules();

            expect(result.fuel_reserve_threshold_liters).toBe(800);
            expect(result.shift_stale_hours).toBe(18);
            expect(mockSupabase.storage.from).toHaveBeenCalledWith('system');
        });

        it('should return defaults if file not found (404)', async () => {
            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Object not found', status: 404 }
                })
            });

            const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => { });
            const result = await BusinessLogicManager.loadRules();

            expect(result.fuel_reserve_threshold_liters).toBe(1000);
            expect(result.shift_stale_hours).toBe(24);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Config not found'));
            consoleSpy.mockRestore();
        });

        it('should return defaults if download fails', async () => {
            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Download error', status: 500 }
                })
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const result = await BusinessLogicManager.loadRules();

            expect(result.fuel_reserve_threshold_liters).toBe(1000);
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should handle JSON parse errors gracefully', async () => {
            const invalidBlob = new Blob(['invalid json'], { type: 'application/json' });

            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({ data: invalidBlob, error: null })
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const result = await BusinessLogicManager.loadRules();

            expect(result).toEqual(expect.objectContaining({
                fuel_reserve_threshold_liters: 1000,
                shift_stale_hours: 24
            }));
            consoleSpy.mockRestore();
        });
    });

    describe('saveRules', () => {
        it('should successfully save rules to storage', async () => {
            const currentRules = {
                fuel_reserve_threshold_liters: 1000,
                shift_stale_hours: 24,
                updated_at: '2024-01-01T00:00:00Z'
            };

            const mockBlob = new Blob([JSON.stringify(currentRules)], { type: 'application/json' });

            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
                upload: vi.fn().mockResolvedValue({ data: {}, error: null })
            });

            const newRules = { fuel_reserve_threshold_liters: 1200 };
            await BusinessLogicManager.saveRules(newRules);

            expect(mockSupabase.storage.from).toHaveBeenCalledWith('system');
            expect(mockToast.show).toHaveBeenCalledWith(
                'Regole di business aggiornate con successo',
                'success'
            );
        });

        it('should merge new rules with existing rules', async () => {
            const currentRules = {
                fuel_reserve_threshold_liters: 1000,
                shift_stale_hours: 24,
                updated_at: '2024-01-01T00:00:00Z'
            };

            const mockBlob = new Blob([JSON.stringify(currentRules)], { type: 'application/json' });

            let uploadedData: any = null;
            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
                upload: vi.fn((path, file) => {
                    file.text().then((text: string) => {
                        uploadedData = JSON.parse(text);
                    });
                    return Promise.resolve({ data: {}, error: null });
                })
            });

            await BusinessLogicManager.saveRules({ shift_stale_hours: 36 });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(uploadedData.fuel_reserve_threshold_liters).toBe(1000);
            expect(uploadedData.shift_stale_hours).toBe(36);
        });

        it('should handle upload errors', async () => {
            const currentRules = {
                fuel_reserve_threshold_liters: 1000,
                shift_stale_hours: 24,
                updated_at: '2024-01-01T00:00:00Z'
            };

            const mockBlob = new Blob([JSON.stringify(currentRules)], { type: 'application/json' });

            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
                upload: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Upload failed' }
                })
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await expect(BusinessLogicManager.saveRules({ fuel_reserve_threshold_liters: 1500 }))
                .rejects.toThrow();

            expect(mockToast.show).toHaveBeenCalledWith(
                expect.stringContaining('Errore nel salvataggio'),
                'error'
            );
            consoleSpy.mockRestore();
        });

        it('should validate data before saving with Zod', async () => {
            const currentRules = {
                fuel_reserve_threshold_liters: 1000,
                shift_stale_hours: 24,
                updated_at: '2024-01-01T00:00:00Z'
            };

            const mockBlob = new Blob([JSON.stringify(currentRules)], { type: 'application/json' });

            mockSupabase.storage.from.mockReturnValue({
                download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
                upload: vi.fn().mockResolvedValue({ data: {}, error: null })
            });

            await BusinessLogicManager.saveRules({ fuel_reserve_threshold_liters: 2000 });

            // Zod parse should be called from the mock
            const { BusinessRulesSchema } = await import('../../js/core/business-rules-schema.js');
            expect(BusinessRulesSchema.parse).toHaveBeenCalled();
        });
    });
});
