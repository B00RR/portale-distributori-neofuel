// ==========================================
// OPERATOR INVOICE REQUESTS
// Gestione richieste fattura (Non fiscale / Non incide su cassa)
// ==========================================
import { supabase } from "./api.js";
import { openModal, closeModal, showInfoModal } from "./ui.js";
import { createWarningMessage, createErrorMessage, createFormActions } from "./operator-ui-components.js";
import { checkOpeningStatus } from "./operator-opening.js";

/**
 * Mostra il menu per la richiesta fatture
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showInvoiceMenu(stationId, userId) {
    openModal('Richiesta Fattura');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

    try {
        // Verifica apertura turno
        const activeOpening = await checkOpeningStatus(stationId);
        if (!activeOpening) {
            modalBody.innerHTML = createWarningMessage(
                "Nessun Turno Aperto",
                "Devi aprire un turno prima di poter registrare richieste di fattura."
            ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>`;

            document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
            return;
        }

        renderInvoiceForm(modalBody, stationId, userId);

    } catch (err) {
        modalBody.innerHTML = createErrorMessage("Errore Caricamento", err) +
            `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
        document.getElementById('btn-close-err').addEventListener('click', () => closeModal());
    }
}

/**
 * Renderizza il form per la richiesta fattura
 */
function renderInvoiceForm(container, stationId, userId) {
    container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Registra una richiesta di fattura per un cliente</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <form id="invoice-form">
            <div class="form-group">
                <label>Ragione Sociale / Nome Cliente</label>
                <input type="text" name="customer_name" class="big-input" required placeholder="Es. Azienda SRL">
            </div>

            <div class="form-group">
                <label>Importo Rifornimento (€)</label>
                <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
            </div>

            <div class="form-group">
                <label>Dati Fatturazione / Note</label>
                <textarea name="notes" rows="4" class="big-input" placeholder="P.IVA, Codice Univoco, Targa, ecc..." required></textarea>
            </div>

            ${createFormActions({ confirmText: 'Invia Richiesta', confirmClass: 'primary' })}
        </form>
      </div>
    `;

    // Event Listeners
    container.querySelector('#btn-cancel').addEventListener('click', () => {
        closeModal();
    });

    document.getElementById('invoice-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const customerName = formData.get('customer_name').trim();
        const amount = parseFloat(formData.get('amount'));
        const notes = formData.get('notes').trim();

        if (!customerName || amount <= 0) {
            alert("Inserire tutti i dati obbligatori.");
            return;
        }

        try {
            const { error } = await supabase
                .from('invoice_requests')
                .insert([{
                    station_id: stationId,
                    operator_id: userId,
                    customer_name: customerName,
                    amount: amount,
                    notes: notes,
                    status: 'pending',
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;

            closeModal();
            showInfoModal(`Richiesta fattura per ${customerName} inviata correttamente.`);

        } catch (err) {
            alert("Errore salvataggio: " + err.message);
        }
    });
}
