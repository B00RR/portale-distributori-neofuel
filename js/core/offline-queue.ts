/**
 * Offline Queue System
 * Queues actions when offline and syncs when back online.
 * Uses IndexedDB for persistent storage.
 */

import { Toast } from '../ui/toast.js';

import { logger } from './logger.js';

// ========== TYPES ==========

export interface QueuedAction {
  id: string;
  type: 'voucher_redeem' | 'shift_close' | 'movement_create' | 'generic';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  /**
   * Monotonic version of the payload stored under this id. Optional so actions
   * written by older application versions remain readable.
   */
  revision?: number;
  status?: 'pending' | 'failed';
  lastError?: string | undefined;
}

type DeduplicablePayload = Record<string, unknown> & {
  operation?: unknown;
  method?: unknown;
  action?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
};

type ActionExecutor = (action: QueuedAction) => Promise<boolean>;

// ========== CONSTANTS ==========

const DB_NAME = 'neofuel-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-actions';
const MAX_RETRIES = 3;

// ========== MODULE STATE ==========

let db: IDBDatabase | null = null;
const executors: Map<string, ActionExecutor> = new Map();
let syncInFlight: Promise<{ success: number; failed: number }> | null = null;

function normalizeDedupeValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function getUpdateDedupeKey(
  type: QueuedAction['type'],
  payload: Record<string, unknown>
): string | null {
  const candidate = payload as DeduplicablePayload;
  const operation = normalizeDedupeValue(
    candidate.operation ?? candidate.method ?? candidate.action
  )?.toLowerCase();
  if (operation !== 'update' && operation !== 'upsert') {
    return null;
  }

  const entityType = normalizeDedupeValue(candidate.entityType ?? candidate.entity_type);
  const entityId = normalizeDedupeValue(candidate.entityId ?? candidate.entity_id);

  if (!entityType || !entityId) {
    return null;
  }
  return `${type}:${entityType}:${entityId}`;
}

function findDuplicateUpdateAction(
  actions: QueuedAction[],
  dedupeKey: string
): QueuedAction | null {
  return (
    actions.find(
      action =>
        action.status !== 'failed' && getUpdateDedupeKey(action.type, action.payload) === dedupeKey
    ) ?? null
  );
}

function getActionRevision(action: QueuedAction): number {
  return Number.isSafeInteger(action.revision) && (action.revision ?? 0) >= 0
    ? (action.revision ?? 0)
    : 0;
}

function isSameRevision(current: QueuedAction, expected: QueuedAction): boolean {
  return current.id === expected.id && getActionRevision(current) === getActionRevision(expected);
}

// ========== INITIALIZATION ==========

/**
 * Initialize the IndexedDB database
 */
export async function initOfflineQueue(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error('offlineQueue', 'Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = event => {
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
  if (!db) {
    throw new Error('Coda offline non disponibile');
  }
  const database = db;

  const action: QueuedAction = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    revision: 1,
    status: 'pending'
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const dedupeKey = getUpdateDedupeKey(type, payload);

    const addAction = (): void => {
      const request = store.add(action);

      request.onsuccess = () => {
        Toast.show('Azione salvata. Verrà sincronizzata quando online.', 'info');
        resolve(action.id);
      };

      request.onerror = () => {
        logger.error('offlineQueue', 'Failed to queue action:', request.error);
        reject(request.error);
      };
    };

    if (!dedupeKey) {
      addAction();
      return;
    }

    const existingRequest = store.getAll();

    existingRequest.onsuccess = () => {
      const duplicate = findDuplicateUpdateAction(existingRequest.result || [], dedupeKey);

      if (!duplicate) {
        addAction();
        return;
      }

      const mergedAction: QueuedAction = {
        ...duplicate,
        payload,
        retryCount: 0,
        revision: getActionRevision(duplicate) + 1,
        status: 'pending',
        lastError: undefined
      };

      const updateRequest = store.put(mergedAction);

      updateRequest.onsuccess = () => {
        Toast.show('Azione offline aggiornata. Verrà sincronizzata quando online.', 'info');
        resolve(mergedAction.id);
      };

      updateRequest.onerror = () => {
        logger.error('offlineQueue', 'Failed to update queued action:', updateRequest.error);
        reject(updateRequest.error);
      };
    };

    existingRequest.onerror = () => {
      logger.error(
        'offlineQueue',
        'Failed to inspect queue for duplicates:',
        existingRequest.error
      );
      reject(existingRequest.error);
    };
  });
}

/**
 * Get all pending actions from the queue
 */
