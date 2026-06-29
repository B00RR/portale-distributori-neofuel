import { supabase } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showInfoModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { getErrorMessage } from '../utils/utils.js';

import { checkOpeningStatus } from './opening.js';
import { createErrorMessage, createFormActions } from './ui-components.js';

/**
 * Mostra il menu per la gestione degli incassi extra (olio, AdBlue, ecc.)
 * @param {number | string} stationId - ID della stazione
 * @param {string} userId - ID dell'operatore
 */
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
    // Verifica apertura turno
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      setSafeHTML(
        modalBody,
        `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter registrare degli incassi extra.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `
      );

      const closeBtn = document.getElementById('btn-close-warning');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal());
      }
      return;
    }

    renderExtraIncomeForm(modalBody, stationId, userId);
  } catch (err) {
    setSafeHTML(
      modalBody,
      createErrorMessage('Errore Caricamento', err) +
        '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>'
    );
    const closeBtn = document.getElementById('btn-close-err');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal());
    }
  }
}

/**
 * Renderizza il form per l'inserimento dell'incasso extra
 */
function renderExtraIncomeForm(
  container: HTMLElement,
  stationId: number | string,
  userId: string
): void {
  setSafeHTML(
    container,
    `
      <div class="content-box">
        <p class="section-subtitle">Registra una vendita extra carburante</p>
        <form id="extra-income-form">
            <div class="form-group">
            <label>Importo (€)</label>
            <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
            </div>

            <div class="form-group">
            <label>Tipo di Prodotto</label>
            <select name="type" id="product-type" class="big-input" required>
                <option value="olio">Olio Motore</option>
                <option value="adblue">AdBlue</option>
                <option value="accessori">Accessori Auto</option>
                <option value="altro_incasso">Altro</option>
            </select>
            </div>

            <div class="form-group">
            <label>Descrizione / Note <span id="required-indicator" style="display: none; color: #ef4444;">*</span></label>
            <textarea name="description" id="description-field" rows="3" class="big-input" placeholder="Dettagli vendita..."></textarea>
            </div>

            ${createFormActions({ confirmText: 'Registra Incasso', confirmClass: 'primary' })}
        </form>
      </div>
    `
  );

  // Event Listeners
  const cancelBtn = container.querySelector('#btn-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeModal());
  }

  // Dynamic required field based on product type
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
      descriptionField.value = ''; // Clear if not required
    }
  }

  if (productTypeSelect) {
    productTypeSelect.addEventListener('change', updateDescriptionRequired);
    updateDescriptionRequired(); // Initialize on load
  }

  const form = document.getElementById('extra-income-form') as HTMLFormElement | null;
  if (form) {
    form.addEventListener('submit', async e => {
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
        // Salva in movimenti_cassa con tipo 'incasso'
        const { error } = await supabase.from('movimenti_cassa').insert([
          {
            station_id: Number(stationId),
            operator_id: Number(userId),
            tipo: 'incasso', // Tipo per identificare gli incassi extra
            importo: amount,
            descrizione: `[${type.toUpperCase()}] ${description}`,
            created_at: new Date().toISOString()
          }
        ]);

        if (error) {
          throw error;
        }

        closeModal();
        showInfoModal(`Incasso di € ${amount.toFixed(2)} registrato correttamente.`);
      } catch (err: unknown) {
        Toast.show('Errore salvataggio: ' + getErrorMessage(err), 'error');
      }
    });
  }
}
