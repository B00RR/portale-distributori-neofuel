// ==========================================
// OPERATOR AREA
// ==========================================
import { supabase, safeSupabaseQuery, getStationName } from "./api.js";
import {
  showLoadingMessage, showErrorMessage,
  openModal, closeModal, showInfoModal, openConfirmModal
} from "./ui.js";
import {
  escapeHtml, escapeNumber, formatNumberIt, formatLitri,
  parseNumberFlexible, formatEuro
} from "./utils.js";
import { loggedUser, clearSession } from "./auth.js";

export async function showInvoiceMenu(userId, stationId) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Layout operatore
  // Aggiungiamo stili inline per le nuove funzionalità per evitare di toccare il CSS se non necessario
  const style = document.createElement('style');
  style.innerHTML = `
    .result-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;
    }
    .result-item:hover { background: #f9f9f9; }
    .customer-header {
      background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;
      border-left: 4px solid #0284c7;
    }
    .balance-display { font-size: 1.2em; color: #0284c7; margin-top: 5px; }
    .action-tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab-btn {
      flex: 1; padding: 10px; border: 1px solid #ddd; background: #fff; border-radius: 6px; cursor: pointer;
    }
    .tab-btn.active { background: #0284c7; color: white; border-color: #0284c7; }
    .voucher-amount { font-size: 2em; font-weight: bold; color: #10b981; margin: 10px 0; }
  `;
  document.head.appendChild(style);

  mainContent.innerHTML = `
    <div class="operator-container">
      <header class="operator-header">
        <div class="header-left">
          <h2>Neofuel</h2>
          <span class="station-badge" id="station-badge">Caricamento...</span>
        </div>
        <div class="header-right">
          <span class="user-name">${escapeHtml(loggedUser?.full_name)}</span>
          <button id="op-logout-btn" class="icon-btn"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      </header>
      
      <div class="operator-grid">
        <button class="op-card" id="btn-apertura">
          <i class="fas fa-door-open"></i>
          <span>Apertura</span>
          <span class="status-badge" id="opening-status"></span>
        </button>
        <button class="op-card" id="btn-chiusura">
          <i class="fas fa-door-closed"></i>
          <span>Chiusura</span>
        </button>
        <button class="op-card" id="btn-prezzi">
          <i class="fas fa-tags"></i>
          <span>Prezzi</span>
        </button>
        <button class="op-card" id="btn-crediti">
          <i class="fas fa-credit-card"></i>
          <span>Crediti</span>
        </button>
        <button class="op-card" id="btn-voucher">
          <i class="fas fa-ticket-alt"></i>
          <span>Voucher</span>
        </button>
      </div>
      
      <div id="operator-content" class="operator-content">
        <div class="welcome-message">
            <p>Seleziona un'attività dal menu in alto.</p>
        </div>
      </div>
    </div>
  `;

  // Carica nome stazione
  getStationName(stationId).then(name => {
    const badge = document.getElementById('station-badge');
    if (badge) badge.textContent = name;
  });

  // Listeners
  document.getElementById('op-logout-btn').addEventListener('click', async () => {
    if (confirm('Vuoi uscire?')) {
      await clearSession();
      window.location.reload();
    }
  });

  document.getElementById('btn-apertura').addEventListener('click', () => showAperturaForm(stationId, userId));
  document.getElementById('btn-chiusura').addEventListener('click', () => startClosureWizard(stationId, userId));
  document.getElementById('btn-prezzi').addEventListener('click', () => showPrezziEditForm(stationId));
  document.getElementById('btn-crediti').addEventListener('click', () => showCreditsMenu(stationId, userId));
  document.getElementById('btn-voucher').addEventListener('click', () => showVoucherMenu(stationId, userId));

  // Controlla e mostra stato apertura
  updateOpeningStatus(stationId);
}

async function showPrezziEditForm(stationId) {
  const container = document.getElementById('operator-content');
  showLoadingMessage(container);

  try {
    const { data: current } = await supabase
      .from('prezzi_distributore')
      .select('*')
      .eq('station_id', stationId)
      .order('data_validita', { ascending: false })
      .maybeSingle();

    const benzina = current?.prezzo_benzina || 0;
    const gasolio = current?.prezzo_gasolio || 0;

    container.innerHTML = `
      <div class="content-box">
        <h3>Modifica Prezzi</h3>
        <form id="op-prezzi-form">
          <div class="form-row">
            <div class="form-group">
              <label>Benzina</label>
              <input type="number" step="0.001" name="benzina" value="${benzina}" class="big-input">
            </div>
            <div class="form-group">
              <label>Gasolio</label>
              <input type="number" step="0.001" name="gasolio" value="${gasolio}" class="big-input">
            </div>
          </div>
          <button type="submit" class="menu-button primary full-width">Aggiorna Prezzi</button>
        </form>
      </div>
    `;

    document.getElementById('op-prezzi-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        station_id: stationId,
        prezzo_benzina: parseFloat(fd.get('benzina')),
        prezzo_gasolio: parseFloat(fd.get('gasolio')),
        data_validita: new Date().toISOString()
      };

      try {
        await safeSupabaseQuery(() => supabase.from('prezzi_distributore').insert([payload]));
        showInfoModal('Prezzi aggiornati con successo!');
        container.innerHTML = '<div class="success-message"><i class="fas fa-check-circle"></i> Prezzi aggiornati.</div>';
      } catch (err) {
        showInfoModal('Errore: ' + err.message);
      }
    });
  } catch (err) {
    showErrorMessage(container, err);
  }
}

