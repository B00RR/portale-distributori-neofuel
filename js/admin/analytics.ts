/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../core/api.js';
import { showLoadingMessage, showErrorMessage } from '../ui/ui.js';
import { formatEuro, formatLitri, getISODate } from '../utils/utils.js';

// --- TYPES ---
declare global {
    interface Window {
        Chart: any;
    }
}

// Hack: Cast window to 'any' to silence the editor error about 'Chart' missing
// We access it via window because it's loaded via CDN in index.html
// Chart accessed lazily from window to support async loading and testing

interface ClosingData {
    ricavo_teorico?: number | string | null;
    litri_benzina?: number | string | null;
    litri_gasolio?: number | string | null;
    soldi_contanti?: number | string | null;
    soldi_pos_totale?: number | string | null;
    soldi_crediti?: number | string | null;
    soldi_voucher?: number | string | null;
    [key: string]: any;
}

interface ShiftData {
    closed_at: string;
    closing_data: ClosingData | null;
    station_id: number;
}

interface DayStats {
    date: string;
    revenue: number;
    liters_benzina: number;
    liters_gasolio: number;
}

interface AnalyticsTotals {
    benzina: number;
    gasolio: number;
    contanti: number;
    pos: number;
    crediti: number;
    voucher: number;
    revenue: number;
}

interface AnalyticsResult {
    daily: DayStats[];
    totals: AnalyticsTotals;
}

type DateRange = '7d' | '30d' | 'month' | 'year';

// --- STATE ---
const charts: Record<string, any> = {}; // Store chart instances

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
  container.innerHTML = `
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
    `;

  // Initialize Charts
  await updateCharts(container, stationFilter, dateRange);

  // Event Listeners for Controls
  container.querySelectorAll('button[data-range]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
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
  // 1. Calculate Date Range (Use UTC to match database/ISO strings)
  const endDate = new Date();
  const startDate = new Date();

  if (dateRange === '7d') {
    startDate.setUTCDate(endDate.getUTCDate() - 7);
  } else if (dateRange === '30d') {
    startDate.setUTCDate(endDate.getUTCDate() - 30);
  } else if (dateRange === 'month') {
    startDate.setUTCDate(1); // First day of current month
  } else if (dateRange === 'year') {
    startDate.setUTCMonth(0, 1);
  }

  startDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(23, 59, 59, 999);

  try {
    // 2. Fetch Data from Shifts (Closed)
    let query = supabase
      .from('shifts')
      .select('closed_at, closing_data, station_id')
      .eq('status', 'closed')
      .gte('closed_at', startDate.toISOString())
      .lte('closed_at', endDate.toISOString())
      .order('closed_at', { ascending: true });

    if (stationId) {
      query = query.eq('station_id', stationId);
    }

    const { data: shifts, error } = await query;
    if (error) { throw error; }

    // 3. Process Data
    const aggregated = processAnalyticsData(shifts as ShiftData[], startDate, endDate);

    // 4. Render Charts (Lazy load Chart.js logic if needed, but assuming global Chart)
    const Chart = (window as any).Chart;
    if (Chart) {
      renderRevenueChart(aggregated);
      renderVolumeChart(aggregated);
      renderPaymentChart(aggregated);
      renderFuelMixChart(aggregated);
    } else {
      console.error('Chart.js not found');
    }

  } catch (err) {
    showErrorMessage(container, err);
  }
}

/**
 * Process raw shifts into daily and total aggregations
 */
function processAnalyticsData(shifts: ShiftData[], startDate: Date, endDate: Date): AnalyticsResult {
  const days: Record<string, DayStats> = {};
  const totals: AnalyticsTotals = {
    benzina: 0,
    gasolio: 0,
    contanti: 0,
    pos: 0,
    crediti: 0,
    voucher: 0,
    revenue: 0
  };

  // Initialize all days in range to 0 to ensure continuity in charts
  // Create a new date object to avoid modifying startDate passed by reference
  const currentDate = new Date(startDate);

  // Safety check loop limit (e.g. 400 days) to prevent infinite loops if dates are wrong
  let loopCount = 0;
  while (currentDate <= endDate && loopCount < 400) {
    const iso = getISODate(currentDate); // YYYY-MM-DD
    days[iso] = {
      date: iso,
      revenue: 0,
      liters_benzina: 0,
      liters_gasolio: 0
    };
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    loopCount++;
  }

  shifts.forEach(s => {
    if (!s.closed_at) {return;}
    const day = s.closed_at.substring(0, 10);
    const data = s.closing_data || {};

    if (days[day]) {
      // Revenue
      const rev = Number(data.ricavo_teorico || 0);
      days[day].revenue += rev;
      totals.revenue += rev;

      // Liters
      const lb = Number(data.litri_benzina || 0);
      const lg = Number(data.litri_gasolio || 0);
      days[day].liters_benzina += lb;
      days[day].liters_gasolio += lg;
      totals.benzina += lb;
      totals.gasolio += lg;

      // Payments (approximation from cash movements attached in closing_data usually)
      totals.contanti += Number(data.soldi_contanti || 0);
      totals.pos += Number(data.soldi_pos_totale || 0); // Sum of all POS
      totals.crediti += Number(data.soldi_crediti || 0);
      totals.voucher += Number(data.soldi_voucher || 0);
    }
  });

  return {
    daily: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    totals
  };
}

function getChartContext(id: string): HTMLCanvasElement | null {
  const ctx = document.getElementById(id) as HTMLCanvasElement;
  if (!ctx) { return null; }

  // Destroy existing
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
  return ctx;
}

function renderRevenueChart(data: AnalyticsResult): void {
  const ctx = getChartContext('revenue-chart');
  if (!ctx) { return; }

  const Chart = (window as any).Chart;
  charts['revenue-chart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.daily.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })),
      datasets: [{
        label: 'Ricavi Totali (€)',
        data: data.daily.map(d => d.revenue),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.3
      }]
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
  if (!ctx) { return; }

  const Chart = (window as any).Chart;
  charts['volume-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.daily.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })),
      datasets: [
        {
          label: 'Benzina (L)',
          data: data.daily.map(d => d.liters_benzina),
          backgroundColor: '#22c55e'
        },
        {
          label: 'Gasolio (L)',
          data: data.daily.map(d => d.liters_gasolio),
          backgroundColor: '#1f2937' // Dark gray/black for diesel
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
  if (!ctx) { return; }

  const Chart = (window as any).Chart;
  charts['payments-chart'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Contanti', 'POS', 'Crediti', 'Voucher'],
      datasets: [{
        data: [data.totals.contanti, data.totals.pos, data.totals.crediti, data.totals.voucher],
        backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899']
      }]
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
  if (!ctx) { return; }

  const Chart = (window as any).Chart;
  charts['fuels-chart'] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Benzina', 'Gasolio'],
      datasets: [{
        data: [data.totals.benzina, data.totals.gasolio],
        backgroundColor: ['#22c55e', '#1f2937']
      }]
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
