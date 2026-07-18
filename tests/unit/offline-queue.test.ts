import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockToast, smartIDB } = vi.hoisted(() => {
  const store = new Map();
  let idCounter = 1;
  let failNextDelete = false;

  const smartIDB = {
    open: vi.fn(() => {
      const req: any = {};
      setTimeout(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
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
              get: (id: any) => {
                const value = store.get(id);
                const r: any = {};
                setTimeout(() => {
                  r.result = value;
                  if (r.onsuccess) r.onsuccess({ target: { result: value } });
                }, 0);
                return r;
              },
              delete: (id: any) => {
                const r: any = {};
                setTimeout(() => {
                  if (failNextDelete) {
                    failNextDelete = false;
                    r.error = new Error('delete failed');
                    if (r.onerror) r.onerror();
                    return;
                  }
                  store.delete(id);
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
    _reset: () => {
      store.clear();
      idCounter = 1;
      failNextDelete = false;
    },
    _failNextDelete: () => {
      failNextDelete = true;
    }
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
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    smartIDB._reset();
    vi.stubGlobal('indexedDB', smartIDB);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    offlineQueue = await import('../../js/core/offline-queue.js');
    await offlineQueue.initOfflineQueue();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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

  it('should retain exhausted rejected actions in the failed queue', async () => {
    const executor = vi.fn().mockResolvedValue(false);
    offlineQueue.registerExecutor('voucher_redeem', executor);

    await offlineQueue.queueAction('voucher_redeem', { voucherCode: 'ABCD1234' });

    await offlineQueue.syncPendingActions();
    await offlineQueue.syncPendingActions();
    const result = await offlineQueue.syncPendingActions();

    expect(result).toEqual({ success: 0, failed: 1 });
    expect(executor).toHaveBeenCalledTimes(3);
    expect(await offlineQueue.getPendingActions()).toHaveLength(0);
    expect(await offlineQueue.getFailedActions()).toEqual([
      expect.objectContaining({ retryCount: 3, status: 'failed' })
    ]);
  });

  it('should retain exhausted thrown actions in the failed queue', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('network error'));
    offlineQueue.registerExecutor('shift_close', executor);

    await offlineQueue.queueAction('shift_close', { shiftId: '1' });

    await offlineQueue.syncPendingActions();
    await offlineQueue.syncPendingActions();
    const result = await offlineQueue.syncPendingActions();

    expect(result).toEqual({ success: 0, failed: 1 });
    expect(executor).toHaveBeenCalledTimes(3);
    expect(await offlineQueue.getPendingActions()).toHaveLength(0);
    expect(await offlineQueue.getFailedActions()).toEqual([
      expect.objectContaining({ retryCount: 3, status: 'failed', lastError: 'network error' })
    ]);
  });

  it('should quarantine a remotely completed action when local deletion fails', async () => {
    const executor = vi.fn().mockResolvedValue(true);
    offlineQueue.registerExecutor('shift_close', executor);
    await offlineQueue.queueAction('shift_close', { shiftId: '1' });
    smartIDB._failNextDelete();

    expect(await offlineQueue.syncPendingActions()).toEqual({ success: 0, failed: 1 });
    expect(await offlineQueue.getPendingActions()).toHaveLength(0);
    expect(await offlineQueue.getFailedActions()).toEqual([
      expect.objectContaining({
        status: 'quarantined',
        errorType: 'permanent',
        lastError: expect.stringContaining('rimozione locale fallita')
      })
    ]);

    expect(await offlineQueue.syncPendingActions()).toEqual({ success: 0, failed: 0 });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('should keep queued actions when no executor is registered', async () => {
    await offlineQueue.queueAction('shift_close', { shiftId: '1' });

    const result = await offlineQueue.syncPendingActions();
    const pending = await offlineQueue.getPendingActions();

    expect(result).toEqual({ success: 0, failed: 1 });
    expect(pending).toHaveLength(1);
    expect(consoleErrorSpy.mock.calls.length + consoleWarnSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('deduplicates pending update actions for the same entity (#107)', async () => {
    const firstId = await offlineQueue.queueAction('generic', {
      operation: 'update',
      entityType: 'invoice',
      entityId: '123',
      changes: { status: 'draft', note: 'first' }
    });
    const secondId = await offlineQueue.queueAction('generic', {
      operation: 'update',
      entityType: 'invoice',
      entityId: '123',
      changes: { status: 'paid' }
    });

    const pending = await offlineQueue.getPendingActions();

    expect(secondId).toBe(firstId);
    expect(pending).toHaveLength(1);
    expect(pending[0].payload).toMatchObject({
      operation: 'update',
      entityType: 'invoice',
      entityId: '123',
      changes: { status: 'paid' }
    });
    expect(pending[0].retryCount).toBe(0);
  });

  it('does not deduplicate creates without update semantics (#107)', async () => {
    await offlineQueue.queueAction('movement_create', {
      operation: 'create',
      entityType: 'movement',
      entityId: '123',
      amount: 10
    });
    await offlineQueue.queueAction('movement_create', {
      operation: 'create',
      entityType: 'movement',
      entityId: '123',
      amount: 20
    });

    expect(await offlineQueue.getPendingActions()).toHaveLength(2);
  });

  it('does not execute the same action twice when sync is called concurrently', async () => {
    const mockExecutor = vi.fn().mockResolvedValue(true);
    offlineQueue.registerExecutor('generic', mockExecutor);

    await offlineQueue.queueAction('generic', { testData: 'concurrency-test' });
    await new Promise(r => setTimeout(r, 20));

    const [resultA, resultB] = await Promise.all([
      offlineQueue.syncPendingActions(),
      offlineQueue.syncPendingActions()
    ]);

    expect(resultA.success).toBe(1);
    expect(resultB.success).toBe(1);
    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(await offlineQueue.getPendingActions()).toHaveLength(0);
  });

  it('keeps a newer deduplicated payload queued while the previous revision is syncing', async () => {
    let releaseExecutor!: () => void;
    let markStarted!: () => void;
    const executorStarted = new Promise<void>(resolve => {
      markStarted = resolve;
    });
    const executorRelease = new Promise<void>(resolve => {
      releaseExecutor = resolve;
    });
    const executor = vi.fn(async () => {
      markStarted();
      await executorRelease;
      return true;
    });
    offlineQueue.registerExecutor('generic', executor);

    const originalId = await offlineQueue.queueAction('generic', {
      operation: 'update',
      entityType: 'invoice',
      entityId: 'concurrent-1',
      changes: { status: 'draft' }
    });

    const sync = offlineQueue.syncPendingActions();
    await executorStarted;

    const updatedId = await offlineQueue.queueAction('generic', {
      operation: 'update',
      entityType: 'invoice',
      entityId: 'concurrent-1',
      changes: { status: 'paid' }
    });
    releaseExecutor();

    expect(updatedId).toBe(originalId);
    expect(await sync).toEqual({ success: 1, failed: 0 });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[0][0].payload.changes).toEqual({ status: 'draft' });
    expect(await offlineQueue.getPendingActions()).toEqual([
      expect.objectContaining({
        id: originalId,
        revision: 2,
        payload: expect.objectContaining({ changes: { status: 'paid' } })
      })
    ]);
  });
});
