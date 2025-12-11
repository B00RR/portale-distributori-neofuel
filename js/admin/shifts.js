import { supabase } from "../core/api.js";
import { showLoadingMessage } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml, formatEuro } from "../utils/utils.js";
import { FilterBar } from "./components/FilterBar.js";
import { store } from "../shared/state.js";

// Dipendenze esterne (devono essere gestite: showClosureDetails, openExportModal)
// Assumiamo siano globali o importabili.

export async function showChiusureTab(container, actionsContainer, defaultStationId = null) {
  // Basic structure
  container.innerHTML = `
        <div id="filters-container"></div>
        <div id="data-container"></div>
    `;

  // Render FilterBar
  new FilterBar('filters-container').render();

  if (actionsContainer) actionsContainer.innerHTML = '';

  const renderTable = async () => {
    const dataContainer = document.getElementById('data-container');
    if (!dataContainer) return; // Tab switched

    showLoadingMessage(dataContainer);

    try {
      const filters = store.getFilters();
      const stationId = store.getFilter() || defaultStationId; // Global filter takes precedence or merge? 
      // Usually store.stationFilter IS the global filter. defaultStationId is passed from admin.js which reads it.
      // Let's use the one from store directly to be safe, or the arg.

      // Build Query
      let query = supabase.from('shifts')
        .select(`
                    *,
                    fuel_stations(station_name),
                    users(full_name)
                `);

      // 1. Station Filter
      if (stationId) query = query.eq('station_id', stationId);

      // 2. Date Range Filter
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters.dateTo) {
        // Add 1 day to include end date fully or just use logic
        // validators/UI sets dateTo as YYYY-MM-DD. We want < dateTo + 1 day or <= dateTo 23:59
        // Simple: query.lt('created_at', filters.dateTo + 'T23:59:59')
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      // 3. Search Query - Client side for now or basic ILIKE on known fields?
      // Relations search is hard. Let's do client side filtering for search text if simple.
      // Or limit server side.
      // For robust 'search', let's stick to client-side filtering after fetch for now (since we limit 500 anyway).

      query = query.order('created_at', { ascending: false }).limit(500);

      const { data: closures, error } = await query;

      if (error) throw error;

      let filteredClosures = closures || [];

      // Client-side Text Search
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        filteredClosures = filteredClosures.filter(c => {
          const stName = c.fuel_stations?.station_name?.toLowerCase() || '';
          const usName = c.users?.full_name?.toLowerCase() || '';
          const dateStr = new Date(c.created_at).toLocaleDateString().toLowerCase();
          return stName.includes(q) || usName.includes(q) || dateStr.includes(q);
        });
      }

      if (filteredClosures.length === 0) {
        dataContainer.innerHTML = '<p>Nessuna chiusura trovata.</p>';
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

      filteredClosures.forEach(c => {
        const dateStr = new Date(c.closed_at || c.created_at).toLocaleString('it-IT');
        const stationName = c.fuel_stations?.station_name || `#${c.station_id}`;
        const operatorName = c.users?.full_name || `#${c.operator_id}`;
        const closingData = c.closing_data || {};
        const isFinal = c.status === 'closed' || closingData.is_final === true;
        const closureType = isFinal ? 'Finale' : 'Parziale';
        const closureClass = isFinal ? 'badge-success' : 'badge-warning';
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
      dataContainer.innerHTML = html;

      dataContainer.querySelectorAll('.view-closure').forEach(btn => {
        btn.addEventListener('click', () => showClosureDetails(btn.dataset.id));
      });
      dataContainer.querySelectorAll('.export-closure').forEach(btn => {
        btn.addEventListener('click', () => openExportModal(btn.dataset.id));
      });

    } catch (err) {
      handleError(err, 'showChiusureTab', dataContainer);
    }
  };

  // Initial Render
  await renderTable();

  // Subscribe to filter changes
  const unsub = store.subscribe((key) => {
    if (key === 'filters') {
      // Check if still mounted
      if (!document.getElementById('filters-container')) {
        unsub(); // Cleanup
        return;
      }
      renderTable();
    }
  });
}
