import { supabase } from '../core/api.js';
import { logger } from '../core/logger.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage } from '../ui/ui.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

// --- DOM HELPER ---

function createIcon(className: string): HTMLElement {
  const icon = document.createElement('i');
  icon.className = className;
  return icon;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    id?: string;
    classes?: string[];
    text?: string;
    attrs?: Record<string, string>;
    dataset?: Record<string, string>;
    style?: Record<string, string>;
    children?: (HTMLElement | Node)[];
  } = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.id) {el.id = options.id;}
  if (options.classes) {el.classList.add(...options.classes.filter(Boolean));}
  if (options.text !== undefined) {el.textContent = options.text;}
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      el.setAttribute(`data-${key}`, value);
    });
  }
  if (options.style) {
    Object.entries(options.style).forEach(([key, value]) => {
      el.style.setProperty(key, value);
    });
  }
  if (options.children) {
    options.children.forEach(child => el.appendChild(child));
  }
  return el;
}

// --- INTERFACES ---

type InvoiceStatus = 'pending' | 'completed' | 'emessa' | 'annullata';
type PaymentMethod = 'contanti' | 'pos' | 'bonifico' | string;

interface FuelStation {
    station_name: string;
}

interface User {
    full_name?: string;
    username?: string;
}

interface BillingCustomer {
    id: number;
    nome: string;
    partita_iva?: string;
    telefono?: string;
}

interface Invoice {
    id: number;
    created_at: string;
    amount: number;
    payment_method: PaymentMethod;
    product_category: string;
    status: InvoiceStatus;
    notes?: string;
    station_id: number;
    cliente_id?: number | null;
    customer_name?: string; // Fallback legacy name

    // Joins
    fuel_stations?: FuelStation;
    users?: User;

    // Manually joined
    clienti_fatturazione?: BillingCustomer;
}

// --- MAIN FUNCTION ---

export async function showFattureTab(
  container: HTMLElement,
  _actionsContainer?: HTMLElement | null,
  stationId: number | null = null
): Promise<void> {
  showLoadingMessage(container);

  if (_actionsContainer) {
    _actionsContainer.innerHTML = '';
  }

  try {
    let query = supabase.from('invoices')
      .select(`
                *,
                fuel_stations(station_name),
                users(full_name, username)
            `);

    if (stationId) {
      query = query.eq('station_id', stationId);
    }

    query = query.order('created_at', { ascending: false });

    const { data: rawInvoices, error } = await query;
    if (error) { throw error; }

    const invoices = rawInvoices as Invoice[];

    // Fetch billing customer details if needed
    if (invoices && invoices.length > 0) {
      const clienteIds = invoices
        .filter(inv => inv.cliente_id)
        .map(inv => inv.cliente_id)
        .filter((id): id is number => !!id)
        .filter((id, index, self) => self.indexOf(id) === index); // remove duplicates

      if (clienteIds.length > 0) {
        const { data: clienti } = await supabase
          .from('clienti_fatturazione')
          .select('id, nome, partita_iva, telefono')
          .in('id', clienteIds);

        if (clienti) {
          const clientiMap: Record<number, BillingCustomer> = {};
          (clienti as BillingCustomer[]).forEach(c => {
            clientiMap[c.id] = c;
          });

          invoices.forEach(inv => {
            if (inv.cliente_id) {
              const cliente = clientiMap[inv.cliente_id];
              if (cliente) {
                inv.clienti_fatturazione = cliente;
              }
            }
          });
        }
      }
    }

    if (!invoices || invoices.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'Nessuna richiesta fattura trovata.';
      container.innerHTML = '';
      container.appendChild(p);
      return;
    }

    renderInvoicesTable(container, invoices);

  } catch (err) {
    handleError(err, 'Caricamento Fatture', container);
  }
}

