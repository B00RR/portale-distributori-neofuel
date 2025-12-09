// ==========================================
// ADMIN AREA
// ==========================================
import { supabase, safeSupabaseQuery, getStationName } from "./api.js";
import {
  initAdminContent, showLoadingMessage, showErrorMessage,
  openModal, closeModal, showInfoModal, openConfirmModal
} from "./ui.js";
import {
  escapeHtml, escapeNumber, formatNumberIt, formatLitri,
  parseNumberFlexible, slugifyLabel, formatEuro
} from "./utils.js";
import {
  fetchClosureExportData, buildClosureTemplate,
  generateClosureExcel,
  applyCustomExportSchema,
  readExportSummaryValues
} from "./export.js";
import { loggedUser, clearSession } from "./auth.js";
import { showIslandsModal } from "./admin-islands.js";
import { showSettingsTab } from "./admin-logic.js";
import { calculationEngine, CALCULATION_SCOPES } from "./calculation-engine.js";

// Stato locale admin
let currentAdminTab = 'dashboard';
let currentStationFilter = null; // null = Tutte le stazioni

async function renderGlobalFilter() {
  const container = document.getElementById('header-actions');
  if (!container) return;

  // Carica stazioni per il filtro
  const { data: stations } = await safeSupabaseQuery(() => supabase.from('fuel_stations').select('station_id, station_name').order('station_name'));

  const options = stations || [];

  container.innerHTML = `
    <div class="global-filter-wrapper">
      <i class="fas fa-filter filter-icon"></i>
      <select id="global-station-filter" class="global-filter-select">
        <option value="">Tutte le Stazioni</option>
        ${options.map(s => `<option value="${s.station_id}" ${currentStationFilter == s.station_id ? 'selected' : ''}>${escapeHtml(s.station_name)}</option>`).join('')}
      </select>
    </div>
  `;

  document.getElementById('global-station-filter').addEventListener('change', (e) => {
    const val = e.target.value;
    currentStationFilter = val ? parseInt(val) : null;
    // Ricarica la tab corrente con il nuovo filtro
    loadAdminTab(currentAdminTab);
  });
}


export function showAdminArea() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  mainContent.innerHTML = `
    <div class="admin-container">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <p class="sidebar-subtitle">Control Center</p>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-btn active" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
          <button class="nav-btn" data-tab="stations"><i class="fas fa-gas-pump"></i> Distributori</button>
          <button class="nav-btn" data-tab="operators"><i class="fas fa-users"></i> Operatori</button>
          <button class="nav-btn" data-tab="shifts"><i class="fas fa-file-invoice-dollar"></i> Chiusure</button>
          <button class="nav-btn" data-tab="crediti"><i class="fas fa-credit-card"></i> Crediti</button>
          <button class="nav-btn" data-tab="invoices"><i class="fas fa-file-invoice"></i> Fatture</button>
          <button class="nav-btn" data-tab="vouchers"><i class="fas fa-ticket-alt"></i> Voucher</button>
          <button class="nav-btn" data-tab="notifiche"><i class="fas fa-bell"></i> Notifiche</button>
          <button class="nav-btn" data-tab="settings"><i class="fas fa-cog"></i> Impostazioni</button>
          <button class="nav-btn logout-btn" id="admin-logout"><i class="fas fa-sign-out-alt"></i> Esci</button>
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-footer-avatar">
            <i class="fas fa-user-shield"></i>
          </div>
          <div class="sidebar-footer-meta">
            <span class="sidebar-footer-role">Admin User</span>
            <span class="sidebar-footer-name">${escapeHtml(loggedUser?.full_name || 'Amministratore')}</span>
          </div>
        </div>
      </aside>
      <main class="admin-main">
        <header class="admin-header">
          <div class="admin-header-center">
            <img src="logo svg.svg" alt="Neofuel" class="admin-header-logo" />
            <p class="welcome-subtitle" id="page-subtitle">Dashboard</p>
          </div>
          <div class="admin-header-right">
            <div id="header-actions" class="header-actions"></div>
            <button class="header-icon-btn" type="button" title="Notifiche">
              <i class="fas fa-bell"></i>
            </button>
          </div>
        </header>
        <div id="admin-content" class="admin-content-area">
          <!-- Contenuto dinamico -->
        </div>
      </main>
    </div>
  `;

  // Event listeners sidebar
  const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      loadAdminTab(tab);
    });
  });

  document.getElementById('admin-logout').addEventListener('click', async () => {
    if (confirm('Sei sicuro di voler uscire?')) {
      await clearSession();
      // Attendi un momento per assicurarsi che la sessione sia stata pulita
      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.href = window.location.pathname;
    }
  });

  // Carica tab iniziale
  renderGlobalFilter();
  loadAdminTab('dashboard');
}

async function loadAdminTab(tab) {
  currentAdminTab = tab;
  const pageSubtitle = document.getElementById('page-subtitle');
  const headerActions = document.getElementById('header-actions');
  const content = document.getElementById('admin-content');

  // Reset header actions but preserve the global filter
  // We need to re-render the filter because header-actions is often cleared
  // OR we should move the filter out of header-actions.
  // Given current structure, let's re-render or better, separate the container.
  // Actually, renderGlobalFilter targets 'header-actions'.
  // If we clear 'header-actions', we kill the filter.
  // CHANGE: Let's modify rendered HTML structure in showAdminArea or here.
  // Current showAdminArea:
  // <div class="admin-header-right">
  //   <div id="header-actions" class="header-actions"></div>
  //   ...
  // </div>

  // If we clear headerActions, we lose the filter if it was inside.
  // Quick fix: renderGlobalFilter puts it in a new container, OR we re-render it every time.
  // Let's re-render it every time for now, it's safer and easier.

  if (headerActions) headerActions.innerHTML = '';
  if (content) content.innerHTML = '';

  // Re-render Global Filter (it will check currentStationFilter state)
  await renderGlobalFilter();

  switch (tab) {
    case 'dashboard':
      if (pageSubtitle) pageSubtitle.textContent = 'Dashboard';
      showDashboard(content, currentStationFilter);
      break;
    case 'stations':
      if (pageSubtitle) pageSubtitle.textContent = 'Gestione Distributori';
      showStationsTab(content, headerActions); // Stations usually don't need filtering by station
      break;
    case 'operators':
      if (pageSubtitle) pageSubtitle.textContent = 'Gestione Operatori';
      showOperatorsTab(content, headerActions);
      break;
    case 'shifts':
      if (pageSubtitle) pageSubtitle.textContent = 'Storico Chiusure';
      showChiusureTab(content, headerActions, currentStationFilter);
      break;
    case 'prices':
      if (pageSubtitle) pageSubtitle.textContent = 'Gestione Prezzi';
      showPricesTab(content, headerActions);
      break;
    case 'tanks':
      if (pageSubtitle) pageSubtitle.textContent = 'Gestione Cisterne';
      showTanksTab(content, headerActions);
      break;
    case 'crediti':
      if (pageSubtitle) pageSubtitle.textContent = 'Gestione Crediti';
      showCreditiOverview(content, headerActions, currentStationFilter);
      break;
    case 'invoices':
      if (pageSubtitle) pageSubtitle.textContent = 'Richieste Fatture';
      showFattureTab(content, headerActions, currentStationFilter);
      break;
    case 'vouchers':
      if (pageSubtitle) pageSubtitle.textContent = 'Gestione Voucher';
      showVoucherAdminTab(content, headerActions, currentStationFilter);
      break;
    case 'notifiche':
      if (pageSubtitle) pageSubtitle.textContent = 'Notifiche';
      showNotificheAdmin(content);
      break;
    case 'settings':
      if (pageSubtitle) pageSubtitle.textContent = 'Impostazioni';
      showSettingsTab(content, headerActions);
      break;
    default:
      if (pageSubtitle) pageSubtitle.textContent = 'Dashboard';
      showDashboard(content, currentStationFilter);
  }
}

