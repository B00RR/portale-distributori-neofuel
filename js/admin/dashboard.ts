import { supabase } from '../core/api.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { DEFAULT_BUSINESS_RULES } from '../core/business-rules-schema.js';
import { logger } from '../core/logger.js';
import { getStations } from '../core/stations-cache.js';
import { showLoadingMessage, showErrorMessage } from '../ui/ui.js';
import { calculationEngine, CALCULATION_SCOPES } from '../utils/calculation-engine.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';
import { ensureChart, ensureSortable } from '../vendor/lazy.js';

import { createItalianCalendarRange } from './analytics-aggregation.js';
import {
  fetchAnalyticsData,
  renderRevenueChart,
  renderVolumeChart,
  renderPaymentChart,
  renderFuelMixChart
} from './dashboard-charts.js';
import { loadDashboardConfig, saveDashboardConfig } from './dashboard-config.js';
import { renderKpiCards, KPIData } from './dashboard-helpers.js';

// window.Chart e window.Sortable sono dichiarati (opzionali) in js/vendor/lazy.ts (#343).
declare global {
  interface Window {
    dashboardResizeTimeout: ReturnType<typeof setTimeout>;
  }
}

// Row shapes used locally. The generated DB types don't reliably model these
// joined queries (see CLAUDE.md: repo types can lag the live DB), so the query
// results are asserted to these minimal shapes.
interface DashboardTank {
  id: number;
  capacity?: number | null;
  fuel_type?: string | null;
  station_id?: number | null;
  fuel_stations?: { station_name?: string | null } | null;
}
interface TankReading {
  tank_id: number | null;
  liters?: number | null;
  created_at: string;
}

// ------------------------------------------------------------------
// DASHBOARD MAIN FUNCTION
// ------------------------------------------------------------------

let salesChart: { destroy: () => void } | null = null;

export type CheckActiveFunction = () => boolean;

