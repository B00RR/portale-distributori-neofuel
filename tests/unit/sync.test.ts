import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToast, mockOfflineDB } = vi.hoisted(() => ({
    mockToast: { show: vi.fn() },
    mockOfflineDB: {
        getQueue: vi.fn().mockResolvedValue([]),
        dequeue: vi.fn().mockResolvedValue(true),
        getQueueCount: vi.fn().mockResolvedValue(0)
    }
}));

vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/core/offline-db.js', () => ({ offlineDB: mockOfflineDB }));
vi.mock('../../js/core/api.js', () => ({ supabase: { from: vi.fn() } }));

import { SyncManager } from '../../js/core/sync.js';

describe('Sync Manager Module', () => {
    let syncManager: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        const module = await import('../../js/core/sync.js');
        // If singleton, we might need to reset state if possible or rely on fresh import
        syncManager = module.syncManager;
        if (syncManager) syncManager.isSyncing = false; // Reset flag manually
    });

    it('should handle sync errors gracefully', async () => {
        mockOfflineDB.getQueueCount.mockRejectedValue(new Error('DB Fail'));

        try {
            await syncManager.sync();
        } catch (e) {
            // If it throws, we catch it.
        }

        expect(syncManager.isSyncing).toBe(false);
    });

    it('should reset isSyncing flag after completion', async () => {
        mockOfflineDB.getQueueCount.mockResolvedValue(1);
        mockOfflineDB.getQueue.mockResolvedValue([]);

        await syncManager.sync();
        expect(syncManager.isSyncing).toBe(false);
    });
});
