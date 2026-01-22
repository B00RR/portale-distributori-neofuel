// ==========================================
// OPERATOR CREDITS MANAGEMENT
// Gestione crediti clienti (Nuovo Credito vs Pagamento)
// ==========================================
import { supabase } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { showInfoModal, openModal, closeModal } from '../ui/ui.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

import { checkOpeningStatus } from './opening.js';
import { CreditoCliente } from '../types.js';

/**
 * Open the credits management modal and present options to create a new credit or record a payment.
 *
 * @param stationId - Station identifier used to scope credits and check the current opening status
 * @param userId - Operator identifier performing the action
 */
export async function showCreditsMenu(stationId: number | string, userId: string): Promise<void> {
    openModal('Gestione Crediti');
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) { return; }
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

        const closeBtn = document.getElementById('btn-close-warning');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeModal());
        }
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

    document.getElementById('btn-new-credit')?.addEventListener('click', () => showNewCreditForm(stationId, userId));
    document.getElementById('btn-payment-credit')?.addEventListener('click', () => showPaymentSelection(stationId, userId));
}

/**
 * Render and initialize the "New Credit" modal for registering a customer credit.
 *
 * Presents a form to enter customer name, amount, product, and optional notes; wires live customer suggestions,
 * validates the inputs, and submits the credit.
 *
 * On successful submission the modal is closed and a success info modal is shown; on error a toast with the error message is displayed.
 *
 * @param stationId - Identifier of the station where the credit is recorded
 * @param userId - Identifier of the operator performing the action
 */
async function showNewCreditForm(stationId: number | string, userId: string): Promise<void> {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) { return; }
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
    document.getElementById('btn-back-credits')?.addEventListener('click', () => showCreditsMenu(stationId, userId));

    // Customer Search Logic
    const nameInput = document.getElementById('customer-name') as HTMLInputElement | null;
    const suggestionsDiv = document.getElementById('customer-suggestions') as HTMLElement | null;
    let debounceTimer: any;

    if (nameInput && suggestionsDiv) {
        nameInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = (e.target as HTMLInputElement).value;
            if (query.length < 2) {
                suggestionsDiv.style.display = 'none';
                return;
            }
            debounceTimer = setTimeout(() => searchCustomersForInput(query, stationId, suggestionsDiv, nameInput), 300);
        });
    }

    // Form Submit
    const form = document.getElementById('new-credit-form') as HTMLFormElement | null;
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const customerName = (formData.get('customer_name') as string)?.trim() || '';
            const amount = parseFloat(formData.get('amount') as string || '0');
            const product = (formData.get('product') as string) || '';
            const notes = (formData.get('notes') as string) || '';

            if (!customerName || amount <= 0) { return; }

            try {
                await processNewCredit(stationId, userId, customerName, amount, product, notes);
                closeModal();
                showInfoModal('Credito registrato con successo!');
            } catch (err: any) {
                Toast.show('Errore: ' + err.message, 'error');
            }
        });
    }
}

/**
 * Searches for customers matching `query` and displays clickable suggestions that populate the provided input.
 *
 * Renders up to five matching customer names into `suggestionsDiv`; clicking a suggestion sets `inputField.value` to that name and hides the suggestions. If no matches are found, the suggestions container is hidden.
 *
 * @param suggestionsDiv - The container element where suggestion items will be rendered or hidden.
 * @param inputField - The text input to be filled when a suggestion is selected.
 */
