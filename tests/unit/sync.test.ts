import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToast, mockOfflineDB } = vi.hoisted(() => ({
    mockToast: { show: vi.fn() },
    mockOfflineDB: {
        getQueueCount: vi.fn(),
        getQueue: vi.fn(),
        dequeue: vi.fn()
    }
}));

vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/core/offline-db.js', () => ({
    offlineDB: mockOfflineDB,
    QueuedMutation: {}
}));

// Mock window event listeners
global.addEventListener = vi.fn();
global.dispatchEvent = vi.fn();

import { syncManager } from '../../js/core/sync.js';

describe('Sync Manager Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        syncManager.isSyncing = false;
    });

    describe('initialization', () => {
        it('should register online event listener on init', () => {
            expect(global.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
        });
    });

    describe('sync', () => {
        it('should not sync if already syncing', async () => {
            syncManager.isSyncing = true;

            await syncManager.sync();

            expect(mockOfflineDB.getQueueCount).not.toHaveBeenCalled();
        });

        it('should not sync if offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false
            });

            await syncManager.sync();

            expect(mockOfflineDB.getQueueCount).not.toHaveBeenCalled();
        });

        it('should not sync if queue is empty', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
            mockOfflineDB.getQueueCount.mockResolvedValue(0);

            await syncManager.sync();

            expect(mockOfflineDB.getQueue).not.toHaveBeenCalled();
        });

        it('should process queue items when online and queue has items', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
            mockOfflineDB.getQueueCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
            mockOfflineDB.getQueue.mockResolvedValue([
                { id: 1, table: 'shifts', action: 'insert' },
                { id: 2, table: 'vouchers', action: 'update' }
            ]);
            mockOfflineDB.dequeue.mockResolvedValue(undefined);

            await syncManager.sync();

            expect(mockOfflineDB.getQueue).toHaveBeenCalled();
            expect(mockOfflineDB.dequeue).toHaveBeenCalledWith(1);
            expect(mockOfflineDB.dequeue).toHaveBeenCalledWith(2);
        });

        it('should show success toast when all synced', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
            mockOfflineDB.getQueueCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
            mockOfflineDB.getQueue.mockResolvedValue([{ id: 1 }]);
            mockOfflineDB.dequeue.mockResolvedValue(undefined);

            await syncManager.sync();

            expect(mockToast.show).toHaveBeenCalledWith(
                expect.stringContaining('sincronizzati con successo'),
                'success'
            );
        });

        it('should show warning when items remain', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
            mockOfflineDB.getQueueCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
            mockOfflineDB.getQueue.mockResolvedValue([{ id: 1 }, { id: 2 }]);
            mockOfflineDB.dequeue.mockResolvedValue(undefined);

            await syncManager.sync();

            expect(mockToast.show).toHaveBeenCalledWith(
                expect.stringContaining('1'),
                'warning'
            );
        });

        it('should dispatch custom event after sync', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
            mockOfflineDB.getQueueCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
            mockOfflineDB.getQueue.mockResolvedValue([{ id: 1 }]);
            mockOfflineDB.dequeue.mockResolvedValue(undefined);

            const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

            await syncManager.sync();

            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'sync-status-changed'
                })
            );
        });

        it('should handle sync errors gracefully', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
            mockOfflineDB.getQueueCount.mockRejectedValue(new Error('DB error'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await syncManager.sync();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should reset isSyncing flag after completion', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
            mockOfflineDB.getQueueCount.mockResolvedValue(0);

            expect(syncManager.isSyncing).toBe(false);

            const syncPromise = syncManager.sync();
            expect(syncManager.isSyncing).toBe(true);

            await syncPromise;
            expect(syncManager.isSyncing).toBe(false);
        });
    });
});
