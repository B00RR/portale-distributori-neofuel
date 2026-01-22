/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Validators, validateForm, formatErrorMessages } from '../shared/validators.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, openModal, closeModal, setButtonLoading, openConfirmModal } from '../ui/ui.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

// --- INTERFACES ---

interface CreditCustomer {
    id: number;
    cliente: string;
    saldo: number;
    station_id?: number | null;
    updated_at?: string;

    // Join
    fuel_stations?: {
        station_name: string;
    };
}

interface CreditsContext {
    container: HTMLElement | null;
    actions: HTMLElement | null;
    stationId: number | null;
}

// --- STATE ---

// Context to allow refreshing the view
let creditsContext: CreditsContext = { container: null, actions: null, stationId: null };

/**
 * Render the credits customers overview into the provided container, optionally filtered by station.
 *
 * Loads customer records (including related station name), builds and injects an HTML table showing
 * client name, station, current balance, last update and action buttons, and wires Edit/Delete
 * buttons to the corresponding modal and deletion flows.
 *
 * @param container - The DOM element where the overview content will be rendered.
 * @param actionsContainer - Optional DOM element where top-level action controls (e.g., "Nuovo Cliente" button) will be placed.
 * @param stationId - Optional station ID to filter customers by a specific fuel station.
 */

export async function showCreditiOverview(
    container: HTMLElement,
    actionsContainer: HTMLElement | null,
    stationId: number | null = null
): Promise<void> {
    creditsContext = { container, actions: actionsContainer, stationId };
    showLoadingMessage(container);

    if (actionsContainer) {
        actionsContainer.innerHTML = '<button class="action-btn primary" id="add-customer-btn"><i class="fas fa-plus"></i> Nuovo Cliente</button>';
        const addBtn = document.getElementById('add-customer-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => openCustomerModal());
        }
    }

    try {
        let query = supabase.from('crediti_clienti')
            .select(`
                *,
                fuel_stations(station_name)
            `);

        if (stationId) {
            query = query.eq('station_id', stationId);
        }

        query = query.order('cliente');

        const { data: rawCustomers, error } = await query;

        if (error) { throw error; }

        const customers = rawCustomers as CreditCustomer[];

        if (!customers || customers.length === 0) {
            container.innerHTML = '<p>Nessun cliente trovato.</p>';
            return;
        }

        let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Distributore</th>
              <th>Saldo Attuale</th>
              <th>Ultimo Aggiornamento</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

        customers.forEach(c => {
            const stationName = c.fuel_stations?.station_name || '-';
            html += `
        <tr>
          <td>${escapeHtml(c.cliente)}</td>
          <td>${escapeHtml(stationName)}</td>
          <td><strong>${formatEuro(c.saldo || 0)}</strong></td>
          <td>${c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '-'}</td>
          <td>
            <button class="icon-btn edit-customer" data-id="${c.id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn delete-customer" data-id="${c.id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

        // Bind events
        container.querySelectorAll('.edit-customer').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id;
                if (id) openCustomerModal(parseInt(id, 10));
            });
        });
        container.querySelectorAll('.delete-customer').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id;
                if (id) deleteCustomer(parseInt(id, 10));
            });
        });

    } catch (err) {
        handleError(err, 'showCreditiOverview', container);
    }
}

/**
 * Open a modal to create a new customer or edit an existing one.
 *
 * If `customerId` is provided, the existing customer data is loaded into the form; on submit the form is validated and the function either inserts a new customer or updates the existing one, then closes the modal and refreshes the credits overview.
 *
 * @param customerId - The ID of the customer to edit, or `null` to open the modal for creating a new customer
 */

async function openCustomerModal(customerId: number | null = null): Promise<void> {
    const isEdit = !!customerId;
    openModal(isEdit ? 'Modifica Cliente' : 'Nuovo Cliente');
    const target = document.getElementById('modal-body');
    if (!target) return;

    let customer: Partial<CreditCustomer> = {};
    if (customerId) {
        try {
            const { data, error } = await supabase.from('crediti_clienti').select('*').eq('id', customerId).single();
            if (error) throw error;
            customer = data as CreditCustomer;
        } catch (err) {
            console.error('Error loading customer', err);
            // Continue with empty? or show error?
        }
    }

    target.innerHTML = `
    <form id="customer-form">
      <div class="form-group">
        <label>Nome Cliente / Azienda</label>
        <input type="text" name="cliente" value="${escapeHtml(customer.cliente || '')}" required>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Saldo Iniziale (€)</label>
        <input type="number" name="saldo" step="0.01">
      </div>` : ''}
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Cliente'}</button>
    </form>
  `;

    const form = document.getElementById('customer-form') as HTMLFormElement;
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const cliente = fd.get('cliente') as string;
            const saldoStr = fd.get('saldo');
            const saldo = saldoStr ? parseFloat(saldoStr as string) : 0;
            const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

            const errors = validateForm({ cliente, saldo }, {
                cliente: [Validators.required],
                saldo: [Validators.number]
            });
            if (errors) {
                Toast.show('Errore validazione: ' + formatErrorMessages(errors), 'error');
                return;
            }

            try {
                setButtonLoading(submitBtn, true, 'Salvataggio...');
                if (isEdit && customerId) {
                    await safeSupabaseQuery(() => supabase.from('crediti_clienti').update({ cliente }).eq('id', customerId));
                } else {
                    // Opzionale: gestire station_id se necessario
                    await safeSupabaseQuery(() => supabase.from('crediti_clienti').insert([{
                        cliente,
                        saldo, // Note: saldo usually shouldn't be updated directly via edit, only via movements, but creation allows initial saldo
                        create_at: new Date().toISOString() // Should be created_at if DB has it, likely auto-generated
                    }]));
                }
                closeModal();
                Toast.show(isEdit ? 'Cliente aggiornato' : 'Cliente creato', 'success');
                refreshCreditsTab();
            } catch (err) {
                handleError(err, 'saveCustomer');
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }
}

/**
 * Delete a customer record after user confirmation and refresh the credits overview.
 *
 * Prompts the user for confirmation, deletes the record with the given id when confirmed, shows a success toast, and refreshes the credits tab.
 *
 * @param customerId - The id of the customer record to delete
 */
async function deleteCustomer(customerId: number): Promise<void> {
    if (!await openConfirmModal('Sei sicuro? Verranno eliminati anche i movimenti associati.')) { return; }
    try {
        await safeSupabaseQuery(() => supabase.from('crediti_clienti').delete().eq('id', customerId));
        Toast.show('Cliente eliminato', 'success');
        refreshCreditsTab();
    } catch (err) {
        handleError(err, 'deleteCustomer');
    }
}

/**
 * Re-renders the credits overview using the last stored UI context.
 */
function refreshCreditsTab(): void {
    if (creditsContext.container) {
        showCreditiOverview(creditsContext.container, creditsContext.actions, creditsContext.stationId);
    }
}