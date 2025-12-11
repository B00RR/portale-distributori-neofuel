import { supabase } from "../core/api.js";
import { showLoadingMessage } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml, formatEuro } from "../utils/utils.js";

// Dipendenze: openCustomerModal, deleteCustomer

export async function showCreditiOverview(container, actionsContainer, stationId = null) {
    showLoadingMessage(container);

    if (actionsContainer) {
        actionsContainer.innerHTML = `<button class="action-btn primary" id="add-customer-btn"><i class="fas fa-plus"></i> Nuovo Cliente</button>`;
        document.getElementById('add-customer-btn').addEventListener('click', () => openCustomerModal());
    }

    try {
        let query = supabase.from('crediti_clienti')
            .select(`
        *,
        fuel_stations(station_name)
      `);

        if (stationId) query = query.eq('station_id', stationId);

        query = query.order('cliente');

        const { data: customers, error } = await query;

        if (error) throw error;

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

        html += `</tbody></table></div>`;
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