// ------------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------------
async function showDashboard(container, stationId = null) {
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
    if (currentAdminTab !== 'dashboard') return;

    // ------------------------------------------------------------------
    // PROCESS TANKS (Parallel Readings Fetch)
    // ------------------------------------------------------------------
    let tanksHtmlRows = '';
    if (tanks.length > 0) {
      const tankIds = tanks.map(t => t.id);

      // Optimization: Fetch only necessary recent readings or limited set
      // Since we need latest per tank, and if we have many tanks, querying all history is bad.
      // Strategy: Fetch last 1 reading for EACH tank in parallel (if < 20 tanks) or bulk if many.
      // For robustness with many tanks, we typically bulk fetch with a limit per tank (complex in Supabase/PostgREST).
      // Fallback: Fetch last 7 days of readings for these tanks to limit data size.
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

    // Andamento prezzi medi - verrà popolato via Chart.js

    // RACE CONDITION CHECK: Stop if user switched tab
    if (currentAdminTab !== 'dashboard') return;

    container.innerHTML = `
      <section class="dashboard-grid">
        <article class="kpi-card">
          <div class="kpi-row">
            <div class="kpi-icon"><i class="fas fa-euro-sign"></i></div>
          </div>
          <p class="kpi-title">Venduto Oggi</p>
          <p class="kpi-value">${vendutoKpiValue ? formatEuro(vendutoKpiValue) : '€ 0'}</p>
          <p class="kpi-sub">+0% vs ieri</p>
        </article>
        <article class="kpi-card">
          <div class="kpi-row">
            <div class="kpi-icon"><i class="fas fa-gas-pump"></i></div>
          </div>
          <p class="kpi-title">Erogato Oggi</p>
          <p class="kpi-value">${(erogatoKpiData.totale || 0).toFixed(2)} L</p>
          <p class="kpi-sub">${(erogatoKpiData.litriBenzina || 0).toFixed(2)} L Benzina / ${(erogatoKpiData.litriGasolio || 0).toFixed(2)} L Gasolio</p>
        </article>
        <article class="kpi-card">
          <div class="kpi-row">
            <div class="kpi-icon"><i class="fas fa-map-marker-alt"></i></div>
          </div>
          <p class="kpi-title">Stazioni Attive</p>
          <p class="kpi-value">${stationsCount || 0}</p>
          <p class="kpi-sub">${operatorsCount || 0} operatori attivi</p>
        </article>
        <article class="kpi-card">
          <div class="kpi-row">
            <div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div>
          </div>
          <p class="kpi-title">Alert Cisterne</p>
          <p class="kpi-value">${closuresCount || 0}</p>
          <p class="kpi-sub">Chiusure registrate</p>
        </article>
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

        <!-- DRAGGABLE RESIZER: Handled largely by Split.js but we keep the structure clean -->
        <!-- No explicit resizer div needed for Split.js, it injects 'gutter' element -->

        <article class="panel-card" id="panel-sales">
          <h3 class="panel-title">Andamento Vendite</h3>
          <p class="panel-subtitle">Trend vendite giornaliere per distributore (valore in €).</p>
          <div class="prices-chart-wrapper">
            <canvas id="sales-trend-chart"></canvas>
          </div>
        </article>
      </section>
    `;

    // Activate Resizer (Split.js)
    requestAnimationFrame(() => {
      initDashboardSplit();
    });

    // Popola grafico vendite per distributore se Chart.js è disponibile
    if (window.Chart) {
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
  } catch (err) {
    showErrorMessage(container, err);
  }
}

// ------------------------------------------------------------------
// RESIZE LOGIC (Split.js)
// ------------------------------------------------------------------
function initDashboardSplit() {
  const leftPanel = document.getElementById('panel-tanks');
  const rightPanel = document.getElementById('panel-sales');

  if (!leftPanel || !rightPanel) return;

  // Remove any previous custom styles that might conflict
  leftPanel.style.width = '';
  leftPanel.style.flex = '';
  rightPanel.style.flex = '';

  try {
    // Initialize Split.js
    Split(['#panel-tanks', '#panel-sales'], {
      sizes: [35, 65],
      minSize: 250,
      gutterSize: 10,
      cursor: 'col-resize',
      onDragEnd: function () {
        // Trigger resize for ChartJS
        window.dispatchEvent(new Event('resize'));
      }
    });
  } catch (e) {
    console.warn('Split.js error or not loaded:', e);
  }
}

// ------------------------------------------------------------------
// STATIONS (Distributori)
// ------------------------------------------------------------------
async function showStationsTab(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-station-btn"><i class="fas fa-plus"></i> Nuovo Distributore</button>`;
    document.getElementById('add-station-btn').addEventListener('click', () => openStationModal());
  }

  try {
    const { data: stations, error } = await supabase
      .from('fuel_stations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!stations || stations.length === 0) {
      container.innerHTML = '<p>Nessun distributore trovato.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Località</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    stations.forEach(st => {
      html += `
        <tr>
          <td>${escapeHtml(st.station_name)}</td>
          <td>${escapeHtml(st.location)}</td>
          <td>
            <button class="icon-btn edit-station" data-id="${st.station_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn prices-station" data-id="${st.station_id}" title="Prezzi"><i class="fas fa-tag"></i></button>
            <button class="icon-btn islands-station" data-id="${st.station_id}" title="Isole e Pistole"><i class="fas fa-gas-pump"></i></button>
            <button class="icon-btn tanks-station" data-id="${st.station_id}" title="Cisterne"><i class="fas fa-oil-can"></i></button>
            <button class="icon-btn delete-station" data-id="${st.station_id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    // Aggiorna le icone personalizzate se presenti
    if (window.refreshUiIcons) {
      window.refreshUiIcons();
    }

    // Listeners
    container.querySelectorAll('.edit-station').forEach(btn => {
      btn.addEventListener('click', () => openStationModal(btn.dataset.id));
    });
    container.querySelectorAll('.prices-station').forEach(btn => {
      btn.addEventListener('click', () => showPrezziAdminModal(btn.dataset.id));
    });
    container.querySelectorAll('.islands-station').forEach(btn => {
      btn.addEventListener('click', () => showIslandsModal(btn.dataset.id));
    });
    container.querySelectorAll('.tanks-station').forEach(btn => {
      btn.addEventListener('click', () => showTanksAdminModal(btn.dataset.id));
    });
    container.querySelectorAll('.delete-station').forEach(btn => {
      btn.addEventListener('click', () => deleteStation(btn.dataset.id));
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

async function openStationModal(stationId = null) {
  const isEdit = !!stationId;
  openModal(isEdit ? 'Modifica Distributore' : 'Nuovo Distributore');
  const target = document.getElementById('modal-body');

  let station = {};
  if (isEdit) {
    const { data } = await supabase.from('fuel_stations').select('*').eq('station_id', stationId).single();
    station = data || {};
  }

  // Valore di default per allow_partial_closure: true se non specificato
  const allowPartialClosure = station.allow_partial_closure !== false;

  target.innerHTML = `
    <form id="station-form">
      <div class="form-group">
        <label>Nome Distributore</label>
        <input type="text" name="station_name" value="${escapeHtml(station.station_name)}" required>
      </div>
      <div class="form-group">
        <label>Località (indirizzo / città)</label>
        <input type="text" name="location" value="${escapeHtml(station.location)}">
      </div>
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
          <input type="checkbox" name="allow_partial_closure" ${allowPartialClosure ? 'checked' : ''} style="width: 18px; height: 18px;">
          <span>Consenti chiusura parziale per gli operatori</span>
        </label>
        <small style="color: #666; margin-top: 5px; display: block;">
          Se disabilitato, gli operatori di questo distributore potranno effettuare solo chiusure finali.
        </small>
      </div>
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Distributore'}</button>
    </form>
  `;

  document.getElementById('station-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      station_name: formData.get('station_name'),
      location: formData.get('location'),
      allow_partial_closure: formData.get('allow_partial_closure') === 'on'
    };

    try {
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from('fuel_stations').update(payload).eq('station_id', stationId));
      } else {
        await safeSupabaseQuery(() => supabase.from('fuel_stations').insert([payload]));
      }
      closeModal();
      loadAdminTab('stations');
    } catch (err) {
      alert('Errore salvataggio: ' + err.message);
    }
  });
}

async function deleteStation(stationId) {
  if (!await openConfirmModal('Sei sicuro di voler eliminare questo distributore?')) return;
  try {
    await safeSupabaseQuery(() => supabase.from('fuel_stations').delete().eq('station_id', stationId));
    loadAdminTab('stations');
  } catch (err) {
    alert('Errore eliminazione: ' + err.message);
  }
}

async function showPrezziAdminModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Modifica Prezzi - ${escapeHtml(stationName)}`);
  const target = document.getElementById('modal-body');

  const { data: current } = await supabase
    .from('prezzi_distributore')
    .select('*')
    .eq('station_id', stationId)
    .order('data_validita', { ascending: false })
    .limit(1)
    .maybeSingle();

  const benzinaValue = escapeNumber(current?.prezzo_benzina);
  const gasolioValue = escapeNumber(current?.prezzo_gasolio);

  target.innerHTML = `
    <form id="admin-prezzi-form">
      <div class="form-group"><label>Benzina</label><input class="price-input" type="number" step="0.001" min="0" name="benzina" value="${benzinaValue}" /></div>
      <div class="form-group"><label>Gasolio</label><input class="price-input" type="number" step="0.001" min="0" name="gasolio" value="${gasolioValue}" /></div>
      <fieldset class="form-group prezzi-validita-group">
        <legend>Validità</legend>
        <div class="validita-grid">
          <label class="validita-option">
            <input type="radio" name="validita" value="ora" checked>
            <span>Da ora</span>
          </label>
          <label class="validita-option">
            <input type="radio" name="validita" value="prossima">
            <span>Dalla prossima chiusura</span>
          </label>
        </div>
      </fieldset>
      <button type="submit" class="menu-button primary">Salva Prezzi</button>
    </form>
  `;

  document.getElementById('admin-prezzi-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const validita = fd.get('validita');

    // Calcola data validità
    let dataValidita = new Date();
    if (validita === 'prossima') {
      // Logica per prossima chiusura: prendi l'ultima chiusura e aggiungi 1 secondo, oppure usa now se non c'è
      // Semplificazione: usiamo now + 1 ora per demo, o logica più complessa
      // Nel codice originale non era specificato esattamente come calcolare "prossima chiusura" lato server
      // Qui usiamo un placeholder o logica custom.
      // Per ora salviamo con data futura fittizia o lasciamo gestire al backend se ci fosse
      // Ma dato che è client-side, usiamo now per semplicità se non implementiamo logica turni complessa qui
    }

    const payload = {
      station_id: stationId,
      prezzo_benzina: parseFloat(fd.get('benzina')) || 0,
      prezzo_gasolio: parseFloat(fd.get('gasolio')) || 0,
      prezzo_gpl: null,
      prezzo_metano: null,
      data_validita: dataValidita.toISOString()
    };

    try {
      await safeSupabaseQuery(() => supabase.from('prezzi_distributore').insert([payload]));
      closeModal();
      alert('Prezzi aggiornati!');
    } catch (err) {
      alert('Errore: ' + err.message);
    }
  });
}

