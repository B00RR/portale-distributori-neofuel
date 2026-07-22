// ==========================================
// OPERATOR INVOICE REQUESTS
// Gestione richieste fattura (Non fiscale / Non incide su cassa)
// ==========================================
import type { Database } from '../../supabase/database.types.js';
import { supabase } from '../core/api.js';
import { logger } from '../core/logger.js';
import { isOffline, queueAction } from '../core/offline-queue.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showInfoModal } from '../ui/ui.js';
import { setSafeHTML, escapeLikePattern } from '../utils/sanitizer.js';
import { escapeHtml, getItalianBusinessDate } from '../utils/utils.js';

import { checkOpeningStatus } from './opening.js';
import { createErrorMessage, createFormActions } from './ui-components.js';

interface BillingCustomer {
  id: number;
  nome?: string | null;
  partita_iva?: string | null;
  codice_univoco_pec?: string | null;
  telefono?: string | null;
  targa?: string | null;
}

type BillingCustomerUpdate = Database['public']['Tables']['clienti_fatturazione']['Update'];

interface PersistOptions {
  skipOfflineQueue?: boolean;
  createdAt?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  requestId?: string;
}

function shouldQueue(options?: PersistOptions): boolean {
  return !options?.skipOfflineQueue && isOffline();
}

async function findExistingCustomer(
  partitaIva: string,
  telefono: string
): Promise<Pick<BillingCustomer, 'id'> | null> {
  const matches = new Map<number, Pick<BillingCustomer, 'id'>>();
  const identifiers = [
    ['partita_iva', partitaIva],
    ['telefono', telefono]
  ] as const;

  for (const [column, value] of identifiers) {
    if (!value) {
      continue;
    }

    const { data, error } = await supabase
      .from('clienti_fatturazione')
      .select('id')
      .eq(column, value)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (data) {
      matches.set(data.id, data);
    }
  }

  if (matches.size > 1) {
    throw new Error('Partita IVA e telefono risultano associati a clienti diversi.');
  }

  return matches.values().next().value ?? null;
}

export async function showInvoiceMenu(stationId: number | string, userId: string): Promise<void> {
  openModal('Richiesta Fattura');
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }
  setSafeHTML(
    modalBody,
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>'
  );

  try {
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      setSafeHTML(
        modalBody,
        `
          <div style="background: rgba(255, 65, 54, 0.1); color: var(--danger-color); padding:30px; border-radius:12px; border:2px solid rgba(255, 65, 54, 0.3); text-align:center; margin: 20px;">
            <h2 style="margin:0 0 15px 0; color: var(--danger-color);"><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
            <p style="font-size:1.1em; margin:0 0 20px 0;">Devi aprire un turno prima di poter registrare richieste di fattura.</p>
            <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
          </div>
        `
      );
      document.getElementById('btn-close-warning')?.addEventListener('click', () => closeModal());
      return;
    }

    renderCustomerChoice(modalBody, stationId, userId);
  } catch (err) {
    setSafeHTML(
      modalBody,
      createErrorMessage('Errore Caricamento', err) +
        '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>'
    );
    document.getElementById('btn-close-err')?.addEventListener('click', () => closeModal());
  }
}

function renderCustomerChoice(
  container: HTMLElement,
  stationId: number | string,
  userId: string
): void {
  setSafeHTML(
    container,
    `
      <div class="content-box">
        <p class="section-subtitle">Seleziona il tipo di cliente</p>
        <div class="info-box" style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); color: var(--info-color); padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 20px;">
          <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
          <button id="btn-new-customer" class="menu-button primary" style="flex: 1; padding: 15px; font-size: 1rem;"><i class="fas fa-user-plus"></i> Nuovo Cliente</button>
          <button id="btn-existing-customer" class="menu-button" style="flex: 1; padding: 15px; font-size: 1rem;"><i class="fas fa-users"></i> Cliente Esistente</button>
        </div>
        <div style="text-align: center;"><button id="btn-cancel-choice" class="menu-button btn-danger"><i class="fas fa-times"></i> Annulla</button></div>
      </div>
    `
  );

  document.getElementById('btn-new-customer')?.addEventListener('click', () => {
    renderNewCustomerForm(container, stationId, userId);
  });
  document.getElementById('btn-existing-customer')?.addEventListener('click', () => {
    renderExistingCustomerForm(container, stationId, userId);
  });
  document.getElementById('btn-cancel-choice')?.addEventListener('click', () => closeModal());
}

