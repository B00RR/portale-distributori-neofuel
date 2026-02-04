import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Hoist Mock IDB
const { smartIDB } = vi.hoisted(() => {
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
                                const id = val.id || idCounter++;
                                // Auto-assign ID if autoIncrement is assumed (OfflineDB uses autoIncrement: true)
                                const stored = { ...val, id };
                                store.set(id, stored);
                                const r: any = {};
                                setTimeout(() => {
                                    r.result = id;
                                    if (r.onsuccess) r.onsuccess({ target: { result: id } });
                                }, 0);
                                return r;
                            },
                            getAll: () => {
                                const list = Array.from(store.values());
                                const r: any = {};
                                setTimeout(() => {
                                    r.result = list;
                                    if (r.onsuccess) r.onsuccess({ target: { result: list } });
                                }, 0);
                                return r;
                            },
                            delete: (id: any) => {
                                store.delete(id);
                                const r: any = {};
                                setTimeout(() => r.onsuccess && r.onsuccess(), 0);
                                return r;
                            },
                            count: () => {
                                const r: any = {};
                                setTimeout(() => {
                                    r.result = store.size;
                                    if (r.onsuccess) r.onsuccess({ target: { result: store.size } });
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
    return { smartIDB };
});

// Stub Global
vi.stubGlobal('indexedDB', smartIDB);

describe('Offline DB Module', () => {
    let offlineDB: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        smartIDB._reset();

        // Re-stub to be safe
        vi.stubGlobal('indexedDB', smartIDB);

        // Dynamic Import
        const module = await import('../../js/core/offline-db.js');
        offlineDB = module.offlineDB;

        // Wait for DB init
        await new Promise(r => setTimeout(r, 10));
    });

    it('should enqueue mutation', async () => {
        const id = await offlineDB.enqueue({ table: 'test', action: 'insert', data: {} });
        expect(id).toBe(1);

        const count = await offlineDB.getQueueCount();
        expect(count).toBe(1);
    });

    it('should get queue', async () => {
        await offlineDB.enqueue({ table: 't1', action: 'a1' });
        await offlineDB.enqueue({ table: 't2', action: 'a2' });

        const queue = await offlineDB.getQueue();
        expect(queue).toHaveLength(2);
        expect(queue[0].table).toBe('t1');
    });

    it('should dequeue mutation', async () => {
        const id = await offlineDB.enqueue({ table: 't1' });
        await offlineDB.dequeue(id);

        const count = await offlineDB.getQueueCount();
        expect(count).toBe(0);
    });
});
