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
}

function shouldQueue(options?: PersistOptions): boolean {
  return !options?.skipOfflineQueue && isOffline();
}

export async function showExtraIncomeMenu(
  stationId: number | string,
  userId: string
): Promise<void> {
  openModal('Registra Incasso Extra');
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
        `<div class="warning-box">
          <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
          <p>Devi aprire un turno prima di poter registrare degli incassi extra.</p>
          <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
        </div>`
      );

      document.getElementById('btn-close-warning')?.addEventListener('click', () => closeModal());
      return;
    }

    renderExtraIncomeForm(modalBody, stationId, userId);
  } catch (err) {
    setSafeHTML(
      modalBody,
      createErrorMessage('Errore Caricamento', err) +
        '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>'
    );
    document.getElementById('btn-close-err')?.addEventListener('click', () => closeModal());
  }
}

function renderExtraIncomeForm(
  container: HTMLElement,
  stationId: number | string,
  userId: string
): void {
  setSafeHTML(
    container,
    `<div class="content-box">
      <p class="section-subtitle">Registra una vendita extra carburante</p>
      <form id="extra-income-form">
        <div class="form-group"><label>Importo (&euro;)</label><input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00"></div>
        <div class="form-group"><label>Metodo di Pagamento</label><select name="payment_method" class="big-input" required><option value="cash">Contanti</option><option value="pos">POS</option><option value="uta">UTA / DKV / Fine Mese</option></select></div>
        <div class="form-group"><label>Tipo di Prodotto</label><select name="type" id="product-type" class="big-input" required><option value="olio">Olio Motore</option><option value="adblue">AdBlue</option><option value="accessori">Accessori Auto</option><option value="altro_incasso">Altro</option></select></div>
        <div class="form-group"><label>Descrizione / Note <span id="required-indicator" style="display: none; color: var(--danger-color);">*</span></label><textarea name="description" id="description-field" rows="3" class="big-input" placeholder="Dettagli vendita..."></textarea></div>
        ${createFormActions({ confirmText: 'Registra Incasso', confirmClass: 'primary' })}
      </form>
    </div>`
  );

  container.querySelector('#btn-cancel')?.addEventListener('click', () => closeModal());

  const productTypeSelect = document.getElementById('product-type') as HTMLSelectElement | null;
  const descriptionField = document.getElementById(
    'description-field'
  ) as HTMLTextAreaElement | null;
  const requiredIndicator = document.getElementById('required-indicator') as HTMLElement | null;

  function updateDescriptionRequired(): void {
    if (!productTypeSelect || !descriptionField || !requiredIndicator) {
      return;
    }

    const selectedType = productTypeSelect.value;
    const requiresDescription = selectedType === 'accessori' || selectedType === 'altro_incasso';

    descriptionField.required = requiresDescription;
    requiredIndicator.style.display = requiresDescription ? 'inline' : 'none';

    if (!requiresDescription) {
      descriptionField.value = '';
    }
  }

  productTypeSelect?.addEventListener('change', updateDescriptionRequired);
  updateDescriptionRequired();

  const form = document.getElementById('extra-income-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const amount = parseFloat((formData.get('amount') as string) || '0');
    const paymentMethod = (formData.get('payment_method') as string) || 'cash';
    const type = (formData.get('type') as string) || '';
    const description = (formData.get('description') as string) || '';

    if (!amount || amount <= 0) {
      Toast.show('Inserire un importo valido.', 'warning');
      return;
    }

    try {
      await processExtraIncome(stationId, userId, amount, paymentMethod, type, description);
      closeModal();
      showInfoModal(
        isOffline()
          ? 'Incasso di ' + amount.toFixed(2) + ' salvato offline.'
          : 'Incasso di ' + amount.toFixed(2) + ' registrato correttamente.'
      );
    } catch (err: unknown) {
      handleError(err, 'showExtraIncomeMenu_submit');
    }
  });
}

export async function processExtraIncome(
  stationId: number | string,
  userId: string,
  amount: number,
  paymentMethod: string,
  type: string,
  description: string,
  options?: PersistOptions
): Promise<void> {
  const createdAt = options?.createdAt ?? getItalianBusinessDayEndUtc();

  const activeOpening = await checkOpeningStatus(stationId);
  const shiftId = activeOpening?.id ?? null;

  if (shouldQueue(options)) {
    await queueAction('movement_create', {
      kind: 'extra_income_create',
      stationId: Number(stationId),
      operatorId: String(userId),
      amount,
      paymentMethod,
      type,
      description,
      createdAt
    });
    return;
  }

  const requestId =
    'extra_income_' +
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
    p_tipo: 'incasso',
    p_payment_method: paymentMethod || 'cash',
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
