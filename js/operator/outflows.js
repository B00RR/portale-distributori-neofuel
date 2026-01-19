import { supabase } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showInfoModal } from '../ui/ui.js';

import { checkOpeningStatus } from './opening.js';
import { createWarningMessage, createErrorMessage, createFormActions } from './ui-components.js';

/**
 * Mostra il menu per la gestione delle uscite di cassa
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showOutflowMenu(stationId, userId) {
  openModal('Registra Uscita Cassa');
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

  try {
    // Verifica apertura turno
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      modalBody.innerHTML = `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter registrare delle uscite.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;

      document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
      return;
    }

    renderOutflowForm(modalBody, stationId, userId, activeOpening.id);

  } catch (err) {
    modalBody.innerHTML = createErrorMessage('Errore Caricamento', err) +
            '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>';
    document.getElementById('btn-close-err').addEventListener('click', () => closeModal());
  }
}

/**
 * Renderizza il form per l'inserimento dell'uscita
 */
function renderOutflowForm(container, stationId, userId, turnoId) {
  container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Registra una spesa o un prelievo dalla cassa</p>
        <form id="outflow-form">
            <div class="form-group">
            <label>Importo (€)</label>
            <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
            </div>

            <div class="form-group">
            <label>Tipo di Uscita</label>
            <select name="type" class="big-input" required>
                <option value="rimborso">Rimborso Cliente</option>
                <option value="pagamento">Pagamento Fattura/Fornitore</option>
                <option value="prelievo">Prelievo Titolare</option>
                <option value="altro_uscita">Altro</option>
            </select>
            </div>

            <div class="form-group">
            <label>Descrizione / Note</label>
            <textarea name="description" rows="3" class="big-input" placeholder="Dettagli operazione..." required></textarea>
            </div>

            ${createFormActions({ confirmText: 'Registra Uscita', confirmClass: 'danger' })}
        </form>
      </div>
    `;

  // Event Listeners
  container.querySelector('#btn-cancel').addEventListener('click', () => {
    closeModal();
  });

  document.getElementById('outflow-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(/** @type {HTMLFormElement} */(e.target));
    const amount = parseFloat(formData.get('amount')?.toString() || '0');
    const type = formData.get('type')?.toString() || '';
    const description = formData.get('description')?.toString() || '';

    if (!amount || amount <= 0) {
      Toast.show('Inserire un importo valido.', 'warning');
      return;
    }

    try {
      const { error } = await supabase
        .from('movimenti_cassa')
        .insert([{
          station_id: stationId,
          operator_id: userId,
          tipo: 'uscita',
          importo: amount,
          descrizione: `[${type.toUpperCase()}] ${description}`,
          created_at: new Date().toISOString()
        }]);

      if (error) {throw error;}

      closeModal();
      showInfoModal(`Uscita di € ${amount.toFixed(2)} registrata correttamente.`);

    } catch (err) {
      Toast.show('Errore salvataggio: ' + err.message, 'error');
    }
  });
}
