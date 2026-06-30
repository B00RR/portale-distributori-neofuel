import { supabase, Cache, CACHE_KEYS } from '../core/api.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { logger } from '../core/logger.js';
import { handleError } from '../shared/error-handler.js';
import { store, type Pagination as PaginationType } from '../shared/state.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, openModal, closeModal, openConfirmModal } from '../ui/ui.js';
import {
  fetchClosureExportData,
  generateClosureExcel,
  generateMultiClosureExcel,
  computeExportSummaryMetrics
} from '../utils/export_utils.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml, formatEuro, getErrorMessage } from '../utils/utils.js';

import { FilterBar } from './components/FilterBar.js';
import { Pagination } from './components/Pagination.js';

// ========== INTERFACES ==========

interface FuelStation {
  station_name: string;
}

interface User {
  full_name: string;
}

interface SelfServiceData {
  banconote_erogate?: number;
  banconote_incassate?: number;
  bancomat_erogati?: number;
  transazioni_uta?: number;
}

interface DettaglioIncasso {
  contanti_operatore?: number;
  pos_operatore?: number;
  crediti?: number;
  voucher?: number;
  uta_dkv_operatore?: number;
  rimborsi_uscite?: number;
}

interface ClosingData {
  is_final?: boolean;
  ricavo_teorico?: number;
  totale_atteso?: number;
  dettaglio_incasso?: DettaglioIncasso;
  scontrino_self?: SelfServiceData;
  extra_incassi?: number;
}

interface Shift {
  id: number | string;
  station_id: number | string;
  operator_id: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
  closing_data: ClosingData;
  fuel_stations?: FuelStation; // Joined
  users?: User; // Joined
}

interface BulkExportOptions {
  stationId: string | null;
  type: 'last_n' | 'date_range';
  limit: number;
  dateFrom?: string;
  dateTo?: string;
}

// ========== MODULE ==========

export async function showChiusureTab(
  container: HTMLElement,
  actionsContainer: HTMLElement | null,
  defaultStationId: string | null = null
): Promise<void> {
  // Basic structure
  setSafeHTML(
    container,
    `
        <div id="filters-container"></div>
        <div id="data-container"></div>
        <div id="pagination-container"></div>
    `
  );

  // Render Components
  const filterBar = new FilterBar('filters-container');
  filterBar.render();

  const pagination = new Pagination('pagination-container');

  if (actionsContainer) {
    // Clear and rebuild to avoid duplicates if re-called
    setSafeHTML(actionsContainer, '');

    const btnBulk = document.createElement('button');
    btnBulk.id = 'btn-bulk-export';
    btnBulk.className = 'menu-button secondary';
    setSafeHTML(btnBulk, '<i class="fas fa-file-export"></i> Export Multiplo');
    btnBulk.onclick = openBulkExportModal;

    actionsContainer.appendChild(btnBulk);
  }

  // Track params to prevent loop
  let lastParams = { page: -1, filtersJson: '' };

  const renderTable = async (): Promise<void> => {
    const dataContainer = document.getElementById('data-container');
    if (!dataContainer) {
      return;
    }

    const filters = store.getFilters();
    const pagState = store.getPagination();
    const stationId = store.getFilter() || defaultStationId;

    // Params check
    const currentFiltersJson = JSON.stringify({ ...filters, stationId });
    // We proceed if filters changed OR page changed.

    lastParams = { page: pagState.page, filtersJson: currentFiltersJson };

    // Render Pagination (with current totalCount)
    pagination.render();

    showLoadingMessage(dataContainer);

    try {
      // Load business rules
      const businessRules = await BusinessLogicManager.loadRules();

      // Build Query
      let query = supabase.from('shifts').select(
        `
                    *,
                    fuel_stations(station_name),
                    users(full_name)
                `,
        { count: 'exact' }
      );

      // 1. Station Filter
      if (stationId) {
        query = query.eq('station_id', Number(stationId));
      }

      // 2. Date Range Filter
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      // 3. Pagination
      const from = pagState.page * pagState.pageSize;
      const to = from + pagState.pageSize - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: closures, error, count } = await query;

      if (error) {
        throw error;
      }

      // Update totalCount if changed
      if (count !== null && count !== pagState.totalCount) {
        store.setPagination({ totalCount: count });
      }

      // Re-render pagination with new count
      pagination.render();

      const filteredClosures: Shift[] = (closures as unknown as Shift[]) || [];

      if (filteredClosures.length === 0) {
        setSafeHTML(dataContainer, '<p>Nessuna chiusura trovata.</p>');
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

        // Stale Shift Logic
        let staleIndicator = '';
        if (!isFinal) {
          const createdAt = new Date(c.created_at).getTime();
          const now = new Date().getTime();
          const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
          if (hoursOpen > businessRules.force_close_hours_threshold) {
            staleIndicator = `<span class="badge badge-danger" style="margin-left: 5px;" title="Turno aperto da oltre ${businessRules.force_close_hours_threshold} ore">STALE</span>`;
          }
        }

        const closureType = isFinal ? 'Finale' : 'Parziale';
        const closureClass = isFinal ? 'badge-success' : 'badge-warning';
        const totalValue = closingData.ricavo_teorico || closingData.totale_atteso || 0;
        const total = formatEuro(totalValue);

        html += `
                <tr>
                  <td>${dateStr}</td>
                  <td>${escapeHtml(stationName)}</td>
                  <td>${escapeHtml(operatorName)}</td>
                  <td><span class="badge ${closureClass}">${closureType}</span>${staleIndicator}</td>
                  <td>${total}</td>
                  <td>
                    <button class="icon-btn view-closure" data-id="${c.id}" title="Dettagli" aria-label="Dettagli"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn export-closure" data-id="${c.id}" title="Export" aria-label="Export"><i class="fas fa-file-export"></i></button>
                    <button class="icon-btn delete-closure" data-id="${c.id}" title="Elimina" aria-label="Elimina" style="color: var(--danger-color);"><i class="fas fa-trash-alt"></i></button>
                  </td>
                </tr>
              `;
      });

      html += '</tbody></table></div>';
      setSafeHTML(dataContainer, html);

      dataContainer.querySelectorAll('.view-closure').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = (btn as HTMLElement).dataset.id;
          if (id) {
            showClosureDetails(id);
          }
        });
      });
      dataContainer.querySelectorAll('.export-closure').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = (btn as HTMLElement).dataset.id;
          if (id) {
            openExportModal(id);
          }
        });
      });
      dataContainer.querySelectorAll('.delete-closure').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = (btn as HTMLElement).dataset.id;
          if (id) {
            deleteClosure(id, renderTable);
          }
        });
      });
    } catch (err) {
      handleError(err as Error, 'showChiusureTab', dataContainer);
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
    } else if (key === 'pagination') {
      // Only render if PAGE changed. TotalCount change should be ignored (it was set by us)
      const paginationState = val as unknown as PaginationType;
      if (paginationState.page !== lastParams.page) {
        renderTable();
      } else {
        // Just re-render pagination UI to be safe
        pagination.render();
      }
    }
  });
}

