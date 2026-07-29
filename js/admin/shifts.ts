import { supabase } from '../core/api.js';
import { loggedUser } from '../core/auth.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { logger } from '../core/logger.js';
import { getStations } from '../core/stations-cache.js';
import { handleError } from '../shared/error-handler.js';
import { isAdminRole } from '../shared/roles.js';
import { store, type Pagination as PaginationType } from '../shared/state.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, openModal, closeModal, openConfirmModal } from '../ui/ui.js';
import {
  fetchClosureExportData,
  fetchShiftPistolsForBulkExport,
  generateClosureExcel,
  generateMultiClosureExcel,
  computeExportSummaryMetrics
} from '../utils/export_utils.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { selfTotalErogato } from '../utils/self-service.js';
import { escapeHtml, formatEuro, getItalianBusinessDate } from '../utils/utils.js';

import { FilterBar } from './components/FilterBar.js';
import { Pagination } from './components/Pagination.js';

// ========== INTERFACES ==========

interface FuelStation {
  station_name: string;
}

interface User {
  full_name: string;
}

interface ClosingDataSnapshot {
  version?: string;
  actor?: number;
  input?: Record<string, unknown>;
  computed?: {
    total_liters?: number;
    liters_by_pump?: Record<string, number>;
    fuel_revenue?: number;
    extra_revenue?: number;
    totale_venduto_carburante?: number;
    totale_venduto_extra?: number;
    extra_by_method?: { cash?: number; pos?: number; uta_dkv_fine_mese?: number };
    total_sold?: number;
    electronic_total?: number;
    self?: {
      cash_in?: number;
      cash_out?: number;
      pos?: number;
      fleet?: number;
      manager?: number;
    };
    operator?: { cash?: number; pos?: number; fleet?: number };
    vouchers?: number;
    points?: number;
    new_credits?: number;
    outflows?: number;
    credit_payments?: { cash?: number; pos?: number; uta_dkv_fine_mese?: number };
    non_erogato?: number;
    expected_cash?: number;
    real_cash?: number;
    discrepancy?: number;
  };
  prices_used?: Record<string, number>;
}

interface SelfServiceData {
  banconote_erogate?: number | undefined;
  banconote_incassate?: number | undefined;
  bancomat_erogati?: number | undefined;
  transazioni_uta?: number | undefined;
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
  contante_atteso?: number;
  operator_cash?: number;
  dettaglio_incasso?: DettaglioIncasso;
  scontrino_self?: SelfServiceData;
  extra_incassi?: number;
  /** Snapshot server-side produced by submit_shift_closure_v2. */
  snapshot?: ClosingDataSnapshot;
  /** Legacy compatibility with older computed payloads. */
  computed?: ClosingDataSnapshot['computed'];
}

interface Shift {
  id: number | string;
  station_id: number | string;
  operator_id: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
  opening_data: Record<string, number>;
  closing_data: ClosingData;
  fuel_stations?: FuelStation; // Joined
  users?: User; // Joined
  previous_closing_data?: ClosingData | null;
}

interface BulkExportOptions {
  stationId: string | null;
  type: 'last_n' | 'date_range';
  limit: number;
  dateFrom?: string;
  dateTo?: string;
}

function getExclusiveNextDay(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Data non valida: ${date}`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Data non valida: ${date}`);
  }
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export interface ShiftMetrics {
  fuelRevenue: number;
  extraRevenue: number;
  totalSold: number;
  expectedCash: number;
  realCash: number;
  discrepancy: number;
}

function parseOptionalNum(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : undefined;
}