// ==========================================
// OPENING SHIFT (Apertura Turno)
// ==========================================

async function updateOpeningStatus(stationId) {
  const badge = document.getElementById('opening-status');
  if (!badge) return;

  const activeOpening = await checkOpeningStatus(stationId);

  if (activeOpening) {
    badge.textContent = 'Aperto';
    badge.className = 'status-badge status-open';
    badge.title = `Aperto da ${activeOpening.users?.full_name || 'Operatore'} il ${new Date(activeOpening.date_time).toLocaleString('it-IT')}`;
  } else {
    badge.textContent = 'Chiuso';
    badge.className = 'status-badge status-closed';
    badge.title = 'Nessuna apertura attiva';
  }
}

async function checkOpeningStatus(stationId) {
  try {
    const { data } = await supabase
      .from('opening_shift')
      .select('id, date_time, operator_id, users!operator_id(full_name)')
      .eq('station_id', stationId)
      .order('date_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    // Controlla se questa apertura ha già una chiusura associata
    const { data: closure } = await supabase
      .from('closing_shift')
      .select('id')
      .eq('turno_id', data.id)
      .maybeSingle();

    // Se ha una chiusura, non è più attiva
    return closure ? null : data;
  } catch (err) {
    console.error('Errore controllo apertura:', err);
    return null;
  }
}

async function showAperturaForm(stationId, userId) {
  const container = document.getElementById('operator-content');
  showLoadingMessage(container);

  try {
    // 1. Controlla se esiste già un'apertura attiva
    const activeOpening = await checkOpeningStatus(stationId);

    if (activeOpening) {
      const operatorName = activeOpening.users?.full_name || 'un operatore';
      const openingDate = new Date(activeOpening.date_time).toLocaleString('it-IT');

      container.innerHTML = `
        <div class="content-box">
          <div class="warning-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Apertura Già Effettuata</h3>
            <p>Il turno è già stato aperto da <strong>${escapeHtml(operatorName)}</strong></p>
            <p>Data apertura: <strong>${openingDate}</strong></p>
            <p>Devi prima chiudere il turno corrente prima di aprirne uno nuovo.</p>
          </div>
          <button class="menu-button secondary full-width" id="btn-back-menu">
            <i class="fas fa-arrow-left"></i> Torna al Menu
          </button>
        </div>
      `;

      document.getElementById('btn-back-menu').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
      });
      return;
    }

    // 2. Carica islands - SOLO colonne esistenti: island_id, nome, island_name
    console.log('🔍 DEBUG - Loading islands for stationId:', stationId);

    const { data: islandsData, error: islandsError } = await supabase
      .from('islands')
      .select('island_id, nome, island_name')
      .eq('station_id', stationId)
      .order('nome');

    console.log('🔍 DEBUG - Islands data:', islandsData);
    console.log('🔍 DEBUG - Islands error:', islandsError);

    if (islandsError) {
      console.error('❌ Errore caricamento islands:', islandsError);
      container.innerHTML = `
        <div class="content-box">
          <div class="warning-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Errore Caricamento Isole</h3>
            <p><strong>Errore:</strong> ${escapeHtml(islandsError.message)}</p>
            <p><strong>Codice:</strong> ${escapeHtml(islandsError.code || 'N/A')}</p>
            <p class="small-text">Dettagli: ${escapeHtml(islandsError.details || 'Nessun dettaglio')}</p>
            <p class="small-text">Hint: ${escapeHtml(islandsError.hint || 'Nessun suggerimento')}</p>
          </div>
          <button class="menu-button secondary full-width" id="btn-back-menu">
            <i class="fas fa-arrow-left"></i> Torna al Menu
          </button>
        </div>
      `;

      document.getElementById('btn-back-menu').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
      });
      return;
    }

    // Normalizza islands
    const islands = (islandsData || []).map((isola, idx) => ({
      id: isola?.island_id ?? idx + 1,
      nome: isola?.nome ?? isola?.island_name ?? `Isola ${idx + 1}`
    }));

    if (!islands || islands.length === 0) {
      container.innerHTML = `
        <div class="content-box">
          <div class="warning-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Nessuna Isola Configurata</h3>
            <p>Non ci sono isole configurate per questa stazione.</p>
            <p>Contatta l'amministratore per configurare le isole e le pistole.</p>
          </div>
          <button class="menu-button secondary full-width" id="btn-back-menu">
            <i class="fas fa-arrow-left"></i> Torna al Menu
          </button>
        </div>
      `;

      document.getElementById('btn-back-menu').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
      });
      return;
    }

    // 3. Carica pistole
    const islandIds = islands.map(i => i.id);
    const { data: allPistole, error: pistoleError } = await supabase
      .from('pistole')
      .select('*, islands(nome)')
      .in('island_id', islandIds)
      .order('id');

    if (pistoleError) throw pistoleError;

    if (!allPistole || allPistole.length === 0) {
      container.innerHTML = `
        <div class="content-box">
          <div class="warning-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Nessuna Pistola Configurata</h3>
            <p>Non ci sono pistole configurate per questa stazione.</p>
            <p>Contatta l'amministratore per configurare le pistole.</p>
          </div>
          <button class="menu-button secondary full-width" id="btn-back-menu">
            <i class="fas fa-arrow-left"></i> Torna al Menu
          </button>
        </div>
      `;

      document.getElementById('btn-back-menu').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
      });
      return;
    }

    // 4. Recupera ultima chiusura finale per precompilare i numeratori
    let lastFinalClosure = null;
    let lastClosureCounters = {};

    // 4b. Carica Cisterne
    const { data: tanks } = await supabase
      .from('tanks')
      .select('*')
      .eq('station_id', stationId)
      .order('name');





    try {
      // 4. Recupera l'ultima chiusura FINALE effettiva dal DB
      const { data: lastClosureData, error: lastClosureError } = await supabase
        .from('closing_shift')
        .select('id, date_time, data_json')
        .eq('station_id', stationId)
        .eq('is_final', true) // Filtra direttamente per is_final = true
        .order('date_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastClosureError) throw lastClosureError;

      lastFinalClosure = lastClosureData;

      if (lastFinalClosure?.id) {
        const { data: closureCounters } = await supabase
          .from('chiusura_turno_pistole')
          .select('pistola_id, numeratore_chiusura')
          .eq('chiusura_id', lastFinalClosure.id);

        (closureCounters || []).forEach(row => {
          const parsed = Number.parseInt(row.numeratore_chiusura, 10);
          lastClosureCounters[row.pistola_id] = Number.isFinite(parsed) ? parsed : 0;
        });
      }
    } catch (closureErr) {
      console.warn('Errore recupero ultima chiusura finale:', closureErr);
    }

    const countersSourceDescription = lastFinalClosure
      ? `Ultima chiusura finale del ${new Date(lastFinalClosure.date_time).toLocaleString('it-IT')}`
      : 'Nessuna chiusura finale trovata: uso i contatori attuali';

    // 5. Mostra form apertura
    container.innerHTML = `
      <div class="content-box">
        <h3><i class="fas fa-door-open"></i> Apertura Turno</h3>
        <p class="section-subtitle">
          I numeratori vengono caricati automaticamente dall'ultima chiusura finale.<br>
          <small>${escapeHtml(countersSourceDescription)}</small>
        </p>
        
        <form id="apertura-form">
          <div class="pistole-grid">
            ${allPistole.map(p => `
              <div class="pistola-card">
                <div class="pistola-header">
                  <span class="pistola-name">${escapeHtml(p.nome || `Pistola #${p.id}`)}</span>
                  <span class="pistola-island">${escapeHtml(p.islands?.nome || 'Isola')}</span>
                </div>
                <div class="form-group readonly-field">
                  <label>Contatore Iniziale (litri)</label>
                  <div class="readonly-value">${formatLitri(
      lastClosureCounters[p.id] ??
      p.numero_litri ??
      0
    )}</div>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>Banconote incassate (€)</label>
              <input type="number" name="cash_in" value="0" step="0.01" min="0" class="big-input">
            </div>
            <div class="form-group">
              <label>Banconote erogate (€)</label>
              <input type="number" name="cash_out" value="0" step="0.01" min="0" class="big-input">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Bancomat erogati (€)</label>
              <input type="number" name="pos_amount" value="0" step="0.01" min="0" class="big-input">
            </div>
            <div class="form-group">
              <label>Totale scontrino (€)</label>
              <input type="number" name="total_amount" value="0" step="0.01" min="0" class="big-input">
            </div>
          </div>
          
          <div class="form-group">
            <label>Note (opzionale)</label>
            <textarea name="notes" rows="3" placeholder="Eventuali annotazioni..."></textarea>
          </div>
          
          <div class="form-actions">
            <button type="button" class="menu-button secondary" id="btn-cancel-apertura">
              <i class="fas fa-times"></i> Annulla
            </button>
            <button type="submit" class="menu-button success">
              <i class="fas fa-check"></i> Conferma Apertura
            </button>
          </div>
        </form>
      </div>
    `;

    // Event listeners
    document.getElementById('btn-cancel-apertura').addEventListener('click', () => {
      container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
    });

    document.getElementById('apertura-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!confirm('Confermi l\'apertura del turno con questi contatori?')) return;

      showLoadingMessage(container);

      try {
        const formData = new FormData(e.target);
        const cashIn = parseFloat(formData.get('cash_in')) || 0;
        const cashOut = parseFloat(formData.get('cash_out')) || 0;
        const posAmount = parseFloat(formData.get('pos_amount')) || 0;
        const totalAmount = parseFloat(formData.get('total_amount')) || 0;
        const notes = formData.get('notes') || '';

        // Salva apertura
        const { data: opening, error: openingError } = await supabase
          .from('opening_shift')
          .insert([{
            operator_id: userId,
            station_id: stationId,
            date_time: new Date().toISOString(),
            cash_in: cashIn,
            cash_out: cashOut,
            pos_amount: posAmount,
            total_amount: totalAmount,
            cash_in_minus_out: cashIn - cashOut,
            notes: notes
          }])
          .select()
          .single();

        if (openingError) throw openingError;

        // Salva contatori per ogni pistola
        const counterInserts = allPistole.map(p => {
          const finalClosureCounter = Number.parseInt(lastClosureCounters[p.id], 10);
          const fallbackCounter = Number.parseInt(p.numero_litri, 10);
          const latestCounter = Number.isFinite(finalClosureCounter) ? finalClosureCounter : fallbackCounter;
          return {
            pistola_id: p.id,
            turno_id: opening.id,
            numeratore_apertura: Number.isFinite(latestCounter) ? latestCounter : 0
          };
        });

        const { error: countersError } = await supabase
          .from('apertura_turno_pistole')
          .insert(counterInserts);

        if (countersError) throw countersError;

        // Salva livelli cisterne se presenti
        if (tanks && tanks.length > 0) {
          const tankReadings = tanks.map(t => ({
            tank_id: t.id,
            shift_id: opening.id,
            reading_type: 'opening',
            liters: parseFloat(formData.get(`tank_${t.id}`)) || 0,
            created_at: new Date().toISOString()
          }));

          const { error: tankError } = await supabase
            .from('tank_readings')
            .insert(tankReadings);

          if (tankError) console.error('Errore salvataggio cisterne:', tankError); // Non bloccante
        }

        // Mostra successo
        container.innerHTML = `
          <div class="success-message">
            <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
            <h3>Apertura Registrata!</h3>
            <p>Il turno è stato aperto correttamente.</p>
            <p class="small-text">Data: ${new Date().toLocaleString('it-IT')}</p>
            <button id="btn-home" class="menu-button primary">Torna alla Home</button>
          </div>
        `;

        document.getElementById('btn-home').addEventListener('click', () => {
          container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
          updateOpeningStatus(stationId);
        });

      } catch (err) {
        showErrorMessage(container, err);
      }
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

// ==========================================
// CLOSURE WIZARD (Enhanced with Calculations)
// ==========================================

let closureState = {
  step: 1,
  data: {}
};

async function startClosureWizard(stationId, userId) {
  const container = document.getElementById('operator-content');
  showLoadingMessage(container);

  try {
    // 1. Controlla se esiste un'apertura attiva
    const activeOpening = await checkOpeningStatus(stationId);

    if (!activeOpening) {
      container.innerHTML = `
        <div class="content-box">
          <div class="warning-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Nessuna Apertura Attiva</h3>
            <p>Devi prima aprire il turno prima di poterlo chiudere.</p>
            <p>Clicca su <strong>Apertura</strong> per iniziare un nuovo turno.</p>
          </div>
          <button class="menu-button secondary full-width" id="btn-back-menu">
            <i class="fas fa-arrow-left"></i> Torna al Menu
          </button>
        </div>
      `;

      document.getElementById('btn-back-menu').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
      });
      return;
    }

    // 2. Carica contatori di apertura dalla CHIUSURA PRECEDENTE
    const openingMap = {};

    try {
      // Trova il turno_id più alto in chiusura_turno_pistole (ultima chiusura)
      const { data: lastCounters } = await supabase
        .from('chiusura_turno_pistole')
        .select('pistola_id, numeratore_chiusura, turno_id')
        .order('turno_id', { ascending: false })
        .limit(100);

      if (lastCounters && lastCounters.length > 0) {
        // Trova il turno_id più alto
        const maxTurnoId = Math.max(...lastCounters.map(c => c.turno_id));

        // Filtra solo i contatori con il turno_id più alto
        const latestCounters = lastCounters.filter(c => c.turno_id === maxTurnoId);

        // Popola openingMap
        latestCounters.forEach(c => {
          const parsed = Number.parseInt(c.numeratore_chiusura, 10);
          openingMap[c.pistola_id] = Number.isFinite(parsed) ? parsed : 0;
        });
      }
    } catch (err) {
      console.warn('Errore caricamento contatori apertura da chiusura precedente:', err);
    }

    // 3. Carica pistole
    const { data: allPistole } = await supabase
      .from('pistole')
      .select('*, islands!inner(nome, station_id)')
      .eq('islands.station_id', stationId)
      .order('id');

    if (!allPistole || allPistole.length === 0) {
      container.innerHTML = `
        <div class="content-box">
          <div class="warning-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Nessuna Pistola Configurata</h3>
            <p>Non ci sono pistole configurate per questa stazione.</p>
          </div>
          <button class="menu-button secondary full-width" id="btn-back-menu">
            <i class="fas fa-arrow-left"></i> Torna al Menu
          </button>
        </div>
      `;

      document.getElementById('btn-back-menu').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
      });
      return;
    }

    // 4. Carica prezzi correnti
    const { data: prezzi } = await supabase
      .from('prezzi_distributore')
      .select('*')
      .eq('station_id', stationId)
      .order('data_validita', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prezzoBenzina = prezzi?.prezzo_benzina || 0;
    const prezzoGasolio = prezzi?.prezzo_gasolio || 0;

    // 5. Carica movimenti cassa (extra) del turno corrente
    const { data: movimenti } = await supabase
      .from('movimenti_cassa')
      .select('*')
      .eq('station_id', stationId)
      .gte('created_at', activeOpening.date_time);

    // Reset state
    closureState = {
      step: 1,
      data: {
        stationId,
        userId,
        turnoId: activeOpening.id,
        pistole: allPistole,
        openingCounters: openingMap,
        prezzoBenzina,
        prezzoGasolio,
        movimenti: movimenti || []
      }
    };

    showClosureStep1(container);

  } catch (err) {
    showErrorMessage(container, err);
  }
}


function showClosureStep1(container) {
  const { pistole, openingCounters } = closureState.data;

  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-door-closed"></i> Chiusura Turno - Step 1/3</h3>
      <p class="section-subtitle">Inserisci i contatori finali per ogni erogatore</p>
      
      <form id="closure-step1-form">
        <div class="pistole-grid">
          ${pistole.map(p => {
    const opening = openingCounters[p.id] || 0;
    return `
              <div class="pistola-card">
                <div class="pistola-header">
                  <span class="pistola-name">${escapeHtml(p.nome || `Pistola #${p.id}`)}</span>
                  <span class="pistola-island">${escapeHtml(p.islands?.nome || 'Isola')}</span>
                </div>
                <div class="form-group">
                  <label>Contatore Apertura</label>
                  <input type="number" value="${opening}" class="big-input" disabled>
                </div>
                <div class="form-group">
                  <label>Contatore Chiusura</label>
                  <input 
                    type="number" 
                    name="counter_${p.id}" 
                    value="${p.numero_litri || opening}"
                    step="1"
                    min="${opening}"
                    class="big-input"
                    required
                  >
                </div>
              </div>
            `;
  }).join('')}
        </div>
        
        <div class="form-actions">
          <button type="button" class="menu-button secondary" id="btn-cancel-closure">
            <i class="fas fa-times"></i> Annulla
          </button>
          <button type="submit" class="menu-button primary">
            <i class="fas fa-arrow-right"></i> Avanti
          </button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('btn-cancel-closure').addEventListener('click', () => {
    container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
  });

  document.getElementById('closure-step1-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    // Salva contatori finali
    closureState.data.finalCounters = {};
    pistole.forEach(p => {
      closureState.data.finalCounters[p.id] = parseInt(formData.get(`counter_${p.id}`)) || 0;
    });

    closureState.step = 2;
    showClosureStep2(container);
  });
}

function showClosureStep2(container) {
  const { pistole, openingCounters, finalCounters, prezzoBenzina, prezzoGasolio } = closureState.data;

  // Calcola litri erogati per ogni pistola
  let totalLitriBenzina = 0;
  let totalLitriGasolio = 0;

  const pistoleWithCalc = pistole.map(p => {
    const opening = openingCounters[p.id] || 0;
    const closing = finalCounters[p.id] || 0;
    const litri = Math.max(0, closing - opening);

    if (p.tipo_carburante === 'benzina') {
      totalLitriBenzina += litri;
    } else if (p.tipo_carburante === 'gasolio') {
      totalLitriGasolio += litri;
    }

    return { ...p, litri, opening, closing };
  });

  const ricavoBenzina = totalLitriBenzina * prezzoBenzina;
  const ricavoGasolio = totalLitriGasolio * prezzoGasolio;
  const ricavoTotaleTeor = ricavoBenzina + ricavoGasolio;

  closureState.data.totalLitriBenzina = totalLitriBenzina;
  closureState.data.totalLitriGasolio = totalLitriGasolio;

  // Calcolo Extra
  const movimenti = closureState.data.movimenti || [];
  const extraIncassi = movimenti
    .filter(m => m.tipo === 'incasso')
    .reduce((sum, m) => sum + Number(m.importo), 0);

  const totaleAtteso = ricavoTotaleTeor + extraIncassi;
  closureState.data.ricavoTotaleTeor = ricavoTotaleTeor; // Solo carburante
  closureState.data.extraIncassi = extraIncassi;
  closureState.data.totaleAtteso = totaleAtteso;

  container.innerHTML = `
      <h3><i class="fas fa-calculator"></i> Chiusura Turno - Step 2/3</h3>
      <p class="section-subtitle">Riepilogo litri erogati e ricavo teorico</p>
      
      <div class="summary-box">
        <h4>Litri Erogati</h4>
        <div class="summary-row">
          <span>Benzina:</span>
          <strong>${formatLitri(totalLitriBenzina)} L</strong>
        </div>
        <div class="summary-row">
          <span>Gasolio:</span>
          <strong>${formatLitri(totalLitriGasolio)} L</strong>
        </div>
      </div>

      <div class="summary-box">
        <h4>Ricavo Teorico</h4>
        <div class="summary-row">
          <span>Benzina (${formatEuro(prezzoBenzina)}/L):</span>
          <strong>${formatEuro(ricavoBenzina)}</strong>
        </div>
        <div class="summary-row">
          <span>Gasolio (${formatEuro(prezzoGasolio)}/L):</span>
          <strong>${formatEuro(ricavoGasolio)}</strong>
        </div>
        <div class="summary-row">
          <span>Extra (Olio, etc.):</span>
          <strong>${formatEuro(extraIncassi)}</strong>
        </div>
        <div class="summary-row total">
          <span>Totale Atteso:</span>
          <strong>${formatEuro(totaleAtteso)}</strong>
        </div>
      </div>

      <form id="closure-step2-form">
        <div class="form-row">
          <div class="form-group">
            <label>Contanti (€)</label>
            <input type="number" name="cash_real" step="0.01" min="0" value="0" class="big-input" required>
          </div>
          <div class="form-group">
            <label>POS / Carte (€)</label>
            <input type="number" name="pos_real" step="0.01" min="0" value="0" class="big-input" required>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Crediti Clienti (€)</label>
            <input type="number" name="credits_real" step="0.01" min="0" value="0" class="big-input">
          </div>
          <div class="form-group">
            <label>Voucher (€)</label>
            <input type="number" name="vouchers_real" step="0.01" min="0" value="0" class="big-input">
          </div>
        </div>

        <div class="form-group">
          <label>Note (opzionale)</label>
          <textarea name="notes" rows="3" placeholder="Eventuali annotazioni..."></textarea>
        </div>
        
        <div class="form-actions">
          <button type="button" class="menu-button secondary" id="btn-back-step2">
            <i class="fas fa-arrow-left"></i> Indietro
          </button>
          <button type="submit" class="menu-button primary">
            <i class="fas fa-arrow-right"></i> Avanti
          </button>
        </div>
      </form>
    </div >
      `;

  document.getElementById('btn-back-step2').addEventListener('click', () => {
    closureState.step = 1;
    showClosureStep1(container);
  });

  document.getElementById('closure-step2-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    closureState.data.cashReal = parseFloat(formData.get('cash_real')) || 0;
    closureState.data.posReal = parseFloat(formData.get('pos_real')) || 0;
    closureState.data.creditsReal = parseFloat(formData.get('credits_real')) || 0;
    closureState.data.vouchersReal = parseFloat(formData.get('vouchers_real')) || 0;
    closureState.data.notes = formData.get('notes') || '';

    closureState.step = 3;
    showClosureStep3(container);
  });
}
function showClosureStep3(container) {
  const {
    ricavoTotaleTeor,
    cashReal,
    posReal,
    creditsReal,
    vouchersReal,
    totalLitriBenzina,
    totalLitriGasolio,
    prezzoBenzina,
    prezzoGasolio,
    notes
  } = closureState.data;

  const totaleReale = cashReal + posReal + creditsReal + vouchersReal;
  const discrepanza = totaleReale - closureState.data.totaleAtteso;
  const discrepanzaClass = discrepanza >= 0 ? 'positive' : 'negative';

  container.innerHTML = `
      <h3><i class="fas fa-check-circle"></i> Chiusura Turno - Step 3/3</h3>
      <p class="section-subtitle">Conferma i dati prima di salvare</p>
      
      <div class="summary-box">
        <h4>Riepilogo Finale</h4>
        <div class="summary-row">
          <span>Litri Benzina:</span>
          <strong>${formatLitri(totalLitriBenzina)} L</strong>
        </div>
        <div class="summary-row">
          <span>Litri Gasolio:</span>
          <strong>${formatLitri(totalLitriGasolio)} L</strong>
        </div>
        <div class="summary-row">
          <span>Ricavo Carburante:</span>
          <strong>${formatEuro(ricavoTotaleTeor)}</strong>
        </div>
        <div class="summary-row">
          <span>Extra:</span>
          <strong>${formatEuro(closureState.data.extraIncassi)}</strong>
        </div>
        <div class="summary-row">
          <span>Totale Atteso:</span>
          <strong>${formatEuro(closureState.data.totaleAtteso)}</strong>
        </div>
        
        <div class="section-divider"></div>
        
        <div class="summary-row">
          <span>Contanti:</span>
          <strong>${formatEuro(cashReal)}</strong>
        </div>
        <div class="summary-row">
          <span>POS:</span>
          <strong>${formatEuro(posReal)}</strong>
        </div>
        <div class="summary-row">
          <span>Crediti:</span>
          <strong>${formatEuro(creditsReal)}</strong>
        </div>
        <div class="summary-row">
          <span>Voucher:</span>
          <strong>${formatEuro(vouchersReal)}</strong>
        </div>
        
        <div class="summary-row total">
          <span>Totale Dichiarato:</span>
          <strong>${formatEuro(totaleReale)}</strong>
        </div>

        <div class="summary-row ${discrepanzaClass}">
          <span>Discrepanza:</span>
          <strong>${formatEuro(discrepanza)}</strong>
        </div>
        ${notes ? `<div class="summary-row"><span>Note:</span><p>${escapeHtml(notes)}</p></div>` : ''}
      </div>

      <div class="form-group">
        <label>
          <input type="checkbox" id="is-final-closure" style="width: auto; margin-right: 10px;">
          Questa è una chiusura <strong>FINALE</strong> (non parziale)
        </label>
      </div>
      
      <div class="form-actions">
        <button type="button" class="menu-button secondary" id="btn-back-step3">
          <i class="fas fa-arrow-left"></i> Indietro
        </button>
        <button type="button" class="menu-button success" id="btn-confirm-closure">
          <i class="fas fa-save"></i> Conferma e Salva
        </button>
      </div>
      `;

  document.getElementById('btn-back-step3').addEventListener('click', () => {
    closureState.step = 2;
    showClosureStep2(container);
  });

  document.getElementById('btn-confirm-closure').addEventListener('click', async () => {
    const isFinal = document.getElementById('is-final-closure').checked;

    if (!confirm(`Confermi la chiusura ${isFinal ? 'FINALE' : 'PARZIALE'} del turno ? `)) return;

    showLoadingMessage(container);

    try {
      const { stationId, userId, turnoId, pistole, finalCounters } = closureState.data;

      // Prepara data_json
      const dataJson = {
        litri_benzina: totalLitriBenzina,
        litri_gasolio: totalLitriGasolio,
        prezzo_benzina: prezzoBenzina,
        prezzo_gasolio: prezzoGasolio,
        prezzo_gasolio: prezzoGasolio,
        ricavo_teorico: ricavoTotaleTeor,
        extra_incassi: closureState.data.extraIncassi,
        totale_atteso: closureState.data.totaleAtteso,
        incasso_reale: totaleReale,
        dettaglio_incasso: {
          contanti: cashReal,
          pos: posReal,
          crediti: creditsReal,
          voucher: vouchersReal
        },
        discrepanza: discrepanza,
        is_final: isFinal,
        notes: notes
      };

      // Salva chiusura
      const { data: closure, error: closureError } = await supabase
        .from('closing_shift')
        .insert([{
          operator_id: userId,
          station_id: stationId,
          turno_id: turnoId,
          date_time: new Date().toISOString(),
          incasso_contanti: cashReal,
          incasso_pos: posReal,
          incasso_uta_dkv: creditsReal + vouchersReal, // Usiamo questo campo per "altri" pagamenti
          incasso_lordo: totaleReale,
          cash_in_finale: 0, // Non gestito esplicitamente qui, ma richiesto dalla tabella
          cash_out_finale: cashReal, // Assumiamo che i contanti vengano ritirati
          notes: notes,
          is_final: isFinal,
          data_json: dataJson
        }])
        .select()
        .single();

      if (closureError) throw closureError;

      // Salva contatori finali pistole
      const closureCounters = pistole.map(p => ({
        chiusura_id: closure.id,
        pistola_id: p.id,
        numeratore_chiusura: finalCounters[p.id]
      }));

      const { error: countersError } = await supabase
        .from('chiusura_turno_pistole')
        .insert(closureCounters);

      if (countersError) throw countersError;

      // Aggiorna contatori pistole nella tabella 'pistole' se è chiusura finale
      if (isFinal) {
        for (const p of pistole) {
          await supabase
            .from('pistole')
            .update({ numero_litri: finalCounters[p.id] })
            .eq('id', p.id);
        }

        // Chiudi il turno in opening_shift
        await supabase
          .from('opening_shift')
          .update({ closed_at: new Date().toISOString() })
          .eq('id', turnoId);
      }

      // Mostra successo
      container.innerHTML = `
      < div class="success-message" >
          <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
          <h3>Chiusura Registrata!</h3>
          <p>Il turno è stato chiuso correttamente.</p>
          <div class="summary-box" style="margin-top: 20px; text-align: left;">
             <p>Discrepanza: <strong>${formatEuro(discrepanza)}</strong></p>
          </div>
          <button id="btn-home" class="menu-button primary">Torna alla Home</button>
        </div >
      `;

      document.getElementById('btn-home').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
        updateOpeningStatus(stationId);
      });

    } catch (err) {
      showErrorMessage(container, err);
    }
  });
}

// ==========================================
// CREDITS MANAGEMENT
// ==========================================

async function showCreditsMenu(stationId, userId) {
  const container = document.getElementById('operator-content');

  container.innerHTML = `
      < div class="content-box" >
      <h3><i class="fas fa-credit-card"></i> Gestione Crediti</h3>
      <div class="form-group">
        <input type="text" id="credit-search" class="big-input" placeholder="Cerca cliente (nome)...">
      </div>
      <div id="credits-results" class="results-list"></div>
      
      <button class="menu-button secondary full-width" id="btn-back-menu-cred" style="margin-top: 20px;">
        <i class="fas fa-arrow-left"></i> Torna al Menu
      </button>
    </div >
      `;

  document.getElementById('btn-back-menu-cred').addEventListener('click', () => {
    container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
  });

  const searchInput = document.getElementById('credit-search');
  const resultsDiv = document.getElementById('credits-results');

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchCustomers(e.target.value, stationId, userId, container), 300);
  });
}

async function searchCustomers(query, stationId, userId, container) {
  const resultsDiv = document.getElementById('credits-results');
  if (!query || query.length < 2) {
    resultsDiv.innerHTML = '';
    return;
  }

  resultsDiv.innerHTML = '<p class="loading-text">Ricerca in corso...</p>';

  try {
    const { data: customers, error } = await supabase
      .from('crediti_clienti')
      .select('*')
      .ilike('cliente', `% ${query}% `)
      .limit(10);

    if (error) throw error;

    if (!customers || customers.length === 0) {
      resultsDiv.innerHTML = '<p>Nessun cliente trovato.</p>';
      return;
    }

    resultsDiv.innerHTML = customers.map(c => `
      < div class="result-item" onclick = "window.selectCustomer('${c.id}')" >
        <div class="result-info">
          <strong>${escapeHtml(c.cliente)}</strong>
          <span>Saldo: ${formatEuro(c.saldo || 0)}</span>
        </div>
        <button class="btn-small primary">Seleziona</button>
      </div >
      `).join('');

    // Hack per passare l'oggetto cliente al click (o rifare query)
    window.selectCustomer = (customerId) => {
      const customer = customers.find(c => c.id == customerId);
      if (customer) showCustomerActions(customer, stationId, userId, container);
    };

  } catch (err) {
    resultsDiv.innerHTML = `< p class="error-text" > Errore: ${err.message}</p > `;
  }
}

function showCustomerActions(customer, stationId, userId, container) {
  container.innerHTML = `
      < div class="content-box" >
      <div class="customer-header">
        <h3>${escapeHtml(customer.cliente)}</h3>
        <div class="balance-display">
          Saldo Attuale: <strong>${formatEuro(customer.saldo || 0)}</strong>
        </div>
      </div>

      <div class="action-tabs">
        <button class="tab-btn active" data-action="payment">Pagamento (Usa Credito)</button>
        <button class="tab-btn" data-action="recharge">Ricarica (Aggiungi)</button>
      </div>

      <form id="credit-action-form">
        <input type="hidden" name="action_type" id="action_type" value="payment">
        
        <div class="form-group">
          <label id="amount-label">Importo da Scalare (€)</label>
          <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required>
        </div>

        <div class="form-group">
          <label>Note</label>
          <textarea name="notes" rows="2"></textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="menu-button secondary" id="btn-cancel-customer">
            <i class="fas fa-arrow-left"></i> Indietro
          </button>
          <button type="submit" class="menu-button primary" id="btn-confirm-credit">
            Conferma Operazione
          </button>
        </div>
      </form>
    </div >
      `;

  // Tab logic
  const tabs = container.querySelectorAll('.tab-btn');
  const actionInput = document.getElementById('action_type');
  const amountLabel = document.getElementById('amount-label');
  const submitBtn = document.getElementById('btn-confirm-credit');

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const action = t.dataset.action;
      actionInput.value = action;

      if (action === 'payment') {
        amountLabel.textContent = 'Importo da Scalare (€)';
        submitBtn.className = 'menu-button primary'; // Blue/Default
        submitBtn.textContent = 'Conferma Pagamento';
      } else {
        amountLabel.textContent = 'Importo da Ricaricare (€)';
        submitBtn.className = 'menu-button success'; // Green
        submitBtn.textContent = 'Conferma Ricarica';
      }
    });
  });

  document.getElementById('btn-cancel-customer').addEventListener('click', () => {
    showCreditsMenu(stationId, userId);
  });

  document.getElementById('credit-action-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const amount = parseFloat(formData.get('amount'));
    const action = formData.get('action_type');
    const notes = formData.get('notes');

    if (!amount || amount <= 0) return;

    if (action === 'payment' && amount > (customer.saldo || 0)) {
      alert('Saldo insufficiente!');
      return;
    }

    if (!confirm(`Confermi ${action === 'payment' ? 'il pagamento' : 'la ricarica'} di ${formatEuro(amount)}?`)) return;

    showLoadingMessage(container);

    try {
      // 1. Registra movimento
      // Nota: 'metodo' in crediti_movimenti è text. Usiamo 'payment' o 'recharge' o 'cash'/'pos' se fosse ricarica.
      // Per semplicità: 'scarico' (pagamento) o 'carico' (ricarica)
      const movementType = action === 'payment' ? 'scarico' : 'carico';

      const { error: moveError } = await supabase.from('crediti_movimenti').insert([{
        cliente_id: customer.id,
        importo: amount, // Sempre positivo, il tipo determina il segno logico
        metodo: movementType,
        station_id: stationId,
        operator_id: userId,
        created_at: new Date().toISOString()
        // notes: notes // Se la tabella ha notes, altrimenti ignoriamo
      }]);

      if (moveError) throw moveError;

      // 2. Aggiorna saldo cliente
      const newBalance = action === 'payment'
        ? (customer.saldo || 0) - amount
        : (customer.saldo || 0) + amount;

      const { error: updateError } = await supabase
        .from('crediti_clienti')
        .update({ saldo: newBalance, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

      if (updateError) throw updateError;

      showInfoModal('Operazione completata con successo!');
      showCreditsMenu(stationId, userId); // Torna alla ricerca

    } catch (err) {
      showErrorMessage(container, err);
    }
  });
}

// ==========================================
// VOUCHER MANAGEMENT
// ==========================================

async function showVoucherMenu(stationId, userId) {
  const container = document.getElementById('operator-content');

  container.innerHTML = `
      < div class="content-box" >
      <h3><i class="fas fa-ticket-alt"></i> Gestione Voucher</h3>
      <div class="form-group">
        <label>Codice Voucher</label>
        <input type="text" id="voucher-code" class="big-input" placeholder="Inserisci codice..." style="text-transform: uppercase;">
      </div>
      <button class="menu-button primary full-width" id="btn-verify-voucher">
        Verifica Voucher
      </button>
      
      <div id="voucher-result" class="voucher-result-area"></div>

      <button class="menu-button secondary full-width" id="btn-back-menu-vouch" style="margin-top: 20px;">
        <i class="fas fa-arrow-left"></i> Torna al Menu
      </button>
    </div >
      `;

  document.getElementById('btn-back-menu-vouch').addEventListener('click', () => {
    container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
  });

  document.getElementById('btn-verify-voucher').addEventListener('click', async () => {
    const code = document.getElementById('voucher-code').value.trim();
    if (!code) return;

    const resultDiv = document.getElementById('voucher-result');
    resultDiv.innerHTML = '<p class="loading-text">Verifica in corso...</p>';

    try {
      const { data: voucher, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (error) throw error;

      if (!voucher) {
        resultDiv.innerHTML = '<div class="error-msg">Voucher non trovato o codice errato.</div>';
        return;
      }

      if (voucher.is_used) {
        resultDiv.innerHTML = `
      < div class="warning-message" >
            <h4>Voucher Già Utilizzato</h4>
            <p>Valore: ${formatEuro(voucher.amount)}</p>
            <p>Utilizzato il: ${new Date(voucher.used_at).toLocaleString()}</p>
          </div >
      `;
        return;
      }

      // Voucher valido
      resultDiv.innerHTML = `
      < div class="success-message" style = "margin: 20px 0;" >
          <h4>Voucher Valido!</h4>
          <div class="voucher-amount">${formatEuro(voucher.amount)}</div>
          <button class="menu-button success full-width" id="btn-redeem-voucher">
            RISCATTA ORA
          </button>
        </div >
      `;

      document.getElementById('btn-redeem-voucher').addEventListener('click', async () => {
        if (!confirm(`Vuoi riscattare questo voucher da ${formatEuro(voucher.amount)}?`)) return;

        try {
          const { error: redeemError } = await supabase
            .from('vouchers')
            .update({
              is_used: true,
              used_at: new Date().toISOString()
              // station_id: stationId // Opzionale: tracciare dove è stato usato se non c'è già
            })
            .eq('id', voucher.id);

          if (redeemError) throw redeemError;

          showInfoModal('Voucher riscattato con successo!');
          showVoucherMenu(stationId, userId); // Reset form

        } catch (err) {
          showErrorMessage(container, err);
        }
      });

    } catch (err) {
      resultDiv.innerHTML = `< div class="error-msg" > Errore: ${err.message}</div > `;
    }
  });
}
