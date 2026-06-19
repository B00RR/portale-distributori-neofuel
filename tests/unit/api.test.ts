import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Hoisted mocks
const { mockQueueAction, mockToast } = vi.hoisted(() => ({
    mockQueueAction: vi.fn().mockResolvedValue('queued-id'),
    mockToast: { show: vi.fn() }
}));

// Mock Fetch Global
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../js/core/offline-queue.js', () => ({ queueAction: mockQueueAction }));
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

    it('safeSupabaseQuery should not queue an offline mutation without a structured action', async () => {
        Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true });

        const mockRes = { error: { message: 'Fetch failed' }, data: null };
        const mutationFn = () => Promise.resolve(mockRes);

        await expect(safeSupabaseQuery(mutationFn as unknown as Parameters<typeof safeSupabaseQuery>[0])).rejects.toThrow('Fetch failed');
        expect(mockQueueAction).not.toHaveBeenCalled();
    });

    it('safeSupabaseQuery should queue only structured offline actions', async () => {
        Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true });

        const mockRes = { error: { message: 'Fetch failed' }, data: null };
        const mutationFn = () => Promise.resolve(mockRes);
        const offlineAction = {
            type: 'voucher_redeem' as const,
            payload: { voucherCode: 'ABCD1234', stationId: '1', operatorId: 'operator-auth-id' }
        };

        const result = await safeSupabaseQuery(
            mutationFn as unknown as Parameters<typeof safeSupabaseQuery>[0],
            'Errore nella query',
            offlineAction
        );

        expect((result as Partial<typeof result> & { offline: boolean }).offline).toBe(true);
        expect(mockQueueAction).toHaveBeenCalledWith(offlineAction.type, offlineAction.payload);
        expect(mockToast.show).toHaveBeenCalled();
    });
});
