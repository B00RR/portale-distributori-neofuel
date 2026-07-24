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
  status?: 'pending' | 'failed' | 'quarantined';
  lastError?: string | undefined;
  /**
   * Classification of the last failure. Set when the action reaches `failed`
   * status so the UI can decide whether a manual retry makes sense.
   */
  errorType?: 'temporary' | 'permanent' | undefined;
  failedAt?: string | undefined;
  /** @since #328 — owner metadata for cross-account safety */
  userId?: string;
  stationId?: number;
}

type PermanentErrorClassifier = (message: string) => boolean;

const DEFAULT_PERMANENT_ERROR_CLASSIFIER: PermanentErrorClassifier = message => {
  const lower = message.toLowerCase();
  const permanentPatterns = [
    'payload offline non valido',
    'non valido',
    'invalid_',
    'unauthorized',
    'forbidden',
    'not found',
    'not_found',
    'duplicate',
    'already exists',
    'constraint',
    'permission denied',
    'violates',
    'check constraint',
    'foreign key',
    'cannot',
    'not allowed'
  ];
  return permanentPatterns.some(pattern => lower.includes(pattern));
};

let permanentErrorClassifier: PermanentErrorClassifier = DEFAULT_PERMANENT_ERROR_CLASSIFIER;

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
let activeUserAliases: Set<string> | null = null;

export function setOfflineQueueUserAliases(aliases: string[] | null | undefined): void {
  if (!aliases || !Array.isArray(aliases) || aliases.length === 0) {
    activeUserAliases = null;
    return;
  }
  const valid = aliases.filter(a => typeof a === 'string' && a.trim() !== '').map(a => a.trim());
  if (valid.length === 0) {
    activeUserAliases = null;
  } else {
    activeUserAliases = new Set(valid);
  }
}

export function getOfflineQueueUserAliases(): string[] | null {
  return activeUserAliases ? Array.from(activeUserAliases) : null;
}

function normalizeOwnerVal(val: unknown): string | null {
  if (typeof val === 'string' && val.trim()) {
    return val.trim();
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(val);
  }
  return null;
}

