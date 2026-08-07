import { supabase, safeSupabaseQuery } from '../core/api.js';
import { logger } from '../core/logger.js';
import { handleError } from '../shared/error-handler.js';
import { Validators, validateForm, formatErrorMessages } from '../shared/validators.js';
import { Toast } from '../ui/toast.js';
import {
  showLoadingMessage,
  openModal,
  closeModal,
  setButtonLoading,
  openConfirmModal
} from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { formatEuro } from '../utils/utils.js';

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
  page: number;
  pageSize: number;
  totalCount: number;
}

// --- STATE ---

// Context to allow refreshing the view
let creditsContext: CreditsContext = {
  container: null,
  actions: null,
  stationId: null,
  page: 0,
  pageSize: 50,
  totalCount: 0
};

// --- MAIN FUNCTION ---

export async function showCreditiOverview(
  container: HTMLElement,
  actionsContainer: HTMLElement | null,
  stationId: number | null = null
): Promise<void> {
  creditsContext = { ...creditsContext, container, actions: actionsContainer, stationId };
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.replaceChildren();
    const addBtn = document.createElement('button');
    addBtn.className = 'action-btn primary';
    addBtn.id = 'add-customer-btn';
    setSafeHTML(addBtn, '<i class="fas fa-plus"></i> Nuovo Cliente');
    actionsContainer.appendChild(addBtn);
    addBtn.addEventListener('click', () => openCustomerModal());
  }

  try {
    // Paginated, server-side query with minimal columns. Each fetch pulls only
    // the page rows needed for the list, plus an exact count for the footer.
    const { page, pageSize } = creditsContext;

    let query = supabase
      .from('crediti_clienti')
      .select(`id, cliente, saldo, station_id, updated_at, fuel_stations(station_name)`, {
        count: 'exact'
      });

    if (stationId) {
      query = query.eq('station_id', stationId);
    }

    query = query.order('cliente').range(page * pageSize, page * pageSize + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    const customers = (data as CreditCustomer[] | null) || [];
    if (count !== null && count !== undefined) {
      creditsContext.totalCount = count;
    }

    if (customers.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'Nessun cliente trovato.';
      container.replaceChildren();
      container.appendChild(p);
      renderCreditsPagination(container);
      return;
    }

    container.replaceChildren();
    const tableResponsive = document.createElement('div');
    tableResponsive.className = 'table-responsive';
    const table = document.createElement('table');
    table.className = 'admin-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Cliente', 'Distributore', 'Saldo Attuale', 'Ultimo Aggiornamento', 'Azioni'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    customers.forEach(c => {
      const stationName = c.fuel_stations?.station_name || '-';
      const tr = document.createElement('tr');

      const tdCliente = document.createElement('td');
      tdCliente.textContent = c.cliente;
      tr.appendChild(tdCliente);

      const tdStation = document.createElement('td');
      tdStation.textContent = stationName;
      tr.appendChild(tdStation);

      const tdSaldo = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = formatEuro(c.saldo || 0);
      tdSaldo.appendChild(strong);
      tr.appendChild(tdSaldo);

      const tdUpdated = document.createElement('td');
      tdUpdated.textContent = c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '-';
      tr.appendChild(tdUpdated);

      const tdActions = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn edit-customer';
      editBtn.dataset.id = String(c.id);
      editBtn.title = 'Modifica';
      editBtn.setAttribute('aria-label', 'Modifica');
      setSafeHTML(editBtn, '<i class="fas fa-edit"></i>');
      tdActions.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn delete-customer';
      deleteBtn.dataset.id = String(c.id);
      deleteBtn.title = 'Elimina';
      deleteBtn.setAttribute('aria-label', 'Elimina');
      setSafeHTML(deleteBtn, '<i class="fas fa-trash"></i>');
      tdActions.appendChild(deleteBtn);

      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableResponsive.appendChild(table);
    container.appendChild(tableResponsive);

    renderCreditsPagination(container);

    // Bind events
    container.querySelectorAll('.edit-customer').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          openCustomerModal(parseInt(id, 10));
        }
      });
    });
    container.querySelectorAll('.delete-customer').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          deleteCustomer(parseInt(id, 10));
        }
      });
    });
  } catch (err) {
    handleError(err, 'showCreditiOverview', container);
  }
}

// --- HELPER FUNCTIONS ---

