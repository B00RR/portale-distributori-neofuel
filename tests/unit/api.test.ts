import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({})
        });
        Object.defineProperty(global.navigator, 'onLine', { value: true, writable: true });
    });

    it('safeSupabaseQuery should return full result object on success', async () => {
        const mockRes = { data: 'success', error: null };
        const queryFn = () => Promise.resolve(mockRes);

        const result = await safeSupabaseQuery(queryFn as any);
        expect(result).toEqual(mockRes);
    });

    it('safeSupabaseQuery should throw normal error on failure (online)', async () => {
        const mockRes = { data: null, error: { message: 'DB Fail' } };
        const queryFn = () => Promise.resolve(mockRes);

        await expect(safeSupabaseQuery(queryFn as any)).rejects.toThrow('DB Fail');
    });

    it('safeSupabaseQuery should handle offline mutation', async () => {
        // Simulate Offline
        Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true });

        const mockRes = { error: { message: 'Fetch failed' }, data: null };
        // Mutation function (detected by .toString() usually or if error is fetch related)
        const mutationFn = () => Promise.resolve(mockRes);
        mutationFn.toString = () => "function() { return supabase.from('x').insert(...) }";

        const result = await safeSupabaseQuery(mutationFn as any);

        expect(result.offline).toBe(true);
        expect(mockOfflineDB.enqueue).toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalled();
    });
});