function areOwnersEquivalent(ownerA: string | null, ownerB: string | null): boolean {
  if (!ownerA || !ownerB) {
    return false;
  }
  if (ownerA === ownerB) {
    return true;
  }
  if (activeUserAliases && activeUserAliases.has(ownerA) && activeUserAliases.has(ownerB)) {
    return true;
  }
  return false;
}

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
  dedupeKey: string,
  targetOwner: string
): QueuedAction | null {
  return (
    actions.find(
      action =>
        action.status !== 'failed' &&
        action.status !== 'quarantined' &&
        getUpdateDedupeKey(action.type, action.payload) === dedupeKey &&
        areOwnersEquivalent(getQueuedActionOwner(action), targetOwner)
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

export function setPermanentErrorClassifier(classifier: PermanentErrorClassifier): void {
  permanentErrorClassifier = classifier;
}

function classifyError(error: unknown): 'temporary' | 'permanent' {
  const message = errorMessage(error);
  return permanentErrorClassifier(message) ? 'permanent' : 'temporary';
}

function isRetryableError(action: QueuedAction): boolean {
  if (action.errorType === 'permanent') {
    return false;
  }
  return true;
}

export function getSafePayloadOwner(
  payload: Record<string, unknown> | null | undefined
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const opStr = normalizeOwnerVal(payload.operatorId);
  const userStr = normalizeOwnerVal(payload.userId);

  if (opStr !== null && userStr !== null) {
    if (opStr === userStr) {
      return opStr;
    }
    return null;
  }
  if (opStr !== null) {
    return opStr;
  }
  if (userStr !== null) {
    return userStr;
  }
  return null;
}

export function getQueuedActionOwner(action: QueuedAction): string | null {
  const opStr = normalizeOwnerVal(action.payload?.operatorId);
  const payloadUserStr = normalizeOwnerVal(action.payload?.userId);

  if (opStr !== null && payloadUserStr !== null && opStr !== payloadUserStr) {
    return null;
  }

  const payloadOwner = opStr !== null ? opStr : payloadUserStr;
  const actionUser = normalizeOwnerVal(action.userId);

  if (actionUser !== null && payloadOwner !== null && actionUser !== payloadOwner) {
    return null;
  }

  return actionUser !== null ? actionUser : payloadOwner;
}

// ========== INITIALIZATION ==========

export function closeOfflineQueue(): void {
  if (db) {
    db.close();
    db = null;
  }
}

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
  payload: Record<string, unknown>,
  options?: { userId?: string; stationId?: number }
): Promise<string> {
  if (!db) {
    await initOfflineQueue();
  }
  if (!db) {
    throw new Error('Coda offline non disponibile');
  }
  const database = db;

  const payloadOp = normalizeOwnerVal(payload?.operatorId);
  const payloadUser = normalizeOwnerVal(payload?.userId);
  if (payloadOp !== null && payloadUser !== null && payloadOp !== payloadUser) {
    throw new Error(
      "Impossibile accodare un'azione con metadati proprietario contraddittori (operatorId e userId discordanti)"
    );
  }

  let resolvedUserId: string | null = null;
  if (options?.userId && typeof options.userId === 'string' && options.userId.trim()) {
    resolvedUserId = options.userId.trim();
  } else {
    resolvedUserId = getSafePayloadOwner(payload);
  }

  const payloadOwner = getSafePayloadOwner(payload);
  if (resolvedUserId && payloadOwner && resolvedUserId !== payloadOwner) {
    throw new Error(
      "Impossibile accodare un'azione con metadati proprietario contraddittori (options.userId e payload owner discordanti)"
    );
  }

  if (!resolvedUserId) {
    throw new Error(
      "Impossibile accodare un'azione senza proprietario (userId non specificato o derivabile)"
    );
  }
  const normalizedOwner = resolvedUserId;

  const action: QueuedAction = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    revision: 1,
    status: 'pending',
    userId: normalizedOwner,
    ...(options?.stationId !== undefined ? { stationId: options.stationId } : {})
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
      const duplicate = findDuplicateUpdateAction(
        existingRequest.result || [],
        dedupeKey,
        normalizedOwner
      );

      if (!duplicate) {
        addAction();
        return;
      }

      const mergedAction: QueuedAction = {
        ...duplicate,
        payload,
        userId: normalizedOwner,
        retryCount: 0,
        revision: getActionRevision(duplicate) + 1,
        status: 'pending',
        lastError: undefined,
        errorType: undefined,
        failedAt: undefined
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
  return actions.filter(action => action.status !== 'failed' && action.status !== 'quarantined');
}

export async function getFailedActions(): Promise<QueuedAction[]> {
  const actions = await getAllQueuedActions();
  return actions.filter(action => action.status === 'failed' || action.status === 'quarantined');
}

export async function getFailedCount(): Promise<number> {
  const failed = await getFailedActions();
  return failed.length;
}

export async function getTotalQueueCount(): Promise<number> {
  const actions = await getAllQueuedActions();
  return actions.length;
}

/**
 * Retry a specific failed action after fresh authorization/verification.
 * Returns true if the action was reset to pending and a sync was triggered.
 */
export async function retryFailedAction(id: string): Promise<boolean> {
  const actions = await getAllQueuedActions();
  const action = actions.find(
    a => a.id === id && (a.status === 'failed' || a.status === 'quarantined')
  );

  if (!action) {
    return false;
  }

  const updatedAction: QueuedAction = {
    ...action,
    retryCount: 0,
    status: 'pending',
    errorType: undefined,
    lastError: undefined,
    failedAt: undefined
  };

  const persisted = await persistActionIfCurrent(action, updatedAction);
  if (!persisted) {
    logger.info('offlineQueue', 'Action changed before retry reset:', action.id);
    return false;
  }

  logger.info('offlineQueue', 'Retry requested for action:', action.id);
  void syncPendingActions();
  return true;
}

/**
 * Cancel/quarantine a failed action. Requires user confirmation upstream.
 */
export async function cancelFailedAction(id: string): Promise<boolean> {
  const actions = await getAllQueuedActions();
  const action = actions.find(a => a.id === id);

  if (!action) {
    return false;
  }

  const updatedAction: QueuedAction = {
    ...action,
    status: 'quarantined',
    revision: getActionRevision(action) + 1,
    errorType: 'permanent',
    lastError: action.lastError || "Annullata dall'utente",
    failedAt: action.failedAt || new Date().toISOString()
  };

  const persisted = await persistActionIfCurrent(action, updatedAction);
  if (!persisted) {
    logger.info('offlineQueue', 'Action changed before cancellation:', action.id);
    return false;
  }

  dispatchSyncStatusChanged();
  return true;
}

/**
 * Remove a quarantined action after it has been handled or reconciled.
 */
export async function removeQuarantinedAction(id: string): Promise<void> {
  await removeAction(id);
}

/**
 * Quarantine all offline actions belonging to target user aliases (Auth UUID, numeric profile ID).
 * Uses a single readwrite IndexedDB transaction with a cursor to ensure atomicity
 * under concurrent deduplication or sync updates.
 * Includes actions with status 'pending' or 'failed'.
 * Does not touch actions belonging to other users.
 * Fail-safe: if a record has no explicit or derivable owner, it is quarantined during deactivation.
 */
export async function quarantineUserActions(userAliases: string | string[]): Promise<number> {
  const aliases = Array.isArray(userAliases) ? userAliases : [userAliases];
  const targetAliasSet = new Set<string>();
  for (const alias of aliases) {
    if (alias && typeof alias === 'string' && alias.trim()) {
      targetAliasSet.add(alias.trim());
    }
  }

  if (targetAliasSet.size === 0) {
    return 0;
  }
  if (!db) {
    await initOfflineQueue();
  }
  if (!db) {
    return 0;
  }

  const database = db;

  return new Promise<number>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction([STORE_NAME], 'readwrite');
    } catch (err) {
      reject(err);
      return;
    }

    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    let count = 0;

    request.onsuccess = event => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        const action = cursor.value as QueuedAction;
        if (action.status !== 'quarantined') {
          const owner = getQueuedActionOwner(action);
          const shouldQuarantine = owner === null || targetAliasSet.has(owner);

          if (shouldQuarantine) {
            const updatedAction: QueuedAction = {
              ...action,
              status: 'quarantined',
              revision: getActionRevision(action) + 1,
              errorType: 'permanent',
              lastError: action.lastError || 'Account disattivato. Azione quarantinata.',
              failedAt: action.failedAt || new Date().toISOString()
            };
            cursor.update(updatedAction);
            count++;
          }
        }
        cursor.continue();
      }
    };

    request.onerror = () => {
      reject(request.error || new Error('Error opening cursor for quarantine'));
    };

    transaction.oncomplete = () => {
      if (count > 0) {
        dispatchSyncStatusChanged();
      }
      resolve(count);
    };

    transaction.onerror = () => {
      reject(transaction.error || new Error('Quarantine transaction failed'));
    };

    transaction.onabort = () => {
      reject(transaction.error || new Error('Quarantine transaction aborted'));
    };
  });
}