function renderNewCustomerForm(
  container: HTMLElement,
  stationId: number | string,
  userId: string
): void {
  setSafeHTML(
    container,
    `
      <div class="content-box">
        <p class="section-subtitle">Nuovo Cliente</p>
        <form id="new-customer-form">
          <div class="form-group"><label>Ragione Sociale / Nome Cliente</label><input type="text" name="nome" class="big-input" placeholder="Es. Azienda SRL"></div>
          <div class="form-group"><label>Partita IVA</label><input type="text" name="partita_iva" class="big-input" placeholder="Es. IT12345678901"></div>
          <div class="form-group"><label>Codice Univoco / PEC</label><input type="text" name="codice_univoco_pec" class="big-input" placeholder="Es. ABCDEF12G34H567I"></div>
          <div class="form-group"><label>Numero di Telefono</label><input type="tel" name="telefono" class="big-input" placeholder="Es. 3331234567"></div>
          <div class="form-group"><label>Targa</label><input type="text" name="targa" class="big-input" placeholder="Es. AB123CD"></div>
          ${createFormActions({ confirmText: 'Continua', confirmClass: 'btn-success' })}
        </form>
      </div>
    `
  );

  container.querySelector('#btn-cancel')?.addEventListener('click', () => {
    renderCustomerChoice(container, stationId, userId);
  });

  const form = document.getElementById('new-customer-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const nome = (formData.get('nome') as string)?.trim() || '';
    const partitaIva = (formData.get('partita_iva') as string)?.trim() || '';
    const codiceUnivoco = (formData.get('codice_univoco_pec') as string)?.trim() || '';
    const telefono = (formData.get('telefono') as string)?.trim() || '';
    const targa = (formData.get('targa') as string)?.trim() || '';

    if (!nome && !partitaIva && !codiceUnivoco && !telefono && !targa) {
      Toast.show('Inserire almeno il numero di telefono o altri dati del cliente.', 'warning');
      return;
    }

    try {
      if (isOffline()) {
        renderInvoiceForm(
          container,
          stationId,
          userId,
          null,
          nome || telefono || targa || 'Cliente offline'
        );
        return;
      }

      // Only stable, exact identifiers are safe for automatic reconciliation.
      // A fuzzy name match can select and overwrite the wrong customer.
      const existingCustomer = await findExistingCustomer(partitaIva, telefono);

      let clienteId: number;
      if (existingCustomer) {
        const updateData: BillingCustomerUpdate = {};

        if (nome) updateData.nome = nome;
        if (partitaIva) updateData.partita_iva = partitaIva;
        if (codiceUnivoco) updateData.codice_univoco_pec = codiceUnivoco;
        if (telefono) updateData.telefono = telefono;
        if (targa) updateData.targa = targa;

        const { error: updateError } = await supabase
          .from('clienti_fatturazione')
          .update(updateData)
          .eq('id', existingCustomer.id);
        if (updateError) throw updateError;
        clienteId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: createError } = await supabase
          .from('clienti_fatturazione')
          .insert([
            {
              nome: nome || '',
              partita_iva: partitaIva || null,
              codice_univoco_pec: codiceUnivoco || null,
              telefono: telefono || null,
              targa: targa || null
            }
          ])
          .select()
          .single();
        if (createError) throw createError;
        clienteId = (newCustomer as BillingCustomer).id;
      }

      renderInvoiceForm(container, stationId, userId, clienteId, nome || telefono || 'Cliente');
    } catch (err: unknown) {
      handleError(err, 'saveCustomer');
    }
  });
}

