/**
 * Offline Queue System
 * Queues actions when offline and syncs when back online.
 * Uses IndexedDB for persistent storage.
 */

import { Toast } from '../ui/toast.js';

// ========== TYPES ==========

export interface QueuedAction {
    id: string;
    type: 'voucher_redeem' | 'shift_close' | 'movement_create' | 'generic';
    payload: Record<string, unknown>;
    createdAt: string;
    retryCount: number;
}

type ActionExecutor = (action: QueuedAction) => Promise<boolean>;

// ========== CONSTANTS ==========

const DB_NAME = 'neofuel-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-actions';
const MAX_RETRIES = 3;

// ========== MODULE STATE ==========

let db: IDBDatabase | null = null;
const executors: Map<string, ActionExecutor> = new Map();

// ========== INITIALIZATION ==========

/**
 * Initialize and open the IndexedDB database used to persist offline queued actions.
 *
 * Creates the object store for pending actions if it does not exist and assigns the opened
 * database to the module-level `db` variable.
 */
export async function initOfflineQueue(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[OfflineQueue] Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('[OfflineQueue] IndexedDB initialized');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log('[OfflineQueue] Created object store:', STORE_NAME);
            }
        };
    });
}

// ========== QUEUE OPERATIONS ==========

/**
 * Enqueues an action in the offline queue for later synchronization.
 *
 * @param type - The action type to queue (e.g., `voucher_redeem`, `shift_close`, `movement_create`, `generic`)
 * @param payload - The data required to perform the action when it is processed
 * @returns The generated id for the queued action
 */
export async function queueAction(
    type: QueuedAction['type'],
    payload: Record<string, unknown>
): Promise<string> {
    if (!db) {
        await initOfflineQueue();
    }

    const action: QueuedAction = {
        id: `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type,
        payload,
        createdAt: new Date().toISOString(),
        retryCount: 0
    };

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(action);

        request.onsuccess = () => {
            console.log('[OfflineQueue] Action queued:', action.id);
            Toast.show('Azione salvata. Verrà sincronizzata quando online.', 'info');
            resolve(action.id);
        };

        request.onerror = () => {
            console.error('[OfflineQueue] Failed to queue action:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Retrieve all queued actions pending synchronization.
 *
 * @returns An array of queued actions pending synchronization.
 */
export async function getPendingActions(): Promise<QueuedAction[]> {
    if (!db) {
        await initOfflineQueue();
    }

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

/**
 * Remove the queued action with the given id.
 *
 * If the offline queue has not been initialized, this function returns without error.
 *
 * @param id - The id of the queued action to remove
 * @throws Rejects with the underlying IndexedDB error if the delete operation fails
 */
export async function removeAction(id: string): Promise<void> {
    if (!db) return;

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            console.log('[OfflineQueue] Action removed:', id);
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

/**
 * Increment the stored retry count for a queued action and persist the update to IndexedDB.
 *
 * @param action - The queued action whose `retryCount` will be incremented and saved
 */
async function incrementRetry(action: QueuedAction): Promise<void> {
    if (!db) return;

    action.retryCount++;

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(action);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ========== EXECUTORS ==========

/**
 * Registers an executor function to handle queued actions of a given type.
 *
 * @param type - The queued action type to associate with the executor
 * @param executor - Function invoked with a queued action; should resolve to `true` on success and `false` otherwise
 */
export function registerExecutor(type: QueuedAction['type'], executor: ActionExecutor): void {
    executors.set(type, executor);
    console.log('[OfflineQueue] Registered executor for:', type);
}

// ========== SYNC LOGIC ==========

/**
 * Process all queued offline actions by invoking their registered executors and updating the queue.
 *
 * For each pending action this function looks up a registered executor and runs it. If the executor
 * resolves to `true` the action is removed from the queue and counted as successful. If the executor
 * resolves to `false` or throws, the action's `retryCount` is incremented; actions that reach
 * `MAX_RETRIES` are removed from the queue. The function also shows user-facing toasts for progress,
 * success, and warnings, and dispatches a `CustomEvent` named `offline-sync-complete` with
 * `{ success, failed }` in `event.detail` when at least one action succeeds.
 *
 * @returns An object containing the number of successfully processed actions (`success`) and the
 * number of actions that failed or were deferred (`failed`).
 */
export async function syncPendingActions(): Promise<{ success: number; failed: number }> {
    const pending = await getPendingActions();

    if (pending.length === 0) {
        return { success: 0, failed: 0 };
    }

    console.log(`[OfflineQueue] Syncing ${pending.length} pending actions...`);
    Toast.show(`Sincronizzazione di ${pending.length} azioni...`, 'info');

    let success = 0;
    let failed = 0;

    for (const action of pending) {
        const executor = executors.get(action.type);

        if (!executor) {
            console.warn('[OfflineQueue] No executor for action type:', action.type);
            failed++;
            continue;
        }

        try {
            const result = await executor(action);

            if (result) {
                await removeAction(action.id);
                success++;
            } else {
                await incrementRetry(action);

                if (action.retryCount >= MAX_RETRIES) {
                    console.error('[OfflineQueue] Max retries reached for:', action.id);
                    await removeAction(action.id);
                }
                failed++;
            }
        } catch (err) {
            console.error('[OfflineQueue] Error executing action:', action.id, err);
            await incrementRetry(action);
            failed++;
        }
    }

    if (success > 0) {
        Toast.show(`${success} azioni sincronizzate con successo!`, 'success');

        // Dispatch custom event to notify other parts of the app
        window.dispatchEvent(new CustomEvent('offline-sync-complete', {
            detail: { success, failed }
        }));
    }

    if (failed > 0) {
        Toast.show(`${failed} azioni non sincronizzate. Riproverò più tardi.`, 'warning');
    }

    return { success, failed };
}

// ========== ONLINE/OFFLINE LISTENERS ==========

/**
 * Register listeners that automatically synchronize pending queued actions when network connectivity changes.
 *
 * When the browser becomes online this triggers a synchronization of pending actions; when it goes offline it notifies the user that actions will be saved locally. If the page is already online when called, a one-time delayed sync is scheduled to process any pending actions from prior sessions.
 */
export function setupAutoSync(): void {
    window.addEventListener('online', () => {
        console.log('[OfflineQueue] Back online, starting sync...');
        syncPendingActions();
    });

    window.addEventListener('offline', () => {
        console.log('[OfflineQueue] Went offline');
        Toast.show('Connessione persa. Le azioni verranno salvate localmente.', 'warning');
    });

    // Initial check
    if (navigator.onLine) {
        // Sync any pending actions from previous sessions
        setTimeout(() => syncPendingActions(), 3000);
    }
}

// ========== UTILITY ==========

/**
 * Determine whether the application is currently offline.
 *
 * @returns `true` if the runtime reports no network connectivity, `false` otherwise.
 */
export function isOffline(): boolean {
    return !navigator.onLine;
}

/**
 * Get the number of actions currently queued for synchronization.
 *
 * @returns The number of pending queued actions
 */
export async function getPendingCount(): Promise<number> {
    const pending = await getPendingActions();
    return pending.length;
}