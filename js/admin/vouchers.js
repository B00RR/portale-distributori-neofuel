import { supabase } from "../core/api.js";
import { showLoadingMessage } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml, formatEuro } from "../utils/utils.js";

// Dipendenze: openVoucherModal, deleteVoucher

export async function showVoucherAdminTab(container, actionsContainer, stationId = null) {
    showLoadingMessage(container);

    if (actionsContainer) {
        actionsContainer.innerHTML = `<button class="action-btn primary" id="generate-voucher-btn"><i class="fas fa-plus"></i> Genera Voucher</button>`;
        document.getElementById('generate-voucher-btn').addEventListener('click', () => openVoucherModal());
    }

    try {
        let query = supabase.from('vouchers').select('*');

        if (stationId) query = query.eq('station_id', stationId);

        query = query.order('created_at', { ascending: false }).limit(500);

        const { data: vouchers, error } = await query;

        if (error) throw error;

        if (!vouchers || vouchers.length === 0) {
            container.innerHTML = '<p>Nessun voucher trovato.</p>';
            return;
        }

        let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Codice</th>
              <th>Importo</th>
              <th>Stato</th>
              <th>Creato il</th>
              <th>Usato il</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

        vouchers.forEach(v => {
            const statusBadge = v.is_used
                ? '<span class="badge badge-warning">Usato</span>'
                : '<span class="badge badge-success">Attivo</span>';

            html += `
        <tr>
          <td><code style="font-size: 1.1em;">${escapeHtml(v.code)}</code></td>
          <td>${formatEuro(v.amount)}</td>
          <td>${statusBadge}</td>
          <td>${new Date(v.created_at).toLocaleDateString()}</td>
          <td>${v.used_at ? new Date(v.used_at).toLocaleString() : '-'}</td>
          <td>
            <button class="icon-btn delete-voucher" data-id="${v.id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        container.querySelectorAll('.delete-voucher').forEach(btn => {
            btn.addEventListener('click', () => deleteVoucher(btn.dataset.id));
        });

    } catch (err) {
        handleError(err, 'showVoucherAdminTab', container);
    }
}
