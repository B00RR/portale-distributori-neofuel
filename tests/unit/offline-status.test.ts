import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockIndexedDB,
  mockGetFailedActions,
  mockGetPendingActions,
  mockGetTotalQueueCount,
  mockRetryFailedAction,
  mockCancelFailedAction,
  mockRemoveQuarantinedAction,
  mockSyncPendingActions,
  mockOpenConfirmModal
} = vi.hoisted(() => ({
  mockIndexedDB: () => {
    return {
      open: vi.fn(() => {
        const req: IDBOpenDBRequest = {
          onsuccess: null,
          onerror: null,
          onblocked: null,
          onupgradeneeded: null,
          result: {
            objectStoreNames: {
              contains: () => true,
              item: () => null,
              length: 0
            } as unknown as DOMStringList,
            createObjectStore: () => ({}),
            transaction: () => ({
              objectStore: () => ({
                getAll: () => {
                  const r: IDBRequest = {
                    onsuccess: null,
                    onerror: null,
                    result: []
                  };
                  setTimeout(() => {
                    if (r.onsuccess) r.onsuccess({ target: r } as unknown as Event);
                  }, 0);
                  return r;
                },
                get: () => {
                  const r: IDBRequest = {
                    onsuccess: null,
                    onerror: null,
                    result: undefined
                  };
                  setTimeout(() => {
                    if (r.onsuccess) r.onsuccess({ target: r } as unknown as Event);
                  }, 0);
                  return r;
                }
              })
            })
          },
          error: null,
          readyState: 'done',
          source: null,
          transaction: null
        };
        setTimeout(() => {
          if (req.onsuccess) req.onsuccess({ target: req } as unknown as Event);
        }, 0);
        return req;
      })
    };
  },
  mockGetFailedActions: vi.fn(),
  mockGetPendingActions: vi.fn(),
  mockGetTotalQueueCount: vi.fn(),
  mockRetryFailedAction: vi.fn(),
  mockCancelFailedAction: vi.fn(),
  mockRemoveQuarantinedAction: vi.fn(),
  mockSyncPendingActions: vi.fn(),
  mockOpenConfirmModal: vi.fn().mockResolvedValue(true)
}));

vi.stubGlobal('indexedDB', mockIndexedDB());

vi.mock('../../js/core/offline-queue.js', () => ({
  getFailedActions: mockGetFailedActions,
  getPendingActions: mockGetPendingActions,
  getTotalQueueCount: mockGetTotalQueueCount,
  retryFailedAction: mockRetryFailedAction,
  cancelFailedAction: mockCancelFailedAction,
  removeQuarantinedAction: mockRemoveQuarantinedAction,
  syncPendingActions: mockSyncPendingActions
}));

vi.mock('../../js/ui/ui.js', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
  openConfirmModal: mockOpenConfirmModal
}));

vi.mock('../../js/operator/ui-components.js', () => ({
  createEmptyStateMessage: vi.fn(
    (title: string, message: string) => `<div class="empty-state">${title}: ${message}</div>`
  ),
  createFormActions: vi.fn(
    () => '<button id="btn-cancel">Chiudi</button><button id="btn-sync-now">Sincronizza</button>'
  )
}));

import { showOfflineFailedActionsModal } from '../../js/operator/offline-status.js';

describe('Offline Status UI', () => {
  let modalBody: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    modalBody = document.createElement('div');
    modalBody.id = 'modal-body';
    document.body.appendChild(modalBody);
  });

  it('renders failed actions list with sanitized details', async () => {
    mockGetFailedActions.mockResolvedValue([
      {
        id: 'action-1',
        type: 'movement_create',
        payload: { kind: 'outflow_create', stationId: 5, amount: 100 },
        createdAt: '2026-07-18T10:00:00Z',
        retryCount: 2,
        status: 'failed',
        errorType: 'temporary',
        lastError: 'network error'
      }
    ]);
    mockGetPendingActions.mockResolvedValue([]);
    mockGetTotalQueueCount.mockResolvedValue(1);

    await showOfflineFailedActionsModal();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(modalBody.textContent).toContain('Uscita Cassa');
    expect(modalBody.textContent).toContain('Stazione 5');
    expect(modalBody.textContent).toContain('network error');
    expect(modalBody.textContent).toContain('Errore temporaneo');
  });

  it('disables retry for permanent errors', async () => {
    mockGetFailedActions.mockResolvedValue([
      {
        id: 'action-2',
        type: 'movement_create',
        payload: { kind: 'credit_create', stationId: 1, amount: 50 },
        createdAt: '2026-07-18T10:00:00Z',
        retryCount: 0,
        status: 'failed',
        errorType: 'permanent',
        lastError: 'duplicate key'
      }
    ]);
    mockGetPendingActions.mockResolvedValue([]);
    mockGetTotalQueueCount.mockResolvedValue(1);

    await showOfflineFailedActionsModal();
    await new Promise(resolve => setTimeout(resolve, 0));

    const retryBtn = modalBody.querySelector('[data-id="action-2"]') as HTMLElement;
    expect(retryBtn?.querySelector('.btn-retry')?.getAttribute('disabled')).not.toBeNull();
  });

  it('quarantines an action when user confirms', async () => {
    mockGetFailedActions.mockResolvedValue([
      {
        id: 'action-3',
        type: 'movement_create',
        payload: { kind: 'outflow_create', stationId: 1, amount: 50 },
        createdAt: '2026-07-18T10:00:00Z',
        retryCount: 3,
        status: 'failed',
        errorType: 'temporary',
        lastError: 'max retries'
      }
    ]);
    mockGetPendingActions.mockResolvedValue([]);
    mockGetTotalQueueCount.mockResolvedValue(1);
    mockCancelFailedAction.mockResolvedValue(true);
    mockOpenConfirmModal.mockResolvedValue(true);

    await showOfflineFailedActionsModal();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(modalBody.querySelector('.offline-action-card')).not.toBeNull();
    const quarantineBtn = modalBody.querySelector(
      '[data-id="action-3"] .btn-quarantine'
    ) as HTMLButtonElement | null;
    expect(quarantineBtn).not.toBeNull();
    quarantineBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(
      () => {
        expect(mockOpenConfirmModal).toHaveBeenCalled();
        expect(mockCancelFailedAction).toHaveBeenCalledWith('action-3');
      },
      { timeout: 2000 }
    );
  });
});
