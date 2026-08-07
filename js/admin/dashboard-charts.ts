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
  type AnalyticsShift,
  type AnalyticsTotals,
  type ItalianCalendarRange
} from './analytics-aggregation.js';

// window.Chart è dichiarato (opzionale) in js/vendor/lazy.ts (#343).

// Global chart instances store to destroy old charts on redraw
const dashboardCharts: Record<string, ChartInstance> = {};

/**
 * FETCH & PROCESS DATA (Unified for all 4 charts to save requests)
 * Fetches last 30 days data. Uses the server-side RPC get_analytics_aggregation
 * (issue #344) so aggregation runs in SQL with completeness metadata. Falls back
 * to the previous client-side broad read + aggregation if the RPC is unavailable.
 */
export async function fetchAnalyticsData(
  stationId: string | number | null = null
): Promise<AnalyticsResult> {
  const calendarRange = createItalianCalendarRange('30d');
  const totals = createEmptyAnalyticsTotals();
  const numericStationId = stationId ? Number(stationId) : null;

  try {
    const { data, error } = await supabase.rpc('get_analytics_aggregation', {
      p_station_id: numericStationId,
      p_start_iso: calendarRange.startIso,
      p_end_exclusive_iso: calendarRange.endExclusiveIso
    });

    if (error) {
      throw error;
    }

    const payload = data as unknown as {
      daily?: { date: string; revenue: number; liters_benzina: number; liters_gasolio: number }[];
      totals?: AnalyticsTotals;
      metadata?: { complete?: boolean };
    } | null;

    if (
      payload &&
      Array.isArray(payload.daily) &&
      payload.totals &&
      payload.metadata?.complete !== false
    ) {
      // Merge the server-aggregated days into the seeded 30-day Italian calendar so
      // empty days are preserved and every chart has a continuous x-axis.
      const dayByKey = new Map(calendarRange.days.map(day => [day.date, day]));
      payload.daily.forEach(day => {
        const seeded = dayByKey.get(day.date);
        if (seeded) {
          seeded.revenue = day.revenue ?? 0;
          seeded.liters_benzina = day.liters_benzina ?? 0;
          seeded.liters_gasolio = day.liters_gasolio ?? 0;
        }
      });
      return {
        daily: calendarRange.days,
        totals: { ...totals, ...payload.totals }
      };
    }

    // Incomplete payload -> fall back to client-side aggregation.
    return await fetchAnalyticsDataClientSide(numericStationId, calendarRange, totals);
  } catch (err) {
    logger.error('fetchAnalyticsData', err);
    return await fetchAnalyticsDataClientSide(numericStationId, calendarRange, totals);
  }
}

/**
 * Legacy client-side aggregation path (pre #344), kept as a fallback when the
 * get_analytics_aggregation RPC is not yet deployed or returns an error.
 */
async function fetchAnalyticsDataClientSide(
  numericStationId: number | null,
  calendarRange: ItalianCalendarRange,
  totals: AnalyticsTotals
): Promise<AnalyticsResult> {
  try {
    let query = supabase
      .from('shift_closures')
      .select('closed_at, closing_data, shifts!inner(station_id)')
      .gte('closed_at', calendarRange.startIso)
      .lt('closed_at', calendarRange.endExclusiveIso);

    if (numericStationId) {
      query = query.eq('shifts.station_id', numericStationId);
    }

    const { data: shifts, error } = await query;
    if (error) {
      throw error;
    }

    return aggregateShiftAnalytics((shifts || []) as AnalyticsShift[], calendarRange.days);
  } catch (err) {
    logger.error('fetchAnalyticsDataClientSide', err);
    return { daily: calendarRange.days, totals };
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
