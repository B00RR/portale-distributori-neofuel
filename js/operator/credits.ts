// ==========================================
// OPERATOR CREDITS MANAGEMENT
// Gestione crediti clienti (Nuovo Credito vs Pagamento)
// ==========================================
import { supabase } from '../core/api.js';
import { logger } from '../core/logger.js';
import { isOffline, queueAction } from '../core/offline-queue.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { showInfoModal, openModal, closeModal } from '../ui/ui.js';
import { escapeLikePattern, setSafeHTML } from '../utils/sanitizer.js';
import {
  escapeHtml,
  formatEuro,
  formatDateSafe,
  getItalianBusinessDayEndUtc
} from '../utils/utils.js';

import { checkOpeningStatus } from './opening.js';

interface CreditoCliente {
  id: number | string;
  station_id?: number | null;
  cliente: string;
  importo?: number;
  saldo: number;
  created_at?: string | null;
  updated_at?: string | null;
}

interface OfflineReplayOptions {
  createdAt?: string;
  skipOfflineQueue?: boolean;
  requestId?: string;
}

const generateUUID = (): string => {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID non supportato o non disponibile in questo ambiente');
  }
  return crypto.randomUUID();
};

function toNumericId(value: number | string): number {
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`ID non numerico: "${value}"`);
    }
    return parsed;
  }
  return value;
}

function shouldQueue(options?: OfflineReplayOptions): boolean {
  return !options?.skipOfflineQueue && isOffline();
}

export async function showCreditsMenu(stationId: number | string, userId: string): Promise<void> {
  openModal('Gestione Crediti');
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }

  setSafeHTML(
    modalBody,
    '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>'
  );

  const activeOpening = await checkOpeningStatus(stationId);
  if (!activeOpening) {
    setSafeHTML(
      modalBody,
      `
        <div class="warning-box">
          <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
          <p>Devi aprire un turno prima di poter gestire i crediti.</p>
          <button id="btn-close-warning" class="menu-button primary">Chiudi</button>
        </div>
      `
    );
    document.getElementById('btn-close-warning')?.addEventListener('click', () => closeModal());
    return;
  }

  setSafeHTML(
    modalBody,
    `
      <div class="credits-menu-container">
        <p class="section-subtitle" style="text-align: center; margin-bottom: 20px;">Seleziona un'operazione</p>
        <div class="credits-options" style="display: flex; gap: 20px; justify-content: center;">
          <button id="btn-new-credit" class="credit-option-card menu-button primary">
            <h3>Nuovo Credito</h3>
            <p>Erogazione senza incasso</p>
          </button>
          <button id="btn-payment-credit" class="credit-option-card menu-button secondary">
            <h3>Pagamento</h3>
            <p>Incasso su credito aperto</p>
          </button>
        </div>
      </div>
    `
  );

  document
    .getElementById('btn-new-credit')
    ?.addEventListener('click', () => showNewCreditForm(stationId, userId));
  document
    .getElementById('btn-payment-credit')
    ?.addEventListener('click', () => showPaymentSelection(stationId, userId));
}

async function showNewCreditForm(stationId: number | string, userId: string): Promise<void> {
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }

  setSafeHTML(
    modalBody,
    `
      <div class="content-box">
        <h3><i class="fas fa-user-plus"></i> Nuovo Credito</h3>
        <p class="section-subtitle">Registra un debito per un cliente</p>
        <form id="new-credit-form">
          <div class="form-group"><label>Nome Cliente</label><div style="position: relative;"><input type="text" id="customer-name" name="customer_name" class="big-input" required autocomplete="off"><div id="customer-suggestions" class="suggestions-list" style="display: none;"></div></div></div>
          <div class="form-group"><label>Importo (€)</label><input type="number" name="amount" step="0.01" min="0.01" class="big-input" required></div>
          <div class="form-group"><label>Prodotto</label><select name="product" class="big-input" required><option value="Gasolio">Gasolio</option><option value="Benzina">Benzina</option><option value="AdBlue">AdBlue</option><option value="Accessori">Accessori</option><option value="Altro">Altro</option></select></div>
          <div class="form-group"><label>Note (Opzionale)</label><textarea name="notes" rows="2" class="big-input"></textarea></div>
          <div class="form-actions"><button type="button" class="menu-button btn-danger" id="btn-back-credits">Annulla</button><button type="submit" class="menu-button btn-success">Conferma Credito</button></div>
        </form>
      </div>
    `
  );

  document
    .getElementById('btn-back-credits')
    ?.addEventListener('click', () => showCreditsMenu(stationId, userId));

  const nameInput = document.getElementById('customer-name') as HTMLInputElement | null;
  const suggestionsDiv = document.getElementById('customer-suggestions') as HTMLElement | null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  if (nameInput && suggestionsDiv) {
    nameInput.addEventListener('input', e => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      const query = (e.target as HTMLInputElement).value;
      if (query.length < 2) {
        suggestionsDiv.style.display = 'none';
        return;
      }
      debounceTimer = setTimeout(() => {
        void searchCustomersForInput(query, stationId, suggestionsDiv, nameInput);
      }, 300);
    });
  }

  const form = document.getElementById('new-credit-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const customerName = (formData.get('customer_name') as string)?.trim() || '';
    const amount = parseFloat((formData.get('amount') as string) || '0');
    const product = (formData.get('product') as string) || '';
    const notes = (formData.get('notes') as string) || '';

    if (!customerName || amount <= 0) {
      return;
    }

    try {
      await processNewCredit(stationId, userId, customerName, amount, product, notes);
      closeModal();
      showInfoModal(
        isOffline()
          ? 'Credito salvato offline. Verrà sincronizzato quando la connessione torna disponibile.'
          : 'Credito registrato con successo!'
      );
    } catch (err) {
      handleError(err, 'submitCredit');
    }
  });
}