async function showTanksAdminModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Gestione Cisterne - ${escapeHtml(stationName)}`);
  const target = document.getElementById('modal-body');

  const renderTanks = async () => {
    target.innerHTML = '<p class="loading-text">Caricamento cisterne e connessioni...</p>';

    const [tanksResult, linksResult, pumpsResult] = await Promise.all([
      supabase
        .from('tanks')
        .select('*')
        .eq('station_id', stationId)
        .order('name'),
      supabase
        .from('tank_pump_links')
        .select(`
          id,
          station_id,
          tank_id,
          pump_id,
          mode,
          ratio,
          priority,
          is_active,
          notes,
          tanks ( id, name, fuel_type ),
          pistole ( id, nome, tipo_carburante, islands(nome) )
        `)
        .eq('station_id', stationId)
        .order('pump_id'),
      supabase
        .from('pistole')
        .select('id, nome, tipo_carburante, islands!inner(island_id, nome, station_id)')
        .eq('islands.station_id', stationId)
        .order('nome')
    ]);

    const { data: tanks, error: tanksError } = tanksResult;
    if (tanksError) {
      target.innerHTML = `<p class="error-text">Errore cisterne: ${tanksError.message}</p>`;
      return;
    }

    let tankLinks = linksResult?.data || [];
    if (linksResult?.error) {
      if (linksResult.error.code && linksResult.error.code !== '42P01') {
        target.innerHTML = `<p class="error-text">Errore collegamenti: ${linksResult.error.message}</p>`;
        return;
      }
      tankLinks = [];
    }

    const { data: pumps, error: pumpsError } = pumpsResult;
    if (pumpsError) {
      target.innerHTML = `<p class="error-text">Errore pistole: ${pumpsError.message}</p>`;
      return;
    }

    const formatPumpLabel = (pump) => {
      const labelParts = [
        pump?.nome || `Pistola #${pump?.id}`,
        pump?.islands?.nome ? `Isola ${pump.islands.nome}` : null,
        pump?.tipo_carburante ? pump.tipo_carburante.toUpperCase() : null
      ].filter(Boolean);
      return labelParts.join(' · ');
    };

    const tanksList = Array.isArray(tanks) && tanks.length
      ? tanks.map(t => `
          <li class="list-item tank-row">
            <div>
              <strong>${escapeHtml(t.name)}</strong>
              <span class="badge badge-info">${escapeHtml(t.fuel_type)}</span>
              <span class="tank-meta">Capacità: ${formatNumberIt(t.capacity)} L</span>
            </div>
            <button class="icon-btn delete-tank" data-id="${t.id}" title="Elimina">
              <i class="fas fa-trash"></i>
            </button>
          </li>
        `).join('')
      : '<p>Nessuna cisterna configurata.</p>';

    const linkRows = Array.isArray(tankLinks) && tankLinks.length
      ? tankLinks.map(link => {
        const pumpLabel = formatPumpLabel(link.pistole || {});
        const tankLabel = link.tanks?.name ? `${link.tanks.name} (${link.tanks.fuel_type || '-'})` : `Cisterna #${link.tank_id}`;
        const modeBadge = link.mode === 'manual'
          ? '<span class="badge badge-warning">Manuale</span>'
          : '<span class="badge badge-info">Automatica</span>';
        const metaValue = link.mode === 'manual'
          ? `Priorità ${link.priority || 1}`
          : `${link.ratio || 0}%`;
        const statusBadge = link.is_active
          ? '<span class="badge badge-success">Attiva</span>'
          : '<span class="badge badge-muted">Disattiva</span>';
        const noteText = link.notes ? `<div class="tank-link-note">${escapeHtml(link.notes)}</div>` : '';
        return `
            <tr>
              <td>${escapeHtml(pumpLabel)}</td>
              <td>${escapeHtml(tankLabel)}</td>
              <td>${modeBadge}</td>
              <td>${escapeHtml(metaValue)}</td>
              <td>${statusBadge}</td>
              <td>
                <div class="table-actions">
                  <button class="icon-btn tank-link-toggle" data-id="${link.id}" data-active="${link.is_active}" title="Attiva/Disattiva">
                    <i class="fas ${link.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                  </button>
                  <button class="icon-btn tank-link-delete" data-id="${link.id}" title="Rimuovi Associazione">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                ${noteText}
              </td>
            </tr>
          `;
      }).join('')
      : '<tr><td colspan="6">Nessuna associazione configurata.</td></tr>';

    const pumpOptions = Array.isArray(pumps) && pumps.length
      ? pumps.map(p => `<option value="${p.id}">${escapeHtml(formatPumpLabel(p))}</option>`).join('')
      : '<option value="">Nessuna pistola disponibile</option>';

    const tankOptions = Array.isArray(tanks) && tanks.length
      ? tanks.map(t => `<option value="${t.id}">${escapeHtml(`${t.name} (${t.fuel_type || '-'})`)}</option>`).join('')
      : '<option value="">Nessuna cisterna disponibile</option>';

    const formDisabled = !(pumps?.length && tanks?.length);

    target.innerHTML = `
      <div class="tanks-list">
        <h4>Cisterne Esistenti</h4>
        <ul class="list-group">
          ${tanksList}
        </ul>
      </div>

      <div class="add-tank-form content-box">
        <h4>Aggiungi Nuova Cisterna</h4>
        <form id="add-tank-form">
          <div class="form-row">
            <div class="form-group">
              <label>Nome (es. Cisterna 1)</label>
              <input type="text" name="name" required placeholder="Cisterna 1">
            </div>
            <div class="form-group">
              <label>Tipo Carburante</label>
              <select name="fuel_type" required>
                <option value="Benzina">Benzina</option>
                <option value="Gasolio">Gasolio</option>
                <option value="AdBlue">AdBlue</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Capacità Totale (Litri)</label>
            <input type="number" name="capacity" required min="0" step="1">
          </div>
          <button type="submit" class="menu-button success small-btn">Aggiungi Cisterna</button>
        </form>
      </div>

      <div class="content-box tank-links-section">
        <div class="section-header">
          <div>
            <h4>Associazioni Pistole ↔︎ Cisterne</h4>
            <p class="section-subtitle">Configura se una pistola attinge automaticamente da più serbatoi o se richiede la scelta dell'operatore.</p>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table tank-links-table">
            <thead>
              <tr>
                <th>Pistola</th>
                <th>Cisterna</th>
                <th>Modalità</th>
                <th>Ripartizione / Priorità</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              ${linkRows}
            </tbody>
          </table>
        </div>

        <form id="tank-link-form" class="tank-link-form ${formDisabled ? 'form-disabled' : ''}">
          <h5>${formDisabled ? 'Configura almeno una pistola e una cisterna per creare un\'associazione' : 'Crea nuova associazione'}</h5>
          <div class="form-row">
            <div class="form-group">
              <label>Pistola</label>
              <select name="pump_id" ${!pumps?.length ? 'disabled' : ''} required>
                ${pumpOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Cisterna</label>
              <select name="tank_id" ${!tanks?.length ? 'disabled' : ''} required>
                ${tankOptions}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Modalità</label>
              <select name="mode" id="tank-link-mode" ${formDisabled ? 'disabled' : ''}>
                <option value="auto">Automatica (ripartizione)</option>
                <option value="manual">Manuale (scelta operatore)</option>
              </select>
            </div>
            <div class="form-group" data-role="ratio-group">
              <label>Percentuale (automatica)</label>
              <input type="number" name="ratio" value="100" min="1" max="100" step="1" ${formDisabled ? 'disabled' : ''}>
            </div>
            <div class="form-group" data-role="priority-group" style="display:none;">
              <label>Priorità manuale</label>
              <input type="number" name="priority" value="1" min="1" step="1" ${formDisabled ? 'disabled' : ''}>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group checkbox-group">
              <label class="checkbox">
                <input type="checkbox" name="is_active" ${formDisabled ? 'disabled' : ''} checked>
                Associazione attiva
              </label>
            </div>
            <div class="form-group" style="flex:2;">
              <label>Note (opzionale)</label>
              <input type="text" name="notes" placeholder="Es. Devia verso cisterna 2 in caso di scorta">
            </div>
          </div>
          <button type="submit" class="menu-button primary small-btn" ${formDisabled ? 'disabled' : ''}>
            <i class="fas fa-plug"></i> Salva Associazione
          </button>
        </form>
      </div>
    `;

    // Listeners per cisterne
    target.querySelectorAll('.delete-tank').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Eliminare questa cisterna?')) return;
        await safeSupabaseQuery(() => supabase.from('tanks').delete().eq('id', btn.dataset.id));
        renderTanks();
      });
    });

    const addTankForm = document.getElementById('add-tank-form');
    addTankForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        station_id: stationId,
        name: fd.get('name'),
        fuel_type: fd.get('fuel_type'),
        capacity: parseFloat(fd.get('capacity'))
      };

      try {
        await safeSupabaseQuery(() => supabase.from('tanks').insert([payload]));
        e.target.reset();
        renderTanks();
      } catch (err) {
        alert('Errore: ' + err.message);
      }
    });

    // Gestione associazioni
    const linkForm = document.getElementById('tank-link-form');
    const modeSelect = document.getElementById('tank-link-mode');
    const ratioGroup = linkForm?.querySelector('[data-role="ratio-group"]');
    const priorityGroup = linkForm?.querySelector('[data-role="priority-group"]');

    const refreshModeFields = () => {
      if (!modeSelect || !ratioGroup || !priorityGroup) return;
      const mode = modeSelect.value;
      const isFormDisabled = linkForm?.classList.contains('form-disabled');
      const ratioInput = ratioGroup.querySelector('input');
      const priorityInput = priorityGroup.querySelector('input');
      if (mode === 'manual') {
        ratioGroup.style.display = 'none';
        if (ratioInput) ratioInput.disabled = true;
        priorityGroup.style.display = 'block';
        if (priorityInput) priorityInput.disabled = isFormDisabled ? true : false;
      } else {
        ratioGroup.style.display = 'block';
        if (ratioInput) ratioInput.disabled = isFormDisabled ? true : false;
        priorityGroup.style.display = 'none';
        if (priorityInput) priorityInput.disabled = true;
      }
    };

    modeSelect?.addEventListener('change', refreshModeFields);
    refreshModeFields();

    linkForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const mode = fd.get('mode');
      const payload = {
        station_id: stationId,
        pump_id: parseInt(fd.get('pump_id'), 10),
        tank_id: parseInt(fd.get('tank_id'), 10),
        mode,
        ratio: mode === 'auto' ? (parseFloat(fd.get('ratio')) || 0) : null,
        priority: mode === 'manual' ? (parseInt(fd.get('priority'), 10) || 1) : null,
        is_active: fd.get('is_active') !== null,
        notes: fd.get('notes')?.trim() || null
      };

      try {
        await safeSupabaseQuery(() => supabase.from('tank_pump_links').insert([payload]));
        e.target.reset();
        refreshModeFields();
        renderTanks();
      } catch (err) {
        alert('Errore: ' + err.message);
      }
    });

    // Toggle stato associazione
    target.querySelectorAll('.tank-link-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const current = btn.dataset.active === 'true';
        await safeSupabaseQuery(() => supabase.from('tank_pump_links').update({ is_active: !current }).eq('id', id));
        renderTanks();
      });
    });

    // Elimina associazione
    target.querySelectorAll('.tank-link-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Rimuovere questa associazione pistola/cisterna?')) return;
        await safeSupabaseQuery(() => supabase.from('tank_pump_links').delete().eq('id', btn.dataset.id));
        renderTanks();
      });
    });
  };

  renderTanks();
}

