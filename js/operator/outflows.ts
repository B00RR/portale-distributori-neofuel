import { supabase } from '../core/api.js';
import { isOffline, queueAction } from '../core/offline-queue.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showInfoModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { getItalianBusinessDayEndUtc } from '../utils/utils.js';

import { checkOpeningStatus } from './opening.js';
import { createErrorMessage, createFormActions } from './ui-components.js';

interface PersistOptions {
  skipOfflineQueue?: boolean;
  createdAt?: string;
  requestId?: string;
}

function shouldQueue(options?: PersistOptions): boolean {
  return !options?.skipOfflineQueue && isOffline();
}

/**
 * Mostra il menu per la gestione delle uscite di cassa
 * @param {number | string} stationId - ID della stazione
 * @param {string} userId - ID dell'operatore
 */
export async function showOutflowMenu(stationId: number | string, userId: string): Promise<void> {
  openModal('Registra Uscita Cassa');
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }
  setSafeHTML(
    modalBody,
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>'
  );

  try {
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      setSafeHTML(
        modalBody,
        `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter registrare delle uscite.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `
      );

      document.getElementById('btn-close-warning')?.addEventListener('click', () => closeModal());
      return;
    }

    renderOutflowForm(modalBody, stationId, userId);
  } catch (err) {
    setSafeHTML(
      modalBody,
      createErrorMessage('Errore Caricamento', err) +
        '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>'
    );
    document.getElementById('btn-close-err')?.addEventListener('click', () => closeModal());
  }
}

function renderOutflowForm(
  container: HTMLElement,
  stationId: number | string,
  userId: string
): void {
  setSafeHTML(
    container,
    `
      <div class="content-box">
        <p class="section-subtitle">Registra una spesa o un prelievo dalla cassa</p>
        <form id="outflow-form">
            <div class="form-group"><label>Importo (€)</label><input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00"></div>
            <div class="form-group"><label>Tipo di Uscita</label><select name="type" class="big-input" required><option value="rimborso">Rimborso Cliente</option><option value="pagamento">Pagamento Fattura/Fornitore</option><option value="prelievo">Prelievo Titolare</option><option value="altro_uscita">Altro</option></select></div>
            <div class="form-group"><label>Descrizione / Note</label><textarea name="description" rows="3" class="big-input" placeholder="Dettagli operazione..." required></textarea></div>
            ${createFormActions({ confirmText: 'Registra Uscita', confirmClass: 'danger' })}
        </form>
      </div>
    `
  );

  container.querySelector('#btn-cancel')?.addEventListener('click', () => closeModal());

  const form = document.getElementById('outflow-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const amount = parseFloat((formData.get('amount') as string) || '0');
    const type = (formData.get('type') as string) || '';
    const description = (formData.get('description') as string) || '';

    if (!amount || amount <= 0) {
      Toast.show('Inserire un importo valido.', 'warning');
      return;
    }

    try {
      await processOutflow(stationId, userId, amount, type, description);
      closeModal();
      showInfoModal(
        isOffline()
          ? 'Uscita di ' + amount.toFixed(2) + ' salvata offline.'
          : 'Uscita di ' + amount.toFixed(2) + ' registrata correttamente.'
      );
    } catch (err: unknown) {
      handleError(err, 'showOutflowMenu_submit');
    }
  });
}

export async function processOutflow(
  stationId: number | string,
  userId: string,
  amount: number,
  type: string,
  description: string,
  options?: PersistOptions
): Promise<void> {
  const createdAt = options?.createdAt ?? getItalianBusinessDayEndUtc();

  const activeOpening = await checkOpeningStatus(stationId);
  const shiftId = activeOpening?.id ?? null;

  if (shouldQueue(options)) {
    await queueAction(
      'movement_create',
      {
        kind: 'outflow_create',
        stationId: Number(stationId),
        operatorId: String(userId),
        amount,
        type,
        description,
        createdAt
      },
      { userId: String(userId), stationId: Number(stationId) }
    );
    return;
  }

  const requestId =
    options?.requestId ??
    'outflow_' +
      stationId +
      '_' +
      (shiftId ?? 'no-shift') +
      '_' +
      Date.now() +
      '_' +
      Math.random().toString(36).substring(2, 9);
  const { data: result, error } = await supabase.rpc('create_movement_v2', {
    p_station_id: Number(stationId),
    p_shift_id: shiftId ?? undefined,
    p_operator_id: Number(userId),
    p_tipo: 'uscita',
    p_payment_method: 'cash',
    p_importo: amount,
    p_descrizione: '[' + type.toUpperCase() + '] ' + description,
    p_request_id: requestId,
    p_created_at: createdAt
  });

  if (error) {
    throw error;
  }
  if (result && typeof result === 'object' && 'success' in result && !result.success) {
    throw new Error(String(result.error ?? 'Errore durante la registrazione'));
  }
}
