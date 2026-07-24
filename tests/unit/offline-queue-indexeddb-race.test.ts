/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { QueuedAction } from '../../js/core/offline-queue.js';

describe('Offline Queue Real IndexedDB Race Proof (Blocker 1)', () => {
  let offlineQueue: typeof import('../../js/core/offline-queue.js');
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset fake-indexeddb database cleanly between tests
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('neofuel-offline-db');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });

    offlineQueue = await import('../../js/core/offline-queue.js');
    await offlineQueue.initOfflineQueue();
  });

  afterEach(() => {
    if (offlineQueue) {
      offlineQueue.closeOfflineQueue();
    }
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('keeps action quarantined when in-flight executor releases with true', async () => {
    // 1. Establish active aliases
    offlineQueue.setOfflineQueueUserAliases(['user-1']);

    // 2. Queue action owned by active account
    const actionId = await offlineQueue.queueAction(
      'generic',
      { data: 'race-test-true' },
      { userId: 'user-1' }
    );

    // 3. Register deferred executor with explicit barrier
    let releaseExecutor!: (val: boolean) => void;
    let markStarted!: () => void;

    const executorStarted = new Promise<void>(resolve => {
      markStarted = resolve;
    });

    const executorRelease = new Promise<boolean>(resolve => {
      releaseExecutor = resolve;
    });

    const executor = vi.fn(async () => {
      markStarted();
      return await executorRelease;
    });

    offlineQueue.registerExecutor('generic', executor);

    // 4. Begin sync and wait until executor is genuinely in-flight
    const syncPromise = offlineQueue.syncPendingActions();
    await executorStarted;

    // 5. Call and await quarantineUserActions so its real IndexedDB readwrite transaction commits
    const quarantinedCount = await offlineQueue.quarantineUserActions('user-1');
    expect(quarantinedCount).toBe(1);

    // 6. Release old executor with true
    releaseExecutor(true);

    // 7. Await sync completion
    const syncResult = await syncPromise;
    expect(syncResult).toEqual({ success: 1, failed: 0 });

    // 8. Assert action still exists, remains quarantined, revision incremented by quarantine, not deleted or rewritten pending/failed
    const failedActions = await offlineQueue.getFailedActions();
    expect(failedActions).toHaveLength(1);

    const action = failedActions.find(a => a.id === actionId) as QueuedAction;
    expect(action).toBeDefined();
    expect(action.status).toBe('quarantined');
    expect(action.revision).toBe(2);
    expect(action.errorType).toBe('permanent');
    expect(action.lastError).toContain('Account disattivato');

    const pendingActions = await offlineQueue.getPendingActions();
    expect(pendingActions).toHaveLength(0);
  });

  it('keeps action quarantined when in-flight executor releases with false', async () => {
    // 1. Establish active aliases
    offlineQueue.setOfflineQueueUserAliases(['user-1']);

    // 2. Queue action owned by active account
    const actionId = await offlineQueue.queueAction(
      'generic',
      { data: 'race-test-false' },
      { userId: 'user-1' }
    );

    // 3. Register deferred executor with explicit barrier
    let releaseExecutor!: (val: boolean) => void;
    let markStarted!: () => void;

    const executorStarted = new Promise<void>(resolve => {
      markStarted = resolve;
    });

    const executorRelease = new Promise<boolean>(resolve => {
      releaseExecutor = resolve;
    });

    const executor = vi.fn(async () => {
      markStarted();
      return await executorRelease;
    });

    offlineQueue.registerExecutor('generic', executor);

    // 4. Begin sync and wait until executor is genuinely in-flight
    const syncPromise = offlineQueue.syncPendingActions();
    await executorStarted;

    // 5. Call and await quarantineUserActions
    const quarantinedCount = await offlineQueue.quarantineUserActions('user-1');
    expect(quarantinedCount).toBe(1);

    // 6. Release old executor with false
    releaseExecutor(false);

    // 7. Await sync completion
    const syncResult = await syncPromise;
    expect(syncResult).toEqual({ success: 0, failed: 1 });

    // 8. Assert action still exists, remains quarantined, revision incremented by quarantine, not rewritten to status 'failed'
    const failedActions = await offlineQueue.getFailedActions();
    expect(failedActions).toHaveLength(1);

    const action = failedActions.find(a => a.id === actionId) as QueuedAction;
    expect(action).toBeDefined();
    expect(action.status).toBe('quarantined'); // Must remain quarantined, NOT rewritten to 'failed'
    expect(action.revision).toBe(2);
    expect(action.errorType).toBe('permanent');
    expect(action.lastError).toContain('Account disattivato');

    const pendingActions = await offlineQueue.getPendingActions();
    expect(pendingActions).toHaveLength(0);
  });

  it('keeps action quarantined when in-flight executor throws/rejects an error', async () => {
    // 1. Establish active aliases
    offlineQueue.setOfflineQueueUserAliases(['user-1']);

    // 2. Queue action owned by active account
    const actionId = await offlineQueue.queueAction(
      'generic',
      { data: 'race-test-error' },
      { userId: 'user-1' }
    );

    // 3. Register deferred executor with explicit barrier
    let rejectExecutor!: (err: Error) => void;
    let markStarted!: () => void;

    const executorStarted = new Promise<void>(resolve => {
      markStarted = resolve;
    });

    const executorRelease = new Promise<boolean>((_, reject) => {
      rejectExecutor = reject;
    });

    const executor = vi.fn(async () => {
      markStarted();
      return await executorRelease;
    });

    offlineQueue.registerExecutor('generic', executor);

    // 4. Begin sync and wait until executor is genuinely in-flight
    const syncPromise = offlineQueue.syncPendingActions();
    await executorStarted;

    // 5. Call and await quarantineUserActions
    const quarantinedCount = await offlineQueue.quarantineUserActions('user-1');
    expect(quarantinedCount).toBe(1);

    // 6. Release old executor with thrown error
    rejectExecutor(new Error('Network exception during sync'));

    // 7. Await sync completion
    const syncResult = await syncPromise;
    expect(syncResult).toEqual({ success: 0, failed: 1 });

    // 8. Assert action still exists, remains quarantined, revision incremented by quarantine, not rewritten to status 'failed'
    const failedActions = await offlineQueue.getFailedActions();
    expect(failedActions).toHaveLength(1);

    const action = failedActions.find(a => a.id === actionId) as QueuedAction;
    expect(action).toBeDefined();
    expect(action.status).toBe('quarantined');
    expect(action.revision).toBe(2);
    expect(action.errorType).toBe('permanent');
    expect(action.lastError).toContain('Account disattivato');

    const pendingActions = await offlineQueue.getPendingActions();
    expect(pendingActions).toHaveLength(0);
  });
});