export function computeShiftMetrics(shift: {
  status?: string;
  opening_data?: Record<string, unknown>;
  closing_data?: ClosingData;
}): ShiftMetrics {
  if (shift.status === 'open') {
    const openingData = shift.opening_data || {};
    const totalAmt = parseOptionalNum(openingData.total_amount) ?? 0;
    const cashIn = parseOptionalNum(openingData.cash_in) ?? 0;
    const cashOut = parseOptionalNum(openingData.cash_out) ?? 0;
    const cashInMinusOut = parseOptionalNum(openingData.cash_in_minus_out);

    const fuelRevenue = totalAmt;
    const extraRevenue = 0;
    const totalSold = totalAmt;
    const expectedCash = cashOut;
    const realCash = cashIn;
    const discrepancy = cashInMinusOut ?? cashIn - cashOut;

    return {
      fuelRevenue,
      extraRevenue,
      totalSold,
      expectedCash,
      realCash,
      discrepancy
    };
  }

  const closingData = shift.closing_data || {};
  const computed = closingData.snapshot?.computed || closingData.computed || {};
  const operator = computed.operator || {};

  const fuelRevenue =
    parseOptionalNum(computed.fuel_revenue) ??
    parseOptionalNum(computed.totale_venduto_carburante) ??
    parseOptionalNum(closingData.ricavo_teorico) ??
    0;

  const extraRevenue =
    parseOptionalNum(computed.extra_revenue) ??
    parseOptionalNum(computed.totale_venduto_extra) ??
    0;

  const totalSold = parseOptionalNum(computed.total_sold) ?? fuelRevenue + extraRevenue;

  const expectedCash =
    parseOptionalNum(computed.expected_cash) ?? parseOptionalNum(closingData.contante_atteso) ?? 0;

  const realCash =
    parseOptionalNum(computed.real_cash) ??
    parseOptionalNum(operator.cash) ??
    parseOptionalNum(closingData.operator_cash) ??
    0;

  const discrepancy = parseOptionalNum(computed.discrepancy) ?? realCash - expectedCash;

  return {
    fuelRevenue,
    extraRevenue,
    totalSold,
    expectedCash,
    realCash,
    discrepancy
  };
}

// ========== MODULE ==========

// Module-level subscription disposer to prevent leaked listeners when the tab is
// re-initialized (#347).
let activeSubscription: (() => void) | null = null;