async function searchCustomersForInput(
  query: string,
  stationId: number | string,
  suggestionsDiv: HTMLElement,
  inputField: HTMLInputElement
): Promise<void> {
  try {
    const numericStationId = toNumericId(stationId);
    const { data: customers } = await supabase
      .from('crediti_clienti')
      .select('cliente')
      .eq('station_id', numericStationId)
      .ilike('cliente', `%${escapeLikePattern(query)}%`)
      .limit(5);

    if (customers && customers.length > 0) {
      setSafeHTML(
        suggestionsDiv,
        customers.map(c => `<div class="suggestion-item">${escapeHtml(c.cliente)}</div>`).join('')
      );
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
    logger.error('credits', err);
  }
}

export async function processNewCredit(
  stationId: number | string,
  userId: string,
  customerName: string,
  amount: number,
  product: string,
  notes: string,
  options?: OfflineReplayOptions
): Promise<void> {
  const numericStationId = toNumericId(stationId);
  const creditDate = options?.createdAt ?? getItalianBusinessDayEndUtc();

  const activeOpening = await checkOpeningStatus(stationId);
  const shiftId = activeOpening?.id ?? null;

  if (shouldQueue(options)) {
    const numericOpId = toNumericId(userId);
    await queueAction('movement_create', {
      kind: 'credit_create',
      stationId: numericStationId,
      operatorId: String(numericOpId),
      customerName,
      amount,
      product,
      notes,
      ...(creditDate ? { createdAt: creditDate } : {})
    }, { userId: String(numericOpId), stationId: numericStationId });
    return;
  }

  const requestId = options?.requestId ?? `credit-create-${generateUUID()}`;

  const { data, error } = await supabase.rpc('create_credit_transaction', {
    p_request_id: requestId,
    p_station_id: numericStationId,
    p_shift_id: shiftId,
    p_customer_name: customerName,
    p_amount: amount,
    p_product: product,
    p_notes: notes
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Risposta del server non valida o vuota');
  }

  const responseData = data as { success?: boolean; message?: string; error?: string };
  if (responseData.success !== true) {
    throw new Error(
      responseData.message || responseData.error || 'Errore durante la creazione del credito'
    );
  }
}

async function showPaymentSelection(stationId: number | string, userId: string): Promise<void> {
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }

  setSafeHTML(
    modalBody,
    `
      <div class="content-box">
        <h3><i class="fas fa-list"></i> Crediti Aperti</h3>
        <input type="text" id="debtor-search" class="big-input" placeholder="Cerca cliente...">
        <div id="debtors-list" class="results-list" style="max-height: 350px; overflow-y: auto;"><div class="loading-spinner">Caricamento...</div></div>
        <button type="button" class="menu-button secondary full-width" id="btn-back-credits-2">Indietro</button>
      </div>
    `
  );

  document
    .getElementById('btn-back-credits-2')
    ?.addEventListener('click', () => showCreditsMenu(stationId, userId));

  const listContainer = document.getElementById('debtors-list') as HTMLElement | null;
  const searchInput = document.getElementById('debtor-search') as HTMLInputElement | null;
  if (!listContainer || !searchInput) {
    return;
  }

  const loadDebtors = async (filter = ''): Promise<void> => {
    try {
      const numericStationId = toNumericId(stationId);
      let query = supabase
        .from('crediti_clienti')
        .select('*')
        .eq('station_id', numericStationId)
        .gt('saldo', 0.01)
        .order('cliente');

      if (filter) {
        query = query.ilike('cliente', `%${escapeLikePattern(filter)}%`);
      }

      const { data: debtors, error } = await query;
      if (error) {
        throw error;
      }

      if (!debtors || debtors.length === 0) {
        setSafeHTML(
          listContainer,
          '<p style="text-align:center; padding:20px;">Nessun credito aperto trovato.</p>'
        );
        return;
      }

      setSafeHTML(
        listContainer,
        debtors
          .map(
            d => `
              <div class="result-item" data-id="${d.id}" style="cursor:pointer; padding: 15px; border-bottom: 1px solid var(--border-color);">
                <strong>${escapeHtml(d.cliente)}</strong>
                <span style="float:right;">${formatEuro(d.saldo)}</span>
                <div style="font-size: 0.85rem; color: var(--secondary-color);">Ultimo agg: ${formatDateSafe(d.updated_at || d.created_at)}</div>
              </div>
            `
          )
          .join('')
      );

      listContainer.querySelectorAll('.result-item').forEach(itemElement => {
        const item = itemElement as HTMLElement;
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const debtor = (debtors as CreditoCliente[]).find(x => String(x.id) === id);
          if (debtor) {
            showPaymentModal(debtor, stationId, userId);
          }
        });
      });
    } catch (err) {
      const message = err instanceof Error ? escapeHtml(err.message) : 'Errore imprevisto';
      setSafeHTML(listContainer, `<p class="error-text">Errore: ${message}</p>`);
    }
  };

  await loadDebtors();
  searchInput.addEventListener('input', e => {
    void loadDebtors((e.target as HTMLInputElement).value);
  });
}

