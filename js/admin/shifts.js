import { supabase } from "../core/api.js";
import { showLoadingMessage } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml, formatEuro } from "../utils/utils.js";
import { FilterBar } from "./components/FilterBar.js";
import { Pagination } from "./components/Pagination.js";
import { store } from "../shared/state.js";

// Dipendenze esterne (devono essere gestite: showClosureDetails, openExportModal)
// Assumiamo siano globali o importabili.

export async function showChiusureTab(container, actionsContainer, defaultStationId = null) {
  // Basic structure
  container.innerHTML = `
        <div id="filters-container"></div>
        <div id="data-container"></div>
        <div id="pagination-container"></div>
    `;

  // Render Components
  const filterBar = new FilterBar('filters-container');
  filterBar.render();

  const pagination = new Pagination('pagination-container');

  if (actionsContainer) actionsContainer.innerHTML = '';

  // Track params to prevent loop
  let lastParams = { page: -1, filtersJson: '' };

  const renderTable = async () => {
    const dataContainer = document.getElementById('data-container');
    if (!dataContainer) return;

    const filters = store.getFilters();
    const pagState = store.getPagination();
    const stationId = store.getFilter() || defaultStationId;

    // Params check
    const currentFiltersJson = JSON.stringify({ ...filters, stationId });
    // We proceed if filters changed OR page changed.
    // If just totalCount changed (which is in pagState), we do NOT fetch.
    // However, we MUST fetch if this function is called manually (initial).

    lastParams = { page: pagState.page, filtersJson: currentFiltersJson };

    // Render Pagination (with current totalCount - might be stale before fetch, updated after)
    pagination.render();

    showLoadingMessage(dataContainer);

    try {
      // Build Query
      let query = supabase.from('shifts')
        .select(`
                    *,
                    fuel_stations(station_name),
                    users(full_name)
                `, { count: 'exact' }); // Request count

      // 1. Station Filter
      if (stationId) query = query.eq('station_id', stationId);

      // 2. Date Range Filter
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');

      // 3. Pagination
      const from = pagState.page * pagState.pageSize;
      const to = from + pagState.pageSize - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: closures, error, count } = await query;

      if (error) throw error;

      // Update totalCount if changed
      if (count !== null && count !== pagState.totalCount) {
        store.setPagination({ totalCount: count });
        // Note: this triggers 'pagination' listener.
        // Checks in listener must prevent loop.
      }

      // Re-render pagination with new count
      pagination.render();

      let filteredClosures = closures || [];

      // Client-side Text Search (Applied on the PAGE)
      // Note: Search ideally should be server side for pagination to work correctly across pages.
      // If we filter client side, we might end up with empty pages if matches are on other pages.
      // For now, we keep client side search but warn it only searches current page.
      // Ideally we implement server side search.
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

  // Subscribe to state changes
  const unsub = store.subscribe((key, val) => {
    // Check if still mounted
    if (!document.getElementById('filters-container')) {
      unsub();
      return;
    }

    if (key === 'filters' || key === 'stationFilter') {
      // Always render if filters change
      renderTable();
    }
    else if (key === 'pagination') {
      // Only render if PAGE changed. TotalCount change should be ignored (it was set by us)
      if (val.page !== lastParams.page) {
        renderTable();
      } else {
        // Just re-render pagination UI to be safe (e.g. totalCount updated)
        pagination.render();
      }
    }
  });
}
