import { supabase } from "../core/api.js";
import { openModal, closeModal, showInfoModal } from "../ui/ui.js";
import { createWarningMessage, createErrorMessage, createFormActions } from "./ui-components.js";
import { checkOpeningStatus } from "./opening.js";
import { Toast } from "../ui/toast.js";
import { handleError } from "../shared/error-handler.js";

/**
 * Mostra il menu per la gestione degli incassi extra (olio, AdBlue, ecc.)
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showExtraIncomeMenu(stationId, userId) {
    openModal('Registra Incasso Extra');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

    try {
        // Verifica apertura turno
        const activeOpening = await checkOpeningStatus(stationId);
        if (!activeOpening) {
            modalBody.innerHTML = `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter registrare degli incassi extra.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;

            document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
            return;
        }

        renderExtraIncomeForm(modalBody, stationId, userId, activeOpening.id);

    } catch (err) {
        modalBody.innerHTML = createErrorMessage("Errore Caricamento", err) +
            `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
        document.getElementById('btn-close-err').addEventListener('click', () => closeModal());
    }
}

/**
 * Renderizza il form per l'inserimento dell'incasso extra
 */
function renderExtraIncomeForm(container, stationId, userId, turnoId) {
    container.innerHTML = `
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
    `;

    // Event Listeners
    container.querySelector('#btn-cancel').addEventListener('click', () => {
        closeModal();
    });

    // Dynamic required field based on product type
    const productTypeSelect = document.getElementById('product-type');
    const descriptionField = document.getElementById('description-field');
    const requiredIndicator = document.getElementById('required-indicator');

    function updateDescriptionRequired() {
        const selectedType = productTypeSelect.value;
        const requiresDescription = selectedType === 'accessori' || selectedType === 'altro_incasso';

        descriptionField.required = requiresDescription;
        requiredIndicator.style.display = requiresDescription ? 'inline' : 'none';

        if (!requiresDescription) {
            descriptionField.value = ''; // Clear if not required
        }
    }

    productTypeSelect.addEventListener('change', updateDescriptionRequired);
    updateDescriptionRequired(); // Initialize on load

    document.getElementById('extra-income-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const amount = parseFloat(formData.get('amount'));
        const type = formData.get('type');
        const description = formData.get('description');

        if (!amount || amount <= 0) {
            Toast.show("Inserire un importo valido.", 'warning');
            return;
        }

        try {
            // Salva in movimenti_cassa con tipo 'incasso'
            const { error } = await supabase
                .from('movimenti_cassa')
                .insert([{
                    station_id: stationId,
                    operator_id: userId,
                    tipo: 'incasso', // Tipo per identificare gli incassi extra
                    importo: amount,
                    descrizione: `[${type.toUpperCase()}] ${description}`,
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;

            closeModal();
            showInfoModal(`Incasso di € ${amount.toFixed(2)} registrato correttamente.`);

        } catch (err) {
            Toast.show("Errore salvataggio: " + err.message, 'error');
        }
    });
}