export async function showDashboard(
  container: HTMLElement,
  stationId: string | number | null = null,
  checkActiveFn: CheckActiveFunction | null = null
): Promise<void> {
  const numericStationId = stationId ? Number(stationId) : null;
  showLoadingMessage(container);

  try {
    // ------------------------------------------------------------------
    // PARALLEL DATA FETCHING
    // ------------------------------------------------------------------
    const todayRange = createItalianCalendarRange('1d');

    const [stationsRes, operatorsRes, closuresRes, tanksRes, todayClosuresRes, businessRules] =
      await Promise.all([
        // 1. Stations Count
        numericStationId
          ? supabase
              .from('fuel_stations')
              .select('*', { count: 'exact', head: true })
              .eq('station_id', numericStationId)
          : supabase.from('fuel_stations').select('*', { count: 'exact', head: true }),

        // 2. Operators Count
        numericStationId
          ? supabase
              .from('user_stations')
              .select('*', { count: 'exact', head: true })
              .eq('station_id', numericStationId)
          : supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .eq('role', 'operator'),

        // 3. Closures Count
        numericStationId
          ? supabase
              .from('shifts')
              .select('*', { count: 'exact', head: true })
              .eq('station_id', numericStationId)
          : supabase.from('shifts').select('*', { count: 'exact', head: true }),

        // 4. Tanks List
        (async () => {
          let q = supabase
            .from('tanks')
            .select('id, name, fuel_type, capacity, station_id, fuel_stations(station_name)');
          if (numericStationId) {
            q = q.eq('station_id', numericStationId);
          }
          return q.order('name');
        })(),

        // 5. Today's Closures (for Sales & Liters)
        (async () => {
          let q = supabase
            .from('shifts')
            .select('closing_data')
            .gte('closed_at', todayRange.startIso)
            .lt('closed_at', todayRange.endExclusiveIso)
            .eq('status', 'closed');
          if (numericStationId) {
            q = q.eq('station_id', numericStationId);
          }
          return q;
        })(),

        // 6. Business Rules
        BusinessLogicManager.loadRules().catch(err => {
          logger.warn('dashboard', 'Failed to load rules, using defaults', err);
          return DEFAULT_BUSINESS_RULES;
        })
      ]);

    // EXTRACT RESULTS
    const stationsCount = stationsRes.count || 0;
    const operatorsCount = operatorsRes.count || 0;
    const closuresCount = closuresRes.count || 0;
    const tanks = (tanksRes.data || []) as DashboardTank[];
    const todayClosures = todayClosuresRes.data || [];

    // RACE CONDITION CHECK (Early)
    if (checkActiveFn && !checkActiveFn()) {
      return;
    }

    // ------------------------------------------------------------------
    // PROCESS TANKS (Parallel Readings Fetch)
    // ------------------------------------------------------------------
    let tanksHtmlRows = '';
    if (tanks.length > 0) {
      const tankIds = tanks.map(t => t.id);

      // Fetch last 7 days of readings for these tanks to limit data size.
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: tankReadings } = await supabase
        .from('tank_readings')
        .select('*')
        .in('tank_id', tankIds)
        .gte('created_at', sevenDaysAgo.toISOString()) // LIMIT HISTORY
        .order('created_at', { ascending: false });

      const latestByTank: Record<number, TankReading> = {};
      for (const r of (tankReadings || []) as TankReading[]) {
        if (r.tank_id === null) {
          continue;
        }
        if (!latestByTank[r.tank_id]) {
          latestByTank[r.tank_id] = r;
        }
      }

      tanks.forEach(t => {
        const latest = latestByTank[t.id];
        const liters = latest?.liters ?? 0;
        const capacity = t.capacity || 0;
        const levelPerc = capacity > 0 ? Math.max(0, Math.min(100, (liters / capacity) * 100)) : 0;

        let levelClass = 'tank-level-ok';
        let statusLabel = '(OK)';

        // Logic based on dynamic business rule (fuel_reserve_alert_liters)
        // If liters < businessRules.fuel_reserve_alert_liters => CRIT
        // If liters < businessRules.fuel_reserve_alert_liters * 1.5 => LOW (pre-warning)
        if (liters < businessRules.fuel_reserve_alert_liters) {
          levelClass = 'tank-level-crit';
          statusLabel = '(CRIT)';
        } else if (liters < businessRules.fuel_reserve_alert_liters * 1.5) {
          levelClass = 'tank-level-low';
          statusLabel = '(LOW)';
        }

        const stationName = t.fuel_stations?.station_name || `Stazione #${t.station_id}`;

        tanksHtmlRows += `
          <tr>
            <td>${escapeHtml(stationName)}</td>
            <td>${escapeHtml(t.fuel_type || '')}</td>
            <td>
              <div class="tank-level-bar">
                <div class="tank-level-bar-inner ${levelClass}" style="width:${levelPerc.toFixed(0)}%;"></div>
              </div>
              <div class="tank-level-meta">${levelPerc.toFixed(0)}% ${statusLabel}</div>
            </td>
            <td>${latest ? escapeHtml(new Date(latest.created_at).toLocaleString('it-IT')) : '-'}</td>
          </tr>
        `;
      });
    } else {
      tanksHtmlRows =
        '<tr><td colspan="4">Nessuna cisterna configurata o trovata per questo filtro.</td></tr>';
    }

    // ------------------------------------------------------------------
    // PROCESS KPI DATA (Sales & Liters)
    // ------------------------------------------------------------------
    let vendutoDataValue = 0;
    let totalLitriBenzina = 0;
    let totalLitriGasolio = 0;

    if (Array.isArray(todayClosures)) {
      todayClosures.forEach(item => {
        const closingData = (item?.closing_data || {}) as Record<string, unknown>;
        // Sales
        vendutoDataValue += Number(closingData.ricavo_teorico || 0);
        // Liters
        totalLitriBenzina += Number(closingData.litri_benzina || 0);
        totalLitriGasolio += Number(closingData.litri_gasolio || 0);
      });
    }

    // Prepare Calculation Engine Inputs
    const erogatoKpiDataInput = {
      litriBenzina: totalLitriBenzina,
      litriGasolio: totalLitriGasolio,
      totale: totalLitriBenzina + totalLitriGasolio
    };

    // Run Calculations Parallel
    let vendutoKpiValue = vendutoDataValue;
    let erogatoKpiData = { ...erogatoKpiDataInput };

    try {
      const [kpiVendutoRes, kpiErogatoRes] = await Promise.all([
        calculationEngine.run(
          CALCULATION_SCOPES.KPI_VENDUTO,
          {
            stationsCount,
            operatorsCount,
            closuresCount,
            salesEuro: vendutoDataValue,
            fallback: vendutoDataValue,
            timestamp: Date.now()
          },
          { forceRefresh: false }
        ),

        calculationEngine.run(
          CALCULATION_SCOPES.KPI_EROGATO,
          {
            erogatoData: erogatoKpiDataInput,
            totalLitriBenzina,
            totalLitriGasolio,
            fallback: erogatoKpiDataInput
          },
          { forceRefresh: false }
        )
      ]);

      // Assign Venduto
      if (typeof kpiVendutoRes === 'number') {
        vendutoKpiValue = kpiVendutoRes;
      } else if (kpiVendutoRes && typeof kpiVendutoRes === 'object') {
        const value = (kpiVendutoRes as Record<string, unknown>).value;
        if (typeof value === 'number') {
          vendutoKpiValue = value;
        }
      }

      // Assign Erogato
      if (kpiErogatoRes && typeof kpiErogatoRes === 'object') {
        const erogato = kpiErogatoRes as Record<string, number | undefined>;
        const litriBenzina = erogato.litriBenzina ?? totalLitriBenzina;
        const litriGasolio = erogato.litriGasolio ?? totalLitriGasolio;
        erogatoKpiData = {
          litriBenzina,
          litriGasolio,
          totale: litriBenzina + litriGasolio
        };
      }
    } catch (calcErr) {
      logger.warn('dashboard', 'Errore calcoli KPI (usando fallback):', calcErr);
    }

    // ------------------------------------------------------------------
    // LOAD USER DASHBOARD CONFIGURATION
    // ------------------------------------------------------------------
    const dashboardConfig = await loadDashboardConfig();

    // Build KPI data object
    const kpiData: KPIData = {
      venduto: {
        value: vendutoKpiValue ? formatEuro(vendutoKpiValue) : '€ 0',
        subtitle: '+0% vs ieri'
      },
      erogato: {
        value: `${(erogatoKpiData.totale || 0).toFixed(2)} L`,
        subtitle: `${(erogatoKpiData.litriBenzina || 0).toFixed(2)} L Benzina / ${(erogatoKpiData.litriGasolio || 0).toFixed(2)} L Gasolio`
      },
      stazioni: {
        value: `${stationsCount || 0}`,
        subtitle: `${operatorsCount || 0} operatori attivi`
      },
      alert: {
        value: `${closuresCount || 0}`,
        subtitle: 'Chiusure registrate'
      }
    };

    // ... (imports remain)

    // Render KPI cards dynamically (Now includes charts placeholders)
    const kpiHtml = renderKpiCards(dashboardConfig, kpiData);

    // RACE CONDITION CHECK: Stop if user switched tab
    if (checkActiveFn && !checkActiveFn()) {
      return;
    }

    setSafeHTML(
      container,
      `
      <section id="dashboard-kpi-grid" class="dashboard-grid" style="grid-template-columns: repeat(${dashboardConfig.gridColumns || 4}, 1fr);">
        ${kpiHtml}
      </section>

      <section class="dashboard-panels" id="dashboard-container">
        <!-- Panels omitted for brevity as they are appended below -->
        <article class="panel-card" id="panel-tanks">
          <h3 class="panel-title">Stato Cisterne Rete in Tempo Reale</h3>
          <p class="panel-subtitle">Panoramica livelli percentuali su tutte le stazioni.</p>
          <div class="table-responsive" style="box-shadow:none; border:none; background:transparent;">
            <table class="tanks-table">
              <thead>
                <tr>
                  <th>Stazione</th>
                  <th>Carburante</th>
                  <th>Livello %</th>
                  <th>Ultimo Agg.</th>
                </tr>
              </thead>
              <tbody>
                ${tanksHtmlRows}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    `
    );

    // ------------------------------------------------------------------
    // RENDER ANALYTICS CHARTS (If present in grid)
    // ------------------------------------------------------------------
    const visibleKpis = dashboardConfig.kpiLayout.filter(k => k.visible !== false).map(k => k.id);
    const hasCharts = visibleKpis.some(id =>
      ['andamento_ricavi', 'volume_erogato', 'metodi_pagamento', 'mix_carburanti'].includes(id)
    );

    if (hasCharts) {
      // Fetch only if needed; Chart.js viene caricato on-demand (#343)
      Promise.all([fetchAnalyticsData(numericStationId), ensureChart()])
        .then(([analyticsData]) => {
          if (visibleKpis.includes('andamento_ricavi')) {
            renderRevenueChart(analyticsData, 'chart-andamento_ricavi');
          }
          if (visibleKpis.includes('volume_erogato')) {
            renderVolumeChart(analyticsData, 'chart-volume_erogato');
          }
          if (visibleKpis.includes('metodi_pagamento')) {
            renderPaymentChart(analyticsData, 'chart-metodi_pagamento');
          }
          if (visibleKpis.includes('mix_carburanti')) {
            renderFuelMixChart(analyticsData, 'chart-mix_carburanti');
          }
          return analyticsData;
        })
        .catch(err =>
          logger.error('dashboard', 'Errore nel rendering dei grafici analytics:', err)
        );
    }

    // Initialize Sortable for dashboard grid (caricato on-demand, #343)
    const gridEl = document.getElementById('dashboard-kpi-grid');
    if (gridEl) {
      await ensureSortable().catch((err: unknown) =>
        logger.error('dashboard', 'Sortable load failed', err)
      );
    }
    if (gridEl && window.Sortable) {
      new window.Sortable(gridEl, {
        animation: 200,
        ghostClass: 'kpi-card-ghost',
        onEnd: async function () {
          const newOrderIds = Array.from(gridEl.children).map(
            el => (el as HTMLElement).dataset.kpiId
          );

          // Get all items in current config
          const allItems = [...dashboardConfig.kpiLayout];

          // Update order for visible items found in DOM
          newOrderIds.forEach((id, index) => {
            const layoutItem = allItems.find(k => k.id === id);
            if (layoutItem) {
              layoutItem.order = index;
            }
          });

          dashboardConfig.kpiLayout = allItems;

          // Save to DB
          await saveDashboardConfig(dashboardConfig);
        }
      });
    }

    // Activate Panels Drag & Drop
    requestAnimationFrame(() => {
      void initDashboardPanelsDrag();
    });

    // Popola grafico vendite per distributore; Chart.js caricato on-demand (#343)
    const salesChartLib = await ensureChart().catch((err: unknown) => {
      logger.error('dashboard', 'Chart.js load failed', err);
      return null;
    });
    if (salesChartLib) {
      await renderSalesChart(stationId);
    }
  } catch (err) {
    showErrorMessage(container, err);
  }
}