function dispatchSyncStatusChanged(): void {
  document.dispatchEvent(new CustomEvent('sync-status-changed'));
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
  const errorType = action.errorType || classifyError(error);
  if (errorType === 'permanent') {
    const updatedAction: QueuedAction = {
      ...action,
      status: 'failed',
      errorType,
      lastError: errorMessage(error),
      failedAt: new Date().toISOString()
    };

    const persisted = await persistActionIfCurrent(action, updatedAction);
    if (!persisted) {
      logger.info(
        'offlineQueue',
        'Action changed during classification; permanent state not applied:',
        action.id
      );
      return false;
    }
    logger.error('offlineQueue', 'Permanent error; action moved to failed queue:', action.id);
    return true;
  }

  const retryCount = action.retryCount + 1;
  const exhausted = retryCount >= MAX_RETRIES;
  const updatedAction: QueuedAction = {
    ...action,
    retryCount,
    status: exhausted ? 'failed' : 'pending',
    errorType,
    lastError: errorMessage(error),
    failedAt: exhausted ? new Date().toISOString() : undefined
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
    status: 'quarantined',
    errorType: 'permanent',
    lastError: `Esecuzione remota riuscita, ma rimozione locale fallita: ${errorMessage(error)}`,
    failedAt: new Date().toISOString()
  });
}

