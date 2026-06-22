import { supabase } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showInfoModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { getErrorMessage } from '../utils/utils.js';

import { checkOpeningStatus } from './opening.js';
import { createErrorMessage, createFormActions } from './ui-components.js';

/**
 * Mostra il menu per la gestione delle uscite di cassa
 * @param {number | string} stationId - ID della stazione
 * @param {string} userId - ID dell'operatore
 */
export async function showOutflowMenu(stationId: number | string, userId: string): Promise<void> {
  openModal('Registra Uscita Cassa');
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) { return; }
  setSafeHTML(modalBody, '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>');

  try {
    // Verifica apertura turno
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      setSafeHTML(modalBody, `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter registrare delle uscite.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `);

      const closeBtn = document.getElementById('btn-close-warning');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal());
      }
      return;
    }

    renderOutflowForm(modalBody, stationId, userId);

  } catch (err) {
    setSafeHTML(modalBody, createErrorMessage('Errore Caricamento', err) +
            '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>');
    const closeBtn = document.getElementById('btn-close-err');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal());
    }
  }
}

/**
 * Renderizza il form per l'inserimento dell'uscita
 */
function renderOutflowForm(container: HTMLElement, stationId: number | string, userId: string): void {
  setSafeHTML(container, `
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
    `);

  // Event Listeners
  const cancelBtn = container.querySelector('#btn-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeModal());
  }

  const form = document.getElementById('outflow-form') as HTMLFormElement | null;
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const amount = parseFloat(formData.get('amount') as string || '0');
      const type = formData.get('type') as string || '';
      const description = (formData.get('description') as string) || '';

      if (!amount || amount <= 0) {
        Toast.show('Inserire un importo valido.', 'warning');
        return;
      }

      try {
        const { error } = await supabase
          .from('movimenti_cassa')
          .insert([{
            station_id: Number(stationId),
            operator_id: Number(userId),
            tipo: 'uscita',
            importo: amount,
            descrizione: `[${type.toUpperCase()}] ${description}`,
            created_at: new Date().toISOString()
          }]);

        if (error) { throw error; }

        closeModal();
        showInfoModal(`Uscita di € ${amount.toFixed(2)} registrata correttamente.`);

      } catch (err: unknown) {
        Toast.show('Errore salvataggio: ' + getErrorMessage(err), 'error');
      }
    });
  }
}
