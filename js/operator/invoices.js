// ==========================================
// OPERATOR INVOICE REQUESTS
// Gestione richieste fattura (Non fiscale / Non incide su cassa)
// ==========================================
import { supabase } from "../core/api.js";
import { openModal, closeModal, showInfoModal } from "../ui/ui.js";
import { createWarningMessage, createErrorMessage, createFormActions } from "./ui-components.js";
import { checkOpeningStatus } from "./opening.js";
import { Toast } from "../ui/toast.js";
import { handleError } from "../shared/error-handler.js";

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
            modalBody.innerHTML = `
                <div style="background:#fee2e2; color:#b91c1c; padding:30px; border-radius:12px; border:2px solid #fecaca; text-align:center; margin: 20px;">
                    <h2 style="margin:0 0 15px 0; color:#b91c1c;"><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p style="font-size:1.1em; margin:0 0 20px 0;">Devi aprire un turno prima di poter registrare richieste di fattura.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;

            document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
            return;
        }

        renderCustomerChoice(modalBody, stationId, userId);

    } catch (err) {
        modalBody.innerHTML = createErrorMessage("Errore Caricamento", err) +
            `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
        document.getElementById('btn-close-err').addEventListener('click', () => closeModal());
    }
}

/**
 * Renderizza la scelta tra nuovo cliente e cliente esistente
 */
function renderCustomerChoice(container, stationId, userId) {
    container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Seleziona il tipo di cliente</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 20px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
            <button id="btn-new-customer" class="menu-button primary" style="flex: 1; padding: 15px; font-size: 1rem;">
                <i class="fas fa-user-plus"></i> Nuovo Cliente
            </button>
            <button id="btn-existing-customer" class="menu-button" style="flex: 1; padding: 15px; font-size: 1rem;">
                <i class="fas fa-users"></i> Cliente Esistente
            </button>
        </div>

        <div style="text-align: center;">
            <button id="btn-cancel-choice" class="menu-button btn-danger">
                <i class="fas fa-times"></i> Annulla
            </button>
        </div>
      </div>
    `;

    document.getElementById('btn-new-customer').addEventListener('click', () => {
        renderNewCustomerForm(container, stationId, userId);
    });

    document.getElementById('btn-existing-customer').addEventListener('click', () => {
        renderExistingCustomerForm(container, stationId, userId);
    });

    document.getElementById('btn-cancel-choice').addEventListener('click', () => {
        closeModal();
    });
}

/**
 * Renderizza il form per nuovo cliente
 */
function renderNewCustomerForm(container, stationId, userId) {
    container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Nuovo Cliente</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <form id="new-customer-form">
            <div class="form-group">
                <label>Ragione Sociale / Nome Cliente</label>
                <input type="text" name="nome" class="big-input" placeholder="Es. Azienda SRL">
            </div>

            <div class="form-group">
                <label>Partita IVA</label>
                <input type="text" name="partita_iva" class="big-input" placeholder="Es. IT12345678901">
            </div>

            <div class="form-group">
                <label>Codice Univoco / PEC</label>
                <input type="text" name="codice_univoco_pec" class="big-input" placeholder="Es. ABCDEF12G34H567I">
            </div>

            <div class="form-group">
                <label>Numero di Telefono</label>
                <input type="tel" name="telefono" class="big-input" placeholder="Es. 3331234567">
            </div>

            <div class="form-group">
                <label>Targa</label>
                <input type="text" name="targa" class="big-input" placeholder="Es. AB123CD">
            </div>

            ${createFormActions({ confirmText: 'Continua', confirmClass: 'btn-success' })}
        </form>
      </div>
    `;

    container.querySelector('#btn-cancel').addEventListener('click', () => {
        renderCustomerChoice(container, stationId, userId);
    });

    document.getElementById('new-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(/** @type {HTMLFormElement} */(e.target));
        const nome = formData.get('nome')?.toString().trim() || '';
        const partitaIva = formData.get('partita_iva')?.toString().trim() || '';
        const codiceUnivoco = formData.get('codice_univoco_pec')?.toString().trim() || '';
        const telefono = formData.get('telefono')?.toString().trim() || '';
        const targa = formData.get('targa')?.toString().trim() || '';

        // Validazione: se tutti i campi sono vuoti, almeno il telefono è obbligatorio
        if (!nome && !partitaIva && !codiceUnivoco && !telefono && !targa) {
            Toast.show("Inserire almeno il numero di telefono o altri dati del cliente.", 'warning');
            return;
        }

        try {
            // Salva o recupera cliente
            let clienteId;
            const { data: existingCustomer } = await supabase
                .from('clienti_fatturazione')
                .select('id')
                .or(`nome.ilike.%${nome}%,partita_iva.eq.${partitaIva || 'null'},telefono.eq.${telefono || 'null'}`)
                .maybeSingle();

            if (existingCustomer) {
                // Aggiorna cliente esistente se necessario
                const updateData = {};
                if (nome) updateData.nome = nome;
                if (partitaIva) updateData.partita_iva = partitaIva;
                if (codiceUnivoco) updateData.codice_univoco_pec = codiceUnivoco;
                if (telefono) updateData.telefono = telefono;
                if (targa) updateData.targa = targa;
                updateData.updated_at = new Date().toISOString();

                const { error: updateError } = await supabase
                    .from('clienti_fatturazione')
                    .update(updateData)
                    .eq('id', existingCustomer.id);

                if (updateError) throw updateError;
                clienteId = existingCustomer.id;
            } else {
                // Crea nuovo cliente
                const { data: newCustomer, error: createError } = await supabase
                    .from('clienti_fatturazione')
                    .insert([{
                        nome: nome || null,
                        partita_iva: partitaIva || null,
                        codice_univoco_pec: codiceUnivoco || null,
                        telefono: telefono || null,
                        targa: targa || null
                    }])
                    .select()
                    .single();

                if (createError) throw createError;
                clienteId = newCustomer.id;
            }

            // Procedi con il form della fattura
            renderInvoiceForm(container, stationId, userId, clienteId, nome || telefono || 'Cliente');

        } catch (err) {
            Toast.show("Errore salvataggio cliente: " + err.message, 'error');
        }
    });
}

