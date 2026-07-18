import { supabase } from '../core/api.js';
import { logger } from '../core/logger.js';
import type { ChartInstance } from '../types.js';
import { formatEuro } from '../utils/utils.js';

import {
  aggregateShiftAnalytics,
  createEmptyAnalyticsTotals,
  createItalianCalendarRange,
  formatItalianDayLabel,
  type AnalyticsResult,
  type AnalyticsShift
} from './analytics-aggregation.js';

// window.Chart è dichiarato (opzionale) in js/vendor/lazy.ts (#343).

// Global chart instances store to destroy old charts on redraw
const dashboardCharts: Record<string, ChartInstance> = {};

/**
 * FETCH & PROCESS DATA (Unified for all 4 charts to save requests)
 * Fetches last 30 days data.
 */
export async function fetchAnalyticsData(
  stationId: string | number | null = null
): Promise<AnalyticsResult> {
  const calendarRange = createItalianCalendarRange('30d');
  const totals = createEmptyAnalyticsTotals();

  try {
    let query = supabase
      .from('shifts')
      .select('closed_at, closing_data, station_id')
      .eq('status', 'closed')
      .gte('closed_at', calendarRange.startIso)
      .lt('closed_at', calendarRange.endExclusiveIso);

    if (stationId) {
      query = query.eq('station_id', Number(stationId));
    }

    const { data: shifts, error } = await query;
    if (error) {
      throw error;
    }

    return aggregateShiftAnalytics((shifts || []) as AnalyticsShift[], calendarRange.days);
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
  const Chart = window.Chart;
  if (!ctx || !Chart) {
    return;
  }

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.daily.map(d => formatItalianDayLabel(d.date)),
      datasets: [
        {
          label: 'Ricavi (€)',
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
        y: { beginAtZero: true, ticks: { callback: (v: number) => formatEuro(v) } },
        x: { ticks: { maxTicksLimit: 10 } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

export function renderVolumeChart(data: AnalyticsResult, canvasId: string): void {
  const ctx = getCtx(canvasId);
  const Chart = window.Chart;
  if (!ctx || !Chart) {
    return;
  }

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.daily.map(d => formatItalianDayLabel(d.date)),
      datasets: [
        {
          label: 'Benzina',
          data: data.daily.map(d => d.liters_benzina),
          backgroundColor: '#10b981'
        },
        {
          label: 'Gasolio',
          data: data.daily.map(d => d.liters_gasolio),
          backgroundColor: '#333333'
        }
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
  const Chart = window.Chart;
  if (!ctx || !Chart) {
    return;
  }

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
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
      plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } }
    }
  });
}

export function renderFuelMixChart(data: AnalyticsResult, canvasId: string): void {
  const ctx = getCtx(canvasId);
  const Chart = window.Chart;
  if (!ctx || !Chart) {
    return;
  }

  // eslint-disable-next-line security/detect-object-injection -- canvasId is a literal id string
  dashboardCharts[canvasId] = new Chart(ctx, {
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
      plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } }
    }
  });
}
