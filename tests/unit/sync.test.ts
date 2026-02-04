import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Setup mocks before imports
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

// 2. Mock specific globals if needed (properties)
Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

describe('Sync Manager Module', () => {
    let syncManager: any;
    let addEventListenerSpy: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Reset navigator online
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

        // Spy on window.addEventListener BEFORE importing the module
        // Since the module is a singleton initialized on import, we need to reset/re-import or accept it runs once
        // However, standard ESM mocks run before import.
        // The constructor runs _init() immediately.
        // We can't easily re-run constructor for singleton.
        // But we can check if it WAS called if we spy on window methods.

        // For testing the singleton side-effects on import is tricky.
        // Instead, we will test the methods directly.
        // For the initialization test, we might check if the listener is attached if we could spy before import.
        // But 'vi.spyOn' works on existing objects.

        if (!syncManager) {
            addEventListenerSpy = vi.spyOn(window, 'addEventListener');
            const module = await import('../../js/core/sync.js');
            syncManager = module.syncManager;
        }
    });

    afterEach(() => {
        if (addEventListenerSpy) addEventListenerSpy.mockRestore();
    });

    describe('initialization', () => {
        it('should have registered online event listener', () => {
            // Since singleton initializes on import, check if spy was called
            // Note: This relies on the spy being set up before the first import in this test file execution
            // If other tests imported it, it might be cached. 
            // Vitest isolates test files, so it should be fine.
            expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
        });
    });

    describe('sync', () => {
        it('should process queue items when online and queue has items', async () => {
            syncManager.isSyncing = false;
            mockOfflineDB.getQueueCount.mockResolvedValueOnce(2);
            mockOfflineDB.getQueue.mockResolvedValue([
                { id: 1, table: 'shifts' },
                { id: 2, table: 'vouchers' }
            ]);

            await syncManager.sync();

            expect(mockOfflineDB.getQueue).toHaveBeenCalled();
            expect(mockOfflineDB.dequeue).toHaveBeenCalledTimes(2);
        });

        it('should not sync if offline', async () => {
            syncManager.isSyncing = false;
            Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

            await syncManager.sync();

            expect(mockOfflineDB.getQueueCount).not.toHaveBeenCalled();
        });

        it('should handle sync errors gracefully', async () => {
            syncManager.isSyncing = false;
            mockOfflineDB.getQueueCount.mockRejectedValue(new Error('DB Fail'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await syncManager.sync();

            expect(consoleSpy).toHaveBeenCalled();
            expect(syncManager.isSyncing).toBe(false);
        });

        it('should reset isSyncing flag after completion', async () => {
            syncManager.isSyncing = false;
            // MUST return count > 0 to enter the syncing block
            mockOfflineDB.getQueueCount.mockResolvedValueOnce(1);
            mockOfflineDB.getQueue.mockResolvedValue([]); // Empty queue so it finishes fast

            const syncPromise = syncManager.sync();

            expect(syncManager.isSyncing).toBe(true);
            await syncPromise;
            expect(syncManager.isSyncing).toBe(false);
        });
    });
});
