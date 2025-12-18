import { supabase, safeSupabaseQuery } from "../core/api.js";
import { showLoadingMessage, openModal, closeModal, setButtonLoading } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml, formatEuro, formatNumberIt, formatLitri } from "../utils/utils.js";
import { FilterBar } from "./components/FilterBar.js";
import { Pagination } from "./components/Pagination.js";
import { store } from "../shared/state.js";
import { Toast } from "../ui/toast.js";
import {
  fetchClosureExportData, buildClosureTemplate,
  generateClosureExcel
} from "../utils/export.js";


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

export async function showClosureDetails(closureId) {
  openModal('Dettagli Chiusura');
  const target = document.getElementById('modal-body');
  showLoadingMessage(target);

  try {
    const { data: closure } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', closureId)
      .single();

    if (!closure) throw new Error('Chiusura non trovata');

    const closingData = closure.closing_data || {};
    const dettaglio = closingData.dettaglio_incasso || {};

    // Mappa dati
    const dateStr = new Date(closure.closed_at || closure.created_at).toLocaleString('it-IT');

    // Breakdown Incassi
    const contanti = formatEuro(dettaglio.contanti_operatore || 0);
    const pos = formatEuro(dettaglio.pos_operatore || 0);
    const crediti = formatEuro(dettaglio.crediti || 0);
    const voucher = formatEuro(dettaglio.voucher || 0);
    const carteUta = formatEuro(dettaglio.uta_dkv_operatore || 0);
    const rimborsi = formatEuro(dettaglio.rimborsi_uscite || 0);

    // Self Service Breakdown Logic
    const selfData = closingData.scontrino_self || {};
    // MODIFICA: Somma esatta delle componenti (richiesta utente)
    const banconoteErogate = selfData.banconote_erogate || 0;
    const banconoteIncassate = selfData.banconote_incassate || 0;
    const bancomatSelf = selfData.bancomat_erogati || 0;
    const cardsSelf = selfData.transazioni_uta || 0; // Assuming this maps to Icad/dkv/iscard

    const selfTotalVal = banconoteErogate + bancomatSelf + cardsSelf;
    const selfTotalFormatted = formatEuro(selfTotalVal);

    // Logic per Contanti Self: se uguali mostra solo uno, altrimenti entrambi
    let contantiSelfHtml = '';
    if (banconoteErogate === banconoteIncassate) {
      contantiSelfHtml = `<span>Contanti:</span> <b>${formatEuro(banconoteErogate)}</b>`;
    } else {
      contantiSelfHtml = `
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Contanti:</span>
                <div style="text-align: right;">
                    <div>Erogati: <b>${formatEuro(banconoteErogate)}</b></div>
                    <div style="font-size: 0.85em; color: #64748b;">Incassati: <b>${formatEuro(banconoteIncassate)}</b></div>
                </div>
            </div>`;
    }

    // Extra
    const extraVal = closingData.extra_incassi || 0;
    const extra = formatEuro(extraVal);

    // CALCOLO TOTALE REALE (Richiesto da utente: Venduto Carburante + Extra)
    // ricavo_teorico = venduto carburante totale (contatori)
    const vendutoCarburanteVal = closingData.ricavo_teorico || 0;
    const vendutoCarburante = formatEuro(vendutoCarburanteVal);

    const totaleRealeVal = vendutoCarburanteVal + extraVal;
    const totaleReale = formatEuro(totaleRealeVal);

    target.innerHTML = `
      <div class="closure-details" style="font-size: 0.95rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            <span>ID Chiusura: <b>${closure.id}</b></span>
            <span>${dateStr}</span>
        </div>

        <!-- SEZIONE SELF SERVICE -->
        <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
            <div style="font-weight: 600; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Dettaglio Self Service</div>
            
            <p style="display: flex; justify-content: space-between; margin: 5px 0;">${contantiSelfHtml}</p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Bancomat:</span> <b>${formatEuro(bancomatSelf)}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Icad/DKV/Iscard:</span> <b>${formatEuro(cardsSelf)}</b></p>
            
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-weight: 700;">
                <span>Incasso Totale Self:</span> <span>${selfTotalFormatted}</span>
            </div>
        </div>

        <!-- SEZIONE OPERATORE -->
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
            <div style="font-weight: 600; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Dettaglio Operatore</div>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Contanti:</span> <b>${contanti}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0;"><span>POS:</span> <b>${pos}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Crediti:</span> <b>${crediti}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0;"><span>Voucher/Buoni:</span> <b>${voucher}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0;"><span>Carte (UTA/DKV):</span> <b>${carteUta}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0; color: #dc2626;"><span>Uscite/Rimborsi:</span> <b>- ${rimborsi}</b></p>
            
            <hr style="margin: 8px 0; border-color: #e2e8f0;">
            
            <!-- NUOVA RIGA: Totale venduto della giornata (pistole) -->
            <p style="display: flex; justify-content: space-between; margin: 5px 0; font-weight: 600; color: #0f172a;"><span>Totale Venduto (Pistole):</span> <b>${vendutoCarburante}</b></p>
            
            <p style="display: flex; justify-content: space-between; margin: 5px 0; color: #1e40af;"><span>Incassi Extra:</span> <b>${extra}</b></p>
        </div>

        <div style="background: #eff6ff; padding: 15px; border-radius: 6px; border: 1px solid #bfdbfe; text-align: right; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 4px;">Totale Venduto (Carburante + Extra)</div>
            <div style="font-size: 1.6rem; font-weight: 700; color: #1e3a8a;">${totaleReale}</div>
        </div>
        
        <div style="margin-top: 15px; text-align: center;">
             <button class="menu-button" onclick="document.querySelector('.icon-btn.export-closure[data-id=\\'${closure.id}\\']').click()">
                <i class="fas fa-file-export"></i> Scarica Excel Dettagliato
             </button>
        </div>
      </div>
    `;
  } catch (err) {
    target.innerHTML = `<p class="error">Errore: ${err.message}</p>`;
  }
}

export async function openExportModal(closureId) {
  try {
    const ctx = await fetchClosureExportData(closureId);
    const template = buildClosureTemplate(ctx, ctx.layout, ctx.summaryDefaults);

    console.log('=== DEBUG EXPORT ===');
    console.log('ctx.layout:', ctx.layout);
    console.log('ctx.metricsMap:', ctx.metricsMap);
    console.log('template:', template);
    console.log('template.sections:', template.sections);
    console.log('===================');

    await generateClosureExcel(template);
  } catch (err) {
    Toast.show('Errore export: ' + (err?.message || err), 'error');
    console.error('Errore export:', err);
  }
}
