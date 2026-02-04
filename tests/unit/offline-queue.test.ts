import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for map
const { mockDB } = vi.hoisted(() => ({
    mockDB: new Map()
}));

const mockIndexedDB = {
    open: vi.fn(() => ({
        result: {
            objectStoreNames: { contains: vi.fn(() => false) },
            createObjectStore: vi.fn(),
            transaction: vi.fn(() => ({
                objectStore: vi.fn(() => ({
                    add: vi.fn((action) => {
                        mockDB.set(action.id, action);
                        const req = { onsuccess: null as any };
                        setTimeout(() => req.onsuccess?.(), 0);
                        return req;
                    }),
                    getAll: vi.fn(() => {
                        const all = Array.from(mockDB.values());
                        const req = { onsuccess: null as any, result: all };
                        setTimeout(() => req.onsuccess?.(), 0);
                        return req;
                    }),
                    delete: vi.fn((id) => {
                        mockDB.delete(id);
                        const req = { onsuccess: null as any };
                        setTimeout(() => req.onsuccess?.(), 0);
                        return req;
                    }),
                    put: vi.fn()
                }))
            }))
        },
        onsuccess: null as any
    }))
};

global.indexedDB = mockIndexedDB as any;
vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: vi.fn() } }));

import { initOfflineQueue, queueAction, syncPendingActions, registerExecutor } from '../../js/core/offline-queue.js';

describe('Offline Queue Module', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockDB.clear();
        await initOfflineQueue();
    });

    it('should sync pending actions', async () => {
        const executor = vi.fn().mockResolvedValue(true);
        registerExecutor('mock-action', executor);

        // Add action
        await queueAction('mock-action', { data: 123 });

        // Ensure async operations complete
        await new Promise(r => setTimeout(r, 10));

        const result = await syncPendingActions();

        expect(result.success).toBe(1);
        expect(executor).toHaveBeenCalled();
    });
});