export async function showChiusureTab(
  container: HTMLElement,
  actionsContainer: HTMLElement | null,
  defaultStationId: string | null = null
): Promise<void> {
  // Clean up any previous subscription before rebuilding the tab.
  activeSubscription?.();
  activeSubscription = null;

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

      // Build Query for Table Rows (Paginated)
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
        query = query.lt('created_at', getExclusiveNextDay(filters.dateTo));
      }

      // 3. Pagination
      const from = pagState.page * pagState.pageSize;
      const to = from + pagState.pageSize - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      // Build Query for Totali Card (Unpaginated - all rows matching the period / today)
      let totalsQuery = supabase
        .from('shifts')
        .select('status, opening_data, closing_data, created_at, closed_at');

      if (stationId) {
        totalsQuery = totalsQuery.eq('station_id', Number(stationId));
      }

      const hasDateFilter = Boolean(filters.dateFrom || filters.dateTo);

      if (filters.dateFrom) {
        totalsQuery = totalsQuery.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        totalsQuery = totalsQuery.lt('created_at', getExclusiveNextDay(filters.dateTo));
      }

      if (!hasDateFilter) {
        const todayDateStr = getItalianBusinessDate();
        const nextDayStr = getExclusiveNextDay(todayDateStr);
        totalsQuery = totalsQuery.or(
          `and(created_at.gte.${todayDateStr},created_at.lt.${nextDayStr}),and(closed_at.is.null,status.in.(open,partial))`
        );
      }

      const [{ data: closures, error, count }, { data: totalsData, error: totalsError }] =
        await Promise.all([query, totalsQuery]);

      if (error) {
        throw error;
      }
      if (totalsError) {
        throw totalsError;
      }

      // Update totalCount if changed
      if (count !== null && count !== pagState.totalCount) {
        store.setPagination({ totalCount: count });
      }

      // Re-render pagination with new count
      pagination.render();

      const filteredClosures: Shift[] = (closures as unknown as Shift[]) || [];
      const totalsClosures: Shift[] = (totalsData as unknown as Shift[]) || [];

      if (filteredClosures.length === 0) {
        setSafeHTML(dataContainer, '<p>Nessuna chiusura trovata.</p>');
        return;
      }

      // Totale Giornaliero / Filtered Totals
      let totale_venduto_carburante = 0;
      let totale_venduto_extra = 0;
      let totale_venduto = 0;
      let contante_atteso = 0;
      let contante_reale = 0;
      let discrepanza = 0;

      totalsClosures.forEach(c => {
        const m = computeShiftMetrics(c);
        totale_venduto_carburante += m.fuelRevenue;
        totale_venduto_extra += m.extraRevenue;
        totale_venduto += m.totalSold;
        contante_atteso += m.expectedCash;
        contante_reale += m.realCash;
        discrepanza += m.discrepancy;
      });

      const discrepanzaColor =
        discrepanza >= 0 ? 'var(--success-color, green)' : 'var(--danger-color, red)';

      const cardHtml = `
        <div class="daily-total-card" style="margin-bottom: 20px; padding: 15px; background: var(--bg-secondary, #f8f9fa); border-radius: 8px; border: 1px solid var(--border-color, #dee2e6);">
          <h3 style="margin: 0 0 15px 0; font-size: 1.1em;">Totale Giornaliero</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div>
              <div style="font-size: 0.85em; color: var(--secondary-color);">Venduto Carburante</div>
              <div style="font-size: 1.1em;">${formatEuro(totale_venduto_carburante)}</div>
            </div>
            <div>
              <div style="font-size: 0.85em; color: var(--secondary-color);">Venduto Extra</div>
              <div style="font-size: 1.1em;">${formatEuro(totale_venduto_extra)}</div>
            </div>
            <div>
              <div style="font-size: 0.85em; color: var(--secondary-color);">Totale Venduto</div>
              <div style="font-size: 1.2em; font-weight: bold;">${formatEuro(totale_venduto)}</div>
            </div>
            <div>
              <div style="font-size: 0.85em; color: var(--secondary-color);">Contante Atteso</div>
              <div style="font-size: 1.1em;">${formatEuro(contante_atteso)}</div>
            </div>
            <div>
              <div style="font-size: 0.85em; color: var(--secondary-color);">Contante Reale</div>
              <div style="font-size: 1.2em; font-weight: bold;">${formatEuro(contante_reale)}</div>
            </div>
            <div>
              <div style="font-size: 0.85em; color: var(--secondary-color);">Discrepanza</div>
              <div style="font-size: 1.1em; font-weight: bold; color: ${discrepanzaColor};">${discrepanza > 0 ? '+' : ''}${formatEuro(discrepanza)}</div>
            </div>
          </div>
        </div>
      `;

      let tableHtml = `
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
        const isOpen = c.status === 'open' && !isFinal;

        // Stale Shift Logic
        let staleIndicator = '';
        if (isOpen) {
          const createdAt = new Date(c.created_at).getTime();
          const now = new Date().getTime();
          const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
          if (hoursOpen > businessRules.force_close_hours_threshold) {
            staleIndicator = `<span class="badge badge-danger" style="margin-left: 5px;" title="Turno aperto da oltre ${businessRules.force_close_hours_threshold} ore">STALE</span>`;
          }
        }

        let closureType: string;
        let closureClass: string;
        if (isOpen) {
          closureType = 'Apertura';
          closureClass = 'badge-info';
        } else if (isFinal) {
          closureType = 'Finale';
          closureClass = 'badge-success';
        } else {
          closureType = 'Parziale';
          closureClass = 'badge-warning';
        }
        const metrics = computeShiftMetrics(c);
        const total = formatEuro(metrics.totalSold);

        tableHtml += `
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

      tableHtml += '</tbody></table></div>';
      setSafeHTML(dataContainer, cardHtml + tableHtml);

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

  // Subscribe to state changes (only if we don't already have an active one).
  if (activeSubscription === null) {
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

    // Persist the disposer so re-initialization can clean it up (#347).
    activeSubscription = unsub;
  }
}