// ------------------------------------------------------------------
// HELPERS (Internal)
// ------------------------------------------------------------------

async function renderSalesChart(stationId: string | number | null): Promise<void> {
  const numericStationId = stationId ? Number(stationId) : null;

  // Recupera le chiusure degli ultimi 30 giorni
  const daysBack = 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  startDate.setHours(0, 0, 0, 0);

  let closuresQuery = supabase
    .from('shifts')
    .select('id, station_id, closed_at, closing_data, fuel_stations(station_name)')
    .gte('closed_at', startDate.toISOString())
    .eq('status', 'closed');

  if (numericStationId) {
    closuresQuery = closuresQuery.eq('station_id', numericStationId);
  }

  closuresQuery = closuresQuery.order('closed_at', { ascending: true });

  const { data: closuresData } = await closuresQuery;

  // Recupera tutti i distributori (o solo quello filtrato) dalla sorgente
  // unica (#349): il filtro è applicato client-side sulla lista canonica,
  // così non esistono indici `stations_filtered_<id>` che possono divergere.
  const stationRows = await getStations();
  const allStations = numericStationId
    ? stationRows.filter(st => st.station_id === numericStationId)
    : [...stationRows].sort((a, b) => a.station_name.localeCompare(b.station_name));

  // Raggruppa vendite per data e distributore
  const salesByDateAndStation = new Map<string, Map<number, number>>();
  const allDates = new Set<string>();

  if (closuresData) {
    closuresData.forEach(closure => {
      if (!closure.closed_at || !closure.closing_data) {
        return;
      }

      const day = new Date(closure.closed_at).toISOString().substring(0, 10);
      allDates.add(day);

      const sId = Number(closure.station_id);
      const ricavo = Number(
        (closure.closing_data as Record<string, unknown> | null)?.ricavo_teorico || 0
      );

      let dayMap = salesByDateAndStation.get(day);
      if (!dayMap) {
        dayMap = new Map<number, number>();
        salesByDateAndStation.set(day, dayMap);
      }
      dayMap.set(sId, (dayMap.get(sId) || 0) + ricavo);
    });
  }

  // Ordina le date
  const sortedDates = Array.from(allDates).sort();

  // Colori per le linee (allineati alla palette Neofuel + colori di estensione per dati multipli)
  const colors = [
    '#8DC63F', // accent-color (verde lime)
    '#10b981', // success-color
    '#3b82f6', // info-color
    '#FFA500', // warning-color
    '#FF4136', // danger-color
    '#8b5cf6', // viola (estensione dati)
    '#ec4899', // rosa (estensione dati)
    '#06b6d4', // ciano (estensione dati)
    '#84cc16', // lime (estensione dati)
    '#f97316' // arancio (estensione dati)
  ];

  // Crea un dataset per ogni distributore
  const datasets: Record<string, unknown>[] = [];
  if (allStations) {
    allStations.forEach((station, index) => {
      const sId = station.station_id;
      const stationName = station.station_name || `Distributore ${sId}`;

      // Crea array di vendite per questo distributore per ogni data
      const salesData = sortedDates.map(date => {
        return salesByDateAndStation.get(date)?.get(Number(sId)) || 0;
      });

      // Aggiungi solo se ci sono vendite (almeno un valore > 0)
      if (salesData.some(v => v > 0)) {
        datasets.push({
          label: stationName,
          data: salesData,
          borderColor: colors[index % colors.length],
          backgroundColor: colors[index % colors.length] + '20',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2.5,
          fill: false
        });
      }
    });
  }

  const ctx = document.getElementById('sales-trend-chart') as HTMLCanvasElement;
  const ChartLib = window.Chart;
  if (ctx && ChartLib) {
    if (salesChart) {
      salesChart.destroy();
      salesChart = null;
    }
    salesChart = new ChartLib(ctx, {
      type: 'line',
      data: {
        labels: sortedDates.map(d =>
          new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
        ),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 8,
              font: { size: 10 }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context: { dataset: { label?: string }; parsed: { y: number } }) {
                return context.dataset.label + ': € ' + context.parsed.y.toFixed(2);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.2)' },
            ticks: {
              font: { size: 10 },
              callback: function (value: number) {
                return '€ ' + value.toFixed(0);
              }
            }
          }
        }
      }
    });
  }
}

