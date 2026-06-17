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
 * Initialize the IndexedDB database
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
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// ========== QUEUE OPERATIONS ==========

/**
 * Add an action to the offline queue
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
 * Get all pending actions from the queue
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
 * Remove an action from the queue
 */
export async function removeAction(id: string): Promise<void> {
  if (!db) {return;}

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Update retry count for an action
 */
async function incrementRetry(action: QueuedAction): Promise<void> {
  if (!db) {return;}

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
 * Register an executor for a specific action type
 */
export function registerExecutor(type: QueuedAction['type'], executor: ActionExecutor): void {
  executors.set(type, executor);
}

// ========== SYNC LOGIC ==========

/**
 * Process all pending actions (called when back online)
 */
export async function syncPendingActions(): Promise<{ success: number; failed: number }> {
  const pending = await getPendingActions();

  if (pending.length === 0) {
    return { success: 0, failed: 0 };
  }

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
 * Setup automatic sync when coming back online
 */
export function setupAutoSync(): void {
  window.addEventListener('online', () => {
    syncPendingActions();
  });

  window.addEventListener('offline', () => {
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
 * Check if we're currently offline
 */
export function isOffline(): boolean {
  return !navigator.onLine;
}

/**
 * Get count of pending actions
 */
export async function getPendingCount(): Promise<number> {
  const pending = await getPendingActions();
  return pending.length;
}
