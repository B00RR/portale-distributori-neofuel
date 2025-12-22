// ==========================================
// OPERATOR CREDITS MANAGEMENT
// Gestione crediti clienti (Nuovo Credito vs Pagamento)
// ==========================================
import { supabase } from "../core/api.js";
import { showLoadingMessage, showErrorMessage, showInfoModal, openModal, closeModal } from "../ui/ui.js";
import { escapeHtml, formatEuro } from "../utils/utils.js";
import { createBackButton, createFormActions, createWarningMessage } from "./ui-components.js";
import { checkOpeningStatus } from "./opening.js";
import { Toast } from "../ui/toast.js";
import { handleError } from "../shared/error-handler.js";

/**
 * Mostra il menu principale per la gestione crediti
 * Scelta tra "Nuovo Credito" e "Pagamento"
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showCreditsMenu(stationId, userId) {
    openModal('Gestione Crediti');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

    // Verifica apertura turno
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
        modalBody.innerHTML = `
            <div style="background:#fee2e2; color:#b91c1c; padding:30px; border-radius:12px; border:2px solid #fecaca; text-align:center; margin: 20px;">
                <h2 style="margin:0 0 15px 0; color:#b91c1c;"><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                <p style="font-size:1.1em; margin:0 0 20px 0;">Devi aprire un turno prima di poter gestire i crediti.</p>
                <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
            </div>
        `;

        document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
        return;
    }

    modalBody.innerHTML = `
        <div class="credits-menu-container">
            <p class="section-subtitle" style="text-align: center; margin-bottom: 20px;">Seleziona un'operazione</p>
            
            <div class="credits-options" style="display: flex; gap: 20px; justify-content: center;">
            <!-- Opzione 1: Nuovo Credito -->
            <button id="btn-new-credit" class="credit-option-card">
                <div class="icon-wrapper new-credit">
                    <i class="fas fa-plus-circle"></i>
                </div>
                <h3>Nuovo Credito</h3>
                <p>Erogazione senza incasso</p>
            </button>

            <!-- Opzione 2: Pagamento -->
            <button id="btn-payment-credit" class="credit-option-card">
                <div class="icon-wrapper payment">
                    <i class="fas fa-hand-holding-usd"></i>
                </div>
                <h3>Pagamento</h3>
                <p>Incasso su credito aperto</p>
            </button>
        </div>

        <style>
            .credit-option-card {
                flex: 1;
                background: white;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                max-width: 250px;
            }
            .credit-option-card:hover {
                border-color: #3b82f6;
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
            .icon-wrapper {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                margin-bottom: 5px;
            }
            .icon-wrapper.new-credit {
                background: #eff6ff;
                color: #3b82f6;
            }
            .icon-wrapper.payment {
                background: #f0fdf4;
                color: #22c55e;
            }
            .credit-option-card h3 {
                margin: 0;
                color: #1e293b;
                font-size: 1.1rem;
            }
            .credit-option-card p {
                margin: 0;
                color: #64748b;
                font-size: 0.9rem;
            }
        </style>
      </div>
    `;

    document.getElementById('btn-new-credit').addEventListener('click', () => showNewCreditForm(stationId, userId));
    document.getElementById('btn-payment-credit').addEventListener('click', () => showPaymentSelection(stationId, userId));
}

/**
 * 1. NUOVO CREDITO
 * L'operatore segna nome cliente e importo.
 * Viene sottratto dai contanti (erogazione senza incasso).
 */
