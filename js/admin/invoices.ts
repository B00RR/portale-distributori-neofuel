/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { showLoadingMessage } from '../ui/ui.js';
import { Toast } from '../ui/toast.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

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

/**
 * Load invoice records (optionally filtered by station) and render a table of invoices into the given container.
 *
 * @param _actionsContainer - Optional element whose contents will be cleared before rendering the invoices UI.
 * @param stationId - If provided, filters invoices to those belonging to the specified station id.
 */

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
                .map(inv => inv.cliente_id!)
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
            container.innerHTML = '<p>Nessuna richiesta fattura trovata.</p>';
            return;
        }

        renderInvoicesTable(container, invoices);

    } catch (err) {
        handleError(err, 'Caricamento Fatture', container);
    }
}

/**
 * Renders a table of invoices into the given container and attaches status-toggle handlers.
 *
 * Renders invoice data (dates, customer, amount, payment method, product category, station,
 * operator, status, notes, and actions) as an HTML table inside `container`, and binds click
 * listeners on action buttons to toggle invoice status.
 *
 * @param container - DOM element where the invoices table will be inserted
 * @param invoices - Array of invoices to display
 */
function renderInvoicesTable(container: HTMLElement, invoices: Invoice[]): void {
    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Data Richiesta</th>
              <th>Cliente</th>
              <th>Importo</th>
              <th>Metodo Pagamento</th>
              <th>Categoria Prodotto</th>
              <th>Distributore</th>
              <th>Operatore</th>
              <th>Stato</th>
              <th>Note</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    invoices.forEach(inv => {
        const stationName = inv.fuel_stations?.station_name || '-';
        const operatorName = inv.users?.full_name || inv.users?.username || '-';
        const customerName = inv.clienti_fatturazione?.nome || inv.customer_name || '-';

        let statusBadge = '';
        if (inv.status === 'pending') {
            statusBadge = '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">In Attesa</span>';
        } else if (inv.status === 'completed' || inv.status === 'emessa') {
            statusBadge = '<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">Emessa</span>';
        } else {
            statusBadge = '<span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">Annullata</span>';
        }

        let paymentMethodBtn = '-';
        if (inv.payment_method === 'contanti') {
            paymentMethodBtn = '<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">Contanti</span>';
        } else if (inv.payment_method === 'pos') {
            paymentMethodBtn = '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">POS</span>';
        } else if (inv.payment_method === 'bonifico') {
            paymentMethodBtn = '<span style="background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">Bonifico</span>';
        }

        const productCategory = inv.product_category
            ? inv.product_category.charAt(0).toUpperCase() + inv.product_category.slice(1)
            : '-';

        const isEmitted = inv.status === 'completed' || inv.status === 'emessa';
        const toggleStatusAction = isEmitted
            ? `<button class="icon-btn toggle-status" data-id="${inv.id}" data-status="pending" title="Segna come non emessa"><i class="fas fa-undo"></i></button>`
            : `<button class="icon-btn toggle-status" data-id="${inv.id}" data-status="completed" title="Segna come emessa"><i class="fas fa-check"></i></button>`;

        html += `
        <tr>
          <td>${inv.created_at ? new Date(inv.created_at).toLocaleDateString('it-IT') : '-'}</td>
          <td><strong>${escapeHtml(customerName)}</strong></td>
          <td><strong>${formatEuro(inv.amount || 0)}</strong></td>
          <td>${paymentMethodBtn}</td>
          <td>${escapeHtml(productCategory)}</td>
          <td>${escapeHtml(stationName)}</td>
          <td>${escapeHtml(operatorName)}</td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(inv.notes || '')}</td>
          <td>
            ${toggleStatusAction}
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Bind events
    container.querySelectorAll('.toggle-status').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = (btn as HTMLElement).dataset.id;
            const status = (btn as HTMLElement).dataset.status;
            if (id && status) {
                toggleInvoiceStatus(parseInt(id), status as InvoiceStatus);
            }
        });
    });
}

/**
 * Update an invoice's status and refresh the invoices view.
 *
 * Updates the invoice record's status in the backend, shows a success or error notification, and attempts to refresh the currently displayed invoices tab.
 *
 * @param id - The identifier of the invoice to update
 * @param newStatus - The target invoice status (e.g., 'pending', 'completed', 'emessa', 'annullata')
 */
async function toggleInvoiceStatus(id: number, newStatus: InvoiceStatus): Promise<void> {
    try {
        const { error } = await supabase
            .from('invoices')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;

        Toast.show('Stato fattura aggiornato', 'success');

        // Refresh Current View (requires re-calling logic essentially, but simplify by reloading tab via triggering router or just hack for now)
        // Since we are inside the module, we can't easily access the "router" to reload the tab cleanly without import cycle.
        // A simple way is to dispatch a custom event or click the tab again.
        // Or better: just locate the tab button and click it to refresh.
        const activeTab = document.querySelector('.nav-btn.active') as HTMLElement;
        if (activeTab) activeTab.click();

    } catch (err) {
        console.error(err);
        Toast.show('Errore aggiornamento stato', 'error');
    }
}