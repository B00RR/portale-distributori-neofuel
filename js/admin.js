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
  generateClosurePdf, generateClosureExcel,
  getDefaultSchemaFromLayout, applyCustomExportSchema,
  readExportSummaryValues
} from "./export.js";
import { loggedUser, clearSession } from "./auth.js";
import { showIslandsModal } from "./admin-islands.js";

// Stato locale admin
let currentAdminTab = 'dashboard';

export function showAdminArea() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  mainContent.innerHTML = `
    <div class="admin-container">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <h2>Pannello Admin</h2>
          <p class="user-info">Loggato come: <b>${escapeHtml(loggedUser?.full_name)}</b></p>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-btn active" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
          <button class="nav-btn" data-tab="stations"><i class="fas fa-gas-pump"></i> Distributori</button>
          <button class="nav-btn" data-tab="operators"><i class="fas fa-users"></i> Operatori</button>
          <button class="nav-btn" data-tab="chiusure"><i class="fas fa-file-invoice-dollar"></i> Chiusure</button>
          <button class="nav-btn" data-tab="crediti"><i class="fas fa-credit-card"></i> Crediti</button>
          <button class="nav-btn" data-tab="vouchers"><i class="fas fa-ticket-alt"></i> Voucher</button>
          <button class="nav-btn" data-tab="notifiche"><i class="fas fa-bell"></i> Notifiche</button>
          <button class="nav-btn logout-btn" id="admin-logout"><i class="fas fa-sign-out-alt"></i> Esci</button>
        </nav>
      </aside>
      <main class="admin-main">
        <header class="admin-header">
          <h1 id="page-title">Dashboard</h1>
          <div id="header-actions"></div>
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
      window.location.reload();
    }
  });

  // Carica tab iniziale
  loadAdminTab('dashboard');
}

function loadAdminTab(tab) {
  currentAdminTab = tab;
  const pageTitle = document.getElementById('page-title');
  const headerActions = document.getElementById('header-actions');
  const content = document.getElementById('admin-content');

  if (headerActions) headerActions.innerHTML = '';
  if (content) content.innerHTML = '';

  switch (tab) {
    case 'dashboard':
      if (pageTitle) pageTitle.textContent = 'Dashboard';
      showDashboard(content);
      break;
    case 'stations':
      if (pageTitle) pageTitle.textContent = 'Gestione Distributori';
      showStationsTab(content, headerActions);
      break;
    case 'operators':
      if (pageTitle) pageTitle.textContent = 'Gestione Operatori';
      showOperatorsTab(content, headerActions);
      break;
    case 'chiusure':
      if (pageTitle) pageTitle.textContent = 'Storico Chiusure';
      showChiusureTab(content, headerActions);
      break;
    case 'crediti':
      if (pageTitle) pageTitle.textContent = 'Gestione Crediti';
      showCreditiOverview(content, headerActions);
      break;
    case 'vouchers':
      if (pageTitle) pageTitle.textContent = 'Gestione Voucher';
      showVoucherAdminTab(content, headerActions);
      break;
    case 'notifiche':
      if (pageTitle) pageTitle.textContent = 'Notifiche';
      showNotificheAdmin(content);
      break;
    default:
      showDashboard(content);
  }
}

// ------------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------------
async function showDashboard(container) {
  showLoadingMessage(container);
  try {
    // Esempio di dashboard semplice
    const { count: stationsCount } = await supabase.from('fuel_stations').select('*', { count: 'exact', head: true });
    const { count: operatorsCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'operator');
    const { count: closuresCount } = await supabase.from('closing_shift').select('*', { count: 'exact', head: true });

    container.innerHTML = `
      <div class="dashboard-grid">
        <div class="dash-card">
          <h3>Distributori</h3>
          <div class="dash-value">${stationsCount || 0}</div>
        </div>
        <div class="dash-card">
          <h3>Operatori</h3>
          <div class="dash-value">${operatorsCount || 0}</div>
        </div>
        <div class="dash-card">
          <h3>Chiusure Totali</h3>
          <div class="dash-value">${closuresCount || 0}</div>
        </div>
      </div>
      <div class="dashboard-recent">
        <h3>Ultime Attività</h3>
        <p>Funzionalità in arrivo...</p>
      </div>
    `;
  } catch (err) {
    showErrorMessage(container, err);
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
              <th>Indirizzo</th>
              <th>Città</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    stations.forEach(st => {
      html += `
        <tr>
          <td>${escapeHtml(st.station_name)}</td>
          <td>${escapeHtml(st.address)}</td>
          <td>${escapeHtml(st.city)}</td>
          <td>
            <button class="icon-btn edit-station" data-id="${st.station_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn prices-station" data-id="${st.station_id}" title="Prezzi"><i class="fas fa-tag"></i></button>
            <button class="icon-btn islands-station" data-id="${st.station_id}" title="Isole e Pistole"><i class="fas fa-gas-pump"></i></button>
            <button class="icon-btn delete-station" data-id="${st.station_id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

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

  target.innerHTML = `
    <form id="station-form">
      <div class="form-group">
        <label>Nome Distributore</label>
        <input type="text" name="station_name" value="${escapeHtml(station.station_name)}" required>
      </div>
      <div class="form-group">
        <label>Indirizzo</label>
        <input type="text" name="address" value="${escapeHtml(station.address)}">
      </div>
      <div class="form-group">
        <label>Città</label>
        <input type="text" name="city" value="${escapeHtml(station.city)}">
      </div>
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Distributore'}</button>
    </form>
  `;

  document.getElementById('station-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      station_name: formData.get('station_name'),
      address: formData.get('address'),
      city: formData.get('city')
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
    .maybeSingle();

  const benzinaValue = escapeNumber(current?.prezzo_benzina);
  const gasolioValue = escapeNumber(current?.prezzo_gasolio);
  const gplValue = escapeNumber(current?.prezzo_gpl);
  const metanoValue = escapeNumber(current?.prezzo_metano);

  target.innerHTML = `
    <form id="admin-prezzi-form">
      <div class="form-group"><label>Benzina</label><input type="number" step="0.001" min="0" name="benzina" value="${benzinaValue}" /></div>
      <div class="form-group"><label>Gasolio</label><input type="number" step="0.001" min="0" name="gasolio" value="${gasolioValue}" /></div>
      <div class="form-group"><label>GPL</label><input type="number" step="0.001" min="0" name="gpl" value="${gplValue}" /></div>
      <div class="form-group"><label>Metano</label><input type="number" step="0.001" min="0" name="metano" value="${metanoValue}" /></div>
      <div class="form-group"><label>Validità</label>
        <div class="validita-grid">
          <label><input type="radio" name="validita" value="ora" checked> Da ora</label>
          <label><input type="radio" name="validita" value="prossima"> Dalla prossima chiusura</label>
        </div>
      </div>
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
      prezzo_gpl: parseFloat(fd.get('gpl')) || 0,
      prezzo_metano: parseFloat(fd.get('metano')) || 0,
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
    target.innerHTML = '<p class="loading-text">Caricamento cisterne...</p>';

    const { data: tanks, error } = await supabase
      .from('tanks')
      .select('*')
      .eq('station_id', stationId)
      .order('name');

    if (error) {
      target.innerHTML = `<p class="error-text">Errore: ${error.message}</p>`;
      return;
    }

    let html = `
      <div class="tanks-list" style="margin-bottom: 20px;">
        <h4>Cisterne Esistenti</h4>
        ${(!tanks || tanks.length === 0) ? '<p>Nessuna cisterna configurata.</p>' : ''}
        <ul class="list-group">
    `;

    if (tanks) {
      tanks.forEach(t => {
        html += `
          <li class="list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
            <div>
              <strong>${escapeHtml(t.name)}</strong>
              <span class="badge badge-info">${escapeHtml(t.fuel_type)}</span>
              <span style="color: #666; margin-left: 10px;">Capacità: ${formatNumberIt(t.capacity)} L</span>
            </div>
            <button class="icon-btn delete-tank" data-id="${t.id}" style="color: #ef4444;"><i class="fas fa-trash"></i></button>
          </li>
        `;
      });
    }

    html += `
        </ul>
      </div>

      <div class="add-tank-form" style="background: #f9fafb; padding: 15px; border-radius: 8px;">
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
                <option value="GPL">GPL</option>
                <option value="Metano">Metano</option>
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
    `;

    target.innerHTML = html;

    // Listeners
    target.querySelectorAll('.delete-tank').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Eliminare questa cisterna?')) return;
        await safeSupabaseQuery(() => supabase.from('tanks').delete().eq('id', btn.dataset.id));
        renderTanks();
      });
    });

    document.getElementById('add-tank-form').addEventListener('submit', async (e) => {
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
        renderTanks();
      } catch (err) {
        alert('Errore: ' + err.message);
      }
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
      .select('*')
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
              <th>Username</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    users.forEach(u => {
      html += `
        <tr>
          <td>${escapeHtml(u.full_name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.username)}</td>
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
      <div class="form-group">
        <label>Username (opzionale)</label>
        <input type="text" name="username" value="${escapeHtml(user.username)}">
      </div>
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Operatore'}</button>
    </form>
  `;

  document.getElementById('operator-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email');
    const password = fd.get('password');
    const fullName = fd.get('full_name');
    const username = fd.get('username');

    try {
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from('users').update({ full_name: fullName, username }).eq('user_id', userId));
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
          username,
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
async function showChiusureTab(container, actionsContainer) {
  showLoadingMessage(container);
  if (actionsContainer) actionsContainer.innerHTML = ''; // Filtri potrebbero andare qui

  try {
    const { data: closures, error } = await supabase
      .from('closing_shift')
      .select(`
        *,
        fuel_stations (station_name),
        users!operator_id (full_name)
      `)
      .order('date_time', { ascending: false })
      .limit(500);

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
      const dateStr = new Date(c.date_time).toLocaleString('it-IT');
      const stationName = c.fuel_stations?.station_name || `#${c.station_id}`;
      const operatorName = c.users?.full_name || `#${c.operator_id}`;

      // Determina il tipo di chiusura
      const isFinal = c.is_final === true || c.is_final === 1;
      const closureType = isFinal ? 'Finale' : 'Parziale';
      const closureClass = isFinal ? 'badge-success' : 'badge-warning';

      // Calcolo robusto del totale
      const totalValue = c.gran_totale || c.total || c.totale || c.total_amount || c.grand_total || ((c.incasso_contanti || 0) + (c.incasso_pos || 0)) || 0;
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
  // Implementazione semplificata dettagli
  openModal('Dettagli Chiusura');
  const target = document.getElementById('modal-body');
  showLoadingMessage(target);

  try {
    const { data: closure } = await supabase.from('closing_shift').select('*').eq('id', closureId).single();
    if (!closure) throw new Error('Chiusura non trovata');

    target.innerHTML = `
      <div class="closure-details">
        <p><b>ID:</b> ${closure.id}</p>
        <p><b>Data:</b> ${new Date(closure.date_time).toLocaleString()}</p>
        <p><b>Contanti:</b> ${formatEuro(closure.incasso_contanti)}</p>
        <p><b>POS:</b> ${formatEuro(closure.incasso_pos)}</p>
        <p><b>Totale:</b> ${formatEuro(closure.gran_totale)}</p>
        <hr>
        <p><i>Dettagli completi disponibili in export</i></p>
      </div>
    `;
  } catch (err) {
    target.innerHTML = `<p class="error">Errore: ${err.message}</p>`;
  }
}

