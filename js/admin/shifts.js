import { supabase } from "../core/api.js";
import { showLoadingMessage } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml, formatEuro } from "../utils/utils.js";

// Dipendenze esterne (devono essere gestite: showClosureDetails, openExportModal)
// Assumiamo siano globali o importabili.

export async function showChiusureTab(container, actionsContainer, stationId = null) {
    showLoadingMessage(container);
    if (actionsContainer) actionsContainer.innerHTML = '';

    try {
        // Fetch with joins to display station and operator names
        let query = supabase.from('shifts')
            .select(`
        *,
        fuel_stations(station_name),
        users(full_name)
      `);

        if (stationId) query = query.eq('station_id', stationId);

        query = query.order('created_at', { ascending: false }).limit(500);

        const { data: closures, error } = await query;

        if (error) throw error;

        if (!closures || closures.length === 0) {
            container.innerHTML = '<p>Nessuna chiusura trovata.</p>';
            return;
        }

        let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Stazione</th>
              <th>Operatore</th>
              <th>Tipo</th>
              <th>Totale €</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

        closures.forEach(c => {
            // MAPPING DATI DA SHIFTS
            const dateStr = new Date(c.closed_at || c.created_at).toLocaleString('it-IT');
            const stationName = c.fuel_stations?.station_name || `#${c.station_id}`;
            const operatorName = c.users?.full_name || `#${c.operator_id}`;

            // Estrai dati dal JSON closing_data
            const closingData = c.closing_data || {};

            // Determina il tipo di chiusura
            // Se status è 'closed' è finale, altrimenti controlla closing_data
            const isFinal = c.status === 'closed' || closingData.is_final === true;
            const closureType = isFinal ? 'Finale' : 'Parziale';
            const closureClass = isFinal ? 'badge-success' : 'badge-warning';

            // Calcolo del totale - SOLO CARBURANTE (esclude movimenti di cassa)
            // Usa ricavo_teorico che rappresenta il totale del carburante venduto
            const totalValue = closingData.ricavo_teorico || closingData.totale_atteso || 0;
            const total = formatEuro(totalValue);

            html += `
        <tr>
          <td>${dateStr}</td>
          <td>${escapeHtml(stationName)}</td>
          <td>${escapeHtml(operatorName)}</td>
          <td><span class="badge ${closureClass}">${closureType}</span></td>
          <td>${total}</td>
          <td>
            <button class="icon-btn view-closure" data-id="${c.id}" title="Dettagli"><i class="fas fa-eye"></i></button>
            <button class="icon-btn export-closure" data-id="${c.id}" title="Export"><i class="fas fa-file-export"></i></button>
          </td>
        </tr>
      `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        container.querySelectorAll('.view-closure').forEach(btn => {
            btn.addEventListener('click', () => showClosureDetails(btn.dataset.id));
        });
        container.querySelectorAll('.export-closure').forEach(btn => {
            btn.addEventListener('click', () => openExportModal(btn.dataset.id));
        });

    } catch (err) {
        handleError(err, 'showChiusureTab', container);
    }
}