/**
 * Renderizza il form per cliente esistente con autocompletamento
 */
function renderExistingCustomerForm(container, stationId, userId) {
    container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Cliente Esistente</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <form id="existing-customer-form">
            <div class="form-group">
                <label>Ragione Sociale / Nome Cliente</label>
                <div style="position: relative;">
                    <input type="text" id="customer-search" name="customer_name" class="big-input" required placeholder="Inizia a digitare il nome del cliente..." autocomplete="off">
                    <div id="customer-suggestions" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 6px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
                </div>
                <input type="hidden" id="selected-customer-id" name="customer_id">
            </div>

            ${createFormActions({ confirmText: 'Continua', confirmClass: 'btn-success' })}
        </form>
      </div>
    `;

    const searchInput = document.getElementById('customer-search');
    const suggestionsDiv = document.getElementById('customer-suggestions');
    const customerIdInput = document.getElementById('selected-customer-id');

    // Autocompletamento
    let searchTimeout;
    searchInput.addEventListener('input', async (e) => {
        const query = (/** @type {HTMLInputElement} */(e.target)).value.trim();

        clearTimeout(searchTimeout);

        if (query.length < 2) {
            suggestionsDiv.style.display = 'none';
            (/** @type {HTMLInputElement} */(customerIdInput)).value = '';
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                const { data: customers, error } = await supabase
                    .from('clienti_fatturazione')
                    .select('id, nome, partita_iva, telefono, targa')
                    .or(`nome.ilike.%${query}%,partita_iva.ilike.%${query}%,telefono.ilike.%${query}%,targa.ilike.%${query}%`)
                    .limit(10);

                if (error) throw error;

                if (customers && customers.length > 0) {
                    suggestionsDiv.innerHTML = customers.map(c => `
                        <div class="suggestion-item" data-id="${c.id}" data-name="${c.nome || c.telefono || 'Cliente'}" style="padding: 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" 
                             onmouseover="this.style.background='#f8fafc'" 
                             onmouseout="this.style.background='white'">
                            <div style="font-weight: 600;">${escapeHtml(c.nome || c.telefono || 'Cliente')}</div>
                            ${c.partita_iva ? `<div style="font-size: 0.85rem; color: #64748b;">P.IVA: ${escapeHtml(c.partita_iva)}</div>` : ''}
                            ${c.telefono ? `<div style="font-size: 0.85rem; color: #64748b;">Tel: ${escapeHtml(c.telefono)}</div>` : ''}
                            ${c.targa ? `<div style="font-size: 0.85rem; color: #64748b;">Targa: ${escapeHtml(c.targa)}</div>` : ''}
                        </div>
                    `).join('');
                    suggestionsDiv.style.display = 'block';

                    // Event listeners per i suggerimenti
                    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(itemElement => {
                        const item = /** @type {HTMLElement} */(itemElement);
                        item.addEventListener('click', () => {
                            const customerId = item.dataset.id;
                            const customerName = item.dataset.name || '';
                            (/** @type {HTMLInputElement} */(searchInput)).value = customerName;
                            (/** @type {HTMLInputElement} */(customerIdInput)).value = customerId || '';
                            suggestionsDiv.style.display = 'none';
                        });
                    });
                } else {
                    suggestionsDiv.innerHTML = '<div style="padding: 12px; color: #64748b; text-align: center;">Nessun cliente trovato</div>';
                    suggestionsDiv.style.display = 'block';
                }
            } catch (err) {
                console.error('Errore ricerca clienti:', err);
            }
        }, 300);
    });

    // Chiudi suggerimenti quando si clicca fuori
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(/** @type {Node} */(e.target)) && !suggestionsDiv.contains(/** @type {Node} */(e.target))) {
            suggestionsDiv.style.display = 'none';
        }
    });

    container.querySelector('#btn-cancel').addEventListener('click', () => {
        renderCustomerChoice(container, stationId, userId);
    });

    document.getElementById('existing-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const customerId = (/** @type {HTMLInputElement} */(customerIdInput)).value;
        const customerName = (/** @type {HTMLInputElement} */(searchInput)).value.trim();

        if (!customerId || !customerName) {
            Toast.show("Seleziona un cliente dalla lista.", 'warning');
            return;
        }

        // Recupera dati cliente
        const { data: customer, error } = await supabase
            .from('clienti_fatturazione')
            .select('*')
            .eq('id', customerId)
            .single();

        if (error) {
            Toast.show("Errore recupero cliente: " + error.message, 'error');
            return;
        }

        // Procedi con il form della fattura
        renderInvoiceForm(container, stationId, userId, customerId, customer.nome || customer.telefono || 'Cliente');
    });
}

/**
 * Renderizza il form per la richiesta fattura
 */
function renderInvoiceForm(container, stationId, userId, clienteId, customerName) {
    container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Richiesta Fattura - ${escapeHtml(customerName)}</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <form id="invoice-form">
            <input type="hidden" name="cliente_id" value="${clienteId}">
            <input type="hidden" name="customer_name" value="${escapeHtml(customerName)}">

            <div class="form-group">
                <label>Importo Rifornimento (€)</label>
                <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
            </div>

            <div class="form-group">
                <label>Metodo di Pagamento</label>
                <select name="payment_method" class="big-input" required>
                    <option value="">Seleziona metodo...</option>
                    <option value="contanti">Contanti</option>
                    <option value="pos">POS</option>
                    <option value="bonifico">Bonifico</option>
                </select>
            </div>

            <div class="form-group">
                <label>Categoria Prodotto</label>
                <select name="product_category" id="product-category" class="big-input" required>
                    <option value="">Seleziona categoria...</option>
                    <option value="gasolio">Gasolio</option>
                    <option value="benzina">Benzina</option>
                    <option value="adblue">Adblue</option>
                    <option value="altro">Altro</option>
                </select>
            </div>

            <div class="form-group" id="product-note-group" style="display: none;">
                <label>Specifica Prodotto (obbligatorio se "Altro")</label>
                <input type="text" name="product_note" id="product-note" class="big-input" placeholder="Indica il prodotto da fatturare">
            </div>

            <div class="form-group">
                <label>Note</label>
                <textarea name="notes" rows="4" class="big-input" placeholder="Note aggiuntive..."></textarea>
            </div>

            ${createFormActions({ confirmText: 'Invia Richiesta', confirmClass: 'btn-success' })}
        </form>
      </div>
    `;

    // Mostra/nascondi campo prodotto se "Altro" è selezionato
    const productCategorySelect = document.getElementById('product-category');
    const productNoteGroup = document.getElementById('product-note-group');
    const productNoteInput = document.getElementById('product-note');

    productCategorySelect.addEventListener('change', (e) => {
        if ((/** @type {HTMLSelectElement} */(e.target)).value === 'altro') {
            (/** @type {HTMLElement} */(productNoteGroup)).style.display = 'block';
            (/** @type {HTMLInputElement} */(productNoteInput)).required = true;
        } else {
            (/** @type {HTMLElement} */(productNoteGroup)).style.display = 'none';
            (/** @type {HTMLInputElement} */(productNoteInput)).required = false;
            (/** @type {HTMLInputElement} */(productNoteInput)).value = '';
        }
    });

    container.querySelector('#btn-cancel').addEventListener('click', () => {
        renderCustomerChoice(container, stationId, userId);
    });

    document.getElementById('invoice-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(/** @type {HTMLFormElement} */(e.target));
        const amount = parseFloat(formData.get('amount')?.toString() || '0');
        const paymentMethod = formData.get('payment_method')?.toString() || '';
        const productCategory = formData.get('product_category')?.toString() || '';
        const productNote = formData.get('product_note')?.toString().trim() || '';
        const notes = formData.get('notes')?.toString().trim() || '';

        // Validazione categoria prodotto
        if (productCategory === 'altro' && !productNote) {
            Toast.show("Selezionando 'Altro' è obbligatorio specificare il prodotto nella nota.", 'warning');
            return;
        }

        if (amount <= 0 || !paymentMethod || !productCategory) {
            Toast.show("Inserire tutti i dati obbligatori.", 'warning');
            return;
        }

        // Combina note prodotto e note generali
        let finalNotes = notes;
        if (productCategory === 'altro' && productNote) {
            // Se "Altro", specifichiamo cosa è stato comprato nella descrizione
            finalNotes = `${productNote}${notes ? '\n' + notes : ''}`;
        }
        // Per categorie standard (Gasolio, Benzina, ecc...) NON aggiungiamo il prefisso
        // in quanto c'è già la colonna apposita nella tabella admin.

        try {
            const { error } = await supabase
                .from('invoices')
                .insert([{
                    station_id: stationId,
                    operator_id: userId,
                    cliente_id: clienteId,
                    customer_name: customerName,
                    amount: amount,
                    payment_method: paymentMethod,
                    product_category: productCategory,
                    description: finalNotes,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    // Fix: Campi obbligatori mancanti
                    invoice_number: `REQ-${Date.now()}`, // Genera un ID richiesta temporaneo
                    invoice_date: new Date().toISOString().split('T')[0] // Data odierna
                }]);

            if (error) throw error;

            closeModal();
            showInfoModal(`Richiesta fattura per ${customerName} inviata correttamente.`);

        } catch (err) {
            Toast.show("Errore salvataggio: " + err.message, 'error');
        }
    });
}

// Helper per escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