export async function showClosureDetails(closureId: string | number): Promise<void> {
  openModal('Dettagli Chiusura');
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  showLoadingMessage(target);

  try {
    const { data: closureRaw, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', Number(closureId))
      .single();

    if (error || !closureRaw) {
      throw new Error('Chiusura non trovata');
    }

    const closure = closureRaw as unknown as Shift;

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
    const banconoteErogate = selfData.banconote_erogate || 0;
    const banconoteIncassate = selfData.banconote_incassate || 0;
    const bancomatSelf = selfData.bancomat_erogati || 0;
    const cardsSelf = selfData.transazioni_uta || 0;

    const selfTotalVal = banconoteErogate + bancomatSelf + cardsSelf;
    const selfTotalFormatted = formatEuro(selfTotalVal);

    // Logic per Contanti Self
    let contantiSelfHtml = '';
    if (banconoteErogate === banconoteIncassate) {
      contantiSelfHtml = `<span>Contanti:</span> <b>${formatEuro(banconoteErogate)}</b>`;
    } else {
      contantiSelfHtml = `
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Contanti:</span>
                <div style="text-align: right;">
                    <div>Erogati: <b>${formatEuro(banconoteErogate)}</b></div>
                    <div style="font-size: 0.85em; color: var(--secondary-color);">Incassati: <b>${formatEuro(banconoteIncassate)}</b></div>
                </div>
            </div>`;
    }

    // Extra
    const extraVal = closingData.extra_incassi || 0;
    const extra = formatEuro(extraVal);

    // Totale Reale
    const vendutoCarburanteVal = closingData.ricavo_teorico || 0;
    const vendutoCarburante = formatEuro(vendutoCarburanteVal);

    const totaleRealeVal = vendutoCarburanteVal + extraVal;
    const totaleReale = formatEuro(totaleRealeVal);

    setSafeHTML(
      target,
      `
      <div class="closure-details">
        <div class="closure-details-header">
            <span>ID Chiusura: <b>${closure.id}</b></span>
            <span>${dateStr}</span>
        </div>

        <!-- SEZIONE SELF SERVICE -->
        <div class="closure-section-alt">
            <div class="closure-section-header">Dettaglio Self Service</div>
            
            <p class="closure-row">${contantiSelfHtml}</p>
            <p class="closure-row"><span>Bancomat:</span> <b>${formatEuro(bancomatSelf)}</b></p>
            <p class="closure-row"><span>Icad/DKV/Iscard:</span> <b>${formatEuro(cardsSelf)}</b></p>
            
            <div class="mt-2 pt-2 border-top-dashed d-flex justify-between font-weight-bold">
                <span>Incasso Totale Self:</span> <span>${selfTotalFormatted}</span>
            </div>
        </div>

        <!-- SEZIONE OPERATORE -->
        <div class="closure-section">
            <div class="closure-section-header">Dettaglio Operatore</div>
            <p class="closure-row"><span>Contanti:</span> <b>${contanti}</b></p>
            <p class="closure-row"><span>POS:</span> <b>${pos}</b></p>
            <p class="closure-row"><span>Crediti:</span> <b>${crediti}</b></p>
            <p class="closure-row"><span>Voucher/Buoni:</span> <b>${voucher}</b></p>
            <p class="closure-row"><span>Carte (UTA/DKV):</span> <b>${carteUta}</b></p>
            <p class="closure-row text-danger"><span>Uscite/Rimborsi:</span> <b>- ${rimborsi}</b></p>
            
            <hr class="my-2 border-0 border-top">
            
            <!-- NUOVA RIGA: Totale venduto della giornata (pistole) -->
            <p class="closure-row font-weight-bold text-main"><span>Totale Venduto (Pistole):</span> <b>${vendutoCarburante}</b></p>
            
            <p class="closure-row text-primary"><span>Incassi Extra:</span> <b>${extra}</b></p>
        </div>

        <div class="closure-total-box">
            <div class="closure-total-label">Totale Venduto (Carburante + Extra)</div>
            <div class="closure-total-value">${totaleReale}</div>
        </div>
        
        <div class="mt-4 text-center">
             <button class="menu-button primary" id="btn-export-details">
                <i class="fas fa-file-export"></i> Scarica Excel Dettagliato
             </button>
        </div>
      </div>
    `
    );

    // Attach Event Listener for Export Button
    const exportBtn = document.getElementById('btn-export-details');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        openExportModal(closure.id);
      });
    }
  } catch (err) {
    setSafeHTML(target, `<p class="error">Errore: ${escapeHtml((err as Error).message)}</p>`);
  }
}

