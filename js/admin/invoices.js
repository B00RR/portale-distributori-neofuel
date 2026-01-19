import { supabase } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { showLoadingMessage } from '../ui/ui.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

// Dipendenze: toggleInvoiceStatus, viewInvoiceDetails (opzionale)

export async function showFattureTab(container, actionsContainer, stationId = null) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = '';
  }

  try {
    let query = supabase.from('invoices')
      .select(`
        *,
        fuel_stations(station_name),
        users(full_name)
      `);

    if (stationId) {query = query.eq('station_id', stationId);}

    query = query.order('created_at', { ascending: false });

    const { data: invoices, error } = await query;

    if (error) {throw error;}

    // Se ci sono fatture con cliente_id, recupera i dati dei clienti separatamente
    if (invoices && invoices.length > 0) {
      const clienteIds = invoices
        .filter(inv => inv.cliente_id)
        .map(inv => inv.cliente_id)
        .filter((id, index, self) => self.indexOf(id) === index); // rimuovi duplicati

      if (clienteIds.length > 0) {
        const { data: clienti } = await supabase
          .from('clienti_fatturazione')
          .select('id, nome, partita_iva, telefono')
          .in('id', clienteIds);

        // Aggiungi i dati dei clienti alle fatture
        if (clienti) {
          const clientiMap = {};
          clienti.forEach(c => {
            clientiMap[c.id] = c;
          });

          invoices.forEach(inv => {
            if (inv.cliente_id && clientiMap[inv.cliente_id]) {
              inv.clienti_fatturazione = clientiMap[inv.cliente_id];
            }
          });
        }
      }
    }

    if (error) {throw error;}

    if (!invoices || invoices.length === 0) {
      container.innerHTML = '<p>Nessuna richiesta fattura trovata.</p>';
      return;
    }

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
      const statusBadge = inv.status === 'pending'
        ? '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">In Attesa</span>'
        : inv.status === 'completed' || inv.status === 'emessa'
          ? '<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">Emessa</span>'
          : '<span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">Annullata</span>';

      const paymentMethod = inv.payment_method === 'contanti'
        ? '<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">Contanti</span>'
        : inv.payment_method === 'pos'
          ? '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">POS</span>'
          : inv.payment_method === 'bonifico'
            ? '<span style="background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">Bonifico</span>'
            : '-';

      const productCategory = inv.product_category
        ? inv.product_category.charAt(0).toUpperCase() + inv.product_category.slice(1)
        : '-';

      const isEmitted = inv.status === 'completed' || inv.status === 'emessa';
      const toggleStatusBtn = isEmitted
        ? `<button class="icon-btn toggle-status" data-id="${inv.id}" data-status="pending" title="Segna come non emessa"><i class="fas fa-undo"></i></button>`
        : `<button class="icon-btn toggle-status" data-id="${inv.id}" data-status="completed" title="Segna come emessa"><i class="fas fa-check"></i></button>`;

      html += `
        <tr>
          <td>${inv.created_at ? new Date(inv.created_at).toLocaleDateString('it-IT') : '-'}</td>
          <td><strong>${escapeHtml(customerName)}</strong></td>
          <td><strong>${formatEuro(inv.amount || 0)}</strong></td>
          <td>${paymentMethod}</td>
          <td>${escapeHtml(productCategory)}</td>
          <td>${escapeHtml(stationName)}</td>
          <td>${escapeHtml(operatorName)}</td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(inv.notes)}</td>
          <td>
            ${toggleStatusBtn}
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.toggle-status').forEach(btn => {
      btn.addEventListener('click', () => toggleInvoiceStatus(btn.dataset.id, btn.dataset.status));
    });

  } catch (err) {
    handleError(err, 'showFattureTab', container);
  }
}