function renderExistingCustomerForm(
  container: HTMLElement,
  stationId: number | string,
  userId: string
): void {
  setSafeHTML(
    container,
    `
      <div class="content-box">
        <p class="section-subtitle">Cliente Esistente</p>
        <form id="existing-customer-form">
          <div class="form-group"><label>Ragione Sociale / Nome Cliente</label><input type="text" id="customer-search" name="customer_name" class="big-input" required autocomplete="off"><input type="hidden" id="selected-customer-id" name="customer_id"><div id="customer-suggestions" style="display:none;"></div></div>
          ${createFormActions({ confirmText: 'Continua', confirmClass: 'btn-success' })}
        </form>
      </div>
    `
  );

  const searchInput = document.getElementById('customer-search') as HTMLInputElement | null;
  const suggestionsDiv = document.getElementById('customer-suggestions') as HTMLElement | null;
  const customerIdInput = document.getElementById(
    'selected-customer-id'
  ) as HTMLInputElement | null;
  if (!searchInput || !suggestionsDiv || !customerIdInput) return;

  let searchTimeout: ReturnType<typeof setTimeout>;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimeout);
    const query = (e.target as HTMLInputElement).value.trim();
    if (query.length < 2) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const { data: customers, error } = await supabase
          .from('clienti_fatturazione')
          .select('id, nome, telefono, partita_iva')
          .ilike('nome', `%${escapeLikePattern(query)}%`)
          .order('nome', { ascending: true })
          .limit(10);
        if (error) throw error;
        setSafeHTML(
          suggestionsDiv,
          (customers ?? [])
            .map(
              c =>
                `<div class="suggestion-item" data-id="${c.id}" data-name="${escapeHtml(c.nome || c.telefono || 'Cliente')}">${escapeHtml(c.nome || c.telefono || 'Cliente')}</div>`
            )
            .join('')
        );
        suggestionsDiv.style.display = customers?.length ? 'block' : 'none';
        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(itemElement => {
          const item = itemElement as HTMLElement;
          item.addEventListener('click', () => {
            customerIdInput.value = item.dataset.id || '';
            searchInput.value = item.dataset.name || '';
            suggestionsDiv.style.display = 'none';
          });
        });
      } catch (err) {
        logger.error('invoices', 'Customer search failed:', err);
      }
    }, 250);
  });

  container.querySelector('#btn-cancel')?.addEventListener('click', () => {
    renderCustomerChoice(container, stationId, userId);
  });

  const form = document.getElementById('existing-customer-form') as HTMLFormElement | null;
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const customerId = customerIdInput.value;
    const customerName = searchInput.value.trim();
    if (!customerId || !customerName) {
      Toast.show('Selezionare un cliente dalla lista.', 'warning');
      return;
    }
    renderInvoiceForm(container, stationId, userId, customerId, customerName);
  });
}

