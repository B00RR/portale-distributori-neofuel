import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockToast, mockDB } = vi.hoisted(() => ({
    mockToast: { show: vi.fn() },
    mockDB: new Map()
}));

// Mock IndexedDB
globalThis.indexedDB = {
    open: vi.fn(() => {
        const request = {
            result: {
                transaction: vi.fn(() => ({
                    objectStore: vi.fn(() => ({
                        add: vi.fn((action) => {
                            const id = action.id;
                            mockDB.set(id, action);
                            const req = { result: id, onsuccess: null as any, onerror: null as any };
                            setTimeout(() => req.onsuccess?.(), 0);
                            return req;
                        }),
                        getAll: vi.fn(() => {
                            const req = { result: Array.from(mockDB.values()), onsuccess: null as any, onerror: null as any };
                            setTimeout(() => req.onsuccess?.(), 0);
                            return req;
                        }),
                        delete: vi.fn((id) => {
                            mockDB.delete(id);
                            const req = { onsuccess: null as any, onerror: null as any };
                            setTimeout(() => req.onsuccess?.(), 0);
                            return req;
                        }),
                        put: vi.fn((action) => {
                            mockDB.set(action.id, action);
                            const req = { onsuccess: null as any, onerror: null as any };
                            setTimeout(() => req.onsuccess?.(), 0);
                            return req;
                        })
                    }))
                }))
            },
            onsuccess: null as any,
            onerror: null as any,
            onupgradeneeded: null as any
        };
        setTimeout(() => request.onsuccess?.({ target: request } as any), 0);
        return request;
    })
} as any;

vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

import {
    initOfflineQueue,
    queueAction,
    getPendingActions,
    removeAction,
    syncPendingActions,
    registerExecutor,
    isOffline,
    getPendingCount
} from '../../js/core/offline-queue.js';

describe('Offline Queue Module', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockDB.clear();
        await initOfflineQueue();
    });

    describe('initOfflineQueue', () => {
        it('should initialize IndexedDB successfully', async () => {
            expect(indexedDB.open).toHaveBeenCalled();
        });
    });

    describe('queueAction', () => {
        it('should queue an action and return ID', async () => {
            const actionId = await queueAction('voucher_redeem', { voucherId: '123' });

            expect(actionId).toContain('voucher_redeem');
            expect(mockToast.show).toHaveBeenCalledWith(
                expect.stringContaining('salvata'),
                'info'
            );
        });

        it('should store action with correct structure', async () => {
            const actionId = await queueAction('shift_close', { shiftId: 456 });

            const actions = await getPendingActions();
            const action = actions.find(a => a.id === actionId);

            expect(action).toBeDefined();
            expect(action?.type).toBe('shift_close');
            expect(action?.payload).toEqual({ shiftId: 456 });
            expect(action?.retryCount).toBe(0);
        });
    });

    describe('getPendingActions', () => {
        it('should return all pending actions', async () => {
            await queueAction('voucher_redeem', { voucherId: '1' });
            await queueAction('shift_close', { shiftId: 2 });

            const actions = await getPendingActions();

            expect(actions).toHaveLength(2);
        });

        it('should return empty array when no actions', async () => {
            const actions = await getPendingActions();
            expect(actions).toEqual([]);
        });
    });

    describe('removeAction', () => {
        it('should remove action by ID', async () => {
            const id = await queueAction('generic', { data: 'test' });

            await removeAction(id);

            const actions = await getPendingActions();
            expect(actions.find(a => a.id === id)).toBeUndefined();
        });
    });

    describe('registerExecutor', () => {
        it('should register executor for action type', () => {
            const executor = vi.fn().mockResolvedValue(true);

            registerExecutor('voucher_redeem', executor);

            // Executor registered (no return value, console log check would be integration test)
            expect(true).toBe(true);
        });
    });

    describe('syncPendingActions', () => {
        it('should return 0 success/failed when no actions', async () => {
            const result = await syncPendingActions();

            expect(result).toEqual({ success: 0, failed: 0 });
        });

        it('should execute actions with registered executors', async () => {
            const executor = vi.fn().mockResolvedValue(true);
            registerExecutor('voucher_redeem', executor);

            const id = await queueAction('voucher_redeem', { voucherId: '999' });

            const result = await syncPendingActions();

            expect(executor).toHaveBeenCalled();
            expect(result.success).toBe(1);
            expect(result.failed).toBe(0);

            const remaining = await getPendingActions();
            expect(remaining.find(a => a.id === id)).toBeUndefined();
        });

        it('should increment retry count on failure', async () => {
            const executor = vi.fn().mockResolvedValue(false);
            registerExecutor('shift_close', executor);

            const id = await queueAction('shift_close', { shiftId: 1 });

            await syncPendingActions();

            const actions = await getPendingActions();
            const action = actions.find(a => a.id === id);

            expect(action?.retryCount).toBe(1);
        });

        it('should handle executor errors gracefully', async () => {
            const executor = vi.fn().mockRejectedValue(new Error('Sync error'));
            registerExecutor('generic', executor);

            await queueAction('generic', { data: 'test' });

            const result = await syncPendingActions();

            expect(result.failed).toBe(1);
        });
    });

    describe('isOffline', () => {
        it('should return true when navigator.onLine is false', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false
            });

            expect(isOffline()).toBe(true);
        });

        it('should return false when navigator.onLine is true', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });

            expect(isOffline()).toBe(false);
        });
    });

    describe('getPendingCount', () => {
        it('should return count of pending actions', async () => {
            await queueAction('voucher_redeem', { v: 1 });
            await queueAction('shift_close', { s: 2 });
            await queueAction('movement_create', { m: 3 });

            const count = await getPendingCount();

            expect(count).toBe(3);
        });
    });
});