export async function openExportModal(closureId: string | number): Promise<void> {
  try {
    const ctx = await fetchClosureExportData(closureId);
    const metrics = await computeExportSummaryMetrics(supabase, ctx, ctx.station_id);
    await generateClosureExcel(metrics);
  } catch (err: unknown) {
    Toast.show('Errore export: ' + getErrorMessage(err), 'error');
    logger.error('shifts', 'Errore export:', err);
  }
}

export async function openBulkExportModal(): Promise<void> {
  openModal('Export Multiplo Chiusure');
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  // Fetch stations for dropdown
  let stationsHtml = '<option value="all">Tutte le stazioni</option>';
  try {
    const stations = await Cache.getOrFetch(
      CACHE_KEYS.STATIONS,
      async () => {
        const { data, error } = await supabase
          .from('fuel_stations')
          .select('station_id, station_name');
        if (error) {
          throw error;
        }
        return data;
      },
      10 * 60 * 1000
    );
    if (stations) {
      stations.forEach((s: Record<string, unknown>) => {
        stationsHtml += `<option value="${escapeHtml(String(s.station_id))}">${escapeHtml(String(s.station_name))}</option>`;
      });
    }
  } catch (e) {
    logger.error('shifts', e);
  }

  setSafeHTML(
    target,
    `
        <div class="p-2">
            <p class="mb-3 text-muted">Seleziona i criteri per scaricare più chiusure in un unico file Excel.</p>
            
            <div class="form-group">
                <label>Stazione</label>
                <select id="bulk-station" class="form-control">
                    ${stationsHtml}
                </select>
            </div>

            <div class="form-group mt-3">
                <label>Tipo di Export</label>
                <div class="d-flex gap-3 mt-1">
                    <label class="d-flex align-center gap-1 cursor-pointer">
                        <input type="radio" name="bulk-type" value="last_n" id="radio-last-n" checked>
                        Ultime Chiusure
                    </label>
                    <label class="d-flex align-center gap-1 cursor-pointer">
                        <input type="radio" name="bulk-type" value="date_range" id="radio-date-range">
                        Intervallo Date
                    </label>
                </div>
            </div>

            <!-- OPZIONI LAST N -->
            <div id="last-n-options" class="mt-3 bg-light p-2 rounded border">
                <label>Numero di chiusure da scaricare:</label>
                <input type="number" id="bulk-limit" class="form-control" value="10" min="1" max="50" style="width: 100px; margin-top: 5px;">
                <small class="d-block text-muted mt-1">Es. 3 per le ultime 3, 10 per le ultime 10.</small>
            </div>

            <!-- OPZIONI DATE RANGE -->
            <div id="range-options" class="mt-3 bg-light p-2 rounded border hidden">
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

            <div class="mt-4 text-right">
                <button id="btn-start-bulk" class="menu-button primary">
                    <i class="fas fa-download"></i> Scarica Excel
                </button>
            </div>
            
            <div id="bulk-loading" class="hidden mt-3 text-info text-center">
                <i class="fas fa-spinner fa-spin"></i> Generazione in corso...
            </div>
        </div>
    `
  );

  // Handle Radio Change Events (CSP Safe)
  const radioLastN = document.getElementById('radio-last-n');
  const radioDateRange = document.getElementById('radio-date-range');
  const rangeOptions = document.getElementById('range-options');
  const lastNOptions = document.getElementById('last-n-options');

  const toggleBulkOptions = (isRange: boolean): void => {
    if (isRange) {
      rangeOptions?.classList.remove('hidden');
      lastNOptions?.classList.add('hidden');
    } else {
      rangeOptions?.classList.add('hidden');
      lastNOptions?.classList.remove('hidden');
    }
  };

  if (radioLastN) {
    radioLastN.addEventListener('change', () => toggleBulkOptions(false));
  }
  if (radioDateRange) {
    radioDateRange.addEventListener('change', () => toggleBulkOptions(true));
  }

  const btn = document.getElementById('btn-start-bulk');
  if (btn) {
    btn.addEventListener('click', async () => {
      const stationElement = document.getElementById('bulk-station') as HTMLSelectElement;
      const stationId = stationElement.value;
      const typeElement = document.querySelector(
        'input[name="bulk-type"]:checked'
      ) as HTMLInputElement;
      const type = typeElement.value as 'last_n' | 'date_range';
      const limitElement = document.getElementById('bulk-limit') as HTMLInputElement;
      const limit = parseInt(limitElement.value) || 10;
      const dateFromElement = document.getElementById('bulk-from') as HTMLInputElement;
      const dateFrom = dateFromElement.value;
      const dateToElement = document.getElementById('bulk-to') as HTMLInputElement;
      const dateTo = dateToElement.value;

      // Validation
      if (type === 'date_range' && (!dateFrom || !dateTo)) {
        Toast.show('Seleziona entrambe le date.', 'error');
        return;
      }

      const loadingDiv = document.getElementById('bulk-loading');
      if (loadingDiv) {
        loadingDiv.classList.remove('hidden');
      }

      const btnElement = btn as HTMLButtonElement;
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
      } catch (err: unknown) {
        logger.error('shifts', err);
        Toast.show('Errore durante export multiplo: ' + getErrorMessage(err), 'error');
      } finally {
        if (loadingDiv) {
          loadingDiv.classList.add('hidden');
        }
        btnElement.disabled = false;
      }
    });
  }
}

