// ==========================================
// OPERATOR CREDITS MANAGEMENT
// Gestione crediti clienti (ricerca, pagamento, ricarica)
// ==========================================
import { supabase } from "./api.js";
import { showLoadingMessage, showErrorMessage, showInfoModal, openModal, closeModal } from "./ui.js";
import { escapeHtml, formatEuro } from "./utils.js";

/**
 * Mostra il menu principale per la gestione crediti
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showCreditsMenu(stationId, userId) {
    openModal('Gestione Crediti');
    const modalBody = document.getElementById('modal-body');
    
    modalBody.innerHTML = `
      <div class="form-group">
        <input type="text" id="credit-search" class="big-input" placeholder="Cerca cliente (nome)...">
      </div>
      <div id="credits-results" class="results-list" style="max-height: 400px; overflow-y: auto; margin-top: 15px;"></div>
    `;

    const searchInput = document.getElementById('credit-search');
    const resultsDiv = document.getElementById('credits-results');

    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => searchCustomers(e.target.value, stationId, userId), 300);
    });
}

/**
 * Cerca clienti per nome
 * @param {string} query - Query di ricerca
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 * @param {HTMLElement} container - Container principale
 */
async function searchCustomers(query, stationId, userId) {
    const resultsDiv = document.getElementById('credits-results');
    if (!query || query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    resultsDiv.innerHTML = '<p class="loading-text">Ricerca in corso...</p>';

    try {
        const { data: customers, error } = await supabase
            .from('crediti_clienti')
            .select('*')
            .ilike('cliente', `%${query}%`)
            .limit(10);

        if (error) throw error;

        if (!customers || customers.length === 0) {
            resultsDiv.innerHTML = '<p>Nessun cliente trovato.</p>';
            return;
        }

        resultsDiv.innerHTML = customers.map(c => `
      <div class="result-item" onclick="window.selectCustomer('${c.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: background 0.2s;">
        <div class="result-info">
          <strong>${escapeHtml(c.cliente)}</strong>
          <span style="display: block; color: #64748b; font-size: 0.9rem; margin-top: 4px;">Saldo: ${formatEuro(c.saldo || 0)}</span>
        </div>
        <button class="btn-small primary">Seleziona</button>
      </div>
    `).join('');

        // Hack per passare l'oggetto cliente al click
        window.selectCustomer = (customerId) => {
            const customer = customers.find(c => c.id == customerId);
            if (customer) showCustomerActions(customer, stationId, userId);
        };

    } catch (err) {
        resultsDiv.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
    }
}

/**
 * Mostra le azioni disponibili per un cliente (pagamento/ricarica)
 * @param {Object} customer - Dati del cliente
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 * @param {HTMLElement} container - Container principale
 */
function showCustomerActions(customer, stationId, userId) {
    openModal(`Crediti - ${escapeHtml(customer.cliente)}`);
    const modalBody = document.getElementById('modal-body');
    
    modalBody.innerHTML = `
      <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
        <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 5px;">Saldo Attuale</div>
        <div style="font-size: 1.5rem; font-weight: 600; color: #0ea5e9;">${formatEuro(customer.saldo || 0)}</div>
      </div>

      <div class="action-tabs" style="display: flex; gap: 10px; margin-bottom: 20px;">
        <button class="tab-btn active" data-action="payment" style="flex: 1; padding: 12px; border: 2px solid #cbd5e1; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">Pagamento (Usa Credito)</button>
        <button class="tab-btn" data-action="recharge" style="flex: 1; padding: 12px; border: 2px solid #cbd5e1; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">Ricarica (Aggiungi)</button>
      </div>

      <form id="credit-action-form">
        <input type="hidden" name="action_type" id="action_type" value="payment">
        
        <div class="form-group">
          <label id="amount-label">Importo da Scalare (€)</label>
          <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required>
        </div>

        <div class="form-group">
          <label>Note</label>
          <textarea name="notes" rows="2" class="big-input"></textarea>
        </div>

        <div class="form-actions" style="display: flex; gap: 10px; margin-top: 20px;">
          <button type="button" class="menu-button secondary" id="btn-cancel-customer" style="flex: 1;">
            <i class="fas fa-arrow-left"></i> Indietro
          </button>
          <button type="submit" class="menu-button primary" id="btn-confirm-credit" style="flex: 1;">
            Conferma Operazione
          </button>
        </div>
      </form>
      
      <style>
        .tab-btn.active {
          border-color: #3b82f6 !important;
          background-color: #eff6ff !important;
          color: #1e40af;
        }
      </style>
    `;

    // Tab logic
    const tabs = container.querySelectorAll('.tab-btn');
    const actionInput = document.getElementById('action_type');
    const amountLabel = document.getElementById('amount-label');
    const submitBtn = document.getElementById('btn-confirm-credit');

    tabs.forEach(t => {
        t.addEventListener('click', () => {
            tabs.forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            const action = t.dataset.action;
            actionInput.value = action;

            if (action === 'payment') {
                amountLabel.textContent = 'Importo da Scalare (€)';
                submitBtn.className = 'menu-button primary';
                submitBtn.textContent = 'Conferma Pagamento';
            } else {
                amountLabel.textContent = 'Importo da Ricaricare (€)';
                submitBtn.className = 'menu-button success';
                submitBtn.textContent = 'Conferma Ricarica';
            }
        });
    });

    document.getElementById('btn-cancel-customer').addEventListener('click', () => {
        showCreditsMenu(stationId, userId);
    });

    document.getElementById('credit-action-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const amount = parseFloat(formData.get('amount'));
        const action = formData.get('action_type');
        const notes = formData.get('notes');

        if (!amount || amount <= 0) return;

        if (action === 'payment' && amount > (customer.saldo || 0)) {
            alert('Saldo insufficiente!');
            return;
        }

        if (!confirm(`Confermi ${action === 'payment' ? 'il pagamento' : 'la ricarica'} di ${formatEuro(amount)}?`)) return;

        const submitBtn = document.getElementById('btn-confirm-credit');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...';

        try {
            // 1. Registra movimento
            const movementType = action === 'payment' ? 'scarico' : 'carico';

            const { error: moveError } = await supabase.from('crediti_movimenti').insert([{
                cliente_id: customer.id,
                importo: amount,
                metodo: movementType,
                station_id: stationId,
                operator_id: userId,
                created_at: new Date().toISOString()
            }]);

            if (moveError) throw moveError;

            // 2. Aggiorna saldo cliente
            const newBalance = action === 'payment'
                ? (customer.saldo || 0) - amount
                : (customer.saldo || 0) + amount;

            const { error: updateError } = await supabase
                .from('crediti_clienti')
                .update({ saldo: newBalance, updated_at: new Date().toISOString() })
                .eq('id', customer.id);

            if (updateError) throw updateError;

            closeModal();
            showInfoModal('Operazione completata con successo!');
            showCreditsMenu(stationId, userId);

        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            showInfoModal('Errore: ' + err.message);
        }
    });
}
