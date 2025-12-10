import { supabase } from '../core/api.js';
import { showLoadingMessage, showErrorMessage } from '../ui/ui.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';
import { calculationEngine, CALCULATION_SCOPES } from '../utils/calculation-engine.js';
import { loadDashboardConfig, saveDashboardConfig, KPI_CATALOG } from './dashboard-config.js';

// ------------------------------------------------------------------
// DASHBOARD MAIN FUNCTION
// ------------------------------------------------------------------
export async function showDashboard(container, stationId = null, checkActiveFn = null) {
    showLoadingMessage(container);

    try {
        // ------------------------------------------------------------------
        // PARALLEL DATA FETCHING
        // ------------------------------------------------------------------
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const [
            stationsRes,
            operatorsRes,
            closuresRes,
            tanksRes,
            todayClosuresRes
        ] = await Promise.all([
            // 1. Stations Count
            stationId
                ? supabase.from('fuel_stations').select('*', { count: 'exact', head: true }).eq('station_id', stationId)
                : supabase.from('fuel_stations').select('*', { count: 'exact', head: true }),

            // 2. Operators Count
            stationId
                ? supabase.from('user_stations').select('*', { count: 'exact', head: true }).eq('station_id', stationId)
                : supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'operator'),

            // 3. Closures Count
            stationId
                ? supabase.from('shifts').select('*', { count: 'exact', head: true }).eq('station_id', stationId)
                : supabase.from('shifts').select('*', { count: 'exact', head: true }),

            // 4. Tanks List
            (async () => {
                let q = supabase.from('tanks').select('id, name, fuel_type, capacity, station_id, fuel_stations(station_name)');
                if (stationId) q = q.eq('station_id', stationId);
                return q.order('name');
            })(),

            // 5. Today's Closures (for Sales & Liters)
            (async () => {
                let q = supabase
                    .from('shifts')
                    .select('closing_data')
                    .gte('closed_at', startOfDay.toISOString())
                    .lte('closed_at', endOfDay.toISOString())
                    .eq('status', 'closed');
                if (stationId) q = q.eq('station_id', stationId);
                return q;
            })()
        ]);

        // EXTRACT RESULTS
        const stationsCount = stationsRes.count || 0;
        const operatorsCount = operatorsRes.count || 0;
        const closuresCount = closuresRes.count || 0;
        const tanks = tanksRes.data || [];
        const todayClosures = todayClosuresRes.data || [];

        // RACE CONDITION CHECK (Early)
        if (checkActiveFn && !checkActiveFn()) return;

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

            const latestByTank = {};
            if (tankReadings) {
                for (const r of tankReadings) {
                    if (!latestByTank[r.tank_id]) {
                        latestByTank[r.tank_id] = r;
                    }
                }
            }

            tanks.forEach(t => {
                const latest = latestByTank[t.id];
                const liters = latest?.liters ?? 0;
                const capacity = t.capacity || 0;
                const levelPerc = capacity > 0 ? Math.max(0, Math.min(100, (liters / capacity) * 100)) : 0;

                let levelClass = 'tank-level-ok';
                let statusLabel = '(OK)';
                if (levelPerc < 10) {
                    levelClass = 'tank-level-crit';
                    statusLabel = '(CRIT)';
                } else if (levelPerc < 30) {
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
            tanksHtmlRows = `<tr><td colspan="4">Nessuna cisterna configurata o trovata per questo filtro.</td></tr>`;
        }

        // ------------------------------------------------------------------
        // PROCESS KPI DATA (Sales & Liters)
        // ------------------------------------------------------------------
        let vendutoDataValue = 0;
        let totalLitriBenzina = 0;
        let totalLitriGasolio = 0;

        if (Array.isArray(todayClosures)) {
            todayClosures.forEach(item => {
                const closingData = item?.closing_data || {};
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
                calculationEngine.run(CALCULATION_SCOPES.KPI_VENDUTO, {
                    stationsCount,
                    operatorsCount,
                    closuresCount,
                    salesEuro: vendutoDataValue,
                    fallback: vendutoDataValue,
                    timestamp: Date.now()
                }, { forceRefresh: false }),

                calculationEngine.run(CALCULATION_SCOPES.KPI_EROGATO, {
                    erogatoData: erogatoKpiDataInput,
                    totalLitriBenzina,
                    totalLitriGasolio,
                    fallback: erogatoKpiDataInput
                }, { forceRefresh: false })
            ]);

            // Assign Venduto
            if (typeof kpiVendutoRes === 'number') {
                vendutoKpiValue = kpiVendutoRes;
            } else if (kpiVendutoRes && typeof kpiVendutoRes === 'object' && typeof kpiVendutoRes.value === 'number') {
                vendutoKpiValue = kpiVendutoRes.value;
            }

            // Assign Erogato
            if (kpiErogatoRes && typeof kpiErogatoRes === 'object') {
                erogatoKpiData = {
                    litriBenzina: kpiErogatoRes.litriBenzina ?? totalLitriBenzina,
                    litriGasolio: kpiErogatoRes.litriGasolio ?? totalLitriGasolio,
                    totale: (kpiErogatoRes.litriBenzina ?? totalLitriBenzina) + (kpiErogatoRes.litriGasolio ?? totalLitriGasolio)
                };
            }

        } catch (calcErr) {
            console.warn('Errore calcoli KPI (usando fallback):', calcErr);
        }

        // ------------------------------------------------------------------
        // LOAD USER DASHBOARD CONFIGURATION
        // ------------------------------------------------------------------
        const dashboardConfig = await loadDashboardConfig();

        // Build KPI data object
        const kpiData = {
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

        // Render KPI cards dynamically
        const kpiHtml = renderKpiCards(dashboardConfig, kpiData);

        // RACE CONDITION CHECK: Stop if user switched tab
        if (checkActiveFn && !checkActiveFn()) return;


        container.innerHTML = `
      <section id="dashboard-kpi-grid" class="dashboard-grid" style="grid-template-columns: repeat(${dashboardConfig.gridColumns || 4}, 1fr);">
        ${kpiHtml}
      </section>

      <section class="dashboard-panels" id="dashboard-container">
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

        <article class="panel-card" id="panel-sales">
          <h3 class="panel-title">Andamento Vendite</h3>
          <p class="panel-subtitle">Trend vendite giornaliere per distributore (valore in €).</p>
          <div class="prices-chart-wrapper">
            <canvas id="sales-trend-chart"></canvas>
          </div>
        </article>
      </section>
    `;

        // Initialize Sortable for dashboard grid
        const gridEl = document.getElementById('dashboard-kpi-grid');
        if (gridEl && window.Sortable) {
            new Sortable(gridEl, {
                animation: 200,
                ghostClass: 'kpi-card-ghost',
                onEnd: async function () {
                    const newOrderIds = Array.from(gridEl.children).map(el => el.dataset.kpiId);

                    // Get all items in current config
                    const allItems = [...dashboardConfig.kpiLayout];

                    // Update order for visible items found in DOM
                    newOrderIds.forEach((id, index) => {
                        const itemIndex = allItems.findIndex(k => k.id === id);
                        if (itemIndex !== -1) {
                            allItems[itemIndex].order = index;
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
            initDashboardPanelsDrag();
        });

        // Popola grafico vendite per distributore se Chart.js è disponibile
        if (window.Chart) {
            await renderSalesChart(stationId);
        }
    } catch (err) {
        showErrorMessage(container, err);
    }
}

// ------------------------------------------------------------------
// HELPERS (Internal)
// ------------------------------------------------------------------

async function renderSalesChart(stationId) {
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

    if (stationId) closuresQuery = closuresQuery.eq('station_id', stationId);

    closuresQuery = closuresQuery.order('closed_at', { ascending: true });

    const { data: closuresData } = await closuresQuery;

    // Recupera tutti i distributori (o solo quello filtrato)
    let stationsQuery = supabase
        .from('fuel_stations')
        .select('station_id, station_name')
        .order('station_name');

    if (stationId) stationsQuery = stationsQuery.eq('station_id', stationId);

    const { data: allStations } = await stationsQuery;

    // Raggruppa vendite per data e distributore
    const salesByDateAndStation = {};
    const allDates = new Set();

    if (closuresData) {
        closuresData.forEach(closure => {
            if (!closure.closed_at || !closure.closing_data) return;

            const day = new Date(closure.closed_at).toISOString().substring(0, 10);
            allDates.add(day);

            const stationId = closure.station_id;
            const ricavo = Number(closure.closing_data?.ricavo_teorico || 0);

            if (!salesByDateAndStation[day]) {
                salesByDateAndStation[day] = {};
            }

            if (!salesByDateAndStation[day][stationId]) {
                salesByDateAndStation[day][stationId] = 0;
            }

            salesByDateAndStation[day][stationId] += ricavo;
        });
    }

    // Ordina le date
    const sortedDates = Array.from(allDates).sort();

    // Colori per le linee (puoi aggiungere più colori se hai molti distributori)
    const colors = [
        '#8DC63F', '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'
    ];

    // Crea un dataset per ogni distributore
    const datasets = [];
    if (allStations) {
        allStations.forEach((station, index) => {
            const stationId = station.station_id;
            const stationName = station.station_name || `Distributore ${stationId}`;

            // Crea array di vendite per questo distributore per ogni data
            const salesData = sortedDates.map(date => {
                return salesByDateAndStation[date]?.[stationId] || 0;
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

    const ctx = document.getElementById('sales-trend-chart');
    if (ctx) {
        // Destroy existing chart if needed? (Usually new Chart() handles or overwrites, but better to check)
        // Chart.js 2.x/3.x: Reuse canvas?
        // Since we re-rendered the container innerHTML, the canvas is fresh.

        new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates.map(d => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })),
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
                            label: function (context) {
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
                            callback: function (value) {
                                return '€ ' + value.toFixed(0);
                            }
                        }
                    }
                }
            }
        });
    }
}


function renderKpiCards(config, kpiData) {
    if (!config || !config.kpiLayout || !Array.isArray(config.kpiLayout)) {
        return '';
    }

    return config.kpiLayout
        .filter(kpi => kpi.visible !== false) // Only show visible KPIs
        .sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by order
        .map(kpi => {
            const kpiMeta = KPI_CATALOG[kpi.id];
            const kpiValue = kpiData[kpi.id];

            if (!kpiMeta || !kpiValue) return '';

            const sizeClass = `kpi-size-${kpi.size || '1x1'}`;

            return `
        <article class="kpi-card ${sizeClass}" data-kpi-id="${kpi.id}">
          <div class="kpi-row">
            <div class="kpi-icon"><i class="fas ${kpiMeta.icon}"></i></div>
          </div>
          <p class="kpi-title">${kpiMeta.title}</p>
          <p class="kpi-value">${kpiValue.value}</p>
          <p class="kpi-sub">${kpiValue.subtitle}</p>
        </article>
      `;
        })
        .join('');
}

// ------------------------------------------------------------------
// DRAG & DROP FOR PANELS (Replaces Split.js)
// ------------------------------------------------------------------
function initDashboardPanelsDrag() {
    const container = document.getElementById('dashboard-container');
    if (!container || !window.Sortable) return;

    // 1. Initialize Sortable (Drag & Drop)
    new Sortable(container, {
        animation: 250,
        handle: '.panel-title', // Drag only by title
        ghostClass: 'panel-ghost',
        onEnd: function (evt) {
            saveDashboardState();
        }
    });

    // 2. Initialize Resize Saving
    // Use ResizeObserver to save size changes
    const resizeObserver = new ResizeObserver(entries => {
        // Debounce saving
        if (window.dashboardResizeTimeout) clearTimeout(window.dashboardResizeTimeout);
        window.dashboardResizeTimeout = setTimeout(() => {
            saveDashboardState();
        }, 500);
    });

    Array.from(container.children).forEach(panel => {
        resizeObserver.observe(panel);
    });

    restoreDashboardState();
}

function saveDashboardState() {
    const container = document.getElementById('dashboard-container');
    if (!container) return;

    const state = Array.from(container.children).map(el => ({
        id: el.id,
        width: el.style.width,
        height: el.style.height,
        flex: el.style.flex // Save flex state if native resize alters it or if we switched to absolute sizes
    }));

    localStorage.setItem('dashboard_panels_state', JSON.stringify(state));
}

function restoreDashboardState() {
    const container = document.getElementById('dashboard-container');
    const savedState = JSON.parse(localStorage.getItem('dashboard_panels_state'));

    if (savedState && Array.isArray(savedState)) {
        // Restore Order
        savedState.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                container.appendChild(el); // Appending moves to end -> restore order

                // Restore Size
                if (item.width) el.style.width = item.width;
                if (item.height) el.style.height = item.height;
                // If native resize was used, it sets inline width/height.
                // We might need to reset flex if it conflicts.
                if (item.width || item.height) {
                    el.style.flex = 'none'; // Disable flex sizing to obey strict width
                }
            }
        });
    }
}
