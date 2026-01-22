import { supabase } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showInfoModal } from '../ui/ui.js';

import { checkOpeningStatus } from './opening.js';
import { createErrorMessage, createFormActions } from './ui-components.js';

/**
 * Open the "Registra Uscita Cassa" modal and present the UI to register a cash outflow for a station and operator.
 *
 * If a station does not have an active opening, a warning is shown instead of the form.
 *
 * @param stationId - The station identifier (number or string)
 * @param userId - The operator identifier
 */
export async function showOutflowMenu(stationId: number | string, userId: string): Promise<void> {
    openModal('Registra Uscita Cassa');
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) { return; }
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

            const closeBtn = document.getElementById('btn-close-warning');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => closeModal());
            }
            return;
        }

        renderOutflowForm(modalBody, stationId, userId);

    } catch (err) {
        modalBody.innerHTML = createErrorMessage('Errore Caricamento', err) +
            '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>';
        const closeBtn = document.getElementById('btn-close-err');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeModal());
        }
    }
}

/**
 * Render an outflow entry form into the provided container and attach handlers to validate input and persist the outflow.
 *
 * On form submission the function validates the amount (> 0), inserts a `tipo: 'uscita'` record into the `movimenti_cassa` table (including station and operator identifiers, a formatted description, amount and a timestamp), closes the modal and shows a confirmation on success, or displays an error toast on failure.
 *
 * @param container - The DOM element where the form will be rendered.
 * @param stationId - Identifier of the station (numeric or string) associated with the outflow.
 * @param userId - Identifier of the operator recording the outflow.
 */
function renderOutflowForm(container: HTMLElement, stationId: number | string, userId: string): void {
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
                        station_id: stationId,
                        operator_id: userId,
                        tipo: 'uscita',
                        importo: amount,
                        descrizione: `[${type.toUpperCase()}] ${description}`,
                        created_at: new Date().toISOString()
                    }]);

                if (error) { throw error; }

                closeModal();
                showInfoModal(`Uscita di € ${amount.toFixed(2)} registrata correttamente.`);

            } catch (err: any) {
                Toast.show('Errore salvataggio: ' + err.message, 'error');
            }
        });
    }
}