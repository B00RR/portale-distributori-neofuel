import { supabase, safeSupabaseQuery } from "../core/api.js";
import { showLoadingMessage, openModal, closeModal, openConfirmModal, setButtonLoading } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml, formatEuro, formatNumberIt, formatLitri } from "../utils/utils.js";
import { FilterBar } from "./components/FilterBar.js";
import { Pagination } from "./components/Pagination.js";
import { store } from "../shared/state.js";
import { Toast } from "../ui/toast.js";
import {
  fetchClosureExportData, buildClosureTemplate,
  generateClosureExcel, generateMultiClosureExcel, computeExportSummaryMetrics
} from "../utils/export_utils.js";


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

  if (actionsContainer) {
    // Clear and rebuild to avoid duplicates if re-called (though usually called once)
    actionsContainer.innerHTML = '';

    const btnBulk = document.createElement('button');
    btnBulk.id = 'btn-bulk-export';
    btnBulk.className = 'menu-button secondary';
    btnBulk.innerHTML = '<i class="fas fa-file-export"></i> Export Multiplo';
    btnBulk.onclick = openBulkExportModal;

    actionsContainer.appendChild(btnBulk);
  }

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
                    <button class="icon-btn delete-closure" data-id="${c.id}" title="Elimina" style="color: #dc2626;"><i class="fas fa-trash-alt"></i></button>
                  </td>
                </tr>
              `;
      });

      html += `</tbody></table></div>`;
      dataContainer.innerHTML = html;

      dataContainer.querySelectorAll('.view-closure').forEach(btn => {
        btn.addEventListener('click', () => showClosureDetails(/** @type {HTMLElement} */(btn).dataset.id));
      });
      dataContainer.querySelectorAll('.export-closure').forEach(btn => {
        btn.addEventListener('click', () => openExportModal(/** @type {HTMLElement} */(btn).dataset.id));
      });
      dataContainer.querySelectorAll('.delete-closure').forEach(btn => {
        btn.addEventListener('click', () => deleteClosure(/** @type {HTMLElement} */(btn).dataset.id, renderTable));
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
    // Use new computation for consistency
    // const template = buildClosureTemplate(ctx, ctx.layout, ctx.summaryDefaults);
    const metrics = await computeExportSummaryMetrics(supabase, ctx, ctx.station_id);
    await generateClosureExcel(metrics);
  } catch (err) {
    Toast.show('Errore export: ' + (err?.message || err), 'error');
    console.error('Errore export:', err);
  }
}

// ==========================================
// BULK EXPORT LOGIC
// ==========================================

async function openBulkExportModal() {
  openModal('Export Multiplo Chiusure');
  const target = document.getElementById('modal-body');

  // Fetch stations for dropdown
  let stationsHtml = '<option value="all">Tutte le stazioni</option>';
  try {
    const { data: stations } = await supabase.from('fuel_stations').select('station_id, station_name');
    if (stations) {
      stations.forEach(s => {
        stationsHtml += `<option value="${s.station_id}">${escapeHtml(s.station_name)}</option>`;
      });
    }
  } catch (e) { console.error(e); }

  target.innerHTML = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 15px; color: #64748b;">Seleziona i criteri per scaricare più chiusure in un unico file Excel.</p>
            
            <div class="form-group">
                <label>Stazione</label>
                <select id="bulk-station" class="form-control">
                    ${stationsHtml}
                </select>
            </div>

            <div class="form-group" style="margin-top: 15px;">
                <label>Tipo di Export</label>
                <div style="display: flex; gap: 15px; margin-top: 5px;">
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <input type="radio" name="bulk-type" value="last_n" checked onchange="document.getElementById('range-options').style.display='none'; document.getElementById('last-n-options').style.display='block';">
                        Ultime Chiusure
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <input type="radio" name="bulk-type" value="date_range" onchange="document.getElementById('range-options').style.display='block'; document.getElementById('last-n-options').style.display='none';">
                        Intervallo Date
                    </label>
                </div>
            </div>

            <!-- OPZIONI LAST N -->
            <div id="last-n-options" style="margin-top: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <label>Numero di chiusure da scaricare:</label>
                <input type="number" id="bulk-limit" class="form-control" value="10" min="1" max="50" style="width: 100px; margin-top: 5px;">
                <small style="display: block; color: #94a3b8; margin-top: 4px;">Es. 3 per le ultime 3, 10 per le ultime 10.</small>
            </div>

            <!-- OPZIONI DATE RANGE -->
            <div id="range-options" style="display: none; margin-top: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label>Da:</label>
                        <input type="date" id="bulk-from" class="form-control">
                    </div>
                    <div>
                        <label>A:</label>
                        <input type="date" id="bulk-to" class="form-control">
                    </div>
                </div>
            </div>

            <div style="margin-top: 25px; text-align: right;">
                <button id="btn-start-bulk" class="menu-button primary">
                    <i class="fas fa-download"></i> Scarica Excel
                </button>
            </div>
            
            <div id="bulk-loading" style="display: none; margin-top: 15px; color: #3b82f6; text-align: center;">
                <i class="fas fa-spinner fa-spin"></i> Generazione in corso...
            </div>
        </div>
    `;

  const btn = document.getElementById('btn-start-bulk');
  btn.addEventListener('click', async () => {
    const stationId = /** @type {HTMLSelectElement} */ (document.getElementById('bulk-station')).value;
    const type = /** @type {HTMLInputElement} */ (document.querySelector('input[name="bulk-type"]:checked')).value;
    const limit = parseInt(/** @type {HTMLInputElement} */(document.getElementById('bulk-limit')).value) || 10;
    const dateFrom = /** @type {HTMLInputElement} */ (document.getElementById('bulk-from')).value;
    const dateTo = /** @type {HTMLInputElement} */ (document.getElementById('bulk-to')).value;

    // Validation
    if (type === 'date_range' && (!dateFrom || !dateTo)) {
      Toast.show('Seleziona entrambe le date.', 'error');
      return;
    }

    const loadingDiv = document.getElementById('bulk-loading');
    loadingDiv.style.display = 'block';

    const btnElement = /** @type {HTMLButtonElement} */ (btn);
    btnElement.disabled = true;

    try {
      await handleBulkExport({
        stationId: stationId === 'all' ? null : stationId,
        type,
        limit,
        dateFrom,
        dateTo
      });
      closeModal();
      // Toast.show('Download avviato!', 'success'); // Spostato internamente a generateMultiClosureExcel
    } catch (err) {
      console.error(err);
      Toast.show('Errore durante export multiplo: ' + err.message, 'error');
    } finally {
      loadingDiv.style.display = 'none';
      /** @type {HTMLButtonElement} */ (btn).disabled = false;
    }
  });
}