async function getAllQueuedActions(): Promise<QueuedAction[]> {
  if (!db) {
    await initOfflineQueue();
  }
  if (!db) {
    return [];
  }
  const database = db;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
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

export async function getPendingActions(): Promise<QueuedAction[]> {
  const actions = await getAllQueuedActions();
  return actions.filter(action => action.status !== 'failed');
}

export async function getFailedActions(): Promise<QueuedAction[]> {
  const actions = await getAllQueuedActions();
  return actions.filter(action => action.status === 'failed');
}

/**
 * Remove an action from the queue
 */
export async function removeAction(id: string): Promise<void> {
  if (!db) {
    return;
  }
  const database = db;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
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
 * Delete only if the record is still the exact revision that was executed.
 * A deduplicated update can reuse the same id while an executor is awaiting a
 * network response; deleting by id alone would otherwise discard that newer
 * payload.
 */
async function removeActionIfCurrent(action: QueuedAction): Promise<boolean> {
  if (!db) {
    return false;
  }
  const database = db;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const readRequest = store.get(action.id);

    readRequest.onsuccess = () => {
      const current = readRequest.result as QueuedAction | undefined;
      if (!current || !isSameRevision(current, action)) {
        resolve(false);
        return;
      }

      const deleteRequest = store.delete(action.id);
      deleteRequest.onsuccess = () => resolve(true);
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };

    readRequest.onerror = () => reject(readRequest.error);
  });
}

/** Persist a state transition without overwriting a payload queued meanwhile. */
async function persistActionIfCurrent(
  expected: QueuedAction,
  updated: QueuedAction
): Promise<boolean> {
  if (!db) {
    return false;
  }
  const database = db;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const readRequest = store.get(expected.id);

    readRequest.onsuccess = () => {
      const current = readRequest.result as QueuedAction | undefined;
      if (!current || !isSameRevision(current, expected)) {
        resolve(false);
        return;
      }

      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = () => reject(putRequest.error);
    };

    readRequest.onerror = () => reject(readRequest.error);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Errore sconosciuto');
}

async function recordFailedAttempt(action: QueuedAction, error?: unknown): Promise<boolean> {
  const retryCount = action.retryCount + 1;
  const exhausted = retryCount >= MAX_RETRIES;
  const updatedAction: QueuedAction = {
    ...action,
    retryCount,
    status: exhausted ? 'failed' : 'pending',
    lastError: errorMessage(error)
  };

  const persisted = await persistActionIfCurrent(action, updatedAction);
  if (!persisted) {
    logger.info('offlineQueue', 'Action changed during sync; retry state not applied:', action.id);
    return false;
  }
  if (exhausted) {
    logger.error('offlineQueue', 'Max retries reached; action moved to failed queue:', action.id);
  }
  return exhausted;
}

async function quarantineCompletedAction(action: QueuedAction, error: unknown): Promise<void> {
  await persistActionIfCurrent(action, {
    ...action,
    status: 'failed',
    lastError: `Esecuzione remota riuscita, ma rimozione locale fallita: ${errorMessage(error)}`
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
 * Re-entrancy guard: if sync is already in flight, returns the existing promise
 */
export function syncPendingActions(): Promise<{ success: number; failed: number }> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = runSync().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

async function runSync(): Promise<{ success: number; failed: number }> {
  const pending = await getPendingActions();

  if (pending.length === 0) {
    return { success: 0, failed: 0 };
  }

  Toast.show(`Sincronizzazione di ${pending.length} azioni...`, 'info');

  let success = 0;
  let failed = 0;
  let manualAttention = 0;

  for (const action of pending) {
    const executor = executors.get(action.type);

    if (!executor) {
      logger.warn('offlineQueue', 'No executor for action type:', action.type);
      failed++;
      continue;
    }

    let result: boolean;
    try {
      result = await executor(action);
    } catch (err) {
      logger.error('offlineQueue', 'Error executing action:', action.id, err);
      try {
        if (await recordFailedAttempt(action, err)) {
          manualAttention++;
        }
      } catch (persistenceError) {
        logger.error('offlineQueue', 'Failed to persist retry state:', action.id, persistenceError);
      }
      failed++;
      continue;
    }

    if (result) {
      try {
        const removed = await removeActionIfCurrent(action);
        if (!removed) {
          logger.info(
            'offlineQueue',
            'Action changed during sync; latest revision kept in queue:',
            action.id
          );
        }
        success++;
      } catch (persistenceError) {
        logger.error(
          'offlineQueue',
          'Remote action succeeded but local removal failed:',
          action.id,
          persistenceError
        );
        try {
          await quarantineCompletedAction(action, persistenceError);
        } catch (quarantineError) {
          logger.error('offlineQueue', 'Failed to quarantine completed action:', quarantineError);
        }
        failed++;
        manualAttention++;
      }
      continue;
    }

    try {
      if (await recordFailedAttempt(action, 'Executor returned false')) {
        manualAttention++;
      }
    } catch (persistenceError) {
      logger.error('offlineQueue', 'Failed to persist retry state:', action.id, persistenceError);
    }
    failed++;
  }

  if (success > 0) {
    Toast.show(`${success} azioni sincronizzate con successo!`, 'success');

    // Dispatch custom event to notify other parts of the app
    window.dispatchEvent(
      new CustomEvent('offline-sync-complete', {
        detail: { success, failed }
      })
    );
  }

  const retryableFailures = failed - manualAttention;
  if (retryableFailures > 0) {
    Toast.show(`${retryableFailures} azioni non sincronizzate. Riproverò più tardi.`, 'warning');
  }

  if (manualAttention > 0) {
    Toast.show(
      `${manualAttention} azioni richiedono verifica manuale e sono state conservate nella coda errori.`,
      'error'
    );
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