// ------------------------------------------------------------------
// OPERATORS
// ------------------------------------------------------------------
async function showOperatorsTab(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-operator-btn"><i class="fas fa-plus"></i> Nuovo Operatore</button>`;
    document.getElementById('add-operator-btn').addEventListener('click', () => openOperatorModal());
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        *,
        user_stations (
          station_id,
          fuel_stations ( station_name )
        )
      `)
      .eq('role', 'operator')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!users || users.length === 0) {
      container.innerHTML = '<p>Nessun operatore trovato.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Distributore</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    users.forEach(u => {
      const firstLink = Array.isArray(u.user_stations) ? u.user_stations[0] : u.user_stations;
      const stationName = firstLink?.fuel_stations?.station_name || '-';
      html += `
        <tr>
          <td>${escapeHtml(u.full_name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(stationName)}</td>
          <td>
            <button class="icon-btn edit-operator" data-id="${u.user_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn assign-station" data-id="${u.user_id}" title="Assegna Stazione"><i class="fas fa-map-marker-alt"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.edit-operator').forEach(btn => {
      btn.addEventListener('click', () => openOperatorModal(btn.dataset.id));
    });
    container.querySelectorAll('.assign-station').forEach(btn => {
      btn.addEventListener('click', () => openAssignStationModal(btn.dataset.id));
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

async function openOperatorModal(userId = null) {
  const isEdit = !!userId;
  openModal(isEdit ? 'Modifica Operatore' : 'Nuovo Operatore');
  const target = document.getElementById('modal-body');

  let user = {};
  if (isEdit) {
    const { data } = await supabase.from('users').select('*').eq('user_id', userId).single();
    user = data || {};
  }

  target.innerHTML = `
    <form id="operator-form">
      <div class="form-group">
        <label>Nome Completo</label>
        <input type="text" name="full_name" value="${escapeHtml(user.full_name)}" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${escapeHtml(user.email)}" required ${isEdit ? 'readonly' : ''}>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" required minlength="6">
      </div>` : ''}
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Operatore'}</button>
    </form>
  `;

  document.getElementById('operator-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email');
    const password = fd.get('password');
    const fullName = fd.get('full_name');

    try {
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from('users').update({ full_name: fullName }).eq('user_id', userId));
      } else {
        // Crea user in Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, role: 'operator' } }
        });
        if (authError) throw authError;

        if (!authData.user) throw new Error("Errore creazione utente Auth");

        // Inserimento manuale in public.users se non c'è trigger
        await safeSupabaseQuery(() => supabase.from('users').insert([{
          user_id: authData.user.id,
          email,
          full_name: fullName,
          role: 'operator'
        }]));
      }
      closeModal();
      loadAdminTab('operators');
    } catch (err) {
      alert('Errore: ' + err.message);
    }
  });
}

async function openAssignStationModal(userId) {
  openModal('Assegna Stazione');
  const target = document.getElementById('modal-body');

  const [stationsRes, currentRes] = await Promise.all([
    supabase.from('fuel_stations').select('*'),
    supabase.from('user_stations').select('station_id').eq('user_id', userId).maybeSingle()
  ]);

  const stations = stationsRes.data || [];
  const currentStationId = currentRes.data?.station_id;

  let html = `
    <form id="assign-station-form">
      <div class="form-group">
        <label>Seleziona Stazione</label>
        <select name="station_id" class="form-control">
          <option value="">Nessuna</option>
          ${stations.map(s => `<option value="${s.station_id}" ${s.station_id === currentStationId ? 'selected' : ''}>${escapeHtml(s.station_name)}</option>`).join('')}
        </select>
      </div>
      <button type="submit" class="menu-button primary">Salva Assegnazione</button>
    </form>
  `;
  target.innerHTML = html;

  document.getElementById('assign-station-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const stationId = e.target.station_id.value;

    try {
      // Rimuovi precedente
      await supabase.from('user_stations').delete().eq('user_id', userId);

      if (stationId) {
        await safeSupabaseQuery(() => supabase.from('user_stations').insert([{ user_id: userId, station_id: stationId }]));
      }
      closeModal();
      alert('Assegnazione salvata');
    } catch (err) {
      alert('Errore: ' + err.message);
    }
  });
}

// ------------------------------------------------------------------
// CHIUSURE (Closures)
// ------------------------------------------------------------------
async function showChiusureTab(container, actionsContainer, stationId = null) {
  showLoadingMessage(container);
  if (actionsContainer) actionsContainer.innerHTML = '';

  try {
    // Fetch with joins to display station and operator names
    let query = supabase.from('shifts')
      .select(`
        *,
        fuel_stations(station_name),
        users(full_name)
      `);

    if (stationId) query = query.eq('station_id', stationId);

    query = query.order('created_at', { ascending: false }).limit(500);

    const { data: closures, error } = await query;

    if (error) throw error;

    if (!closures || closures.length === 0) {
      container.innerHTML = '<p>Nessuna chiusura trovata.</p>';
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

    closures.forEach(c => {
      // MAPPING DATI DA SHIFTS
      const dateStr = new Date(c.closed_at || c.created_at).toLocaleString('it-IT');
      const stationName = c.fuel_stations?.station_name || `#${c.station_id}`;
      const operatorName = c.users?.full_name || `#${c.operator_id}`;

      // Estrai dati dal JSON closing_data
      const closingData = c.closing_data || {};

      // Determina il tipo di chiusura
      // Se status è 'closed' è finale, altrimenti controlla closing_data
      const isFinal = c.status === 'closed' || closingData.is_final === true;
      const closureType = isFinal ? 'Finale' : 'Parziale';
      const closureClass = isFinal ? 'badge-success' : 'badge-warning';

      // Calcolo del totale - SOLO CARBURANTE (esclude movimenti di cassa)
      // Usa ricavo_teorico che rappresenta il totale del carburante venduto
      const totalValue = closingData.ricavo_teorico || closingData.totale_atteso || 0;
      const total = formatEuro(totalValue);

      html += `
        <tr>
          <td>${dateStr}</td>
          <td>${escapeHtml(stationName)}</td>
          <td>${escapeHtml(operatorName)}</td>
          <td><span class="badge ${closureClass}">${closureType}</span></td>
          <td>${total}</td>
          <td>
            <button class="icon-btn view-closure" data-id="${c.id}" title="Dettagli"><i class="fas fa-eye"></i></button>
            <button class="icon-btn export-closure" data-id="${c.id}" title="Export"><i class="fas fa-file-export"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.view-closure').forEach(btn => {
      btn.addEventListener('click', () => showClosureDetails(btn.dataset.id));
    });
    container.querySelectorAll('.export-closure').forEach(btn => {
      btn.addEventListener('click', () => openExportModal(btn.dataset.id));
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

async function showClosureDetails(closureId) {
  openModal('Dettagli Chiusura');
  const target = document.getElementById('modal-body');
  showLoadingMessage(target);

  try {
    const { data: closure } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', closureId)
      .single();

    if (!closure) throw new Error('Chiusura non trovata');

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
    // MODIFICA: Somma esatta delle componenti (richiesta utente)
    const banconoteErogate = selfData.banconote_erogate || 0;
    const banconoteIncassate = selfData.banconote_incassate || 0;
    const bancomatSelf = selfData.bancomat_erogati || 0;
    const cardsSelf = selfData.transazioni_uta || 0; // Assuming this maps to Icad/dkv/iscard

    const selfTotalVal = banconoteErogate + bancomatSelf + cardsSelf;
    const selfTotalFormatted = formatEuro(selfTotalVal);

    // Logic per Contanti Self: se uguali mostra solo uno, altrimenti entrambi
    let contantiSelfHtml = '';
    if (banconoteErogate === banconoteIncassate) {
      contantiSelfHtml = `<span>Contanti:</span> <b>${formatEuro(banconoteErogate)}</b>`;
    } else {
      contantiSelfHtml = `
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Contanti:</span>
                <div style="text-align: right;">
                    <div>Erogati: <b>${formatEuro(banconoteErogate)}</b></div>
                    <div style="font-size: 0.85em; color: #64748b;">Incassati: <b>${formatEuro(banconoteIncassate)}</b></div>
                </div>
            </div>`;
    }

    // Extra
    const extraVal = closingData.extra_incassi || 0;
    const extra = formatEuro(extraVal);

    // CALCOLO TOTALE REALE (Richiesto da utente: Venduto Carburante + Extra)
    // ricavo_teorico = venduto carburante totale (contatori)
    const vendutoCarburanteVal = closingData.ricavo_teorico || 0;
    const vendutoCarburante = formatEuro(vendutoCarburanteVal);

    const totaleRealeVal = vendutoCarburanteVal + extraVal;
    const totaleReale = formatEuro(totaleRealeVal);

    target.innerHTML = `
      <div class="closure-details" style="font-size: 0.95rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            <span>ID Chiusura: <b>${closure.id}</b></span>
            <span>${dateStr}</span>
        </div>

        <!-- SEZIONE SELF SERVICE -->
        <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
            <div style="font-weight: 600; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Dettaglio Self Service</div>
            
            <p style="display: flex; justify-content: space-between; margin: 5px 0;">${contantiSelfHtml}</p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Bancomat:</span> <b>${formatEuro(bancomatSelf)}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Icad/DKV/Iscard:</span> <b>${formatEuro(cardsSelf)}</b></p>
            
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-weight: 700;">
                <span>Incasso Totale Self:</span> <span>${selfTotalFormatted}</span>
            </div>
        </div>

        <!-- SEZIONE OPERATORE -->
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
            <div style="font-weight: 600; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Dettaglio Operatore</div>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Contanti:</span> <b>${contanti}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>POS:</span> <b>${pos}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Crediti:</span> <b>${crediti}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0;"><span>Voucher/Buoni:</span> <b>${voucher}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Carte (UTA/DKV):</span> <b>${carteUta}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0; color: #dc2626;"><span>Uscite/Rimborsi:</span> <b>- ${rimborsi}</b></p>
            
            <hr style="margin: 8px 0; border-color: #e2e8f0;">
            
            <!-- NUOVA RIGA: Totale venduto della giornata (pistole) -->
            <p style="display: flex; justify-content: space-between; margin: 5px 0; font-weight: 600; color: #0f172a;"><span>Totale Venduto (Pistole):</span> <b>${vendutoCarburante}</b></p>
            
            <p style="display: flex; justify-content: space-between; margin: 5px 0; color: #1e40af;"><span>Incassi Extra:</span> <b>${extra}</b></p>
        </div>

        <div style="background: #eff6ff; padding: 15px; border-radius: 6px; border: 1px solid #bfdbfe; text-align: right; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 4px;">Totale Venduto (Carburante + Extra)</div>
            <div style="font-size: 1.6rem; font-weight: 700; color: #1e3a8a;">${totaleReale}</div>
        </div>
        
        <div style="margin-top: 15px; text-align: center;">
             <button class="menu-button" onclick="document.querySelector('.icon-btn.export-closure[data-id=\\'${closure.id}\\']').click()">
                <i class="fas fa-file-export"></i> Scarica Excel Dettagliato
             </button>
        </div>
      </div>
    `;
  } catch (err) {
    target.innerHTML = `<p class="error">Errore: ${err.message}</p>`;
  }
}

async function openExportModal(closureId) {
  try {
    const ctx = await fetchClosureExportData(closureId);
    const template = buildClosureTemplate(ctx, ctx.layout, ctx.summaryDefaults);

    console.log('=== DEBUG EXPORT ===');
    console.log('ctx.layout:', ctx.layout);
    console.log('ctx.metricsMap:', ctx.metricsMap);
    console.log('template:', template);
    console.log('template.sections:', template.sections);
    console.log('===================');

    await generateClosureExcel(template);
  } catch (err) {
    alert('Errore export: ' + (err?.message || err));
    console.error('Errore export:', err);
  }
}

// ------------------------------------------------------------------
// CREDITI & VOUCHER & NOTIFICHE (Placeholder/Minimal)
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// FATTURE (Invoice Requests)
// ------------------------------------------------------------------
async function showFattureTab(container, actionsContainer, stationId = null) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = '';
  }

  try {
    let query = supabase.from('invoices')
      .select(`
        *,
        fuel_stations(station_name),
        users(full_name)
      `);

    if (stationId) query = query.eq('station_id', stationId);

    query = query.order('created_at', { ascending: false });

    const { data: invoices, error } = await query;

    if (error) throw error;

    // Se ci sono fatture con cliente_id, recupera i dati dei clienti separatamente
    if (invoices && invoices.length > 0) {
      const clienteIds = invoices
        .filter(inv => inv.cliente_id)
        .map(inv => inv.cliente_id)
        .filter((id, index, self) => self.indexOf(id) === index); // rimuovi duplicati

      if (clienteIds.length > 0) {
        const { data: clienti } = await supabase
          .from('clienti_fatturazione')
          .select('id, nome, partita_iva, telefono')
          .in('id', clienteIds);

        // Aggiungi i dati dei clienti alle fatture
        if (clienti) {
          const clientiMap = {};
          clienti.forEach(c => {
            clientiMap[c.id] = c;
          });

          invoices.forEach(inv => {
            if (inv.cliente_id && clientiMap[inv.cliente_id]) {
              inv.clienti_fatturazione = clientiMap[inv.cliente_id];
            }
          });
        }
      }
    }

    if (error) throw error;

    if (!invoices || invoices.length === 0) {
      container.innerHTML = '<p>Nessuna richiesta fattura trovata.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Data Richiesta</th>
              <th>Cliente</th>
              <th>Importo</th>
              <th>Metodo Pagamento</th>
              <th>Categoria Prodotto</th>
              <th>Distributore</th>
              <th>Operatore</th>
              <th>Stato</th>
              <th>Note</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    invoices.forEach(inv => {
      const stationName = inv.fuel_stations?.station_name || '-';
      const operatorName = inv.users?.full_name || inv.users?.username || '-';
      const customerName = inv.clienti_fatturazione?.nome || inv.customer_name || '-';
      const statusBadge = inv.status === 'pending'
        ? '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">In Attesa</span>'
        : inv.status === 'completed' || inv.status === 'emessa'
          ? '<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">Emessa</span>'
          : '<span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">Annullata</span>';

      const paymentMethod = inv.payment_method === 'contanti'
        ? '<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">Contanti</span>'
        : inv.payment_method === 'pos'
          ? '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">POS</span>'
          : inv.payment_method === 'bonifico'
            ? '<span style="background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">Bonifico</span>'
            : '-';

      const productCategory = inv.product_category
        ? inv.product_category.charAt(0).toUpperCase() + inv.product_category.slice(1)
        : '-';

      const isEmitted = inv.status === 'completed' || inv.status === 'emessa';
      const toggleStatusBtn = isEmitted
        ? `<button class="icon-btn toggle-status" data-id="${inv.id}" data-status="pending" title="Segna come non emessa"><i class="fas fa-undo"></i></button>`
        : `<button class="icon-btn toggle-status" data-id="${inv.id}" data-status="completed" title="Segna come emessa"><i class="fas fa-check"></i></button>`;

      html += `
        <tr>
          <td>${inv.created_at ? new Date(inv.created_at).toLocaleDateString('it-IT') : '-'}</td>
          <td><strong>${escapeHtml(customerName)}</strong></td>
          <td><strong>${formatEuro(inv.amount || 0)}</strong></td>
          <td>${paymentMethod}</td>
          <td>${escapeHtml(productCategory)}</td>
          <td>${escapeHtml(stationName)}</td>
          <td>${escapeHtml(operatorName)}</td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(inv.description || inv.notes || '-')}</td>
          <td>${toggleStatusBtn}</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    // Event listeners per toggle stato
    container.querySelectorAll('.toggle-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const invoiceId = btn.dataset.id;
        const newStatus = btn.dataset.status;
        const statusText = newStatus === 'completed' ? 'emessa' : 'non emessa';

        if (!confirm(`Sei sicuro di voler segnare questa fattura come ${statusText}?`)) {
          return;
        }

        try {
          const updateData = {};

          // Prova ad aggiungere updated_at solo se la colonna esiste
          try {
            updateData.updated_at = new Date().toISOString();
          } catch (e) {
            // Ignora se updated_at non può essere aggiunto
          }

          // Aggiungi status
          updateData.status = newStatus;

          const { error } = await supabase
            .from('invoices')
            .update(updateData)
            .eq('id', invoiceId);

          if (error) {
            // Se l'errore è relativo a colonne mancanti, informa l'utente
            if (error.message && (error.message.includes('status') || error.message.includes('updated_at'))) {
              alert('Le colonne "status" e/o "updated_at" non esistono ancora nel database.\n\nEsegui lo script SQL "aggiungi_campi_invoices.sql" per aggiungere tutte le colonne necessarie.');
              return;
            }
            throw error;
          }

          // Ricarica la tabella
          showFattureTab(container, actionsContainer);

        } catch (err) {
          alert('Errore aggiornamento stato: ' + err.message);
        }
      });
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

