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
// NOTA: showVoucherAdminTab ora usa lazy loading (vedi case 'vouchers')
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

    const assignedStations = loggedUser?.assignedStations || [];

    let options = stations || [];

    // Se non è admin, mostra solo le stazioni assegnate
    if (!isFullAdmin) {
      options = options.filter(s => assignedStations.some(as => as.id === s.station_id));
    }

    const currentFilter = store.getFilter();

    // Se non c'è un filtro impostato e l'utente ha stazioni assegnate (e non è admin), imposta la prima come default
    if (currentFilter === null && !isFullAdmin && options.length > 0) {
      store.setStationFilter(options[0].station_id);
      // Ricarichiamo dopo aver impostato il filtro per evitare loop ma assicurare la coerenza
      // Tuttavia, setStationFilter notificherà i listener. In questo contesto, meglio farlo prima del render.
    }

    const finalFilter = store.getFilter();

    container.innerHTML = `
      <div class="global-filter-wrapper">
        <i class="fas fa-filter filter-icon"></i>
        <select id="global-station-filter" class="global-filter-select">
          ${isFullAdmin ? '<option value="">Tutte le Stazioni</option>' : ''}
          ${options.map(s => `<option value="${s.station_id}" ${finalFilter == s.station_id ? 'selected' : ''}>${escapeHtml(s.station_name)}</option>`).join('')}
        </select>
      </div>
    `;

    const filterSelect = document.getElementById('global-station-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const newFilter = val ? parseInt(val) : null;
        store.setStationFilter(newFilter);
        // Ricarica la tab corrente con il nuovo filtro
        loadAdminTab(currentAdminTab);
      });
    }
  }

  function renderBreadcrumbs(tab, subPath = '') {
    const container = document.getElementById('breadcrumbs');
    if (!container) return;

    const labels = {
      'dashboard': 'Dashboard',
      'stations': 'Distributori',
      'operators': 'Operatori',
      'shifts': 'Chiusure',
      'crediti': 'Crediti',
      'invoices': 'Fatture',
      'vouchers': 'Voucher',
      'notifiche': 'Notifiche',
      'settings': 'Impostazioni'
    };

    // Home link - sempre cliccabile, vai a dashboard
    let html = `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="dashboard" style="cursor: pointer; text-decoration: none;"><i class="fas fa-home"></i> Home</a>`;

    // Mostra la tab corrente nei breadcrumb
    if (labels[tab] && tab !== 'dashboard') {
      html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
      // Tab intermedia cliccabile se c'è subPath, altrimenti attiva
      if (subPath) {
        html += `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="${tab}" style="cursor: pointer; text-decoration: none;">${labels[tab]}</a>`;
      } else {
        html += `<span class="breadcrumb-item active">${labels[tab]}</span>`;
      }
    }

    if (subPath) {
      html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
      html += `<span class="breadcrumb-item active">${subPath}</span>`;
    }

    container.innerHTML = html;

    // Aggiungi event listeners per i link cliccabili
    container.querySelectorAll('.breadcrumb-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = link.dataset.tab;
        if (targetTab) {
          currentAdminTab = targetTab;
          loadAdminTab(targetTab);
        }
      });
    });
  }




  const userRole = loggedUser?.role || 'operator';
  const isFullAdmin = userRole === 'admin' || userRole === 'super_admin';

  mainContent.innerHTML = `
    <div class="admin-container">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <p class="sidebar-subtitle">Control Center</p>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-btn active" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
          
          ${isFullAdmin ? `
            <button class="nav-btn" data-tab="stations"><i class="fas fa-gas-pump"></i> Distributori</button>
            <button class="nav-btn" data-tab="operators"><i class="fas fa-users-cog"></i> Gestione Operatori</button>
          ` : ''}

          ${(isFullAdmin || userRole === 'accounting') ? `
            <button class="nav-btn" data-tab="vouchers"><i class="fas fa-ticket-alt"></i> Gestione Voucher</button>
            <button class="nav-btn" data-tab="shifts"><i class="fas fa-clock"></i> Turni e Chiusure</button>
            <button class="nav-btn" data-tab="crediti"><i class="fas fa-credit-card"></i> Crediti</button>
          ` : ''}

          ${(isFullAdmin || userRole === 'billing' || userRole === 'accounting') ? `
            <button class="nav-btn" data-tab="invoices"><i class="fas fa-file-invoice"></i> Fatture</button>
          ` : ''}

          <button class="nav-btn" data-tab="notifiche"><i class="fas fa-bell"></i> Notifiche</button>
          
          ${isFullAdmin ? `
            <button class="nav-btn" data-tab="settings"><i class="fas fa-cog"></i> Impostazioni</button>
          ` : ''}

          <button class="nav-btn logout-btn" id="admin-logout"><i class="fas fa-sign-out-alt"></i> Esci</button>
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-footer-avatar">
            <i class="fas fa-user-shield"></i>
          </div>
          <div class="sidebar-footer-meta">
            <span class="sidebar-footer-role">${escapeHtml(userRole === 'admin' || userRole === 'super_admin' ? 'Amministratore' : (userRole === 'accounting' ? 'Contabilità' : (userRole === 'billing' ? 'Fatturazione' : 'Operatore')))}</span>
            <span class="sidebar-footer-name">${escapeHtml(loggedUser?.full_name || 'Utente')}</span>
          </div>
        </div>
      </aside>
      <main class="admin-main">
        <header class="admin-header">
          <div class="admin-header-center">
            <img src="assets/images/logo svg.svg" alt="Neofuel" class="admin-header-logo" />
            <div class="header-titles">
              <p class="welcome-subtitle" id="page-subtitle">Dashboard</p>
              <nav id="breadcrumbs" class="breadcrumbs"></nav>
            </div>
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
    const confirmLogout = await openConfirmModal('Sei sicuro di voler uscire dal Portale Neofuel?');
    if (confirmLogout) {
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

    renderBreadcrumbs(tab); // Update Breadcrumbs

    await renderGlobalFilter(); // Assicurati che il filtro sia presente/aggiornato
    const filter = store.getFilter();

    // Verifichiamo il permesso per la tab
    let allowed = true;
    if (['stations', 'operators', 'settings'].includes(tab) && !isFullAdmin) allowed = false;
    if (tab === 'shifts' && !isFullAdmin && userRole !== 'accounting') allowed = false;
    if (tab === 'crediti' && !isFullAdmin && userRole !== 'accounting') allowed = false;
    if (tab === 'invoices' && !isFullAdmin && userRole !== 'billing' && userRole !== 'accounting') allowed = false;
    if (tab === 'vouchers' && !isFullAdmin && userRole !== 'accounting') allowed = false;

    if (!allowed) {
      content.innerHTML = `
        <div class="error-container">
          <i class="fas fa-lock error-icon"></i>
          <h2>Accesso Negato</h2>
          <p>Non disponi dei permessi necessari per visualizzare questa sezione.</p>
          <button class="menu-button primary" onclick="window.location.reload()">Torna alla Dashboard</button>
        </div>
      `;
      return;
    }
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
        await import('./admin/invoices.js').then(module => {
          module.showFattureTab(content, headerActions, filter);
        });
        break;
      case 'vouchers':
        showLoadingMessage(content);
        try {
          const { showVoucherAdminTab } = await import('./admin/vouchers_reboot.js');
          showVoucherAdminTab(content, headerActions);
        } catch (err) {
          handleError(err, 'Caricamento modulo Voucher', content);
        }
        break;
      case 'notifiche':
        // Placeholder - modulo Notifiche non ancora implementato
        content.innerHTML = `
          <div class="content-box" style="text-align: center; padding: 60px 20px;">
            <i class="fas fa-bell" style="font-size: 4rem; color: var(--secondary-color); margin-bottom: 20px;"></i>
            <h2 style="margin-bottom: 10px;">Notifiche</h2>
            <p style="color: var(--text-secondary);">Questa funzionalità sarà disponibile prossimamente.</p>
          </div>
        `;
        break;
      case 'settings':
        showSettingsTab(content, headerActions);
        break;
      default:
        showDashboard(content, filter);
    }
  }

  // Pre-inizializza il filtro se necessario per utenti ristretti
  if (!isFullAdmin && loggedUser?.assignedStations?.length > 0) {
    if (store.getFilter() === null) {
      store.setStationFilter(loggedUser.assignedStations[0].id);
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


