/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase, type Json } from '../core/api.js';
import { logger } from '../core/logger.js';
import { formatEuro, getISODate } from '../utils/utils.js';

// --- TYPES (Simplified for Dashboard) ---
declare global {
    interface Window {
        Chart: any;
    }
}

const Chart = window.Chart;

interface ClosingData extends Record<string, number | string | null | undefined> {
    ricavo_teorico?: number | string | null;
    litri_benzina?: number | string | null;
    litri_gasolio?: number | string | null;
    soldi_contanti?: number | string | null;
    soldi_pos_totale?: number | string | null;
    soldi_crediti?: number | string | null;
    soldi_voucher?: number | string | null;
}

interface ShiftData {
    closed_at: string | null;
    closing_data: Json | null;
    station_id: number;
}

interface AnalyticsResult {
    daily: DayStats[];
    totals: AnalyticsTotals;
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

// Global chart instances store to destroy old charts on redraw
const dashboardCharts: Record<string, any> = {};

/**
 * FETCH & PROCESS DATA (Unified for all 4 charts to save requests)
 * Fetches last 30 days data.
 */
export async function fetchAnalyticsData(stationId: string | number | null = null): Promise<AnalyticsResult> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30); // Fixed 30 days for Dashboard view

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  // Initial Empty Data
  const days: Record<string, DayStats> = {};
  const totals: AnalyticsTotals = {
    benzina: 0, gasolio: 0, contanti: 0, pos: 0, crediti: 0, voucher: 0, revenue: 0
  };

  // Fill dates
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const iso = getISODate(currentDate);
    // eslint-disable-next-line security/detect-object-injection -- iso is generated YYYY-MM-DD
    days[iso] = { date: iso, revenue: 0, liters_benzina: 0, liters_gasolio: 0 };
    currentDate.setDate(currentDate.getDate() + 1);
  }

  try {
    let query = supabase
      .from('shifts')
      .select('closed_at, closing_data, station_id')
      .eq('status', 'closed')
      .gte('closed_at', startDate.toISOString())
      .lte('closed_at', endDate.toISOString());

    if (stationId) { query = query.eq('station_id', Number(stationId)); }

    const { data: shifts, error } = await query;
    if (error) {throw error;}

    (shifts || []).forEach((s: ShiftData) => {
      if (!s.closed_at) {return;}
      const day = s.closed_at.substring(0, 10);
      const rawData = s.closing_data;
      const data: ClosingData = (rawData && typeof rawData === 'object' && !Array.isArray(rawData))
        ? rawData as ClosingData
        : {};

      // eslint-disable-next-line security/detect-object-injection -- day validated by days map
      if (days[day]) {
        const rev = Number(data.ricavo_teorico || 0);
        const lb = Number(data.litri_benzina || 0);
        const lg = Number(data.litri_gasolio || 0);

        // eslint-disable-next-line security/detect-object-injection -- day validated above
        days[day].revenue += rev;
        // eslint-disable-next-line security/detect-object-injection -- day validated above
        days[day].liters_benzina += lb;
        // eslint-disable-next-line security/detect-object-injection -- day validated above
        days[day].liters_gasolio += lg;

        totals.revenue += rev;
        totals.benzina += lb;
        totals.gasolio += lg;
        totals.contanti += Number(data.soldi_contanti || 0);
        totals.pos += Number(data.soldi_pos_totale || 0);
        totals.crediti += Number(data.soldi_crediti || 0);
        totals.voucher += Number(data.soldi_voucher || 0);
      }
    });

    return {
      daily: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
      totals
    };
  } catch (err) {
    logger.error('fetchAnalyticsData', err);
    return { daily: [], totals };
  }
}

/**
 * HELPER: Get Context & Destroy Old
 */
function getCtx(canvasId: string): HTMLCanvasElement | null {
  const ctx = document.getElementById(canvasId) as HTMLCanvasElement;
  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  if (ctx && dashboardCharts[canvasId]) {
    // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
    dashboardCharts[canvasId].destroy();
    // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
    delete dashboardCharts[canvasId];
  }
  return ctx;
}

/**
 * RENDERERS
 */
export function renderRevenueChart(data: AnalyticsResult, canvasId: string): void {
  const ctx = getCtx(canvasId);
  if (!ctx || !Chart) {return;}

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.daily.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })),
      datasets: [{
        label: 'Ricavi (€)',
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
        y: { beginAtZero: true, ticks: { callback: (v: number) => formatEuro(v) } },
        x: { ticks: { maxTicksLimit: 10 } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

export function renderVolumeChart(data: AnalyticsResult, canvasId: string): void {
  const ctx = getCtx(canvasId);
  if (!ctx || !Chart) {return;}

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.daily.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })),
      datasets: [
        { label: 'Benzina', data: data.daily.map(d => d.liters_benzina), backgroundColor: '#22c55e' },
        { label: 'Gasolio', data: data.daily.map(d => d.liters_gasolio), backgroundColor: '#1f2937' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 10 } },
        y: { stacked: true, beginAtZero: true }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

export function renderPaymentChart(data: AnalyticsResult, canvasId: string): void {
  const ctx = getCtx(canvasId);
  if (!ctx || !Chart) {return;}

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
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
      plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } }
    }
  });
}

export function renderFuelMixChart(data: AnalyticsResult, canvasId: string): void {
  const ctx = getCtx(canvasId);
  if (!ctx || !Chart) {return;}

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
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
      plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } }
    }
  });
}
