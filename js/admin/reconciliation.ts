/**
 * Reconciliation Admin Module
 * Handles rendering the Daily Reconciliation page
 */

import { supabase } from '../core/api.js';
import { getStations } from '../core/stations-cache.js';
import { handleError } from '../shared/error-handler.js';
import { showLoadingMessage } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

interface ShiftSummary {
  id: number;
  operator_id: number;
  operator_name?: string;
  opened_at?: string;
  closed_at?: string;
  closing_data?: {
    computed?: {
      fuel_revenue?: number;
      extra_revenue?: number;
      expected_cash?: number;
      real_cash?: number;
      discrepancy?: number;
    };
  };
}

interface MovementSummary {
  id: number;
  tipo: string;
  payment_method?: string;
  importo: number;
  descrizione?: string;
  created_at: string;
}

interface DailyReconciliationData {
  date: string;
  station_id: number;
  shifts: ShiftSummary[];
  totals: {
    fuel_revenue: number;
    extra_revenue: number;
    total_sold: number;
    expected_cash: number;
    real_cash: number;
    discrepancy: number;
    pos_total: number;
    fleet_total: number;
    vouchers_total: number;
    credits_total: number;
    outflows_total: number;
  };
  movements: {
    extra_incomes: MovementSummary[];
    outflows: MovementSummary[];
    vouchers: MovementSummary[];
    credits: MovementSummary[];
  };
}

export async function showReconciliationTab(
  container: HTMLElement,
  headerActions: HTMLElement | null,
  defaultStationId: number | null
): Promise<void> {
  showLoadingMessage(container);

  if (headerActions) {
    headerActions.replaceChildren();
  }

  try {
    const stations = await getStations();
    if (!stations || stations.length === 0) {
      setSafeHTML(container, '<div class="content-box"><p>Nessun distributore trovato.</p></div>');
      return;
    }

    // Default values
    const today = new Date().toISOString().split('T')[0];
    const firstStation = stations[0];
    if (!firstStation) {
      setSafeHTML(
        container,
        '<div class="content-box"><p>Nessun distributore disponibile.</p></div>'
      );
      return;
    }
    let selectedStationId = defaultStationId || firstStation.station_id;
    let selectedDate = today;

    // Create layout
    container.replaceChildren();

    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'reconciliation-module';

    // 1. Render Filter Panel
    const filterPanel = document.createElement('div');
    filterPanel.className = 'content-box mb-4';

    // Stations dropdown options
    const stationsOptionsHtml = stations
      .map(
        st =>
          `<option value="${st.station_id}" ${
            st.station_id === selectedStationId ? 'selected' : ''
          }>${escapeHtml(st.station_name)}</option>`
      )
      .join('');

    setSafeHTML(
      filterPanel,
      `
      <div style="display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap;">
        <div class="form-group" style="flex: 1; min-width: 200px; margin-bottom: 0;">
          <label for="recon-station-select" style="display: block; margin-bottom: 5px; font-weight: 500;">Stazione</label>
          <select id="recon-station-select" class="form-control" style="width: 100%;">
            ${stationsOptionsHtml}
          </select>
        </div>
        <div class="form-group" style="flex: 1; min-width: 150px; margin-bottom: 0;">
          <label for="recon-date-input" style="display: block; margin-bottom: 5px; font-weight: 500;">Data</label>
          <input type="date" id="recon-date-input" class="form-control" value="${selectedDate}" style="width: 100%;">
        </div>
        <button id="recon-filter-btn" class="menu-button primary" style="margin: 0; height: 38px;">
          <i class="fas fa-sync-alt"></i> Calcola
        </button>
      </div>
      `
    );
    mainWrapper.appendChild(filterPanel);

    // Results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'recon-results-container';
    mainWrapper.appendChild(resultsContainer);

    container.appendChild(mainWrapper);

    // Elements reference
    const stationSelect = filterPanel.querySelector('#recon-station-select') as HTMLSelectElement;
    const dateInput = filterPanel.querySelector('#recon-date-input') as HTMLInputElement;
    const filterBtn = filterPanel.querySelector('#recon-filter-btn') as HTMLButtonElement;

    // Load function
    const loadReconciliation = async (): Promise<void> => {
      showLoadingMessage(resultsContainer);
      selectedStationId = parseInt(stationSelect.value, 10);
      selectedDate = dateInput.value;

      try {
        const { data, error } = await supabase.rpc('get_daily_reconciliation', {
          p_station_id: selectedStationId,
          p_date: selectedDate
        });

        if (error) {
          throw error;
        }

        const reconData = data as unknown as DailyReconciliationData;
        const stationName =
          stations.find(st => st.station_id === selectedStationId)?.station_name || 'Sconosciuta';

        renderResults(resultsContainer, reconData, stationName);
      } catch (err) {
        handleError(err, 'Caricamento Riconciliazione Giornaliera', resultsContainer);
      }
    };

    // Event listeners
    filterBtn.addEventListener('click', loadReconciliation);
    stationSelect.addEventListener('change', loadReconciliation);
    dateInput.addEventListener('change', loadReconciliation);

    // Initial load
    await loadReconciliation();
  } catch (err) {
    handleError(err, 'Inizializzazione Riconciliazione', container);
  }
}