/** Explicitly tear down the active shifts subscription. Exported for tests. */
export function disposeShiftsSubscription(): void {
  activeSubscription?.();
  activeSubscription = null;
}

export async function showClosureDetails(closureId: string | number): Promise<void> {
  // Fetch data first to determine the title
  let closure: Shift;
  try {
    const { data: closureRaw, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', Number(closureId))
      .single();

    if (error || !closureRaw) {
      throw new Error('Chiusura non trovata');
    }
    closure = closureRaw as unknown as Shift;
  } catch (err) {
    openModal('Dettagli Chiusura');
    const target = document.getElementById('modal-body');
    if (target) {
      setSafeHTML(target, `<p class="error">Errore: ${escapeHtml((err as Error).message)}</p>`);
    }
    return;
  }

  const isOpen = closure.status === 'open';
  const modalTitle = isOpen ? 'Dettagli Apertura' : 'Dettagli Chiusura';
  openModal(modalTitle);
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  showLoadingMessage(target);

  try {
    // Fetch the previous closure for the same station/day so the admin can see
    // the self-service absolute vs incremental values.
    if (!isOpen && closure.closed_at) {
      const dayStart = closure.closed_at.slice(0, 10);
      const { data: prev } = await supabase
        .from('shifts')
        .select('closing_data')
        .eq('station_id', Number(closure.station_id))
        .lt('closed_at', closure.closed_at)
        .gte('closed_at', dayStart)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prev) {
        closure.previous_closing_data = prev.closing_data as unknown as ClosingData | null;
      }
    }

    const closingData = closure.closing_data || {};
    const snapshot = closingData.snapshot || { computed: closingData.computed };
    const computed = snapshot.computed || {};
    const openingData = closure.opening_data || {};

    // Prefer the server-authoritative snapshot when present; fall back to the
    // legacy `closing_data.computed` or flat fields for older closures.
    const selfSnapshot = computed.self || {};
    const operatorSnapshot = computed.operator || {};

    const dateStr = new Date(closure.closed_at || closure.created_at).toLocaleString('it-IT');

    let contanti: string,
      pos: string,
      crediti: string,
      voucher: string,
      carteUta: string,
      rimborsi: string;
    let selfData: SelfServiceData;
    let extraVal: number;
    let vendutoCarburanteVal: number;
    let cashIn = 0,
      cashOut = 0,
      netCash = 0;
    let expectedCash = 0,
      realCash = 0,
      discrepancy = 0;
    let selfTotalVal = 0;

    if (isOpen) {
      // Turno aperto: mostra i dati di apertura
      cashIn = openingData.cash_in || 0;
      cashOut = openingData.cash_out || 0;
      netCash = cashIn - cashOut;
      contanti = formatEuro(cashIn);
      pos = formatEuro(openingData.pos_amount || 0);
      crediti = formatEuro(0);
      voucher = formatEuro(0);
      carteUta = formatEuro(openingData.uta_dkv_iscard || 0);
      rimborsi = formatEuro(0);
      selfData = {};
      extraVal = 0;
      vendutoCarburanteVal = 0;
    } else {
      // Server-authoritative values
      contanti = formatEuro(operatorSnapshot.cash || 0);
      pos = formatEuro(operatorSnapshot.pos || 0);
      crediti = formatEuro(
        (computed.credit_payments?.cash || 0) +
          (computed.credit_payments?.pos || 0) +
          (computed.credit_payments?.uta_dkv_fine_mese || 0)
      );
      voucher = formatEuro(computed.vouchers || 0);
      carteUta = formatEuro(operatorSnapshot.fleet || 0);
      rimborsi = formatEuro(computed.outflows || 0);

      selfData = {
        banconote_incassate: selfSnapshot.cash_in,
        banconote_erogate: selfSnapshot.cash_out,
        bancomat_erogati: selfSnapshot.pos,
        transazioni_uta: selfSnapshot.fleet
      };
      extraVal = computed.extra_revenue || 0;
      vendutoCarburanteVal = computed.fuel_revenue || 0;

      expectedCash = computed.expected_cash || 0;
      realCash = computed.real_cash || 0;
      discrepancy = computed.discrepancy || 0;
      selfTotalVal = selfTotalErogato(selfData);
    }

    const totaleVendutoVal = vendutoCarburanteVal + extraVal;
    const totaleVenduto = formatEuro(totaleVendutoVal);

    // Variabili per l'HTML (solo per turni chiusi)
    const banconoteErogate = selfData.banconote_erogate || 0;
    const banconoteIncassate = selfData.banconote_incassate || 0;
    const bancomatSelf = selfData.bancomat_erogati || 0;
    const cardsSelf = selfData.transazioni_uta || 0;
    const selfTotalFormatted = formatEuro(selfTotalVal);
    const extra = formatEuro(extraVal);
    const vendutoCarburante = formatEuro(vendutoCarburanteVal);

    // Incremento self rispetto alla chiusura precedente dello stesso giorno.
    let selfIncrementHtml = '';
    if (!isOpen && closure.previous_closing_data) {
      const prev = closure.previous_closing_data;
      const prevComputed = prev.snapshot?.computed || prev.computed || {};
      const prevSelf = prevComputed.self || {};
      const prevErogato = selfTotalErogato({
        banconote_erogate: prevSelf.cash_out,
        bancomat_erogati: prevSelf.pos,
        transazioni_uta: prevSelf.fleet
      });
      const increment = selfTotalVal - prevErogato;
      if (Math.abs(increment) > 0.005) {
        selfIncrementHtml = `
          <div class="mt-1 pt-1 border-top-dashed" style="font-size: 0.85em; color: var(--secondary-color);">
              <span>Incremento rispetto alla chiusura precedente:</span>
              <b>${increment > 0 ? '+' : ''}${formatEuro(increment)}</b>
          </div>`;
      }
    }

    let contantiSelfHtml = '';
    if (banconoteErogate === banconoteIncassate) {
      contantiSelfHtml = `<span>Contanti:</span> <b>${formatEuro(banconoteIncassate)}</b>`;
    } else {
      contantiSelfHtml = `
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Contanti:</span>
                <div style="text-align: right;">
                    <div style="font-size: 0.85em; color: var(--secondary-color);">Incassati: <b>${formatEuro(banconoteIncassate)}</b></div>
                    <div style="font-size: 0.85em; color: var(--secondary-color);">Erogati: <b>${formatEuro(banconoteErogate)}</b></div>
                </div>
            </div>`;
    }

    const idLabel = isOpen ? 'ID Apertura' : 'ID Chiusura';
    const statusLabel = isOpen ? 'Aperto' : 'Chiuso';

    let selfSectionHtml = '';
    if (!isOpen) {
      selfSectionHtml = `
        <!-- SEZIONE SELF SERVICE -->
        <div class="closure-section-alt">
            <div class="closure-section-header">Dettaglio Self Service</div>

            <p class="closure-row">${contantiSelfHtml}</p>
            <p class="closure-row"><span>Bancomat:</span> <b>${formatEuro(bancomatSelf)}</b></p>
            <p class="closure-row"><span>Icad/DKV/Iscard:</span> <b>${formatEuro(cardsSelf)}</b></p>

            <div class="mt-2 pt-2 border-top-dashed d-flex justify-between font-weight-bold">
                <span>Incasso Totale Self:</span> <span>${selfTotalFormatted}</span>
            </div>
            ${selfIncrementHtml}
        </div>`;
    }

    // Admin-only warning: |venduto dai numeratori - (venduto self + ID gestore)| > 10 €.
    const user = store.getUser();
    const isFullAdmin = isAdminRole(user?.role || loggedUser?.role || 'operator');
    let adminWarningHtml = '';
    if (!isOpen && isFullAdmin) {
      const managerAmount = selfSnapshot.manager || 0;
      const selfPlusManager = selfTotalVal + managerAmount;
      const diff = Math.abs(vendutoCarburanteVal - selfPlusManager);
      if (diff > 10) {
        adminWarningHtml = `
          <div class="closure-alert badge-danger" style="margin: 1rem 0; padding: 0.75rem; border-radius: 8px;">
              <i class="fas fa-exclamation-triangle"></i>
              <strong>Attenzione admin:</strong> differenza venduto numeratori vs self + ID gestore di ${formatEuro(diff)}.
          </div>`;
      }
    }

    let totalSectionHtml = '';
    if (!isOpen) {
      totalSectionHtml = `
        <div class="closure-total-box">
            <div class="closure-total-label">Totale Venduto (Carburante + Extra)</div>
            <div class="closure-total-value">${totaleVenduto}</div>
        </div>
        <div class="closure-total-box" style="margin-top: 1rem;">
            <div class="closure-total-label">Contanti</div>
            <div class="closure-total-value">${formatEuro(realCash)}</div>
            <div style="font-size: 0.85em; color: var(--secondary-color);">Atteso: ${formatEuro(expectedCash)} — Discrepanza:
              <span class="${Math.abs(discrepancy) > 0.01 ? (discrepancy > 0 ? 'text-success' : 'text-danger') : ''}">
                ${discrepancy > 0 ? '+' : ''}${formatEuro(discrepancy)}
              </span>
            </div>
        </div>`;
    }

    // Movimenti automatici del turno (solo per chiusura finale/parziale)
    let movementsSectionHtml = '';
    if (!isOpen) {
      const extraCash = computed.extra_by_method?.cash || 0;
      const extraPos = computed.extra_by_method?.pos || 0;
      const extraUta = computed.extra_by_method?.uta_dkv_fine_mese || 0;
      const creditCash = computed.credit_payments?.cash || 0;
      const creditPos = computed.credit_payments?.pos || 0;
      const creditUta = computed.credit_payments?.uta_dkv_fine_mese || 0;
      const points = computed.points || 0;
      const newCredits = computed.new_credits || 0;

      movementsSectionHtml = `
        <!-- SEZIONE MOVIMENTI TURNO -->
        <div class="closure-section-alt">
            <div class="closure-section-header">Movimenti automatici del turno</div>
            <p class="closure-row"><span>Incassi extra (cash/POS/UTA):</span> <b>${formatEuro(extraCash)} / ${formatEuro(extraPos)} / ${formatEuro(extraUta)}</b></p>
            <p class="closure-row"><span>Uscite cassa:</span> <b>${formatEuro(computed.outflows || 0)}</b></p>
            <p class="closure-row"><span>Voucher:</span> <b>${formatEuro(computed.vouchers || 0)}</b></p>
            <p class="closure-row"><span>Punti riscattati:</span> <b>${formatEuro(points)}</b></p>
            <p class="closure-row"><span>Crediti nuovi:</span> <b>${formatEuro(newCredits)}</b></p>
            <p class="closure-row"><span>Pagamenti crediti vecchi:</span> <b>${formatEuro(creditCash)} / ${formatEuro(creditPos)} / ${formatEuro(creditUta)}</b></p>
        </div>`;
    }

    setSafeHTML(
      target,
      `
      <div class="closure-details">
        ${adminWarningHtml}

        <div class="closure-details-header">
            <span>${idLabel}: <b>${closure.id}</b></span>
            <span>${dateStr} <span class="badge ${isOpen ? 'badge-info' : 'badge-success'}">${statusLabel}</span></span>
        </div>

        ${selfSectionHtml}

        <!-- SEZIONE OPERATORE -->
        <div class="closure-section">
            <div class="closure-section-header">${isOpen ? 'Dati Apertura' : 'Dettaglio Operatore'}</div>
            ${
              isOpen
                ? `
            <p class="closure-row"><span>Contanti:</span> <span style="text-align:right;"><b>${formatEuro(cashIn)}</b>${cashOut > 0 && cashOut !== cashIn ? '<br><span style="font-size:0.8em;color:var(--secondary-color);">erogati ' + formatEuro(cashOut) + '</span>' : ''}</span></p>
            <p class="closure-row"><span>Non erogato:</span> <b>${formatEuro(netCash)}</b></p>
            <p class="closure-row"><span>POS:</span> <b>${pos}</b></p>
            <p class="closure-row"><span>Carte (UTA/DKV):</span> <b>${carteUta}</b></p>
            <hr class="my-2 border-0 border-top">
            <p class="closure-row font-weight-bold text-main"><span>Totale Scontrino:</span> <b>${formatEuro(openingData.total_amount || 0)}</b></p>
            `
                : `
            <p class="closure-row"><span>Contanti:</span> <b>${contanti}</b></p>
            <p class="closure-row"><span>POS:</span> <b>${pos}</b></p>
            <p class="closure-row"><span>Crediti:</span> <b>${crediti}</b></p>
            <p class="closure-row"><span>Voucher/Buoni:</span> <b>${voucher}</b></p>
            <p class="closure-row"><span>Carte (UTA/DKV):</span> <b>${carteUta}</b></p>
            <p class="closure-row text-danger"><span>Uscite/Rimborsi:</span> <b>- ${rimborsi}</b></p>
            <hr class="my-2 border-0 border-top">
            <p class="closure-row font-weight-bold text-main"><span>Totale Venduto (Pistole):</span> <b>${vendutoCarburante}</b></p>
            <p class="closure-row text-primary"><span>Incassi Extra:</span> <b>${extra}</b></p>
            `
            }
        </div>

        ${movementsSectionHtml}

        ${totalSectionHtml}

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
    handleError(err, 'openExportModal');
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
    const stations = await getStations();
    stations.forEach(s => {
      stationsHtml += `<option value="${escapeHtml(String(s.station_id))}">${escapeHtml(String(s.station_name))}</option>`;
    });
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
        Toast.show('Seleziona entrambe le date.', 'warning');
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
        handleError(err, 'openBulkExportModal');
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
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false, nullsFirst: false });

  if (opts.stationId) {
    query = query.eq('station_id', Number(opts.stationId));
  }

  if (opts.type === 'last_n') {
    query = query.limit(opts.limit);
  } else {
    if (!opts.dateFrom || !opts.dateTo) {
      throw new Error('Range date mancante');
    }
    if (opts.dateFrom > opts.dateTo) {
      throw new Error('La data iniziale non può essere successiva alla data finale');
    }
    const exclusiveDateTo = getExclusiveNextDay(opts.dateTo);
    query = query.gte('closed_at', opts.dateFrom).lt('closed_at', exclusiveDateTo);
  }

  const { data: closures, error } = await query;
  if (error) {
    throw error;
  }
  if (!closures || closures.length === 0) {
    throw new Error('Nessuna chiusura trovata con i criteri selezionati.');
  }

  const shiftIds = closures.map(closure => Number(closure.id));
  if (shiftIds.some(shiftId => !Number.isInteger(shiftId) || shiftId <= 0)) {
    throw new Error("L'export contiene uno o più ID turno non validi");
  }
  const shiftPistolsByShift = await fetchShiftPistolsForBulkExport(supabase, shiftIds);

  // 2. Process Data for Template
  const processedClosures = [];
  for (const c of closures) {
    const shiftId = Number(c.id);
    const metrics = await computeExportSummaryMetrics(
      supabase,
      { ...c, shift_pistols: shiftPistolsByShift.get(shiftId) ?? [] },
      c.station_id
    );
    processedClosures.push(metrics);
  }

  // 3. Generate Excel
  await generateMultiClosureExcel(processedClosures);
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