// ------------------------------------------------------------------
// CREDITI (Credits)
// ------------------------------------------------------------------
async function showCreditiOverview(container, actionsContainer, stationId = null) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-customer-btn"><i class="fas fa-plus"></i> Nuovo Cliente</button>`;
    document.getElementById('add-customer-btn').addEventListener('click', () => openCustomerModal());
  }

  try {
    let query = supabase.from('crediti_clienti')
      .select(`
        *,
        fuel_stations(station_name)
      `);

    if (stationId) query = query.eq('station_id', stationId);

    query = query.order('cliente');

    const { data: customers, error } = await query;

    if (error) throw error;

    if (!customers || customers.length === 0) {
      container.innerHTML = '<p>Nessun cliente trovato.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Distributore</th>
              <th>Saldo Attuale</th>
              <th>Ultimo Aggiornamento</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    customers.forEach(c => {
      const stationName = c.fuel_stations?.station_name || '-';
      html += `
        <tr>
          <td>${escapeHtml(c.cliente)}</td>
          <td>${escapeHtml(stationName)}</td>
          <td><strong>${formatEuro(c.saldo || 0)}</strong></td>
          <td>${c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '-'}</td>
          <td>
            <button class="icon-btn edit-customer" data-id="${c.id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn delete-customer" data-id="${c.id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.edit-customer').forEach(btn => {
      btn.addEventListener('click', () => openCustomerModal(btn.dataset.id));
    });
    container.querySelectorAll('.delete-customer').forEach(btn => {
      btn.addEventListener('click', () => deleteCustomer(btn.dataset.id));
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

async function openCustomerModal(customerId = null) {
  const isEdit = !!customerId;
  openModal(isEdit ? 'Modifica Cliente' : 'Nuovo Cliente');
  const target = document.getElementById('modal-body');

  let customer = {};
  if (isEdit) {
    const { data } = await supabase.from('crediti_clienti').select('*').eq('id', customerId).single();
    customer = data || {};
  }

  target.innerHTML = `
    <form id="customer-form">
      <div class="form-group">
        <label>Nome Cliente / Azienda</label>
        <input type="text" name="cliente" value="${escapeHtml(customer.cliente)}" required>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Saldo Iniziale (€)</label>
        <input type="number" name="saldo" step="0.01">
      </div>` : ''}
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Cliente'}</button>
    </form>
  `;

  document.getElementById('customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const cliente = fd.get('cliente');
    const saldo = parseFloat(fd.get('saldo')) || 0;

    try {
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from('crediti_clienti').update({ cliente }).eq('id', customerId));
      } else {
        // Chiedi stazione di default? Per ora usiamo null o la prima trovata se necessario, 
        // ma la tabella ha station_id. Se è globale, lasciamo null o gestiamo diversamente.
        // Assumiamo che i crediti siano per stazione o globali. Qui mettiamo station_id null se non specificato.
        await safeSupabaseQuery(() => supabase.from('crediti_clienti').insert([{
          cliente,
          saldo,
          created_at: new Date().toISOString()
        }]));
      }
      closeModal();
      loadAdminTab('crediti');
    } catch (err) {
      alert('Errore: ' + err.message);
    }
  });
}