async function searchCustomersForInput(query: string, stationId: number | string, suggestionsDiv: HTMLElement, inputField: HTMLInputElement): Promise<void> {
    try {
        const { data: customers } = await supabase
            .from('crediti_clienti')
            .select('cliente')
            .eq('station_id', stationId)
            .ilike('cliente', `%${query}%`)
            .limit(5);

        if (customers && customers.length > 0) {
            suggestionsDiv.innerHTML = customers.map((c: any) => `
                <div class="suggestion-item">${escapeHtml(c.cliente)}</div>
            `).join('');
            suggestionsDiv.style.display = 'block';

            suggestionsDiv.querySelectorAll('.suggestion-item').forEach(itemElement => {
                const item = itemElement as HTMLElement;
                item.addEventListener('click', () => {
                    inputField.value = item.textContent || '';
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

/**
 * Ensures a customer record exists, increases the customer's credit balance by the specified amount, and records both a credit movement and a corresponding cash movement.
 *
 * @param stationId - Identifier of the station where the credit is recorded
 * @param userId - Identifier of the operator performing the action
 * @param customerName - Full name of the customer to credit; case-insensitive match is used to find existing records
 * @param amount - Amount to add to the customer's balance; expected to be greater than zero
 * @param product - Product description to include in movement notes (e.g., "Gasolio", "Accessori")
 * @param notes - Optional additional notes to include in movement records
 *
 * @throws If a database query fails when fetching, creating, or updating the customer
 * @throws If inserting the credit movement or the cash movement fails
 * @throws If a customer record cannot be obtained after an attempted create
 */
async function processNewCredit(stationId: number | string, userId: string, customerName: string, amount: number, product: string, notes: string): Promise<void> {
    // 1. Trova o crea cliente
    let { data: customer, error: fetchError } = await supabase
        .from('crediti_clienti')
        .select('*')
        .eq('station_id', stationId)
        .ilike('cliente', customerName)
        .maybeSingle();

    if (fetchError) { throw fetchError; }

    if (!customer) {
        const { data: newCustomer, error: createError } = await supabase
            .from('crediti_clienti')
            .insert([{ station_id: stationId, cliente: customerName, saldo: 0 }])
            .select()
            .single();

        if (createError) { throw createError; }
        customer = newCustomer;
    }

    if (!customer) { throw new Error('Impossibile creare il cliente'); }

    // 2. Aggiorna saldo (Aumenta debito)
    const newBalance = (customer.saldo || 0) + amount;
    const { error: updateError } = await supabase
        .from('crediti_clienti')
        .update({ saldo: newBalance, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

    if (updateError) { throw updateError; }

    // 3. Registra movimento in crediti_movimenti
    const { error: moveError } = await supabase
        .from('crediti_movimenti')
        .insert([{
            cliente_id: customer.id,
            station_id: stationId,
            operator_id: userId,
            tipo: 'credito',
            importo: amount,
            metodo: 'credito',
            note: `${product} - ${notes || ''}`,
            created_at: new Date().toISOString()
        }]);

    // 4. Registra anche in movimenti_cassa
    const { error: cashMoveError } = await supabase
        .from('movimenti_cassa')
        .insert([{
            station_id: stationId,
            operator_id: userId,
            tipo: 'credito',
            importo: amount,
            descrizione: `Credito: ${customerName} (${product}) ${notes ? '- ' + notes : ''}`,
            created_at: new Date().toISOString()
        }]);

    if (moveError || cashMoveError) { throw moveError || cashMoveError; }
}

/**
 * Show a modal listing open customer credits and allow selecting a debtor to record a payment.
 *
 * Loads customers with a positive balance for the given station, renders a searchable list,
 * and opens the payment modal for the chosen debtor.
 *
 * @param stationId - Station identifier used to filter customers (number or string)
 * @param userId - Operator identifier performing the payment action
 */
async function showPaymentSelection(stationId: number | string, userId: string): Promise<void> {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) { return; }
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

    document.getElementById('btn-back-credits-2')?.addEventListener('click', () => showCreditsMenu(stationId, userId));

    const listContainer = document.getElementById('debtors-list') as HTMLElement | null;
    const searchInput = document.getElementById('debtor-search') as HTMLInputElement | null;

    if (!listContainer || !searchInput) { return; }

    // Load debtors
    const loadDebtors = async (filter = ''): Promise<void> => {
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
            if (error) { throw error; }

            if (!debtors || debtors.length === 0) {
                listContainer.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Nessun credito aperto trovato.</p>';
                return;
            }

            listContainer.innerHTML = debtors.map((d: any) => `
                <div class="result-item" data-id="${d.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; cursor: pointer;">
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

            // Attach event listeners to items
            listContainer.querySelectorAll('.result-item').forEach(itemElement => {
                const item = itemElement as HTMLElement;
                item.addEventListener('click', () => {
                    const id = item.dataset.id;
                    const debtor = debtors.find((x: any) => x.id.toString() === id);
                    if (debtor) { showPaymentModal(debtor as unknown as CreditoCliente, stationId, userId); }
                });
            });

        } catch (err: any) {
            listContainer.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
        }
    };

    loadDebtors();

    searchInput.addEventListener('input', (e) => {
        loadDebtors((e.target as HTMLInputElement).value);
    });
}

/**
 * Opens a payment modal for the specified customer allowing the operator to record a payment against the customer's debt.
 *
 * Displays the customer's current debt, a form to enter a payment amount and method, a "Tutto" button to fill the full debt,
 * and contextual info about cash vs non-cash methods. Validates the amount (must be > 0 and not exceed the current debt),
 * invokes `processPayment` to record the payment, closes the modal and shows a success info modal on success, and shows an error toast on failure.
 *
 * @param customer - The customer record containing at least `cliente` and `saldo`
 * @param stationId - Identifier of the station where the payment is recorded
 * @param userId - Identifier of the operator performing the payment
 */
function showPaymentModal(customer: CreditoCliente, stationId: number | string, userId: string): void {
    openModal(`Pagamento: ${escapeHtml(customer.cliente)}`);
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) { return; }

    modalBody.innerHTML = `
        <div style="background: #fff1f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 1px solid #fecdd3;">
            <div style="font-size: 0.9rem; color: #9f1239;">Debito Attuale</div>
            <div style="font-size: 2rem; font-weight: 700; color: #e11d48;">${formatEuro(customer.saldo)}</div>
        </div>

        <form id="payment-form">
            <div class="form-group">
                <label>Importo Pagamento (€)</label>
                <div style="display: flex; gap: 10px;">
                    <input type="number" name="amount" id="pay-amount" step="0.01" min="0.01" max="${customer.saldo + 0.01}" class="big-input" required value="${customer.saldo}">
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
    const methodSelect = document.getElementById('pay-method') as HTMLSelectElement | null;
    const cashInfo = document.getElementById('cash-info') as HTMLElement | null;
    const posInfo = document.getElementById('pos-info') as HTMLElement | null;

    if (methodSelect && cashInfo && posInfo) {
        methodSelect.addEventListener('change', () => {
            if (methodSelect.value === 'contanti') {
                cashInfo.style.display = 'block';
                posInfo.style.display = 'none';
            } else {
                cashInfo.style.display = 'none';
                posInfo.style.display = 'block';
            }
        });
    }

    // Full Amount Button
    document.getElementById('btn-full-amount')?.addEventListener('click', () => {
        const payAmountInput = document.getElementById('pay-amount') as HTMLInputElement | null;
        if (payAmountInput) {
            payAmountInput.value = customer.saldo.toString();
        }
    });

    document.getElementById('btn-cancel-pay')?.addEventListener('click', () => {
        showPaymentSelection(stationId, userId);
    });

    // Submit
    const form = document.getElementById('payment-form') as HTMLFormElement | null;
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const amount = parseFloat(formData.get('amount') as string || '0');
            const method = (formData.get('method') as string) || '';

            if (amount <= 0) { return; }
            if (amount > customer.saldo + 0.01) {
                Toast.show('L\'importo non può superare il debito!', 'warning');
                return;
            }

            try {
                await processPayment(stationId, userId, customer, amount, method);
                closeModal();
                showInfoModal('Pagamento registrato con successo!');
            } catch (err: any) {
                Toast.show('Errore: ' + err.message, 'error');
            }
        });
    }
}

/**
 * Apply a payment against a customer's credit: update the customer's balance and record the corresponding credit and cash movements.
 *
 * Updates the customer's saldo by subtracting `amount` (bounded at zero), creates a `crediti_movimenti` entry describing the receipt, and creates a `movimenti_cassa` entry for cash accounting.
 *
 * @param stationId - Identifier of the station where the payment is recorded
 * @param userId - Identifier of the operator performing the payment
 * @param customer - The customer's credit record to be updated
 * @param amount - The payment amount to apply (must be greater than 0 and not exceed the customer's outstanding balance)
 * @param method - Payment method; expected values include `'contanti'`, `'pos'`, and `'uta'` (affects the recorded movement type)
 * @throws SupabaseError if updating the customer or inserting movement records fails
 */
async function processPayment(stationId: number | string, userId: string, customer: CreditoCliente, amount: number, method: string): Promise<void> {
    // 1. Aggiorna saldo (Diminuisce debito)
    const newBalance = Math.max(0, (customer.saldo || 0) - amount);
    const { error: updateError } = await supabase
        .from('crediti_clienti')
        .update({ saldo: newBalance, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

    if (updateError) { throw updateError; }

    // 2. Registra movimento in crediti_movimenti
    let movementType = 'incasso'; // Default contanti
    if (method === 'pos') { movementType = 'incasso_pos'; }
    if (method === 'uta') { movementType = 'incasso_uta'; }

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

    // 3. Registra in movimenti_cassa
    const { error: cashMoveError } = await supabase
        .from('movimenti_cassa')
        .insert([{
            station_id: stationId,
            operator_id: userId,
            tipo: movementType,
            importo: amount,
            descrizione: `Pagamento Credito: ${customer.cliente} (${method})`,
            created_at: new Date().toISOString()
        }]);

    if (moveError || cashMoveError) { throw moveError || cashMoveError; }
}