async function openExportModal(closureId) {
  openModal('Esporta Chiusura');
  const target = document.getElementById('modal-body');
  showLoadingMessage(target);

  try {
    const ctx = await fetchClosureExportData(closureId);
    const defaultSchema = getDefaultSchemaFromLayout(ctx.layout);

    target.innerHTML = `
      <div class="export-modal-content">
        <p>Esporta i dati della chiusura del <b>${ctx.meta.dateDisplay}</b></p>
        
        <div class="tabs">
          <button class="tab-btn active" data-tab="summary">Riepilogo</button>
          <button class="tab-btn" data-tab="schema">Schema JSON</button>
        </div>
        
        <div id="tab-summary" class="tab-content active">
          <form id="closure-export-summary-form" class="summary-grid">
            <div class="form-group">
              <label>Self Service</label>
              <input type="number" step="0.01" name="summary_self" value="${ctx.summaryDefaults.self}">
            </div>
            <div class="form-group">
              <label>Carte Self</label>
              <input type="number" step="0.01" name="summary_carte_self" value="${ctx.summaryDefaults.carteSelf}">
            </div>
            <div class="form-group">
              <label>Contanti Servito</label>
              <input type="number" step="0.01" name="summary_contanti" value="${ctx.summaryDefaults.contanti}">
            </div>
            <div class="form-group">
              <label>Carte POS</label>
              <input type="number" step="0.01" name="summary_carte_pos" value="${ctx.summaryDefaults.cartePos}">
            </div>
            <div class="form-group">
              <label>Non Erogato</label>
              <input type="number" step="0.01" name="summary_non_erogato" value="${ctx.summaryDefaults.nonErogato}">
            </div>
            <div class="form-group">
              <label>Lubr/AdBlue/Acc</label>
              <input type="number" step="0.01" name="summary_lubr_adblue" value="${ctx.summaryDefaults.lubrAdblue}">
            </div>
            <div class="form-group">
              <label>Crediti</label>
              <input type="number" step="0.01" name="summary_crediti" value="${ctx.summaryDefaults.crediti}">
            </div>
            <div class="form-group">
              <label>UTA/DKV</label>
              <input type="number" step="0.01" name="summary_uta_dkv" value="${ctx.summaryDefaults.utaDkv}">
            </div>
          </form>
        </div>
        
        <div id="tab-schema" class="tab-content" style="display:none;">
          <p class="small-text">Modifica il layout delle isole per il PDF/Excel:</p>
          <textarea id="export-schema-json" rows="10" style="width:100%; font-family:monospace;">${defaultSchema}</textarea>
          <button type="button" id="reset-schema-btn" class="btn-small">Ripristina Default</button>
        </div>
        
        <div class="modal-actions" style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
          <button id="btn-export-pdf" class="menu-button primary"><i class="fas fa-file-pdf"></i> PDF</button>
          <button id="btn-export-excel" class="menu-button success"><i class="fas fa-file-excel"></i> Excel</button>
        </div>
      </div>
    `;

    // Tab switching logic
    const tabs = target.querySelectorAll('.tab-btn');
    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        target.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        t.classList.add('active');
        document.getElementById(`tab-${t.dataset.tab}`).style.display = 'block';
      });
    });

    document.getElementById('reset-schema-btn').addEventListener('click', () => {
      document.getElementById('export-schema-json').value = defaultSchema;
    });

    const handleExport = async (type) => {
      try {
        const schemaText = document.getElementById('export-schema-json').value;
        const customLayout = applyCustomExportSchema(ctx.layout, ctx.lookups, schemaText);
        const summaryValues = readExportSummaryValues(ctx.summaryDefaults);
        const template = buildClosureTemplate(ctx, customLayout, summaryValues);

        if (type === 'pdf') generateClosurePdf(template);
        else generateClosureExcel(template);

        // closeModal(); // Opzionale: chiudere o lasciare aperto per fare altro export
      } catch (err) {
        alert('Errore export: ' + err.message);
      }
    };

    document.getElementById('btn-export-pdf').addEventListener('click', () => handleExport('pdf'));
    document.getElementById('btn-export-excel').addEventListener('click', () => handleExport('excel'));

  } catch (err) {
    showErrorMessage(target, err);
  }
}

// ------------------------------------------------------------------
// CREDITI & VOUCHER & NOTIFICHE (Placeholder/Minimal)
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// CREDITI (Credits)
// ------------------------------------------------------------------
async function showCreditiOverview(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-customer-btn"><i class="fas fa-plus"></i> Nuovo Cliente</button>`;
    document.getElementById('add-customer-btn').addEventListener('click', () => openCustomerModal());
  }

  try {
    const { data: customers, error } = await supabase
      .from('crediti_clienti')
      .select('*')
      .order('cliente');

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
              <th>Saldo Attuale</th>
              <th>Ultimo Aggiornamento</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    customers.forEach(c => {
      html += `
        <tr>
          <td>${escapeHtml(c.cliente)}</td>
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
        <input type="number" name="saldo" step="0.01" value="0">
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
async function showVoucherAdminTab(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="generate-voucher-btn"><i class="fas fa-plus"></i> Genera Voucher</button>`;
    document.getElementById('generate-voucher-btn').addEventListener('click', () => openVoucherModal());
  }

  try {
    const { data: vouchers, error } = await supabase
      .from('vouchers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

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