// ------------------------------------------------------------------
// DRAG & DROP FOR PANELS (Replaces Split.js)
// ------------------------------------------------------------------
async function initDashboardPanelsDrag(): Promise<void> {
  const container = document.getElementById('dashboard-container');
  if (!container) {
    return;
  }
  const Sortable = await ensureSortable().catch((err: unknown) => {
    logger.error('dashboard', 'Sortable load failed', err);
    return null;
  });
  if (!Sortable) {
    return;
  }

  // 1. Initialize Sortable (Drag & Drop)
  new Sortable(container, {
    animation: 250,
    handle: '.panel-title', // Drag only by title
    ghostClass: 'panel-ghost',
    onEnd: function () {
      saveDashboardState();
    }
  });

  // 2. Initialize Resize Saving
  // Use ResizeObserver to save size changes
  const resizeObserver = new ResizeObserver(() => {
    // Debounce saving
    if (window.dashboardResizeTimeout) {
      clearTimeout(window.dashboardResizeTimeout);
    }
    window.dashboardResizeTimeout = setTimeout(() => {
      saveDashboardState();
    }, 500);
  });

  Array.from(container.children).forEach(panel => {
    resizeObserver.observe(panel);
  });

  restoreDashboardState();
}

function saveDashboardState(): void {
  const container = document.getElementById('dashboard-container');
  if (!container) {
    return;
  }

  const state = Array.from(container.children).map(el => ({
    id: el.id,
    width: (el as HTMLElement).style.width,
    height: (el as HTMLElement).style.height,
    flex: (el as HTMLElement).style.flex // Save flex state if native resize alters it or if we switched to absolute sizes
  }));

  localStorage.setItem('dashboard_panels_state', JSON.stringify(state));
}

function restoreDashboardState(): void {
  const container = document.getElementById('dashboard-container');
  const savedStateStr = localStorage.getItem('dashboard_panels_state');
  const savedState = savedStateStr ? JSON.parse(savedStateStr) : null;

  if (container && savedState && Array.isArray(savedState)) {
    // Restore Order
    savedState.forEach((item: { id?: string; width?: string; height?: string }) => {
      const el = item.id ? document.getElementById(item.id) : null;
      if (el) {
        container.appendChild(el); // Appending moves to end -> restore order

        // Restore Size
        if (item.width) {
          el.style.width = item.width;
        }
        if (item.height) {
          el.style.height = item.height;
        }
        // If native resize was used, it sets inline width/height.
        // We might need to reset flex if it conflicts.
        if (item.width || item.height) {
          el.style.flex = 'none'; // Disable flex sizing to obey strict width
        }
      }
    });
  }
}
