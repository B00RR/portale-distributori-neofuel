// ADMIN AREA
// ==========================================
import { supabase, safeSupabaseQuery, getStationName } from "./core/api.js";
import {
  initAdminContent, showLoadingMessage, showErrorMessage,
  openModal, closeModal, showInfoModal, openConfirmModal, setButtonLoading
} from "./ui/ui.js";
import { Validators, validateForm, formatErrorMessages } from "./shared/validators.js";
import {
  escapeHtml, escapeNumber, formatNumberIt, formatLitri,
  parseNumberFlexible, slugifyLabel, formatEuro
} from "./utils/utils.js";
import {
  fetchClosureExportData, buildClosureTemplate,
  generateClosureExcel,
  applyCustomExportSchema,
  readExportSummaryValues
} from "./utils/export.js";
import { loggedUser, clearSession } from "./core/auth.js";
import { showIslandsModal } from "./admin/islands.js";
import { showSettingsTab } from "./admin/logic.js";
import { calculationEngine, CALCULATION_SCOPES } from "./utils/calculation-engine.js";
import { Toast } from "./ui/toast.js";
import { loadDashboardConfig, saveDashboardConfig, showDashboardConfigPanel, KPI_CATALOG } from "./admin/dashboard-config.js";
import { showDashboard } from "./admin/dashboard.js";
import { handleError } from "./shared/error-handler.js";
import { store } from "./shared/state.js";
import { showStationsTab } from "./admin/stations.js";
import { showPrezziAdminModal, showPricesTab } from "./admin/prices.js";
import { showTanksAdminModal, showTanksTab } from "./admin/tanks.js";
// Imports for other modules should be here or dynamic imports if circular dependency issues arise.
// Since we are fixing a file where imports were moved, we assume these functions are available or need to be imported.
import { showVoucherAdminTab } from "./admin/vouchers.js";
import { showFattureTab } from "./admin/invoices.js";
import { showCreditiOverview as showCreditsTab } from "./admin/credits.js";
import { showOperatorsTab } from "./admin/operators.js";
import { showChiusureTab } from "./admin/shifts.js";



// Stato locale admin
let currentAdminTab = 'dashboard';