async function showNewCreditForm(stationId, userId) {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div class="content-box">
            <h3><i class="fas fa-user-plus"></i> Nuovo Credito</h3>
            <p class="section-subtitle">Registra un debito per un cliente</p>
            
            <form id="new-credit-form">
                <div class="form-group">
                    <label>Nome Cliente</label>
                    <div style="position: relative;">
                        <input type="text" id="customer-name" name="customer_name" class="big-input" required autocomplete="off" placeholder="Cerca o inserisci nuovo...">
                        <div id="customer-suggestions" class="suggestions-list" style="display: none;"></div>
                    </div>
                </div>

                    <div class="form-group">
                    <label>Importo (€)</label>
                    <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
                </div>

                <div class="form-group">
                    <label>Prodotto</label>
                    <select name="product" class="big-input" required>
                        <option value="Gasolio">Gasolio</option>
                        <option value="Benzina">Benzina</option>
                        <option value="AdBlue">AdBlue</option>
                        <option value="Accessori">Accessori</option>
                        <option value="Altro">Altro</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Note (Opzionale)</label>
                    <textarea name="notes" rows="2" class="big-input" placeholder="Targa, dettagli..."></textarea>
                </div>



                <div class="form-actions">
                    <button type="button" class="menu-button btn-danger" id="btn-back-credits">
                        <i class="fas fa-arrow-left"></i> Annulla
                    </button>
                    <button type="submit" class="menu-button btn-success">
                        Conferma Credito
                    </button>
                </div>
            </form>
            
            <style>
                .suggestions-list {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: white;
                    border: 1px solid #cbd5e1;
                    border-radius: 0 0 8px 8px;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 10;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .suggestion-item {
                    padding: 10px;
                    cursor: pointer;
                    border-bottom: 1px solid #f1f5f9;
                }
                .suggestion-item:hover {
                    background: #f8fafc;
                }
            </style>
        </div>
    `;

    // Back button
    document.getElementById('btn-back-credits').addEventListener('click', () => showCreditsMenu(stationId, userId));

    // Customer Search Logic
    const nameInput = document.getElementById('customer-name');
    const suggestionsDiv = document.getElementById('customer-suggestions');
    let debounceTimer;

    nameInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value;
        if (query.length < 2) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        debounceTimer = setTimeout(() => searchCustomersForInput(query, stationId, suggestionsDiv, nameInput), 300);
    });

    // Form Submit
    document.getElementById('new-credit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const customerName = formData.get('customer_name').trim();
        const amount = parseFloat(formData.get('amount'));
        const product = formData.get('product'); // New field
        const notes = formData.get('notes');

        if (!customerName || amount <= 0) return;

        try {
            await processNewCredit(stationId, userId, customerName, amount, product, notes);
            closeModal();
            showInfoModal('Credito registrato con successo!');
        } catch (err) {
            Toast.show('Errore: ' + err.message, 'error');
        }
    });
}

async function searchCustomersForInput(query, stationId, suggestionsDiv, inputField) {
    try {
        const { data: customers } = await supabase
            .from('crediti_clienti')
            .select('cliente')
            .eq('station_id', stationId)
            .ilike('cliente', `%${query}%`)
            .limit(5);

        if (customers && customers.length > 0) {
            suggestionsDiv.innerHTML = customers.map(c => `
                <div class="suggestion-item">${escapeHtml(c.cliente)}</div>
            `).join('');
            suggestionsDiv.style.display = 'block';

            suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    inputField.value = item.textContent;
                    suggestionsDiv.style.display = 'none';
                });
            });
        } else {
            suggestionsDiv.style.display = 'none';
        }
    } catch (err) {
        console.error(err);
    }
}

async function processNewCredit(stationId, userId, customerName, amount, product, notes) {
    // 1. Trova o crea cliente
    let { data: customer, error: fetchError } = await supabase
        .from('crediti_clienti')
        .select('*')
        .eq('station_id', stationId)
        .ilike('cliente', customerName)
        .maybeSingle();

    if (fetchError) throw fetchError;

    if (!customer) {
        const { data: newCustomer, error: createError } = await supabase
            .from('crediti_clienti')
            .insert([{ station_id: stationId, cliente: customerName, saldo: 0, importo: 0 }])
            .select()
            .single();

        if (createError) throw createError;
        customer = newCustomer;
    }

    // 2. Aggiorna saldo (Aumenta debito)
    const newBalance = (customer.saldo || 0) + amount;
    const { error: updateError } = await supabase
        .from('crediti_clienti')
        .update({ saldo: newBalance, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

    if (updateError) throw updateError;

    // 3. Registra movimento (Tipo: 'credito' -> Sottrae da cassa in chiusura)
    const { error: moveError } = await supabase
        .from('crediti_movimenti')
        .insert([{
            cliente_id: customer.id,
            station_id: stationId,
            operator_id: userId,
            tipo: 'credito', // IMPORTANTE: Questo tipo viene sottratto dai contanti in chiusura
            importo: amount,
            metodo: 'credito',
            note: `${product} - ${notes || ''}`, // Include product in notes
            created_at: new Date().toISOString()
        }]);

    // 4. Registra anche in movimenti_cassa per visibilità immediata (Opzionale, ma utile per logica unificata)
    // La chiusura legge da movimenti_cassa, quindi DOBBIAMO scrivere lì o modificare la chiusura per leggere anche crediti_movimenti.
    // La logica attuale di chiusura legge da 'movimenti_cassa'.
    // Per semplicità e robustezza, duplichiamo il movimento in 'movimenti_cassa' con tipo 'credito'.

    const { error: cashMoveError } = await supabase
        .from('movimenti_cassa')
        .insert([{
            station_id: stationId,
            operator_id: userId,
            tipo: 'credito',
            importo: amount,
            descrizione: `Credito: ${customerName} (${product}) ${notes ? '- ' + notes : ''}`, // Include product in description
            created_at: new Date().toISOString()
        }]);

    if (moveError || cashMoveError) throw moveError || cashMoveError;
}


/**
 * 2. PAGAMENTO
 * Lista crediti aperti. Scelta cliente -> Pagamento (Parziale/Totale).
 * Metodi: Contanti (Somma a cassa), POS/Altro (Neutro).
 */
async function showPaymentSelection(stationId, userId) {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div class="content-box">
            <h3><i class="fas fa-list"></i> Crediti Aperti</h3>
            <div class="form-group">
                <input type="text" id="debtor-search" class="big-input" placeholder="Cerca cliente...">
            </div>
            <div id="debtors-list" class="results-list" style="max-height: 350px; overflow-y: auto;">
                <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>
            </div>
            <div style="margin-top: 15px;">
                 <button type="button" class="menu-button secondary full-width" id="btn-back-credits-2">
                    <i class="fas fa-arrow-left"></i> Indietro
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-back-credits-2').addEventListener('click', () => showCreditsMenu(stationId, userId));

    const listContainer = document.getElementById('debtors-list');
    const searchInput = document.getElementById('debtor-search');

    // Load debtors
    const loadDebtors = async (filter = '') => {
        try {
            let query = supabase
                .from('crediti_clienti')
                .select('*')
                .eq('station_id', stationId)
                .gt('saldo', 0.01) // Solo chi ha debito
                .order('cliente');

            if (filter) {
                query = query.ilike('cliente', `%${filter}%`);
            }

            const { data: debtors, error } = await query;
            if (error) throw error;

            if (!debtors || debtors.length === 0) {
                listContainer.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Nessun credito aperto trovato.</p>';
                return;
            }

            listContainer.innerHTML = debtors.map(d => `
                <div class="result-item" onclick="window.openPaymentModal('${d.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <div>
                        <div style="font-weight: bold; font-size: 1.1rem;">${escapeHtml(d.cliente)}</div>
                        <div style="font-size: 0.85rem; color: #64748b;">Ultimo agg: ${new Date(d.updated_at || d.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: #ef4444; font-size: 1.2rem;">${formatEuro(d.saldo)}</div>
                        <div style="font-size: 0.8rem; color: #3b82f6;">Paga <i class="fas fa-chevron-right"></i></div>
                    </div>
                </div>
            `).join('');

            // Hack per click
            window.openPaymentModal = (id) => {
                const debtor = debtors.find(x => x.id == id);
                if (debtor) showPaymentModal(debtor, stationId, userId);
            };

        } catch (err) {
            listContainer.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
        }
    };

    loadDebtors();

    searchInput.addEventListener('input', (e) => {
        loadDebtors(e.target.value);
    });
}

function showPaymentModal(customer, stationId, userId) {
    openModal(`Pagamento: ${escapeHtml(customer.cliente)}`);
    const modalBody = document.getElementById('modal-body');

    modalBody.innerHTML = `
        <div style="background: #fff1f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 1px solid #fecdd3;">
            <div style="font-size: 0.9rem; color: #9f1239;">Debito Attuale</div>
            <div style="font-size: 2rem; font-weight: 700; color: #e11d48;">${formatEuro(customer.saldo)}</div>
        </div>

        <form id="payment-form">
            <div class="form-group">
                <label>Importo Pagamento (€)</label>
                <div style="display: flex; gap: 10px;">
                    <input type="number" name="amount" id="pay-amount" step="0.01" min="0.01" max="${customer.saldo}" class="big-input" required value="${customer.saldo}">
                    <button type="button" id="btn-full-amount" style="padding: 0 15px; background: #e2e8f0; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Tutto</button>
                </div>
            </div>

            <div class="form-group">
                <label>Metodo di Pagamento</label>
                <select name="method" id="pay-method" class="big-input" required>
                    <option value="contanti">Contanti (Aumenta Cassa)</option>
                    <option value="pos">POS (Neutro)</option>
                    <option value="uta">UTA/DKV/Fine Mese (Neutro)</option>
                </select>
            </div>

            <div id="cash-info" class="info-box" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
                <i class="fas fa-check-circle"></i> Questo importo verrà <strong>aggiunto</strong> al totale contanti della giornata.
            </div>
            
            <div id="pos-info" class="info-box" style="display: none; background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i> Questo pagamento non influisce sui contanti in cassa.
            </div>

            <div class="form-actions">
                <button type="button" class="menu-button btn-danger" id="btn-cancel-pay">
                    Annulla
                </button>
                <button type="submit" class="menu-button btn-success">
                    Registra Pagamento
                </button>
            </div>
        </form>
    `;

    // Toggle Info based on method
    const methodSelect = document.getElementById('pay-method');
    const cashInfo = document.getElementById('cash-info');
    const posInfo = document.getElementById('pos-info');

    methodSelect.addEventListener('change', () => {
        if (methodSelect.value === 'contanti') {
            cashInfo.style.display = 'block';
            posInfo.style.display = 'none';
        } else {
            cashInfo.style.display = 'none';
            posInfo.style.display = 'block';
        }
    });

    // Full Amount Button
    document.getElementById('btn-full-amount').addEventListener('click', () => {
        document.getElementById('pay-amount').value = customer.saldo;
    });

    document.getElementById('btn-cancel-pay').addEventListener('click', () => {
        showPaymentSelection(stationId, userId);
    });

    // Submit
    document.getElementById('payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const amount = parseFloat(formData.get('amount'));
        const method = formData.get('method');

        if (amount <= 0) return;
        if (amount > customer.saldo + 0.01) { // Tolleranza centesimi
            Toast.show('L\'importo non può superare il debito!', 'warning');
            return;
        }

        try {
            await processPayment(stationId, userId, customer, amount, method);
            closeModal();
            showInfoModal('Pagamento registrato con successo!');
        } catch (err) {
            Toast.show('Errore: ' + err.message, 'error');
        }
    });
}

async function processPayment(stationId, userId, customer, amount, method) {
    // 1. Aggiorna saldo (Diminuisce debito)
    const newBalance = Math.max(0, (customer.saldo || 0) - amount);
    const { error: updateError } = await supabase
        .from('crediti_clienti')
        .update({ saldo: newBalance, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

    if (updateError) throw updateError;

    // 2. Registra movimento in crediti_movimenti
    // Metodo: 'incasso' (se contanti), 'incasso_pos', 'incasso_uta'
    let movementType = 'incasso'; // Default contanti
    if (method === 'pos') movementType = 'incasso_pos';
    if (method === 'uta') movementType = 'incasso_uta';

    const { error: moveError } = await supabase
        .from('crediti_movimenti')
        .insert([{
            cliente_id: customer.id,
            station_id: stationId,
            operator_id: userId,
            tipo: movementType,
            importo: amount,
            metodo: method,
            created_at: new Date().toISOString()
        }]);

    // 3. Registra in movimenti_cassa per la chiusura
    // Se contanti -> 'incasso' (Aggiunge ai contanti attesi)
    // Se POS/UTA -> 'incasso_pos' / 'incasso_uta' (Ignorato nel calcolo contanti, ma tracciato)

    const { error: cashMoveError } = await supabase
        .from('movimenti_cassa')
        .insert([{
            station_id: stationId,
            operator_id: userId,
            tipo: movementType, // 'incasso', 'incasso_pos', 'incasso_uta'
            importo: amount,
            descrizione: `Pagamento Credito: ${customer.cliente} (${method})`,
            created_at: new Date().toISOString()
        }]);

    if (moveError || cashMoveError) throw moveError || cashMoveError;
}