// ========== EXECUTORS ==========

/**
 * Register an executor for a specific action type
 */
export function registerExecutor(type: QueuedAction['type'], executor: ActionExecutor): void {
  executors.set(type, executor);
}

/**
 * Validate that a queued action belongs to the current user and station.
 * Prevents cross-account replay after logout/account switch (#328).
 */
export function validateActionOwnership(
  action: QueuedAction,
  activeAliases?: string | string[] | Set<string> | null,
  currentStationId?: number | null
): { valid: boolean; reason?: string } {
  let aliasSet: Set<string> | null = null;
  if (activeAliases === undefined) {
    aliasSet = activeUserAliases;
  } else if (typeof activeAliases === 'string') {
    if (activeAliases.trim()) {
      aliasSet = new Set([activeAliases.trim()]);
    }
  } else if (Array.isArray(activeAliases)) {
    const valid = activeAliases
      .filter(a => typeof a === 'string' && a.trim() !== '')
      .map(a => a.trim());
    if (valid.length > 0) aliasSet = new Set(valid);
  } else if (activeAliases instanceof Set) {
    if (activeAliases.size > 0) aliasSet = activeAliases;
  }

  if (!aliasSet || aliasSet.size === 0) {
    return { valid: false, reason: 'no_active_user_context' };
  }

  const owner = getQueuedActionOwner(action);
  if (owner === null) {
    return { valid: false, reason: 'ownerless' };
  }

  if (!aliasSet.has(owner)) {
    return { valid: false, reason: 'user_mismatch' };
  }

  if (
    action.stationId !== undefined &&
    currentStationId !== undefined &&
    currentStationId !== null &&
    action.stationId !== currentStationId
  ) {
    return { valid: false, reason: 'station_mismatch' };
  }

  return { valid: true };
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
    // Ownership check: validate action ownership against active user aliases
    // Pass null for stationId context as global localStorage.stationId is not used by application
    const ownership = validateActionOwnership(action, activeUserAliases, null);
    if (!ownership.valid) {
      if (ownership.reason === 'no_active_user_context') {
        logger.info(
          'offlineQueue',
          'Postponing action replay: no active user session context:',
          action.id
        );
        continue;
      }
      logger.warn(
        'offlineQueue',
        'Skipping action with mismatched ownership:',
        action.id,
        ownership.reason
      );
      try {
        await cancelFailedAction(action.id);
      } catch (cancelErr) {
        logger.error(
          'offlineQueue',
          'Failed to quarantine ownership-mismatched action:',
          cancelErr
        );
      }
      failed++;
      continue;
    }

    const executor = executors.get(action.type);

    if (!executor) {
      logger.warn('offlineQueue', 'No executor for action type:', action.type);
      try {
        await cancelFailedAction(action.id);
      } catch (cancelErr) {
        logger.error('offlineQueue', 'Failed to quarantine action without executor:', cancelErr);
      }
      failed++;
      continue;
    }

    if (!isRetryableError(action)) {
      logger.warn('offlineQueue', 'Skipping non-retryable action:', action.id, action.errorType);
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

  dispatchSyncStatusChanged();

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