export function showAdminArea() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Funzione Global Filter definita internamente per accedere allo scope condiviso (loadAdminTab)
  async function renderGlobalFilter() {
    const container = document.getElementById('header-actions');
    if (!container) return;

    // Usa stazioni dallo store se disponibili, altrimenti carica
    let stations = store.state.stations;

    if (!stations || stations.length === 0) {
      const { data } = await safeSupabaseQuery(() => supabase.from('fuel_stations').select('station_id, station_name').order('station_name'));
      if (data) {
        store.setStations(data);
        stations = data;
      }
    }

    const options = stations || [];
    const currentFilter = store.getFilter();

    container.innerHTML = `
      <div class="global-filter-wrapper">
        <i class="fas fa-filter filter-icon"></i>
        <select id="global-station-filter" class="global-filter-select">
          <option value="">Tutte le Stazioni</option>
          ${options.map(s => `<option value="${s.station_id}" ${currentFilter == s.station_id ? 'selected' : ''}>${escapeHtml(s.station_name)}</option>`).join('')}
        </select>
      </div>
    `;

    document.getElementById('global-station-filter').addEventListener('change', (e) => {
      const val = e.target.value;
      const newFilter = val ? parseInt(val) : null;
      store.setStationFilter(newFilter);
      // Ricarica la tab corrente con il nuovo filtro
      loadAdminTab(currentAdminTab);
    });
  }

  // Funzione per caricare le tab
  async function loadAdminTab(tab) {
    currentAdminTab = tab;
    const content = document.getElementById('admin-content');
    const headerActions = document.getElementById('header-actions');
    const pageSubtitle = document.getElementById('page-subtitle');

    // Aggiorna navigazione
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    // Imposta titolo
    const titles = {
      'dashboard': 'Dashboard',
      'stations': 'Gestione Distributori',
      'operators': 'Gestione Operatori',
      'shifts': 'Registro Chiusure',
      'crediti': 'Gestione Crediti',
      'invoices': 'Richieste Fatture',
      'vouchers': 'Gestione Voucher',
      'notifiche': 'Notifiche',
      'settings': 'Impostazioni'
    };
    if (pageSubtitle) pageSubtitle.textContent = titles[tab] || 'Control Center';

    await renderGlobalFilter();
    const filter = store.getFilter();

    switch (tab) {
      case 'dashboard':
        showDashboard(content, filter);
        break;
      case 'stations':
        showStationsTab(content, headerActions);
        break;
      case 'operators':
        showOperatorsTab(content, headerActions);
        break;
      case 'shifts':
        showChiusureTab(content, headerActions, filter);
        break;
      case 'crediti':
        if (typeof showCreditsTab !== 'undefined') showCreditsTab(content, headerActions);
        else content.innerHTML = '<p>Modulo Crediti in caricamento...</p>';
        break;
      case 'invoices':
        if (typeof showFattureTab !== 'undefined') showFattureTab(content, headerActions);
        else content.innerHTML = '<p>Modulo Fatture in fase di completamento...</p>';
        break;
      case 'vouchers':
        if (typeof showVoucherAdminTab !== 'undefined') showVoucherAdminTab(content, headerActions);
        else if (typeof showVoucherView !== 'undefined') showVoucherView();
        else content.innerHTML = '<p>Modulo Voucher in caricamento...</p>';
        break;
      case 'notifiche':
        showNotificheAdmin(content);
        break;
      case 'settings':
        showSettingsTab(content, headerActions);
        break;
      default:
        showDashboard(content, filter);
    }
  }


  mainContent.innerHTML = `
    <div class="admin-container">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <p class="sidebar-subtitle">Control Center</p>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-btn active" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
          <button class="nav-btn" data-tab="stations"><i class="fas fa-gas-pump"></i> Distributori</button>
          <button class="nav-btn" data-tab="operators"><i class="fas fa-users-cog"></i> Gestione Operatori</button>
          <button class="nav-btn" data-tab="vouchers"><i class="fas fa-ticket-alt"></i> Gestione Voucher</button>
          <button class="nav-btn" data-tab="shifts"><i class="fas fa-clock"></i> Turni e Chiusure</button>
          <button class="nav-btn" data-tab="crediti"><i class="fas fa-credit-card"></i> Crediti</button>
          <button class="nav-btn" data-tab="invoices"><i class="fas fa-file-invoice"></i> Fatture</button>
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
            <img src="assets/images/logo svg.svg" alt="Neofuel" class="admin-header-logo" />
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

  // Funzione per caricare le tab
  async function loadAdminTab(tab) {
    currentAdminTab = tab;
    const content = document.getElementById('admin-content');
    const headerActions = document.getElementById('header-actions');
    const pageSubtitle = document.getElementById('page-subtitle');

    // Aggiorna navigazione
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    // Imposta titolo
    const titles = {
      'dashboard': 'Dashboard',
      'stations': 'Gestione Distributori',
      'operators': 'Gestione Operatori',
      'shifts': 'Registro Chiusure',
      'crediti': 'Gestione Crediti',
      'invoices': 'Richieste Fatture',
      'vouchers': 'Gestione Voucher',
      'notifiche': 'Notifiche',
      'settings': 'Impostazioni'
    };
    if (pageSubtitle) pageSubtitle.textContent = titles[tab] || 'Control Center';

    await renderGlobalFilter(); // Assicurati che il filtro sia presente/aggiornato
    const filter = store.getFilter();

    switch (tab) {
      case 'dashboard':
        showDashboard(content, filter);
        break;
      case 'stations':
        showStationsTab(content, headerActions);
        break;
      case 'operators':
        showOperatorsTab(content, headerActions);
        break;
      case 'shifts':
        showChiusureTab(content, headerActions, filter);
        break;
      case 'crediti':

        if (typeof showCreditsTab !== 'undefined') showCreditsTab(content, headerActions);
        else content.innerHTML = '<p>Modulo Crediti in caricamento...</p>';
        break;
      case 'invoices':
        content.innerHTML = '<p>Modulo Fatture: Work in progress (Import missing)</p>';
        break;
      case 'vouchers':
        if (typeof showVoucherAdminTab !== 'undefined') showVoucherAdminTab(content, headerActions);
        else if (typeof showVoucherView !== 'undefined') showVoucherView(); // Check legacy names
        else content.innerHTML = '<p>Modulo Voucher in caricamento...</p>';
        break;
      case 'notifiche':
        showNotificheAdmin(content);
        break;
      case 'settings':
        showSettingsTab(content, headerActions);
        break;
      default:
        showDashboard(content, filter);
    }
  }

  // Carica tab iniziale
  renderGlobalFilter();
  loadAdminTab('dashboard');

  // Event listener for dashboard configuration button (delegated)
  document.getElementById('admin-content')?.addEventListener('click', (e) => {
    if (e.target.closest('#btn-configure-dashboard')) {
      showDashboardConfigPanel();
    }
  });

  // Listen for dashboard config changes and reload dashboard
  document.addEventListener('dashboard-config-changed', () => {
    if (currentAdminTab === 'dashboard') {
      loadAdminTab('dashboard');
    }
  });

  // ------------------------------------------------------------------
  // DASHBOARD
  // ------------------------------------------------------------------


  // ------------------------------------------------------------------
  // STATIONS (Distributori)
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // STATIONS (Distributori)
  // ------------------------------------------------------------------


  // ------------------------------------------------------------------


  // ------------------------------------------------------------------

}