export async function handleBulkExport(opts: BulkExportOptions): Promise<void> {
  try {
    // 1. Fetch Data
    let query = supabase
      .from('shifts')
      .select(
        `
            *,
            fuel_stations(station_name),
            users(full_name)
        `
      )
      .order('created_at', { ascending: false });

    if (opts.stationId) {
      query = query.eq('station_id', Number(opts.stationId));
    }

    if (opts.type === 'last_n') {
      query = query.limit(opts.limit);
    } else {
      if (!opts.dateFrom || !opts.dateTo) {
        throw new Error('Range date mancante');
      }
      query = query.gte('created_at', opts.dateFrom).lte('created_at', opts.dateTo + 'T23:59:59');
    }

    const { data: closures, error } = await query;
    if (error) {
      throw error;
    }
    if (!closures || closures.length === 0) {
      throw new Error('Nessuna chiusura trovata con i criteri selezionati.');
    }

    // 2. Process Data for Template
    const processedClosures = [];
    for (const c of closures) {
      const metrics = await computeExportSummaryMetrics(supabase, c, c.station_id);
      processedClosures.push(metrics);
    }

    // 3. Generate Excel
    await generateMultiClosureExcel(processedClosures);
  } catch (err) {
    handleError(err as Error, 'handleBulkExport');
  }
}

export async function deleteClosure(
  closureId: string | number,
  onSuccessCallback?: () => void
): Promise<void> {
  const confirmed = await openConfirmModal(
    "Sei sicuro di voler eliminare questa chiusura? L'operazione è irreversibile e cancellerà anche i dettagli dei contatori e lo scarico serbatoi."
  );
  if (!confirmed) {
    return;
  }

  try {
    // Use server-side RPC function for secure cascade delete
    const { error } = await supabase.rpc('admin_delete_closure', {
      closure_id: Number(closureId)
    });

    if (error) {
      throw error;
    }

    Toast.show('Chiusura eliminata con successo', 'success');
    if (onSuccessCallback) {
      onSuccessCallback();
    }
  } catch (err) {
    handleError(err as Error, 'deleteClosure');
  }
}