export function showPaymentModal(
  customer: CreditoCliente,
  stationId: number | string,
  userId: string
): void {
  openModal(`Pagamento: ${escapeHtml(customer.cliente)}`);
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }

  setSafeHTML(
    modalBody,
    `
      <div class="content-box">
        <div style="font-size: 2rem; font-weight: 700; color: var(--danger-color);">${formatEuro(customer.saldo)}</div>
        <form id="payment-form">
          <div class="form-group"><label>Importo Pagamento (€)</label><div style="display:flex; gap:10px;"><input type="number" name="amount" id="pay-amount" step="0.01" min="0.01" max="${customer.saldo + 0.01}" class="big-input" required value="${customer.saldo}"><button type="button" id="btn-full-amount" class="menu-button secondary">Tutto</button></div></div>
          <div class="form-group"><label>Metodo di Pagamento</label><select name="method" id="pay-method" class="big-input" required><option value="contanti">Contanti</option><option value="pos">POS</option><option value="uta">UTA/DKV/Fine Mese</option></select></div>
          <div class="form-actions"><button type="button" class="menu-button btn-danger" id="btn-cancel-pay">Annulla</button><button type="submit" class="menu-button btn-success">Registra Pagamento</button></div>
        </form>
      </div>
    `
  );

  document.getElementById('btn-full-amount')?.addEventListener('click', () => {
    const payAmountInput = document.getElementById('pay-amount') as HTMLInputElement | null;
    if (payAmountInput) {
      payAmountInput.value = String(customer.saldo);
    }
  });

  document.getElementById('btn-cancel-pay')?.addEventListener('click', () => {
    void showPaymentSelection(stationId, userId);
  });

  const form = document.getElementById('payment-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const amount = parseFloat((formData.get('amount') as string) || '0');
    const method = (formData.get('method') as string) || '';

    if (amount <= 0) {
      return;
    }
    if (amount > customer.saldo + 0.01) {
      Toast.show("L'importo non può superare il debito!", 'warning');
      return;
    }

    try {
      await processPayment(stationId, userId, customer.id, amount, method);
      closeModal();
      showInfoModal(
        isOffline()
          ? 'Pagamento salvato offline. Verrà sincronizzato quando la connessione torna disponibile.'
          : 'Pagamento registrato con successo!'
      );
    } catch (err: unknown) {
      handleError(err, 'processPayment');
    }
  });
}

export async function processPayment(
  stationId: number | string,
  userId: string,
  customerId: number | string,
  amount: number,
  method: string,
  options?: OfflineReplayOptions
): Promise<void> {
  const numericStationId = toNumericId(stationId);
  const numericCustomerId = toNumericId(customerId);
  const creditDate = options?.createdAt ?? getItalianBusinessDayEndUtc();

  const activeOpening = await checkOpeningStatus(stationId);
  const shiftId = activeOpening?.id ?? null;

  if (shouldQueue(options)) {
    await queueAction('movement_create', {
      kind: 'credit_payment',
      stationId: numericStationId,
      operatorId: String(userId),
      customerId: numericCustomerId,
      amount,
      method,
      ...(creditDate ? { createdAt: creditDate } : {})
    }, { userId: String(userId), stationId: numericStationId });
    return;
  }

  const requestId = options?.requestId ?? `credit-payment-${generateUUID()}`;

  const { data, error } = await supabase.rpc('register_credit_payment', {
    p_request_id: requestId,
    p_station_id: numericStationId,
    p_shift_id: shiftId,
    p_customer_id: numericCustomerId,
    p_amount: amount,
    p_method: method
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Risposta del server non valida o vuota');
  }

  const responseData = data as { success?: boolean; message?: string; error?: string };
  if (responseData.success !== true) {
    throw new Error(
      responseData.message || responseData.error || 'Errore durante la registrazione del pagamento'
    );
  }
}
