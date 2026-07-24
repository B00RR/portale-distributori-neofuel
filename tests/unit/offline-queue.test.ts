/** @vitest-environment happy-dom */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
          transaction: (_storeNames?: any, _mode?: any) => {
            let activeOps = 0;
            const tx: any = {
              oncomplete: null as (() => void) | null,
              onerror: null as ((err?: any) => void) | null,
              onabort: null as ((err?: any) => void) | null,
              objectStore: () => ({
                add: (val: any) => {
                  activeOps++;
                  const id = val.id || `auto-${idCounter++}`;
                  store.set(id, val);
                  const r: any = {};
                  setTimeout(() => {
                    r.result = id;
                    if (r.onsuccess) r.onsuccess({ target: { result: id } });
                    activeOps--;
                    if (activeOps === 0 && tx.oncomplete) {
                      tx.oncomplete();
                    }
                  }, 0);
                  return r;
                },
                getAll: () => {
                  activeOps++;
                  const list = Array.from(store.values());
                  const r: any = {};
                  setTimeout(() => {
                    r.result = list;
                    if (r.onsuccess) r.onsuccess({ target: { result: list } });
                    activeOps--;
                    if (activeOps === 0 && tx.oncomplete) {
                      tx.oncomplete();
                    }
                  }, 0);
                  return r;
                },
                get: (id: any) => {
                  activeOps++;
                  const value = store.get(id);
                  const r: any = {};
                  setTimeout(() => {
                    r.result = value;
                    if (r.onsuccess) r.onsuccess({ target: { result: value } });
                    activeOps--;
                    if (activeOps === 0 && tx.oncomplete) {
                      tx.oncomplete();
                    }
                  }, 0);
                  return r;
                },
                delete: (id: any) => {
                  activeOps++;
                  const r: any = {};
                  setTimeout(() => {
                    if (failNextDelete) {
                      failNextDelete = false;
                      r.error = new Error('delete failed');
                      if (r.onerror) r.onerror();
                      if (tx.onerror) tx.onerror(r.error);
                      return;
                    }
                    store.delete(id);
                    r.result = undefined;
                    if (r.onsuccess) r.onsuccess();
                    activeOps--;
                    if (activeOps === 0 && tx.oncomplete) {
                      tx.oncomplete();
                    }
                  }, 0);
                  return r;
                },
                put: (val: any) => {
                  activeOps++;
                  store.set(val.id, val);
                  const r: any = {};
                  setTimeout(() => {
                    r.result = val.id;
                    if (r.onsuccess) r.onsuccess({ target: { result: val.id } });
                    activeOps--;
                    if (activeOps === 0 && tx.oncomplete) {
                      tx.oncomplete();
                    }
                  }, 0);
                  return r;
                },
                openCursor: () => {
                  activeOps++;
                  const r: any = {};
                  const entries = Array.from(store.values());
                  let idx = 0;

                  const step = () => {
                    if (idx < entries.length) {
                      const entry = entries[idx];
                      const cursor = {
                        value: store.get(entry.id) || entry,
                        update: (updatedVal: any) => {
                          store.set(updatedVal.id, updatedVal);
                        },
                        continue: () => {
                          idx++;
                          setTimeout(step, 0);
                        }
                      };
                      r.result = cursor;
                      if (r.onsuccess) {
                        r.onsuccess({ target: { result: cursor } });
                      }
                    } else {
                      r.result = null;
                      if (r.onsuccess) {
                        r.onsuccess({ target: { result: null } });
                      }
                      activeOps--;
                      if (activeOps === 0 && tx.oncomplete) {
                        tx.oncomplete();
                      }
                    }
                  };

                  setTimeout(step, 0);
                  return r;
                }
              })
            };
            return tx;
          }
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
    },
    _getStore: () => store
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
    offlineQueue.setOfflineQueueUserAliases(['user-1', 'user-A', 'user-B', '456', '42']);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should queue and sync actions', async () => {
    const executor = vi.fn().mockResolvedValue(true);
    offlineQueue.registerExecutor('generic', executor);

    await offlineQueue.queueAction('generic', { a: 1 }, { userId: 'user-1' });
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

    await offlineQueue.queueAction(
      'voucher_redeem',
      { voucherCode: 'ABCD1234' },
      { userId: 'user-1' }
    );

    const result = await offlineQueue.syncPendingActions();
    const pending = await offlineQueue.getPendingActions();

    expect(result).toEqual({ success: 0, failed: 1 });
    expect(pending).toHaveLength(1);
    expect(pending[0].retryCount).toBe(1);
  });

  it('should retain exhausted rejected actions in the failed queue', async () => {
    const executor = vi.fn().mockResolvedValue(false);
    offlineQueue.registerExecutor('voucher_redeem', executor);

    await offlineQueue.queueAction(
      'voucher_redeem',
      { voucherCode: 'ABCD1234' },
      { userId: 'user-1' }
    );

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

    await offlineQueue.queueAction('shift_close', { shiftId: '1' }, { userId: 'user-1' });

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
    await offlineQueue.queueAction('shift_close', { shiftId: '1' }, { userId: 'user-1' });
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
    await offlineQueue.queueAction('shift_close', { shiftId: '1' }, { userId: 'user-1' });

    const result = await offlineQueue.syncPendingActions();

    expect(result).toEqual({ success: 0, failed: 1 });
    expect(await offlineQueue.getPendingActions()).toHaveLength(0);
    expect(await offlineQueue.getFailedActions()).toHaveLength(1);
    expect(consoleErrorSpy.mock.calls.length + consoleWarnSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('deduplicates pending update actions for the same entity (#107)', async () => {
    const firstId = await offlineQueue.queueAction(
      'generic',
      {
        operation: 'update',
        entityType: 'invoice',
        entityId: '123',
        changes: { status: 'draft', note: 'first' }
      },
      { userId: 'user-1' }
    );
    const secondId = await offlineQueue.queueAction(
      'generic',
      {
        operation: 'update',
        entityType: 'invoice',
        entityId: '123',
        changes: { status: 'paid' }
      },
      { userId: 'user-1' }
    );

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
    await offlineQueue.queueAction(
      'movement_create',
      {
        operation: 'create',
        entityType: 'movement',
        entityId: '123',
        amount: 10
      },
      { userId: 'user-1' }
    );
    await offlineQueue.queueAction(
      'movement_create',
      {
        operation: 'create',
        entityType: 'movement',
        entityId: '123',
        amount: 20
      },
      { userId: 'user-1' }
    );

    expect(await offlineQueue.getPendingActions()).toHaveLength(2);
  });

  it('does not execute the same action twice when sync is called concurrently', async () => {
    const mockExecutor = vi.fn().mockResolvedValue(true);
    offlineQueue.registerExecutor('generic', mockExecutor);

    await offlineQueue.queueAction(
      'generic',
      { testData: 'concurrency-test' },
      { userId: 'user-1' }
    );
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

    const originalId = await offlineQueue.queueAction(
      'generic',
      {
        operation: 'update',
        entityType: 'invoice',
        entityId: 'concurrent-1',
        changes: { status: 'draft' }
      },
      { userId: 'user-1' }
    );

    const sync = offlineQueue.syncPendingActions();
    await executorStarted;

    const updatedId = await offlineQueue.queueAction(
      'generic',
      {
        operation: 'update',
        entityType: 'invoice',
        entityId: 'concurrent-1',
        changes: { status: 'paid' }
      },
      { userId: 'user-1' }
    );
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

  describe('quarantineUserActions', () => {
    it('quarantines pending and failed actions for target userId while preserving other users actions', async () => {
      // Queue actions for user-A (target) and user-B (other)
      await offlineQueue.queueAction('generic', { data: 'a1' }, { userId: 'user-A' });
      const actionA2 = await offlineQueue.queueAction(
        'generic',
        { data: 'a2' },
        { userId: 'user-A' }
      );
      await offlineQueue.queueAction('generic', { data: 'b1' }, { userId: 'user-B' });

      // Register an executor that fails actionA2 to set it to 'failed'
      offlineQueue.registerExecutor('generic', async (action: QueuedAction) => {
        if (action.id === actionA2) {
          throw new Error('permanent error sample');
        }
        return true;
      });

      // Set active userId so ownership validation passes during sync
      localStorage.setItem('userId', 'user-A');

      // Run sync to transition actionA2 to failed (using a permanent error)
      offlineQueue.setPermanentErrorClassifier(() => true);
      await offlineQueue.syncPendingActions();

      // Verify state before quarantine
      const failedBefore = await offlineQueue.getFailedActions();
      expect(failedBefore.some((a: QueuedAction) => a.id === actionA2)).toBe(true);

      // Execute quarantine for user-A
      const count = await offlineQueue.quarantineUserActions('user-A');
      expect(count).toBeGreaterThanOrEqual(1);

      // Verify that user-A actions are now quarantined
      const failedAfter = await offlineQueue.getFailedActions();
      const userAQuarantined = failedAfter.filter(
        (a: QueuedAction) => a.userId === 'user-A' && a.status === 'quarantined'
      );
      expect(userAQuarantined.length).toBeGreaterThanOrEqual(1);

      // Verify that user-B action was NOT quarantined
      const userBQuarantined = failedAfter.filter(
        (a: QueuedAction) => a.userId === 'user-B' && a.status === 'quarantined'
      );
      expect(userBQuarantined.length).toBe(0);

      // Quarantined actions must be excluded from pending actions
      const pendingAfter = await offlineQueue.getPendingActions();
      expect(pendingAfter.some((a: QueuedAction) => a.userId === 'user-A')).toBe(false);
    });

    it('quarantines user actions atomically under concurrent deduplication / revision mutation', async () => {
      // Queue action for user-A
      const actionId = await offlineQueue.queueAction(
        'generic',
        { entityType: 'voucher', entityId: '123', operation: 'update', data: 'initial' },
        { userId: 'user-A' }
      );

      let record = smartIDB._getStore().get(actionId);
      expect(record.userId).toBe('user-A');
      expect(record.status).toBe('pending');

      // Start quarantine for user-A
      const quarantinePromise = offlineQueue.quarantineUserActions('user-A');

      // Simulate a concurrent mutation (e.g. deduplication / sync updating revision) while transaction runs
      smartIDB._getStore().set(actionId, {
        ...record,
        revision: 2,
        payload: {
          entityType: 'voucher',
          entityId: '123',
          operation: 'update',
          data: 'concurrent-dedupe'
        }
      });

      const count = await quarantinePromise;
      expect(count).toBe(1);

      // Verify the final record in IndexedDB is quarantined with permanent errorType
      record = smartIDB._getStore().get(actionId);
      expect(record.status).toBe('quarantined');
      expect(record.errorType).toBe('permanent');
      expect(record.userId).toBe('user-A');
    });

    it('session with Auth UUID + numeric profile ID quarantines record owner with each alias', async () => {
      // Record 1: explicit action.userId is Auth UUID
      const action1 = await offlineQueue.queueAction(
        'generic',
        { data: '1' },
        { userId: 'auth-uuid-123' }
      );
      // Record 2: explicit action.userId is numeric profile ID
      const action2 = await offlineQueue.queueAction('generic', { data: '2' }, { userId: '456' });
      // Record 3: belonging to another user
      const action3 = await offlineQueue.queueAction(
        'generic',
        { data: '3' },
        { userId: 'other-user' }
      );

      const count = await offlineQueue.quarantineUserActions(['auth-uuid-123', '456']);
      expect(count).toBe(2);

      const r1 = smartIDB._getStore().get(action1);
      const r2 = smartIDB._getStore().get(action2);
      const r3 = smartIDB._getStore().get(action3);

      expect(r1.status).toBe('quarantined');
      expect(r2.status).toBe('quarantined');
      expect(r3.status).toBe('pending');
    });

    it('legacy record without action.userId but with payload.operatorId target is quarantined', async () => {
      // Insert legacy record into DB manually without action.userId
      const legacyId = 'legacy_action_1';
      smartIDB._getStore().set(legacyId, {
        id: legacyId,
        type: 'movement_create',
        payload: { operatorId: '456', amount: 100 },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        revision: 1,
        status: 'pending'
      });

      const count = await offlineQueue.quarantineUserActions(['456']);
      expect(count).toBe(1);

      const record = smartIDB._getStore().get(legacyId);
      expect(record.status).toBe('quarantined');
    });

    it('record with owner of another user remains unchanged', async () => {
      const otherActionId = await offlineQueue.queueAction(
        'generic',
        { data: 'other' },
        { userId: 'user-B' }
      );

      const count = await offlineQueue.quarantineUserActions(['auth-uuid-123', '456']);
      expect(count).toBe(0);

      const record = smartIDB._getStore().get(otherActionId);
      expect(record.status).toBe('pending');
    });

    it('completely unowned legacy record is quarantined fail-safe during deactivation', async () => {
      const unownedId = 'unowned_legacy_1';
      smartIDB._getStore().set(unownedId, {
        id: unownedId,
        type: 'movement_create',
        payload: { amount: 50 }, // no operatorId, no userId
        createdAt: new Date().toISOString(),
        retryCount: 0,
        revision: 1,
        status: 'pending'
      });

      const count = await offlineQueue.quarantineUserActions(['auth-uuid-123']);
      expect(count).toBe(1);

      const record = smartIDB._getStore().get(unownedId);
      expect(record.status).toBe('quarantined');
    });

    it('new enqueue with inferrable payload owner persists owner', async () => {
      const actionId = await offlineQueue.queueAction('movement_create', {
        operatorId: 456,
        amount: 20
      });

      const record = smartIDB._getStore().get(actionId);
      expect(record.userId).toBe('456');
    });
  });

  describe('REVIEW_FIX_4: Authoritative offline ownership context and cross-user deduplication', () => {
    it('executes action when active alias matches numeric userId', async () => {
      offlineQueue.setOfflineQueueUserAliases(['42', 'uuid-abc']);
      const executor = vi.fn().mockResolvedValue(true);
      offlineQueue.registerExecutor('generic', executor);

      await offlineQueue.queueAction('generic', { data: 1 }, { userId: '42' });
      const result = await offlineQueue.syncPendingActions();

      expect(result.success).toBe(1);
      expect(executor).toHaveBeenCalled();
    });

    it('executes action when active alias matches Auth UUID', async () => {
      offlineQueue.setOfflineQueueUserAliases(['uuid-abc', '42']);
      const executor = vi.fn().mockResolvedValue(true);
      offlineQueue.registerExecutor('generic', executor);

      await offlineQueue.queueAction('generic', { data: 1 }, { userId: 'uuid-abc' });
      const result = await offlineQueue.syncPendingActions();

      expect(result.success).toBe(1);
      expect(executor).toHaveBeenCalled();
    });

    it('postpones sync and leaves pending without executing or quarantining when alias context is missing', async () => {
      offlineQueue.setOfflineQueueUserAliases(null);
      const executor = vi.fn().mockResolvedValue(true);
      offlineQueue.registerExecutor('generic', executor);

      await offlineQueue.queueAction('generic', { data: 1 }, { userId: 'user-1' });

      const result = await offlineQueue.syncPendingActions();

      expect(result).toEqual({ success: 0, failed: 0 });
      expect(executor).not.toHaveBeenCalled();

      const pending = await offlineQueue.getPendingActions();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');
    });

    it('quarantines mismatched owner and legacy ownerless actions when active context is present', async () => {
      offlineQueue.setOfflineQueueUserAliases(['user-active']);
      const executor = vi.fn().mockResolvedValue(true);
      offlineQueue.registerExecutor('generic', executor);

      await offlineQueue.queueAction('generic', { data: 1 }, { userId: 'user-other' });

      smartIDB._getStore().set('legacy_ownerless_99', {
        id: 'legacy_ownerless_99',
        type: 'generic',
        payload: { data: 2 },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        revision: 1,
        status: 'pending'
      });

      const result = await offlineQueue.syncPendingActions();

      expect(result.failed).toBe(2);
      expect(executor).not.toHaveBeenCalled();

      const failed = await offlineQueue.getFailedActions();
      expect(failed.filter((a: any) => a.status === 'quarantined')).toHaveLength(2);
    });

    it('keeps two update actions for the same entity key separate if owners are different', async () => {
      offlineQueue.setOfflineQueueUserAliases(['user-A']);

      const id1 = await offlineQueue.queueAction(
        'generic',
        { operation: 'update', entityType: 'shift', entityId: '100', changes: { note: 'A' } },
        { userId: 'user-A' }
      );

      const id2 = await offlineQueue.queueAction(
        'generic',
        { operation: 'update', entityType: 'shift', entityId: '100', changes: { note: 'B' } },
        { userId: 'user-B' }
      );

      expect(id1).not.toBe(id2);
      const pending = await offlineQueue.getPendingActions();
      expect(pending).toHaveLength(2);
      expect(pending[0].userId).toBe('user-A');
      expect(pending[1].userId).toBe('user-B');
    });

    it('continues to deduplicate update actions when owner is the same', async () => {
      offlineQueue.setOfflineQueueUserAliases(['user-A']);

      const id1 = await offlineQueue.queueAction(
        'generic',
        { operation: 'update', entityType: 'shift', entityId: '100', changes: { note: 'v1' } },
        { userId: 'user-A' }
      );

      const id2 = await offlineQueue.queueAction(
        'generic',
        { operation: 'update', entityType: 'shift', entityId: '100', changes: { note: 'v2' } },
        { userId: 'user-A' }
      );

      expect(id1).toBe(id2);
      const pending = await offlineQueue.getPendingActions();
      expect(pending).toHaveLength(1);
      expect(pending[0].payload).toMatchObject({ changes: { note: 'v2' } });
      expect(pending[0].userId).toBe('user-A');
    });

    it('refuses queueAction when owner is neither explicitly provided nor inferrable', async () => {
      await expect(offlineQueue.queueAction('generic', { data: 'no_owner' })).rejects.toThrow();

      const pending = await offlineQueue.getPendingActions();
      expect(pending).toHaveLength(0);
    });
  });

  describe('REVIEW_FIX_5: Startup ordering cleanup and stationId removal', () => {
    it('no active aliases + action without executor => record remains pending and not quarantined', async () => {
      offlineQueue.setOfflineQueueUserAliases(null);
      smartIDB._getStore().set('no_executor_action_1', {
        id: 'no_executor_action_1',
        type: 'unknown_no_executor',
        payload: { data: 'test' },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        revision: 1,
        status: 'pending',
        userId: 'user-1'
      });

      const result = await offlineQueue.syncPendingActions();

      expect(result).toEqual({ success: 0, failed: 0 });
      const pending = await offlineQueue.getPendingActions();
      expect(pending.some((a: any) => a.id === 'no_executor_action_1')).toBe(true);

      const failed = await offlineQueue.getFailedActions();
      expect(failed.some((a: any) => a.id === 'no_executor_action_1')).toBe(false);
    });

    it('fake localStorage.stationId does not cause quarantine of active user action', async () => {
      localStorage.setItem('stationId', '9999');
      offlineQueue.setOfflineQueueUserAliases(['user-1']);
      const executor = vi.fn().mockResolvedValue(true);
      offlineQueue.registerExecutor('generic', executor);

      const actionId = await offlineQueue.queueAction(
        'generic',
        { data: 'station-test' },
        { userId: 'user-1', stationId: 10 }
      );

      const result = await offlineQueue.syncPendingActions();

      expect(result.success).toBe(1);
      expect(executor).toHaveBeenCalled();

      const pending = await offlineQueue.getPendingActions();
      expect(pending.some((a: any) => a.id === actionId)).toBe(false);

      const failed = await offlineQueue.getFailedActions();
      expect(failed.some((a: any) => a.id === actionId)).toBe(false);
      localStorage.removeItem('stationId');
    });

    it('user mismatch or ownerless actions with active context continue to be quarantined', async () => {
      offlineQueue.setOfflineQueueUserAliases(['active-user']);
      const executor = vi.fn().mockResolvedValue(true);
      offlineQueue.registerExecutor('generic', executor);

      // Mismatched user action
      await offlineQueue.queueAction('generic', { data: 1 }, { userId: 'other-user' });

      // Ownerless action
      smartIDB._getStore().set('ownerless_action_1', {
        id: 'ownerless_action_1',
        type: 'generic',
        payload: { data: 2 },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        revision: 1,
        status: 'pending'
      });

      const result = await offlineQueue.syncPendingActions();

      expect(result.failed).toBe(2);
      expect(executor).not.toHaveBeenCalled();

      const failed = await offlineQueue.getFailedActions();
      expect(failed).toHaveLength(2);
      expect(failed.every((a: any) => a.status === 'quarantined')).toBe(true);
    });

    it('valid action with active alias continues to be executed', async () => {
      offlineQueue.setOfflineQueueUserAliases(['active-user']);
      const executor = vi.fn().mockResolvedValue(true);
      offlineQueue.registerExecutor('generic', executor);

      const actionId = await offlineQueue.queueAction(
        'generic',
        { data: 'valid' },
        { userId: 'active-user' }
      );

      const result = await offlineQueue.syncPendingActions();

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(executor).toHaveBeenCalledTimes(1);

      const pending = await offlineQueue.getPendingActions();
      expect(pending.some((a: any) => a.id === actionId)).toBe(false);
    });
  });

  describe('REVIEW FIX 6 - Independent Review Blockers (#307)', () => {
    describe('1. Race executor in-flight vs quarantine (SECURITY)', () => {
      it('prevents in-flight executor success from deleting quarantined action when quarantine happens concurrently', async () => {
        offlineQueue.setOfflineQueueUserAliases(['user-A']);

        let resolveExecutor!: (val: boolean) => void;
        const executorPromise = new Promise<boolean>(resolve => {
          resolveExecutor = resolve;
        });

        const actionId = await offlineQueue.queueAction(
          'generic',
          { data: 'in-flight-success' },
          { userId: 'user-A' }
        );

        offlineQueue.registerExecutor('generic', async () => {
          return await executorPromise;
        });

        // Start sync but do not await it yet (executor enters and waits)
        const syncPromise = offlineQueue.syncPendingActions();

        // Perform concurrent quarantine
        const quarantineCount = await offlineQueue.quarantineUserActions('user-A');
        expect(quarantineCount).toBe(1);

        // Verify state right after quarantine
        const recordPostQuarantine = smartIDB._getStore().get(actionId);
        expect(recordPostQuarantine.status).toBe('quarantined');
        expect(recordPostQuarantine.revision).toBe(2);

        // Release executor with success (true)
        resolveExecutor(true);
        await syncPromise;

        // Verify action remains quarantined with revision 2 and was NOT deleted by CAS
        const recordFinal = smartIDB._getStore().get(actionId);
        expect(recordFinal).toBeDefined();
        expect(recordFinal.status).toBe('quarantined');
        expect(recordFinal.revision).toBe(2);
      });

      it('prevents in-flight executor error/throw from overwriting quarantined action when quarantine happens concurrently', async () => {
        offlineQueue.setOfflineQueueUserAliases(['user-A']);

        let rejectExecutor!: (err: Error) => void;
        const executorPromise = new Promise<boolean>((_, reject) => {
          rejectExecutor = reject;
        });

        const actionId = await offlineQueue.queueAction(
          'generic',
          { data: 'in-flight-error' },
          { userId: 'user-A' }
        );

        offlineQueue.registerExecutor('generic', async () => {
          return await executorPromise;
        });

        const syncPromise = offlineQueue.syncPendingActions();

        // Perform concurrent quarantine
        const quarantineCount = await offlineQueue.quarantineUserActions('user-A');
        expect(quarantineCount).toBe(1);

        const recordPostQuarantine = smartIDB._getStore().get(actionId);
        expect(recordPostQuarantine.status).toBe('quarantined');
        expect(recordPostQuarantine.revision).toBe(2);

        // Release executor with error throw
        rejectExecutor(new Error('Transient network error'));
        await syncPromise;

        // Verify action remains quarantined and was NOT changed to failed/pending
        const recordFinal = smartIDB._getStore().get(actionId);
        expect(recordFinal).toBeDefined();
        expect(recordFinal.status).toBe('quarantined');
        expect(recordFinal.revision).toBe(2);
      });
    });

    describe('2. Contradictory legacy owner metadata (SECURITY)', () => {
      it('getSafePayloadOwner normalizes operatorId and userId separately and returns null if contradictory', () => {
        expect(offlineQueue.getSafePayloadOwner({ operatorId: 'op1', userId: 'usr2' })).toBeNull();
        expect(offlineQueue.getSafePayloadOwner({ operatorId: '123', userId: '123' })).toBe('123');
        expect(offlineQueue.getSafePayloadOwner({ operatorId: ' 123 ', userId: 123 })).toBe('123');
        expect(offlineQueue.getSafePayloadOwner({ operatorId: '123' })).toBe('123');
        expect(offlineQueue.getSafePayloadOwner({ userId: '456' })).toBe('456');
      });

      it('queueAction rejects new enqueue with contradictory owner metadata', async () => {
        await expect(
          offlineQueue.queueAction('generic', { operatorId: 'op1', userId: 'usr2' } as any)
        ).rejects.toThrow();

        await expect(
          offlineQueue.queueAction('generic', { userId: 'usr2' }, { userId: 'op1' })
        ).rejects.toThrow();
      });

      it('legacy record with contradictory owner metadata is treated as ownerless and quarantined fail-safe', async () => {
        const contradictoryId = 'contradictory_legacy_1';
        smartIDB._getStore().set(contradictoryId, {
          id: contradictoryId,
          type: 'movement_create',
          payload: { operatorId: 'op1', userId: 'usr2' },
          createdAt: new Date().toISOString(),
          retryCount: 0,
          revision: 1,
          status: 'pending'
        });

        const count = await offlineQueue.quarantineUserActions(['op1']);
        expect(count).toBe(1);

        const record = smartIDB._getStore().get(contradictoryId);
        expect(record.status).toBe('quarantined');
      });

      it('dedupe update/upsert: same-user alias dedupe merges while different account owners do not merge', async () => {
        offlineQueue.setOfflineQueueUserAliases(['auth-uuid-123', '456']);

        const id1 = await offlineQueue.queueAction(
          'generic',
          { entityType: 'voucher', entityId: 'v1', operation: 'update', val: 1 },
          { userId: 'auth-uuid-123' }
        );

        // Enqueue update for same voucher under numeric alias '456'
        const id2 = await offlineQueue.queueAction(
          'generic',
          { entityType: 'voucher', entityId: 'v1', operation: 'update', val: 2 },
          { userId: '456' }
        );

        // Same user alias should merge into duplicate record
        expect(id2).toBe(id1);

        // Now test different account owners (not in same activeUserAliases)
        offlineQueue.setOfflineQueueUserAliases(['user-A']);

        const idA = await offlineQueue.queueAction(
          'generic',
          { entityType: 'voucher', entityId: 'v2', operation: 'update', val: 10 },
          { userId: 'user-A' }
        );

        const idB = await offlineQueue.queueAction(
          'generic',
          { entityType: 'voucher', entityId: 'v2', operation: 'update', val: 20 },
          { userId: 'user-B' }
        );

        expect(idB).not.toBe(idA);
      });
    });
  });
});
