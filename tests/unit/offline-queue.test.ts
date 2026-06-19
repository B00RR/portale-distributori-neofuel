import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToast, smartIDB } = vi.hoisted(() => {
    const store = new Map();
    let idCounter = 1;

    const smartIDB = {
        open: vi.fn(() => {
            const req: any = {};
            setTimeout(() => {
                req.result = {
                    objectStoreNames: { contains: () => true },
                    createObjectStore: () => { },
                    transaction: () => ({
                        objectStore: () => ({
                            add: (val: any) => {
                                const id = val.id || `auto-${idCounter++}`;
                                store.set(id, val);
                                const r: any = {};
                                setTimeout(() => {
                                    r.result = id; // Fix: Set result on request
                                    if (r.onsuccess) r.onsuccess({ target: { result: id } });
                                }, 0);
                                return r;
                            },
                            getAll: () => {
                                const list = Array.from(store.values());
                                const r: any = {};
                                setTimeout(() => {
                                    r.result = list; // Fix: Set result on request
                                    if (r.onsuccess) r.onsuccess({ target: { result: list } });
                                }, 0);
                                return r;
                            },
                            delete: (id: any) => {
                                store.delete(id);
                                const r: any = {};
                                setTimeout(() => {
                                    r.result = undefined;
                                    if (r.onsuccess) r.onsuccess();
                                }, 0);
                                return r;
                            },
                            put: (val: any) => {
                                store.set(val.id, val);
                                const r: any = {};
                                setTimeout(() => {
                                    r.result = val.id;
                                    if (r.onsuccess) r.onsuccess({ target: { result: val.id } });
                                }, 0);
                                return r;
                            }
                        })
                    })
                };
                if (req.onsuccess) req.onsuccess({ target: { result: req.result } });
            }, 0);
            return req;
        }),
        _reset: () => { store.clear(); idCounter = 1; }
    };

    return {
        mockToast: { show: vi.fn() },
        smartIDB
    };
});

vi.stubGlobal('indexedDB', smartIDB);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

describe('Offline Queue Module', () => {
    let offlineQueue: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        smartIDB._reset();
        vi.stubGlobal('indexedDB', smartIDB);

        offlineQueue = await import('../../js/core/offline-queue.js');
        await offlineQueue.initOfflineQueue();
    });

    it('should queue and sync actions', async () => {
        const executor = vi.fn().mockResolvedValue(true);
        offlineQueue.registerExecutor('generic', executor);

        await offlineQueue.queueAction('generic', { a: 1 });
        await new Promise(r => setTimeout(r, 20));

        const pending = await offlineQueue.getPendingActions();
        expect(pending.length).toBeGreaterThan(0);

        const result = await offlineQueue.syncPendingActions();
        expect(result.success).toBe(1);
        expect(executor).toHaveBeenCalled();
        expect(await offlineQueue.getPendingActions()).toHaveLength(0);
    });

    it('should keep queued actions when executor fails', async () => {
        const executor = vi.fn().mockResolvedValue(false);
        offlineQueue.registerExecutor('voucher_redeem', executor);

        await offlineQueue.queueAction('voucher_redeem', { voucherCode: 'ABCD1234' });

        const result = await offlineQueue.syncPendingActions();
        const pending = await offlineQueue.getPendingActions();

        expect(result).toEqual({ success: 0, failed: 1 });
        expect(pending).toHaveLength(1);
        expect(pending[0].retryCount).toBe(1);
    });

    it('should keep queued actions when no executor is registered', async () => {
        await offlineQueue.queueAction('shift_close', { shiftId: '1' });

        const result = await offlineQueue.syncPendingActions();
        const pending = await offlineQueue.getPendingActions();

        expect(result).toEqual({ success: 0, failed: 1 });
        expect(pending).toHaveLength(1);
    });
});