function renderInvoicesTable(container: HTMLElement, invoices: Invoice[]): void {
  container.innerHTML = '';

  const wrapper = createEl('div', { classes: ['table-responsive'] });
  const table = createEl('table', { classes: ['admin-table'] });

  const thead = createEl('thead', {
    children: [
      createEl('tr', {
        children: [
          createEl('th', { text: 'Data Richiesta' }),
          createEl('th', { text: 'Cliente' }),
          createEl('th', { text: 'Importo' }),
          createEl('th', { text: 'Metodo Pagamento' }),
          createEl('th', { text: 'Categoria Prodotto' }),
          createEl('th', { text: 'Distributore' }),
          createEl('th', { text: 'Operatore' }),
          createEl('th', { text: 'Stato' }),
          createEl('th', { text: 'Note' }),
          createEl('th', { text: 'Azioni' })
        ]
      })
    ]
  });
  table.appendChild(thead);

  const tbody = createEl('tbody');

  invoices.forEach(inv => {
    const stationName = inv.fuel_stations?.station_name || '-';
    const operatorName = inv.users?.full_name || inv.users?.username || '-';
    const customerName = inv.clienti_fatturazione?.nome || inv.customer_name || '-';

    const statusBadgeStyle = {
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '0.85rem'
    };

    let statusBadge: HTMLElement;
    if (inv.status === 'pending') {
      statusBadge = createEl('span', {
        style: { ...statusBadgeStyle, background: '#fef3c7', color: '#92400e' },
        text: 'In Attesa'
      });
    } else if (inv.status === 'completed' || inv.status === 'emessa') {
      statusBadge = createEl('span', {
        style: { ...statusBadgeStyle, background: '#d1fae5', color: '#065f46' },
        text: 'Emessa'
      });
    } else {
      statusBadge = createEl('span', {
        style: { ...statusBadgeStyle, background: '#fee2e2', color: '#991b1b' },
        text: 'Annullata'
      });
    }

    const paymentBadgeStyle = {
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '0.85rem',
      fontWeight: '600'
    };

    let paymentMethodCell: HTMLElement;
    if (inv.payment_method === 'contanti') {
      paymentMethodCell = createEl('span', {
        style: { ...paymentBadgeStyle, background: '#dbeafe', color: '#1e40af' },
        text: 'Contanti'
      });
    } else if (inv.payment_method === 'pos') {
      paymentMethodCell = createEl('span', {
        style: { ...paymentBadgeStyle, background: '#fef3c7', color: '#92400e' },
        text: 'POS'
      });
    } else if (inv.payment_method === 'bonifico') {
      paymentMethodCell = createEl('span', {
        style: { ...paymentBadgeStyle, background: '#e0e7ff', color: '#3730a3' },
        text: 'Bonifico'
      });
    } else {
      paymentMethodCell = document.createTextNode('-') as unknown as HTMLElement;
    }

    const productCategory = inv.product_category
      ? inv.product_category.charAt(0).toUpperCase() + inv.product_category.slice(1)
      : '-';

    const isEmitted = inv.status === 'completed' || inv.status === 'emessa';
    const toggleBtn = createEl('button', {
      classes: ['icon-btn', 'toggle-status'],
      dataset: {
        id: String(inv.id),
        status: isEmitted ? 'pending' : 'completed'
      },
      attrs: {
        title: isEmitted ? 'Segna come non emessa' : 'Segna come emessa'
      },
      children: [createIcon(isEmitted ? 'fas fa-undo' : 'fas fa-check')]
    });

    const dateText = inv.created_at ? new Date(inv.created_at).toLocaleDateString('it-IT') : '-';

    const row = createEl('tr', {
      children: [
        createEl('td', { text: dateText }),
        createEl('td', { children: [createEl('strong', { text: escapeHtml(customerName) })] }),
        createEl('td', { children: [createEl('strong', { text: formatEuro(inv.amount || 0) })] }),
        createEl('td', { children: [paymentMethodCell] }),
        createEl('td', { text: escapeHtml(productCategory) }),
        createEl('td', { text: escapeHtml(stationName) }),
        createEl('td', { text: escapeHtml(operatorName) }),
        createEl('td', { children: [statusBadge] }),
        createEl('td', { text: escapeHtml(inv.notes || '') }),
        createEl('td', { children: [toggleBtn] })
      ]
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);

  // Bind events
  container.querySelectorAll('.toggle-status').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      const status = (btn as HTMLElement).dataset.status;
      if (id && status) {
        toggleInvoiceStatus(parseInt(id, 10), status as InvoiceStatus);
      }
    });
  });
}

async function toggleInvoiceStatus(id: number, newStatus: InvoiceStatus): Promise<void> {
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {throw error;}

    Toast.show('Stato fattura aggiornato', 'success');

    // Refresh Current View (requires re-calling logic essentially, but simplify by reloading tab via triggering router or just hack for now)
    // Since we are inside the module, we can't easily access the "router" to reload the tab cleanly without import cycle.
    // A simple way is to dispatch a custom event or click the tab again.
    // Or better: just locate the tab button and click it to refresh.
    const activeTab = document.querySelector('.nav-btn.active') as HTMLElement | null;
    if (activeTab) {activeTab.click();}

  } catch (err) {
    logger.error('toggleInvoiceStatus', err);
    Toast.show('Errore aggiornamento stato', 'error');
  }
}
