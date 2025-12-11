// ==========================================
// ADMIN AREA
// ==========================================
import { supabase, safeSupabaseQuery, getStationName } from "./core/api.js";
import {
  initAdminContent, showLoadingMessage, showErrorMessage,
  openModal, closeModal, showInfoModal, openConfirmModal
} from "./ui/ui.js";
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
      const content = document.getElementById('admin-content');
      if (content) {
        showDashboard(content, currentStationFilter);
      }
    }
  });
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
      await showDashboard(content, currentStationFilter, () => currentAdminTab === 'dashboard');
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
// Logic moved to js/admin/dashboard.js for modularization
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// STATIONS (Distributori)
// ------------------------------------------------------------------

import { showStationsTab } from "./admin/stations.js";
import { showPrezziAdminModal, showPricesTab } from "./admin/prices.js";
import { showTanksAdminModal, showTanksTab } from "./admin/tanks.js";

// ------------------------------------------------------------------
// STATIONS (Distributori)
// ------------------------------------------------------------------
// Logic moved to js/admin/stations.js
// ------------------------------------------------------------------
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
    handleError(err, 'showOperatorsTab', container);
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
      handleError(err, 'admin_action');
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
      Toast.show('Assegnazione salvata', 'success');
    } catch (err) {
      handleError(err, 'admin_action');
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
    handleError(err, 'showChiusureTab', container);
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
    Toast.show('Errore export: ' + (err?.message || err), 'error');
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
              Toast.show('Le colonne "status" e/o "updated_at" non esistono ancora nel database.\\n\\nEsegui lo script SQL "aggiungi_campi_invoices.sql" per aggiungere tutte le colonne necessarie.', 'warning');
              return;
            }
            throw error;
          }

          // Ricarica la tabella
          showFattureTab(container, actionsContainer);

        } catch (err) {
          Toast.show('Errore aggiornamento stato: ' + err.message, 'error');
        }
      });
    });

  } catch (err) {
    handleError(err, 'showFattureTab', container);
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
    handleError(err, 'showCreditiOverview', container);
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
      handleError(err, 'admin_action');
    }
  });
}

async function deleteCustomer(customerId) {
  if (!await openConfirmModal('Sei sicuro? Verranno eliminati anche i movimenti associati.')) return;
  try {
    await safeSupabaseQuery(() => supabase.from('crediti_clienti').delete().eq('id', customerId));
    loadAdminTab('crediti');
  } catch (err) {
    handleError(err, 'admin_action');
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
      handleError(err, 'admin_action');
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
    handleError(err, 'admin_action');
  }
}

async function showNotificheAdmin(container) {
  container.innerHTML = '<p>Nessuna notifica.</p>';
}