function renderResults(
  container: HTMLElement,
  data: DailyReconciliationData,
  stationName: string
): void {
  const discrepancyColor =
    data.totals.discrepancy === 0 ? 'var(--success-color)' : 'var(--danger-color)';

  const discrepancySign = data.totals.discrepancy > 0 ? '+' : '';

  // Render cards grid
  container.replaceChildren();

  const resultsCard = document.createElement('div');
  resultsCard.className = 'content-box';

  // Create beautiful styling for the cards
  const cardHtml = `
    <div style="border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 15px; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 1.5rem; display: flex; align-items: center; gap: 10px;">
        <i class="fas fa-balance-scale" style="color: var(--primary-color);"></i>
        Riconciliazione Giornaliera — ${escapeHtml(data.date)} — ${escapeHtml(stationName)}
      </h2>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 30px;">
      <!-- Totali Vendite -->
      <div style="background: var(--bg-secondary, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 20px;">
        <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 8px;">
          <i class="fas fa-gas-pump" style="color: var(--primary-color);"></i> Totali Vendite
        </h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Carburante</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.fuel_revenue)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Venduto Extra</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.extra_revenue)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dashed var(--border-color, #e2e8f0); padding-top: 10px; margin-top: 5px;">
            <span>Totale Venduto</span>
            <span>${formatEuro(data.totals.total_sold)}</span>
          </div>
        </div>
      </div>

      <!-- Transazioni Elettroniche -->
      <div style="background: var(--bg-secondary, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 20px;">
        <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 8px;">
          <i class="fas fa-credit-card" style="color: var(--primary-color);"></i> Transazioni Elettroniche
        </h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Totale POS</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.pos_total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Totale UTA/DKV</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.fleet_total)}</span>
          </div>
        </div>
      </div>

      <!-- Contanti -->
      <div style="background: var(--bg-secondary, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 20px;">
        <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 8px;">
          <i class="fas fa-money-bill-wave" style="color: var(--primary-color);"></i> Contanti
        </h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Contante Atteso</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.expected_cash)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Contante Reale</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.real_cash)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dashed var(--border-color, #e2e8f0); padding-top: 10px; margin-top: 5px; color: ${discrepancyColor};">
            <span>Discrepanza</span>
            <span>${discrepancySign}${formatEuro(data.totals.discrepancy)}</span>
          </div>
        </div>
      </div>

      <!-- Altri Movimenti -->
      <div style="background: var(--bg-secondary, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 20px;">
        <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 8px;">
          <i class="fas fa-exchange-alt" style="color: var(--primary-color);"></i> Altri Movimenti
        </h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Voucher Riscattati</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.vouchers_total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Nuovi Crediti</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.credits_total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary, #64748b);">Totale Uscite</span>
            <span style="font-weight: 500;">${formatEuro(data.totals.outflows_total)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Dettaglio Chiusure -->
    <div style="margin-top: 30px;">
      <h3 style="margin-bottom: 15px; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-clock" style="color: var(--primary-color);"></i> Dettaglio Chiusure del Giorno
      </h3>
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID Chiusura</th>
              <th>Operatore</th>
              <th>Apertura</th>
              <th>Chiusura</th>
              <th>Vendite Carburante</th>
              <th>Vendite Extra</th>
              <th>Atteso</th>
              <th>Reale</th>
              <th>Discrepanza</th>
            </tr>
          </thead>
          <tbody id="recon-shifts-tbody">
            <!-- populated dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  setSafeHTML(resultsCard, cardHtml);
  container.appendChild(resultsCard);

  // Populate shifts table
  const shiftsTbody = resultsCard.querySelector('#recon-shifts-tbody') as HTMLElement;
  if (!data.shifts || data.shifts.length === 0) {
    setSafeHTML(
      shiftsTbody,
      `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">Nessuna chiusura presente per questo giorno.</td></tr>`
    );
  } else {
    const rows = data.shifts
      .map(s => {
        const closingComputed = s.closing_data?.computed || {};
        const fuelRev =
          closingComputed.fuel_revenue !== undefined ? closingComputed.fuel_revenue : 0;
        const extraRev =
          closingComputed.extra_revenue !== undefined ? closingComputed.extra_revenue : 0;
        const expected =
          closingComputed.expected_cash !== undefined ? closingComputed.expected_cash : 0;
        const real = closingComputed.real_cash !== undefined ? closingComputed.real_cash : 0;
        const disc = closingComputed.discrepancy !== undefined ? closingComputed.discrepancy : 0;

        const rowDiscColor = disc === 0 ? 'var(--success-color)' : 'var(--danger-color)';
        const opName = s.operator_name || `#${s.operator_id}`;

        const openDate = s.opened_at
          ? new Date(s.opened_at).toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit'
            })
          : '-';
        const closeDate = s.closed_at
          ? new Date(s.closed_at).toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit'
            })
          : '-';

        return `
        <tr>
          <td><strong>#${s.id}</strong></td>
          <td>${escapeHtml(opName)}</td>
          <td>${escapeHtml(openDate)}</td>
          <td>${escapeHtml(closeDate)}</td>
          <td>${formatEuro(fuelRev)}</td>
          <td>${formatEuro(extraRev)}</td>
          <td>${formatEuro(expected)}</td>
          <td>${formatEuro(real)}</td>
          <td style="color: ${rowDiscColor}; font-weight: bold;">${formatEuro(disc)}</td>
        </tr>
      `;
      })
      .join('');
    setSafeHTML(shiftsTbody, rows);
  }
}
