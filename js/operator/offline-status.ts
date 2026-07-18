// ==========================================
// OFFLINE FAILED ACTIONS UI
// Vista persistente delle azioni offline fallite e controlli di recupero.
// ==========================================
import { logger } from '../core/logger.js';
import {
  cancelFailedAction,
  getFailedActions,
  getPendingActions,
  getTotalQueueCount,
  QueuedAction,
  removeQuarantinedAction,
  retryFailedAction,
  syncPendingActions
} from '../core/offline-queue.js';
import { closeModal, openConfirmModal, openModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml, formatDateSafe } from '../utils/utils.js';

import { createEmptyStateMessage, createFormActions } from './ui-components.js';

const KIND_LABELS: Record<
  'credit_create' | 'credit_payment' | 'outflow_create' | 'extra_income_create' | 'invoice_request',
  string
> = {
  credit_create: 'Nuovo Credito',
  credit_payment: 'Pagamento Credito',
  outflow_create: 'Uscita Cassa',
  extra_income_create: 'Incasso Extra',
  invoice_request: 'Richiesta Fattura'
};

type ActionTypeLabel = Record<QueuedAction['type'], string>;

const TYPE_LABELS: ActionTypeLabel = {
  voucher_redeem: 'Riscatto Voucher',
  shift_close: 'Chiusura Turno',
  movement_create: 'Movimento',
  generic: 'Generica'
};

function getActionLabel(action: QueuedAction): string {
  const kind = action.payload?.kind;
  if (isKnownKind(kind)) {
    // eslint-disable-next-line security/detect-object-injection -- kind is narrowed to literal keys by isKnownKind
    return KIND_LABELS[kind];
  }
  return TYPE_LABELS[action.type] || action.type;
}

function isKnownKind(value: unknown): value is keyof typeof KIND_LABELS {
  return (
    value === 'credit_create' ||
    value === 'credit_payment' ||
    value === 'outflow_create' ||
    value === 'extra_income_create' ||
    value === 'invoice_request'
  );
}

function getStationLabel(action: QueuedAction): string {
  const stationId = action.payload?.stationId;
  if (stationId === undefined || stationId === null) {
    return '-';
  }
  return String(stationId);
}

function getCreatedAt(action: QueuedAction): string {
  return action.createdAt ? formatDateSafe(action.createdAt) : '-';
}

function getErrorMessage(action: QueuedAction): string {
  return action.lastError || 'Errore sconosciuto';
}

function getStatusClass(action: QueuedAction): string {
  switch (action.status) {
    case 'quarantined':
      return 'status-quarantined';
    case 'failed':
      return action.errorType === 'permanent' ? 'status-permanent' : 'status-temporary';
    default:
      return '';
  }
}

function getStatusText(action: QueuedAction): string {
  switch (action.status) {
    case 'quarantined':
      return 'Quarantena';
    case 'failed':
      return action.errorType === 'permanent' ? 'Errore permanente' : 'Errore temporaneo';
    default:
      return action.status || 'Sconosciuto';
  }
}

/**
 * Apre il pannello delle azioni offline fallite.
 */
export async function showOfflineFailedActionsModal(): Promise<void> {
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }
  openModal('Azioni Offline');
  await render(modalBody);
}

async function render(modalBody: HTMLElement): Promise<void> {
  setSafeHTML(
    modalBody,
    `
      <div class="content-box">
        <p class="section-subtitle">Operazioni salvate localmente e non ancora sincronizzate</p>
        <div id="offline-actions-summary" class="offline-summary" style="margin-bottom: 16px;"></div>
        <div id="offline-actions-list" class="offline-actions-list" style="max-height: 50vh; overflow-y: auto;">
          <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>
        </div>
        ${createFormActions({ confirmText: 'Sincronizza ora', confirmId: 'btn-sync-now', confirmClass: 'primary', cancelText: 'Chiudi' })}
      </div>
    `
  );

  document.querySelector('#btn-cancel')?.addEventListener('click', () => closeModal());
  document.querySelector('#btn-sync-now')?.addEventListener('click', () => {
    void syncPendingActions().finally(() => render(modalBody));
  });

  try {
    const [failed, pending, total] = await Promise.all([
      getFailedActions(),
      getPendingActions(),
      getTotalQueueCount()
    ]);

    renderSummary(modalBody, failed.length, pending.length, total);
    renderList(modalBody, failed);
  } catch (err) {
    logger.error('offlineStatus', 'Failed to load offline actions:', err);
    const list = modalBody.querySelector('#offline-actions-list');
    if (list) {
      setSafeHTML(list as HTMLElement, createErrorPanel('Impossibile caricare la coda offline.'));
    }
  }
}