async function deleteCustomer(customerId) {
  if (!await openConfirmModal('Sei sicuro? Verranno eliminati anche i movimenti associati.')) return;
  try {
    await safeSupabaseQuery(() => supabase.from('crediti_clienti').delete().eq('id', customerId));
    loadAdminTab('crediti');
  } catch (err) {
    alert('Errore: ' + err.message);
  }
}

// ------------------------------------------------------------------
// VOUCHER
// ------------------------------------------------------------------
async function showVoucherAdminTab(container, actionsContainer, stationId = null) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="generate-voucher-btn"><i class="fas fa-plus"></i> Genera Voucher</button>`;
    document.getElementById('generate-voucher-btn').addEventListener('click', () => openVoucherModal());
  }

  try {
    let query = supabase.from('vouchers').select('*');

    if (stationId) query = query.eq('station_id', stationId);

    query = query.order('created_at', { ascending: false }).limit(500);

    const { data: vouchers, error } = await query;

    if (error) throw error;

    if (!vouchers || vouchers.length === 0) {
      container.innerHTML = '<p>Nessun voucher trovato.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Codice</th>
              <th>Importo</th>
              <th>Stato</th>
              <th>Creato il</th>
              <th>Usato il</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    vouchers.forEach(v => {
      const statusBadge = v.is_used
        ? '<span class="badge badge-warning">Usato</span>'
        : '<span class="badge badge-success">Attivo</span>';

      html += `
        <tr>
          <td><code style="font-size: 1.1em;">${escapeHtml(v.code)}</code></td>
          <td>${formatEuro(v.amount)}</td>
          <td>${statusBadge}</td>
          <td>${new Date(v.created_at).toLocaleDateString()}</td>
          <td>${v.used_at ? new Date(v.used_at).toLocaleString() : '-'}</td>
          <td>
            <button class="icon-btn delete-voucher" data-id="${v.id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.delete-voucher').forEach(btn => {
      btn.addEventListener('click', () => deleteVoucher(btn.dataset.id));
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

