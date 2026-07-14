import { supabase } from '../core/api.js';
import { logger } from '../core/logger.js';
import type { CustomWindow, ChartInstance } from '../types.js';
import { showLoadingMessage, showErrorMessage } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { formatEuro, formatLitri } from '../utils/utils.js';

import {
  aggregateShiftAnalytics,
  createItalianCalendarRange,
  formatItalianDayLabel,
  type AnalyticsResult,
  type AnalyticsShift,
  type ItalianAnalyticsRange
} from './analytics-aggregation.js';

// Chart accessed lazily from window to support async loading and testing.

type DateRange = ItalianAnalyticsRange;

// --- STATE ---
// Chart.js instances stored as opaque objects
const charts: Record<string, ChartInstance> = {}; // Store chart instances

// --- MAIN FUNCTION ---
/**
 * Main entry point for the Analytics Tab
 */
export async function showAnalyticsTab(
  container: HTMLElement,
  _actionsContainer?: HTMLElement | null,
  stationFilter: number | null = null
): Promise<void> {
  showLoadingMessage(container);

  // Initial State
  let dateRange: DateRange = '30d';

  // Render Layout
  setSafeHTML(
    container,
    `
        <div class="analytics-wrapper">
            <div class="analytics-controls card-box">
                <div class="control-group">
                    <label>Periodo</label>
                    <div class="btn-group">
                        <button class="menu-button small active" data-range="7d">7 Giorni</button>
                        <button class="menu-button small" data-range="30d">30 Giorni</button>
                        <button class="menu-button small" data-range="month">Questo Mese</button>
                    </div>
                </div>
            </div>

            <div class="dashboard-grid two-columns">
                <!-- Sales Trend -->
                <article class="panel-card chart-card">
                    <h3 class="panel-title">Andamento Ricavi</h3>
                    <div class="chart-container">
                        <canvas id="revenue-chart"></canvas>
                    </div>
                </article>

                <!-- Fuel Volume Trend -->
                <article class="panel-card chart-card">
                    <h3 class="panel-title">Volume Erogato (Litri)</h3>
                    <div class="chart-container">
                        <canvas id="volume-chart"></canvas>
                    </div>
                </article>

                <!-- Payment Methods Breakdown -->
                <article class="panel-card chart-card">
                    <h3 class="panel-title">Metodi di Pagamento</h3>
                    <div class="chart-container">
                        <canvas id="payments-chart"></canvas>
                    </div>
                </article>

                <!-- Fuel Splits -->
                 <article class="panel-card chart-card">
                    <h3 class="panel-title">Mix Carburanti</h3>
                    <div class="chart-container">
                        <canvas id="fuels-chart"></canvas>
                    </div>
                </article>
            </div>
        </div>
    `
  );

  // Initialize Charts
  await updateCharts(container, stationFilter, dateRange);

  // Event Listeners for Controls
  container.querySelectorAll('button[data-range]').forEach(btn => {
    btn.addEventListener('click', async e => {
      const target = e.target as HTMLElement;

      // UI Toggle
      container.querySelectorAll('button[data-range]').forEach(b => b.classList.remove('active'));
      target.classList.add('active');

      // Logic
      dateRange = target.dataset.range as DateRange;
      await updateCharts(container, stationFilter, dateRange);
    });
  });
}

/**
 * Fetches data and renders all charts
 */
async function updateCharts(
  container: HTMLElement,
  stationId: number | null,
  dateRange: DateRange
): Promise<void> {
  // Use the station's Italian calendar independently from the browser timezone.
  const calendarRange = createItalianCalendarRange(dateRange);

  try {
    // 2. Fetch Data from Shifts (Closed)
    let query = supabase
      .from('shifts')
      .select('closed_at, closing_data, station_id')
      .eq('status', 'closed')
      .gte('closed_at', calendarRange.startIso)
      .lt('closed_at', calendarRange.endExclusiveIso)
      .order('closed_at', { ascending: true });

    if (stationId) {
      query = query.eq('station_id', stationId);
    }

    const { data: shifts, error } = await query;
    if (error) {
      throw error;
    }

    // 3. Process Data
    const aggregated = processAnalyticsData(shifts as AnalyticsShift[], calendarRange.days);

    // 4. Render Charts (Lazy load Chart.js logic if needed, but assuming global Chart)
    const customWindow = window as unknown as CustomWindow;
    if (customWindow.Chart) {
      renderRevenueChart(aggregated);
      renderVolumeChart(aggregated);
      renderPaymentChart(aggregated);
      renderFuelMixChart(aggregated);
    } else {
      logger.error('Chart.js not found');
    }
  } catch (err) {
    logger.error('showAnalyticsTab', err);
    showErrorMessage(container, err as Error);
  }
}