function renderSummary(
  container: HTMLElement,
  failed: number,
  pending: number,
  total: number
): void {
  const summary = container.querySelector('#offline-actions-summary');
  if (!summary) {
    return;
  }

  setSafeHTML(
    summary as HTMLElement,
    `
      <div class="summary-row">
        <span>In attesa</span>
        <strong>${pending}</strong>
      </div>
      <div class="summary-row">
        <span>Da verificare</span>
        <strong style="color: var(--danger-color);">${failed}</strong>
      </div>
      <div class="summary-row">
        <span>Totale in coda</span>
        <strong>${total}</strong>
      </div>
    `
  );
}

function renderList(container: HTMLElement, failed: QueuedAction[]): void {
  const list = container.querySelector('#offline-actions-list');
  if (!list) {
    return;
  }

  if (failed.length === 0) {
    setSafeHTML(
      list as HTMLElement,
      createEmptyStateMessage(
        'Nessuna azione da verificare',
        'Tutte le operazioni sono state sincronizzate o risolte.'
      )
    );
    return;
  }

  const items = failed
    .map(
      action => `
        <div class="offline-action-card ${getStatusClass(action)}" data-id="${escapeHtml(action.id)}">
          <div class="offline-action-header">
            <strong>${escapeHtml(getActionLabel(action))}</strong>
            <span class="status-badge ${getStatusClass(action)}">${escapeHtml(getStatusText(action))}</span>
          </div>
          <div class="offline-action-meta">
            <span><i class="fas fa-gas-pump"></i> Stazione ${escapeHtml(getStationLabel(action))}</span>
            <span><i class="fas fa-clock"></i> ${escapeHtml(getCreatedAt(action))}</span>
            <span><i class="fas fa-redo"></i> Tentativi: ${action.retryCount}</span>
          </div>
          <div class="offline-action-error">
            <i class="fas fa-exclamation-circle"></i> ${escapeHtml(getErrorMessage(action))}
          </div>
          <div class="offline-action-actions">
            <button class="menu-button small primary btn-retry" data-id="${escapeHtml(action.id)}" ${action.errorType === 'permanent' ? 'disabled' : ''}>
              <i class="fas fa-redo"></i> Riprova
            </button>
            <button class="menu-button small warning btn-quarantine" data-id="${escapeHtml(action.id)}">
              <i class="fas fa-ban"></i> ${action.status === 'quarantined' ? 'Rimuovi' : 'Quarantena'}
            </button>
          </div>
        </div>
      `
    )
    .join('');

  setSafeHTML(
    list as HTMLElement,
    `
      <div class="offline-actions-scroll">
        ${items}
      </div>
      <p class="small-text" style="margin-top: 12px; color: var(--text-muted);">
        Le azioni in quarantena richiedono verifica manuale. I payload completi restano nel dispositivo.
      </p>
    `
  );

  list.querySelectorAll('.btn-retry').forEach(button => {
    button.addEventListener('click', async e => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (!id) return;
      const confirmed = await openConfirmModal(
        "Riprova ora l'operazione? Verifica che la connessione sia attiva e che i dati siano corretti."
      );
      if (!confirmed) return;
      const ok = await retryFailedAction(id);
      if (ok) {
        const body = document.getElementById('modal-body');
        if (body) await render(body);
      }
    });
  });

  list.querySelectorAll('.btn-quarantine').forEach(button => {
    button.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const id = target.dataset.id;
      if (!id) return;
      const isQuarantined = failed.find(a => a.id === id)?.status === 'quarantined';
      const message = isQuarantined
        ? "Rimuovere definitivamente l'azione dalla coda? L'operazione è già stata gestita o non è più necessaria."
        : "Spostare l'azione in quarantena? Non verrà più riprovata automaticamente.";
      const confirmed = await openConfirmModal(message);
      if (!confirmed) return;

      if (isQuarantined) {
        await removeQuarantinedAction(id);
      } else {
        await cancelFailedAction(id);
      }
      const body = document.getElementById('modal-body');
      if (body) await render(body);
    });
  });
}

function createErrorPanel(message: string): string {
  return `
    <div class="warning-message">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Errore caricamento</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}
