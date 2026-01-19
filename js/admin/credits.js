import { supabase, safeSupabaseQuery } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Validators, validateForm, formatErrorMessages } from '../shared/validators.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, openModal, closeModal, setButtonLoading, openConfirmModal } from '../ui/ui.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

// Context to allow refreshing the view
let creditsContext = { container: null, actions: null, stationId: null };

export async function showCreditiOverview(container, actionsContainer, stationId = null) {
  creditsContext = { container, actions: actionsContainer, stationId };
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = '<button class="action-btn primary" id="add-customer-btn"><i class="fas fa-plus"></i> Nuovo Cliente</button>';
    const addBtn = document.getElementById('add-customer-btn');
    if (addBtn) {addBtn.addEventListener('click', () => openCustomerModal());}
  }

  try {
    let query = supabase.from('crediti_clienti')
      .select(`
        *,
        fuel_stations(station_name)
      `);

    if (stationId) {query = query.eq('station_id', stationId);}

    query = query.order('cliente');

    const { data: customers, error } = await query;

    if (error) {throw error;}

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

    container.querySelectorAll('.edit-customer').forEach(btn => {
      btn.addEventListener('click', () => openCustomerModal(btn.dataset.id));
    });
    container.querySelectorAll('.delete-customer').forEach(btn => {
      btn.addEventListener('click', () => deleteCustomer(btn.dataset.id));
    });

  } catch (err) {
    handleError(err, 'showCreditiOverview', container);
  }
}

async function openCustomerModal(customerId = null) {
  const isEdit = !!customerId;
  openModal(isEdit ? 'Modifica Cliente' : 'Nuovo Cliente');
  const target = document.getElementById('modal-body');

  let customer = {};
  if (isEdit) {
    const { data } = await supabase.from('crediti_clienti').select('*').eq('id', customerId).single();
    customer = data || {};
  }

  target.innerHTML = `
    <form id="customer-form">
      <div class="form-group">
        <label>Nome Cliente / Azienda</label>
        <input type="text" name="cliente" value="${escapeHtml(customer.cliente)}" required>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Saldo Iniziale (€)</label>
        <input type="number" name="saldo" step="0.01">
      </div>` : ''}
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Cliente'}</button>
    </form>
  `;

  const form = document.getElementById('customer-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const cliente = fd.get('cliente');
      const saldo = parseFloat(fd.get('saldo')) || 0;
      const submitBtn = e.target.querySelector('button[type="submit"]');

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
        if (isEdit) {
          await safeSupabaseQuery(() => supabase.from('crediti_clienti').update({ cliente }).eq('id', customerId));
        } else {
          // Opzionale: gestire station_id se necessario
          await safeSupabaseQuery(() => supabase.from('crediti_clienti').insert([{
            cliente,
            saldo,
            created_at: new Date().toISOString()
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

async function deleteCustomer(customerId) {
  if (!await openConfirmModal('Sei sicuro? Verranno eliminati anche i movimenti associati.')) {return;}
  try {
    await safeSupabaseQuery(() => supabase.from('crediti_clienti').delete().eq('id', customerId));
    Toast.show('Cliente eliminato', 'success');
    refreshCreditsTab();
  } catch (err) {
    handleError(err, 'deleteCustomer');
  }
}

function refreshCreditsTab() {
  if (creditsContext.container) {
    showCreditiOverview(creditsContext.container, creditsContext.actions, creditsContext.stationId);
  }
}