function renderCreditsPagination(container: HTMLElement): void {
  const { page, pageSize, totalCount } = creditsContext;
  if (totalCount <= pageSize && page === 0) {
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = totalCount > 0 ? page * pageSize + 1 : 0;
  const end = Math.min((page + 1) * pageSize, totalCount);

  const bar = document.createElement('div');
  bar.className = 'pagination-bar';

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = totalCount > 0 ? `${start}-${end} di ${totalCount}` : 'Nessun risultato';
  bar.appendChild(info);

  const controls = document.createElement('div');
  controls.className = 'pagination-controls';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'menu-button secondary small btn-prev';
  prevBtn.textContent = '‹';
  prevBtn.disabled = page <= 0;
  controls.appendChild(prevBtn);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'menu-button secondary small btn-next';
  nextBtn.textContent = '›';
  nextBtn.disabled = page + 1 >= totalPages;
  controls.appendChild(nextBtn);

  bar.appendChild(controls);
  container.appendChild(bar);

  prevBtn.addEventListener('click', () => {
    if (creditsContext.page > 0) {
      creditsContext.page -= 1;
      showCreditiOverview(container, creditsContext.actions, creditsContext.stationId);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (creditsContext.page + 1 < Math.ceil(creditsContext.totalCount / creditsContext.pageSize)) {
      creditsContext.page += 1;
      showCreditiOverview(container, creditsContext.actions, creditsContext.stationId);
    }
  });
}

async function openCustomerModal(customerId: number | null = null): Promise<void> {
  const isEdit = !!customerId;
  openModal(isEdit ? 'Modifica Cliente' : 'Nuovo Cliente');
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  let customer: Partial<CreditCustomer> = {};
  if (customerId) {
    try {
      const { data, error } = await supabase
        .from('crediti_clienti')
        .select('*')
        .eq('id', customerId)
        .single();
      if (error) {
        throw error;
      }
      customer = data as CreditCustomer;
    } catch (err) {
      logger.error('openCustomerModal', err);
      // Continue with empty? or show error?
    }
  }

  target.replaceChildren();
  const form = document.createElement('form');
  form.id = 'customer-form';

  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Nome Cliente / Azienda';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.name = 'cliente';
  nameInput.value = customer.cliente || '';
  nameInput.required = true;
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  form.appendChild(nameGroup);

  if (!isEdit) {
    const saldoGroup = document.createElement('div');
    saldoGroup.className = 'form-group';
    const saldoLabel = document.createElement('label');
    saldoLabel.textContent = 'Saldo Iniziale (€)';
    const saldoInput = document.createElement('input');
    saldoInput.type = 'number';
    saldoInput.name = 'saldo';
    saldoInput.step = '0.01';
    saldoGroup.appendChild(saldoLabel);
    saldoGroup.appendChild(saldoInput);
    form.appendChild(saldoGroup);
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'menu-button primary';
  submitBtn.textContent = isEdit ? 'Salva Modifiche' : 'Crea Cliente';
  form.appendChild(submitBtn);

  target.appendChild(form);

  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const cliente = fd.get('cliente') as string;
      const saldoStr = fd.get('saldo');
      const saldo = saldoStr ? parseFloat(saldoStr as string) : 0;
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

      const errors = validateForm(
        { cliente, saldo },
        {
          cliente: [Validators.required],
          saldo: [Validators.number]
        }
      );
      if (errors) {
        Toast.show('Errore validazione: ' + formatErrorMessages(errors), 'warning');
        return;
      }

      try {
        setButtonLoading(submitBtn, true, 'Salvataggio...');
        if (isEdit && customerId) {
          await safeSupabaseQuery(() =>
            supabase.from('crediti_clienti').update({ cliente }).eq('id', customerId)
          );
        } else {
          const insertPayload: {
            cliente: string;
            saldo: number;
            importo: number;
            created_at: string;
            station_id?: number | null;
          } = {
            cliente,
            saldo,
            importo: saldo, // Initial saldo recorded as importo (required field)
            created_at: new Date().toISOString()
          };
          if (creditsContext.stationId !== null && creditsContext.stationId !== undefined) {
            insertPayload.station_id = creditsContext.stationId;
          }
          await safeSupabaseQuery(() => supabase.from('crediti_clienti').insert([insertPayload]));
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

async function deleteCustomer(customerId: number): Promise<void> {
  if (!(await openConfirmModal('Sei sicuro? Verranno eliminati anche i movimenti associati.'))) {
    return;
  }
  try {
    await safeSupabaseQuery(() => supabase.from('crediti_clienti').delete().eq('id', customerId));

    Toast.show('Cliente eliminato', 'success');
    refreshCreditsTab();
  } catch (err) {
    handleError(err, 'deleteCustomer');
  }
}

function refreshCreditsTab(): void {
  if (creditsContext.container) {
    showCreditiOverview(creditsContext.container, creditsContext.actions, creditsContext.stationId);
  }
}