function renderInvoiceForm(
  container: HTMLElement,
  stationId: number | string,
  userId: string,
  clienteId: number | string | null,
  customerName: string
): void {
  setSafeHTML(
    container,
    `
      <div class="content-box">
        <p class="section-subtitle">Richiesta Fattura - ${escapeHtml(customerName)}</p>
        <form id="invoice-form">
          <input type="hidden" name="cliente_id" value="${clienteId ?? ''}">
          <input type="hidden" name="customer_name" value="${escapeHtml(customerName)}">
          <div class="form-group"><label>Importo Rifornimento (€)</label><input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00"></div>
          <div class="form-group"><label>Metodo di Pagamento</label><select name="payment_method" class="big-input" required><option value="">Seleziona metodo...</option><option value="contanti">Contanti</option><option value="pos">POS</option><option value="bonifico">Bonifico</option></select></div>
          <div class="form-group"><label>Categoria Prodotto</label><select name="product_category" id="product-category" class="big-input" required><option value="">Seleziona categoria...</option><option value="gasolio">Gasolio</option><option value="benzina">Benzina</option><option value="adblue">Adblue</option><option value="altro">Altro</option></select></div>
          <div class="form-group" id="product-note-group" style="display: none;"><label>Specifica Prodotto (obbligatorio se "Altro")</label><input type="text" name="product_note" id="product-note" class="big-input" placeholder="Indica il prodotto da fatturare"></div>
          <div class="form-group"><label>Note</label><textarea name="notes" rows="4" class="big-input" placeholder="Note aggiuntive..."></textarea></div>
          ${createFormActions({ confirmText: 'Invia Richiesta', confirmClass: 'btn-success' })}
        </form>
      </div>
    `
  );

  const productCategorySelect = document.getElementById(
    'product-category'
  ) as HTMLSelectElement | null;
  const productNoteGroup = document.getElementById('product-note-group') as HTMLElement | null;
  const productNoteInput = document.getElementById('product-note') as HTMLInputElement | null;

  productCategorySelect?.addEventListener('change', e => {
    if ((e.target as HTMLSelectElement).value === 'altro') {
      if (productNoteGroup) productNoteGroup.style.display = 'block';
      if (productNoteInput) productNoteInput.required = true;
    } else {
      if (productNoteGroup) productNoteGroup.style.display = 'none';
      if (productNoteInput) {
        productNoteInput.required = false;
        productNoteInput.value = '';
      }
    }
  });

  container.querySelector('#btn-cancel')?.addEventListener('click', () => {
    renderCustomerChoice(container, stationId, userId);
  });

  const form = document.getElementById('invoice-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const amount = parseFloat((formData.get('amount') as string) || '0');
    const paymentMethod = (formData.get('payment_method') as string) || '';
    const productCategory = (formData.get('product_category') as string) || '';
    const productNote = (formData.get('product_note') as string)?.trim() || '';
    const notes = (formData.get('notes') as string)?.trim() || '';

    if (productCategory === 'altro' && !productNote) {
      Toast.show(
        "Selezionando 'Altro' è obbligatorio specificare il prodotto nella nota.",
        'warning'
      );
      return;
    }
    if (amount <= 0 || !paymentMethod || !productCategory) {
      Toast.show('Inserire tutti i dati obbligatori.', 'warning');
      return;
    }

    const finalNotes =
      productCategory === 'altro' && productNote
        ? `${productNote}${notes ? '\n' + notes : ''}`
        : notes;

    try {
      await processInvoiceRequest(
        stationId,
        userId,
        clienteId,
        customerName,
        amount,
        paymentMethod,
        productCategory,
        finalNotes
      );
      closeModal();
      showInfoModal(
        isOffline()
          ? `Richiesta fattura per ${customerName} salvata offline.`
          : `Richiesta fattura per ${customerName} inviata correttamente.`
      );
    } catch (err: unknown) {
      handleError(err, 'saveInvoice');
    }
  });
}

export async function processInvoiceRequest(
  stationId: number | string,
  userId: string,
  clienteId: number | string | null,
  customerName: string,
  amount: number,
  paymentMethod: string,
  productCategory: string,
  description: string,
  options?: PersistOptions
): Promise<void> {
  const createdAt = options?.createdAt ?? new Date().toISOString();
  const invoiceNumber = options?.invoiceNumber ?? `REQ-${Date.now()}`;
  const invoiceDate = options?.invoiceDate ?? getItalianBusinessDate();

  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    throw new Error('ID operatore non valido per la richiesta fattura.');
  }

  const numericStationId = Number(stationId);
  if (!Number.isFinite(numericStationId) || numericStationId <= 0) {
    throw new Error('ID stazione non valido per la richiesta fattura.');
  }

  if (shouldQueue(options)) {
    await queueAction('movement_create', {
      kind: 'invoice_request',
      stationId: numericStationId,
      operatorId: userId,
      clienteId: clienteId === null || clienteId === '' ? null : Number(clienteId),
      customerName,
      amount,
      paymentMethod,
      productCategory,
      description,
      status: 'pending',
      createdAt,
      invoiceNumber,
      invoiceDate
    }, { userId: String(userId), stationId: numericStationId });
    return;
  }

  const requestId =
    options?.requestId ??
    'invoice_' +
      numericStationId +
      '_' +
      numericUserId +
      '_' +
      Date.now() +
      '_' +
      Math.random().toString(36).substring(2, 9);
  const { data: result, error } = await supabase.rpc('create_invoice_request', {
    p_request_id: requestId,
    p_station_id: numericStationId,
    p_operator_id: numericUserId,
    p_cliente_id: clienteId === null || clienteId === '' ? null : Number(clienteId),
    p_customer_name: customerName,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_product_category: productCategory,
    p_description: description,
    p_invoice_number: invoiceNumber,
    p_invoice_date: invoiceDate,
    p_created_at: createdAt
  });
  if (error) throw error;
  if (result && typeof result === 'object' && 'success' in result && !result.success) {
    throw new Error(String(result.error ?? 'Errore durante la registrazione fattura'));
  }
}
