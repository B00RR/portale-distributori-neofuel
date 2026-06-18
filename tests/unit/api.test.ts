import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Hoisted mocks
const { mockOfflineDB, mockToast } = vi.hoisted(() => ({
    mockOfflineDB: { enqueue: vi.fn().mockResolvedValue(true) },
    mockToast: { show: vi.fn() }
}));

// Mock Fetch Global
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../js/core/offline-db.js', () => ({ offlineDB: mockOfflineDB }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

import { safeSupabaseQuery } from '../../js/core/api.js';

describe('API Module', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({})
        });
        Object.defineProperty(global.navigator, 'onLine', { value: true, writable: true });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('safeSupabaseQuery should return full result object on success', async () => {
        const mockRes = { data: 'success', error: null };
        const queryFn = () => Promise.resolve(mockRes);

        const result = await safeSupabaseQuery(queryFn as unknown as Parameters<typeof safeSupabaseQuery>[0]);
        expect(result).toEqual(mockRes);
    });

    it('safeSupabaseQuery should throw normal error on failure (online)', async () => {
        const mockRes = { data: null, error: { message: 'DB Fail' } };
        const queryFn = () => Promise.resolve(mockRes);

        await expect(safeSupabaseQuery(queryFn as unknown as Parameters<typeof safeSupabaseQuery>[0])).rejects.toThrow('DB Fail');
    });

    it('safeSupabaseQuery should handle offline mutation', async () => {
        // Simulate Offline
        Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true });

        const mockRes = { error: { message: 'Fetch failed' }, data: null };
        // Mutation function (detected by .toString() usually or if error is fetch related)
        const mutationFn = () => Promise.resolve(mockRes);
        mutationFn.toString = () => "function() { return supabase.from('x').insert(...) }";

        const result = await safeSupabaseQuery(mutationFn as unknown as Parameters<typeof safeSupabaseQuery>[0]);

        expect((result as Partial<typeof result> & { offline: boolean }).offline).toBe(true);
        expect(mockOfflineDB.enqueue).toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalled();
    });
});