async function handleBulkExport(opts) {
  // 1. Fetch Data
  let query = supabase.from('shifts')
    .select(`
            *,
            fuel_stations(station_name),
            users(full_name)
        `)
    .order('created_at', { ascending: false });

  if (opts.stationId) query = query.eq('station_id', opts.stationId);

  if (opts.type === 'last_n') {
    query = query.limit(opts.limit);
  } else {
    query = query.gte('created_at', opts.dateFrom)
      .lte('created_at', opts.dateTo + 'T23:59:59');
  }

  const { data: closures, error } = await query;
  if (error) throw error;
  if (!closures || closures.length === 0) {
    throw new Error("Nessuna chiusura trovata con i criteri selezionati.");
  }

  // 2. Process Data for Template
  // Converte ogni chiusura nel formato metriche atteso dal template
  const processedClosures = [];
  for (const c of closures) {
    // computeExportSummaryMetrics(client, closureObject, stationId)
    // Passiamo l'oggetto c intero, stationId preso da c
    const metrics = await computeExportSummaryMetrics(supabase, c, c.station_id);
    processedClosures.push(metrics);
  }

  // 3. Generate Excel
  await generateMultiClosureExcel(processedClosures);
}

/**
 * Elimina una chiusura e i dati correlati
 * @param {string} closureId 
 * @param {Function} onSuccessCallback 
 */
export async function deleteClosure(closureId, onSuccessCallback) {
  const confirmed = await openConfirmModal('Sei sicuro di voler eliminare questa chiusura? L\'operazione è irreversibile e cancellerà anche i dettagli dei contatori e lo scarico serbatoi.');
  if (!confirmed) return;

  try {
    // 1. Elimina dati correlati
    // Note: cascade handles some, but let's be explicit and safe for non-linked tables
    await Promise.all([
      supabase.from('shift_pistols').delete().eq('shift_id', closureId),
      supabase.from('tank_pump_usages').delete().eq('shift_id', closureId)
    ]);

    // 2. Elimina il record principale
    const { error } = await supabase.from('shifts').delete().eq('id', closureId);
    if (error) throw error;

    Toast.show('Chiusura eliminata con successo', 'success');
    if (onSuccessCallback) onSuccessCallback();

  } catch (err) {
    handleError(err, 'deleteClosure');
  }
}