async function openVoucherModal() {
  openModal('Genera Voucher');
  const target = document.getElementById('modal-body');

  target.innerHTML = `
    <form id="voucher-form">
      <div class="form-group">
        <label>Importo (€)</label>
        <input type="number" name="amount" step="0.01" min="0.01" required>
      </div>
      <div class="form-group">
        <label>Quantità da generare</label>
        <input type="number" name="quantity" value="1" min="1" max="50" required>
      </div>
      <button type="submit" class="menu-button primary">Genera</button>
    </form>
  `;

  document.getElementById('voucher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = parseFloat(fd.get('amount'));
    const quantity = parseInt(fd.get('quantity')) || 1;

    try {
      const vouchers = [];
      for (let i = 0; i < quantity; i++) {
        vouchers.push({
          code: generateVoucherCode(),
          amount: amount,
          is_used: false,
          created_at: new Date().toISOString()
        });
      }

      await safeSupabaseQuery(() => supabase.from('vouchers').insert(vouchers));
      closeModal();
      loadAdminTab('vouchers');
      showInfoModal(`${quantity} voucher generati con successo!`);
    } catch (err) {
      alert('Errore: ' + err.message);
    }
  });
}

function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code; // Esempio: A7X2M9P1
}

async function deleteVoucher(id) {
  if (!await openConfirmModal('Eliminare questo voucher?')) return;
  try {
    await safeSupabaseQuery(() => supabase.from('vouchers').delete().eq('id', id));
    loadAdminTab('vouchers');
  } catch (err) {
    alert('Errore: ' + err.message);
  }
}

async function showNotificheAdmin(container) {
  container.innerHTML = '<p>Nessuna notifica.</p>';
}