/**
 * Process raw shifts into daily and total aggregations
 */
function processAnalyticsData(
  shifts: AnalyticsShift[],
  days: AnalyticsResult['daily']
): AnalyticsResult {
  return aggregateShiftAnalytics(shifts, days);
}

function getChartContext(id: string): HTMLCanvasElement | null {
  const ctx = document.getElementById(id) as HTMLCanvasElement;
  if (!ctx) {
    return null;
  }

  // Destroy existing
  // eslint-disable-next-line security/detect-object-injection -- id is a literal canvas element id
  if (charts[id]) {
    // eslint-disable-next-line security/detect-object-injection -- id is a literal canvas element id
    charts[id].destroy();
    // eslint-disable-next-line security/detect-object-injection -- id is a literal canvas element id
    delete charts[id];
  }
  return ctx;
}

function renderRevenueChart(data: AnalyticsResult): void {
  const ctx = getChartContext('revenue-chart');
  if (!ctx) {
    return;
  }

  const customWindow = window as unknown as CustomWindow;
  const Chart = customWindow.Chart;
  if (!Chart) {
    return;
  }
  charts['revenue-chart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.daily.map(d => formatItalianDayLabel(d.date)),
      datasets: [
        {
          label: 'Ricavi Totali (€)',
          data: data.daily.map(d => d.revenue),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v: number) => formatEuro(v) } }
      }
    }
  });
}

function renderVolumeChart(data: AnalyticsResult): void {
  const ctx = getChartContext('volume-chart');
  if (!ctx) {
    return;
  }

  const customWindow = window as unknown as CustomWindow;
  const Chart = customWindow.Chart;
  if (!Chart) {
    return;
  }
  charts['volume-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.daily.map(d => formatItalianDayLabel(d.date)),
      datasets: [
        {
          label: 'Benzina (L)',
          data: data.daily.map(d => d.liters_benzina),
          backgroundColor: '#10b981'
        },
        {
          label: 'Gasolio (L)',
          data: data.daily.map(d => d.liters_gasolio),
          backgroundColor: '#333333' // Dark gray/black for diesel
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: (v: number) => formatLitri(v) }
        }
      }
    }
  });
}

function renderPaymentChart(data: AnalyticsResult): void {
  const ctx = getChartContext('payments-chart');
  if (!ctx) {
    return;
  }

  const customWindow = window as unknown as CustomWindow;
  const Chart = customWindow.Chart;
  if (!Chart) {
    return;
  }
  charts['payments-chart'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Contanti', 'POS', 'Crediti', 'Voucher', 'UTA/DKV', 'ID Gestore'],
      datasets: [
        {
          data: [
            data.totals.contanti,
            data.totals.pos,
            data.totals.crediti,
            data.totals.voucher,
            data.totals.utaDkv,
            data.totals.idGestore
          ],
          backgroundColor: ['#10b981', '#3b82f6', '#FFA500', '#ec4899', '#8b5cf6', '#64748b']
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' }
      }
    }
  });
}

function renderFuelMixChart(data: AnalyticsResult): void {
  const ctx = getChartContext('fuels-chart');
  if (!ctx) {
    return;
  }

  const customWindow = window as unknown as CustomWindow;
  const Chart = customWindow.Chart;
  if (!Chart) {
    return;
  }
  charts['fuels-chart'] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Benzina', 'Gasolio'],
      datasets: [
        {
          data: [data.totals.benzina, data.totals.gasolio],
          backgroundColor: ['#10b981', '#333333']
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' }
      }
    }
  });
}
