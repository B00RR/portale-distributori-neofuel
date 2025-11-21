// ==========================================
// OPERATOR CLOSURE WIZARD
// Gestione chiusura turno con wizard a 3 step
// ==========================================
import { supabase } from "./api.js";
import { showLoadingMessage, showErrorMessage } from "./ui.js";
import { checkOpeningStatus, updateOpeningStatus } from "./operator-opening.js";
import {
  createWarningMessage,
  createBackButton,
  createContentBox,
  attachBackButtonListener
} from "./operator-ui-components.js";
import { escapeHtml, formatLitri, formatEuro } from "./utils.js";

// Stato del wizard di chiusura
let closureState = {
  step: 1,
  data: {}
};

/**
 * Avvia il wizard di chiusura turno
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function startClosureWizard(stationId, userId) {
  const container = document.getElementById('operator-content');
  showLoadingMessage(container);

  try {
    // 1. Controlla se esiste un'apertura attiva
    const activeOpening = await checkOpeningStatus(stationId);

    if (!activeOpening) {
      container.innerHTML = createContentBox(
        createWarningMessage(
          'Nessuna Apertura Attiva',
          'Devi prima aprire il turno prima di poterlo chiudere.',
          'Clicca su <strong>Apertura</strong> per iniziare un nuovo turno.'
        ) + createBackButton()
      );
      attachBackButtonListener('btn-back-menu', container);
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
      container.innerHTML = createContentBox(
        createWarningMessage(
          'Nessuna Pistola Configurata',
          'Non ci sono pistole configurate per questa stazione.',
          ''
        ) + createBackButton()
      );
      attachBackButtonListener('btn-back-menu', container);
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
        movimenti: movimenti || [],
        // Default State
        closureType: 'partial', // 'partial' | 'final'
        includeCounters: false
      }
    };

    showClosureStep1(container);

  } catch (err) {
    showErrorMessage(container, err);
  }
}

/**
 * Step 1: Selezione Tipo e Inserimento contatori
 */
function showClosureStep1(container) {
  const { pistole, openingCounters, closureType, includeCounters } = closureState.data;

  const isFinal = closureType === 'final';
  const showCounters = isFinal || includeCounters;

  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-door-closed"></i> Chiusura Turno - Step 1/3</h3>
      <p class="section-subtitle">Configurazione Chiusura</p>
      
      <form id="closure-step1-form">
        
        <!-- TIPO CHIUSURA -->
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 15px;">
                <label class="radio-card ${!isFinal ? 'selected' : ''}" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <input type="radio" name="closure_type" value="partial" ${!isFinal ? 'checked' : ''} style="display: none;">
                    <i class="fas fa-clock" style="font-size: 1.5rem; color: #3b82f6; margin-bottom: 8px; display: block;"></i>
                    <div style="font-weight: 600; color: #1e293b;">Parziale</div>
                    <div style="font-size: 0.8rem; color: #64748b;">Cambio Turno</div>
                </label>
                
                <label class="radio-card ${isFinal ? 'selected' : ''}" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <input type="radio" name="closure_type" value="final" ${isFinal ? 'checked' : ''} style="display: none;">
                    <i class="fas fa-flag-checkered" style="font-size: 1.5rem; color: #ef4444; margin-bottom: 8px; display: block;"></i>
                    <div style="font-weight: 600; color: #1e293b;">Finale</div>
                    <div style="font-size: 0.8rem; color: #64748b;">Fine Giornata</div>
                </label>
            </div>

            <div id="counters-toggle-container" style="display: ${isFinal ? 'none' : 'block'}; text-align: center;">
                <label style="display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;">
                    <input type="checkbox" id="include-counters-check" ${includeCounters ? 'checked' : ''} style="width: 18px; height: 18px;">
                    <span style="font-weight: 500; color: #334155;">Inserisci Numeratori Pistole (Opzionale)</span>
                </label>
            </div>
        </div>

        <!-- GRIGLIA PISTOLE -->
        <div id="pistole-section" style="display: ${showCounters ? 'block' : 'none'};">
            <h4 style="margin-bottom: 15px; color: #475569;">Numeratori Erogatori</h4>
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
                        class="big-input gun-counter-input"
                        ${showCounters ? 'required' : ''}
                    >
                    </div>
                </div>
                `;
  }).join('')}
            </div>
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
      
      <style>
        .radio-card.selected {
            border-color: #3b82f6 !important;
            background-color: #eff6ff !important;
            box-shadow: 0 0 0 2px #3b82f633;
        }
      </style>
    </div>
  `;

  // Event Listeners
  const form = document.getElementById('closure-step1-form');
  const radioInputs = form.querySelectorAll('input[name="closure_type"]');
  const countersCheck = document.getElementById('include-counters-check');
  const pistoleSection = document.getElementById('pistole-section');
  const countersToggleContainer = document.getElementById('counters-toggle-container');
  const gunInputs = form.querySelectorAll('.gun-counter-input');

  function updateUI() {
    const type = document.querySelector('input[name="closure_type"]:checked').value;
    const include = countersCheck.checked;

    // Update selection styles
    document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`input[value="${type}"]`).closest('.radio-card').classList.add('selected');

    if (type === 'final') {
      countersToggleContainer.style.display = 'none';
      pistoleSection.style.display = 'block';
      gunInputs.forEach(i => i.required = true);
    } else {
      countersToggleContainer.style.display = 'block';
      pistoleSection.style.display = include ? 'block' : 'none';
      gunInputs.forEach(i => i.required = include);
    }
  }

  radioInputs.forEach(r => r.addEventListener('change', updateUI));
  countersCheck.addEventListener('change', updateUI);

  document.getElementById('btn-cancel-closure').addEventListener('click', () => {
    container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const type = formData.get('closure_type');
    const include = type === 'final' ? true : countersCheck.checked;

    closureState.data.closureType = type;
    closureState.data.includeCounters = include;
    closureState.data.finalCounters = {};

    if (include) {
      pistole.forEach(p => {
        closureState.data.finalCounters[p.id] = parseInt(formData.get(`counter_${p.id}`)) || 0;
      });
    }

    closureState.step = 2;
    showClosureStep2(container);
  });
}

/**
 * Step 2: Riepilogo litri e inserimento incassi (Self + Operatore)
 */
function showClosureStep2(container) {
  const { pistole, openingCounters, finalCounters, prezzoBenzina, prezzoGasolio } = closureState.data;

  // Calcola litri erogati per ogni pistola (SE presenti)
  let totalLitriBenzina = 0;
  let totalLitriGasolio = 0;
  let ricavoTotaleTeor = 0;

  if (closureState.data.includeCounters) {
    pistole.forEach(p => {
      const opening = openingCounters[p.id] || 0;
      const closing = finalCounters[p.id] || 0;
      const litri = Math.max(0, closing - opening);

      if (p.tipo_carburante === 'benzina') {
        totalLitriBenzina += litri;
      } else if (p.tipo_carburante === 'gasolio') {
        totalLitriGasolio += litri;
      }
    });

    const ricavoBenzina = totalLitriBenzina * prezzoBenzina;
    const ricavoGasolio = totalLitriGasolio * prezzoGasolio;
    ricavoTotaleTeor = ricavoBenzina + ricavoGasolio;
  }

  closureState.data.totalLitriBenzina = totalLitriBenzina;
  closureState.data.totalLitriGasolio = totalLitriGasolio;

  // Calcolo Extra
  const movimenti = closureState.data.movimenti || [];
  const extraIncassi = movimenti
    .filter(m => m.tipo === 'incasso')
    .reduce((sum, m) => sum + Number(m.importo), 0);

  // Recupera valori precedenti o default
  const d = closureState.data;
  const selfCashIn = d.selfCashIn || 0;
  const selfCashOut = d.selfCashOut || 0;
  const selfPos = d.selfPos || 0;
  const selfFleet = d.selfFleet || 0;
  const selfManager = d.selfManager || 0;

  // Calcolo iniziale totale scontrino
  const selfTotal = selfCashIn - selfCashOut + selfPos + selfFleet + selfManager;

  // Logica Totale Atteso
  let totaleAtteso;
  if (closureState.data.includeCounters) {
    totaleAtteso = ricavoTotaleTeor + extraIncassi;
  } else {
    // Fallback: Se non leggiamo le pompe, l'atteso è ciò che dichiara il self + extra
    totaleAtteso = selfTotal + extraIncassi;
  }

  closureState.data.ricavoTotaleTeor = ricavoTotaleTeor;
  closureState.data.extraIncassi = extraIncassi;
  closureState.data.totaleAtteso = totaleAtteso;

  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-calculator"></i> Chiusura Turno - Step 2/3</h3>
      <p class="section-subtitle">Dati Scontrino Self e Incassi Operatore</p>
      
      <div class="summary-box">
        <h4>Riepilogo Erogato ${!closureState.data.includeCounters ? '(Stimato da Self)' : ''}</h4>
        ${closureState.data.includeCounters ? `
        <div class="summary-row">
          <span>Totale Litri:</span>
          <strong>${formatLitri(totalLitriBenzina + totalLitriGasolio)} L</strong>
        </div>
        ` : ''}
        <div class="summary-row total">
          <span>Totale Atteso (Teorico + Extra):</span>
          <strong id="total-expected-display">${formatEuro(totaleAtteso)}</strong>
        </div>
      </div>

      <form id="closure-step2-form">
        
        <!-- SEZIONE SCONTRINO SELF -->
        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
          <h4 style="color: #0369a1; margin-top: 0; margin-bottom: 15px; font-size: 1.1rem;">
            <i class="fas fa-receipt"></i> Dati Scontrino Self
          </h4>
          
          <div class="form-row">
            <div class="form-group">
              <label>1. Banconote Incassate (€)</label>
              <input type="number" name="self_cash_in" step="0.01" min="0" value="${selfCashIn}" class="big-input self-input" required>
            </div>
            <div class="form-group">
              <label>2. Banconote Erogate (€)</label>
              <input type="number" name="self_cash_out" step="0.01" min="0" value="${selfCashOut}" class="big-input self-input" required>
              <small style="color: #6b7280;">(Resto/Rimborsi - Viene sottratto)</small>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>3. Bancomat Erogati (€)</label>
              <input type="number" name="self_pos" step="0.01" min="0" value="${selfPos}" class="big-input self-input" required>
            </div>
            <div class="form-group">
              <label>4. Transazioni UTA/DKV (€)</label>
              <input type="number" name="self_fleet" step="0.01" min="0" value="${selfFleet}" class="big-input self-input" required>
            </div>
          </div>

          <div class="form-group">
            <label>5. ID Gestore (€)</label>
            <input type="number" name="self_manager" step="0.01" min="0" value="${selfManager}" class="big-input self-input" required>
            <small style="color: #6b7280;">(Fondi cambio turno/test)</small>
          </div>

          <div class="summary-row total" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
            <span>Totale Scontrino:</span>
            <strong id="self-total-display">${formatEuro(selfTotal)}</strong>
          </div>
        </div>

        <!-- SEZIONE INCASSI OPERATORE -->
        <div style="background: #fdf2f8; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #db2777;">
          <h4 style="color: #be185d; margin-top: 0; margin-bottom: 15px; font-size: 1.1rem;">
            <i class="fas fa-user-tag"></i> Incassi Operatore
          </h4>

          <div class="form-row">
            <div class="form-group">
              <label>Contanti Cassa (€)</label>
              <input type="number" name="cash_real" step="0.01" min="0" value="${d.cashReal || 0}" class="big-input" required>
            </div>
            <div class="form-group">
              <label>POS Manuale (€)</label>
              <input type="number" name="pos_real" step="0.01" min="0" value="${d.posReal || 0}" class="big-input" required>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>Crediti Clienti (€)</label>
              <input type="number" name="credits_real" step="0.01" min="0" value="${d.creditsReal || 0}" class="big-input">
            </div>
            <div class="form-group">
              <label>Voucher (€)</label>
              <input type="number" name="vouchers_real" step="0.01" min="0" value="${d.vouchersReal || 0}" class="big-input">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Note (opzionale)</label>
          <textarea name="notes" rows="3" placeholder="Eventuali annotazioni...">${d.notes || ''}</textarea>
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
    </div>
  `;

  // Live calculation for Self Total AND Expected Total (if no counters)
  const form = document.getElementById('closure-step2-form');
  const selfInputs = form.querySelectorAll('.self-input');
  const totalDisplay = document.getElementById('self-total-display');
  const expectedDisplay = document.getElementById('total-expected-display');

  function updateTotals() {
    const cashIn = parseFloat(form.self_cash_in.value) || 0;
    const cashOut = parseFloat(form.self_cash_out.value) || 0;
    const pos = parseFloat(form.self_pos.value) || 0;
    const fleet = parseFloat(form.self_fleet.value) || 0;
    const manager = parseFloat(form.self_manager.value) || 0;

    const total = cashIn - cashOut + pos + fleet + manager;
    totalDisplay.textContent = formatEuro(total);

    // If counters are NOT included, Expected Total depends on Self Total
    if (!closureState.data.includeCounters) {
      const newExpected = total + closureState.data.extraIncassi;
      expectedDisplay.textContent = formatEuro(newExpected);
      closureState.data.totaleAtteso = newExpected; // Update state for next step
    }
  }

  selfInputs.forEach(input => {
    input.addEventListener('input', updateTotals);
  });

  document.getElementById('btn-back-step2').addEventListener('click', () => {
    closureState.step = 1;
    showClosureStep1(container);
  });

  document.getElementById('closure-step2-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    // Save Self Data
    closureState.data.selfCashIn = parseFloat(formData.get('self_cash_in')) || 0;
    closureState.data.selfCashOut = parseFloat(formData.get('self_cash_out')) || 0;
    closureState.data.selfPos = parseFloat(formData.get('self_pos')) || 0;
    closureState.data.selfFleet = parseFloat(formData.get('self_fleet')) || 0;
    closureState.data.selfManager = parseFloat(formData.get('self_manager')) || 0;

    // Save Operator Data
    closureState.data.cashReal = parseFloat(formData.get('cash_real')) || 0;
    closureState.data.posReal = parseFloat(formData.get('pos_real')) || 0;
    closureState.data.creditsReal = parseFloat(formData.get('credits_real')) || 0;
    closureState.data.vouchersReal = parseFloat(formData.get('vouchers_real')) || 0;
    closureState.data.notes = formData.get('notes') || '';

    closureState.step = 3;
    showClosureStep3(container);
  });
}

/**
 * Step 3: Conferma finale e salvataggio
 */
function showClosureStep3(container) {
  const {
    ricavoTotaleTeor,
    // Self Data
    selfCashIn, selfCashOut, selfPos, selfFleet, selfManager,
    // Operator Data
    cashReal, posReal, creditsReal, vouchersReal,
    // Totals
    totalLitriBenzina, totalLitriGasolio, prezzoBenzina, prezzoGasolio, notes
  } = closureState.data;

  // Calcoli Totali
  const selfTotal = selfCashIn - selfCashOut + selfPos + selfFleet + selfManager;
  const operatorTotal = cashReal + posReal + creditsReal + vouchersReal;
  const totaleReale = selfTotal + operatorTotal;

  const discrepanza = totaleReale - closureState.data.totaleAtteso;
  const discrepanzaClass = discrepanza >= 0 ? 'positive' : 'negative';

  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-check-circle"></i> Chiusura Turno - Step 3/3</h3>
      <p class="section-subtitle">Conferma i dati prima di salvare</p>
      
      <div class="summary-box">
        <h4>Riepilogo Finale</h4>
        
        <!-- Totale Atteso -->
        <div class="summary-row">
          <span>Totale Atteso (Teorico):</span>
          <strong>${formatEuro(closureState.data.totaleAtteso)}</strong>
        </div>
        
        <div class="section-divider"></div>
        
        <!-- Dettaglio Self -->
        <div class="summary-row">
          <span>Totale Scontrino Self:</span>
          <strong>${formatEuro(selfTotal)}</strong>
        </div>
        <div style="font-size: 0.85rem; color: #6b7280; padding-left: 10px; margin-bottom: 5px;">
          Incassato: ${formatEuro(selfCashIn)} | Erogato: -${formatEuro(selfCashOut)}<br>
          POS: ${formatEuro(selfPos)} | Fleet: ${formatEuro(selfFleet)} | ID: ${formatEuro(selfManager)}
        </div>

        <!-- Dettaglio Operatore -->
        <div class="summary-row">
          <span>Totale Operatore:</span>
          <strong>${formatEuro(operatorTotal)}</strong>
        </div>
        <div style="font-size: 0.85rem; color: #6b7280; padding-left: 10px; margin-bottom: 5px;">
          Cassa: ${formatEuro(cashReal)} | POS: ${formatEuro(posReal)}<br>
          Crediti: ${formatEuro(creditsReal)} | Voucher: ${formatEuro(vouchersReal)}
        </div>

        <div class="section-divider"></div>

        <!-- Totale Finale -->
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
        <div style="background: #f1f5f9; padding: 10px; border-radius: 6px; display: flex; align-items: center; gap: 10px;">
            <i class="fas ${closureState.data.closureType === 'final' ? 'fa-flag-checkered' : 'fa-clock'}" style="color: #64748b;"></i>
            <span>Tipo Chiusura: <strong>${closureState.data.closureType === 'final' ? 'FINALE' : 'PARZIALE'}</strong></span>
        </div>
      </div>
      
      <div class="form-actions">
        <button type="button" class="menu-button secondary" id="btn-back-step3">
          <i class="fas fa-arrow-left"></i> Indietro
        </button>
        <button type="button" class="menu-button success" id="btn-confirm-closure">
          <i class="fas fa-save"></i> Conferma e Salva
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-back-step3').addEventListener('click', () => {
    closureState.step = 2;
    showClosureStep2(container);
  });

  document.getElementById('btn-confirm-closure').addEventListener('click', async () => {
    const isFinal = closureState.data.closureType === 'final';

    if (!confirm(`Confermi la chiusura ${isFinal ? 'FINALE' : 'PARZIALE'} del turno?`)) return;

    showLoadingMessage(container);

    try {
      const { stationId, userId, turnoId, pistole, finalCounters } = closureState.data;

      // Calcolo Aggregati per DB
      // Incasso Contanti = (Self Cash In - Self Cash Out) + Operator Cash
      const incassoContanti = (selfCashIn - selfCashOut) + cashReal;

      // Incasso POS = Self POS + Operator POS
      const incassoPos = selfPos + posReal;

      // Incasso UTA/DKV = Self Fleet + Operator Credits + Operator Vouchers
      const incassoUtaDkv = selfFleet + creditsReal + vouchersReal;

      // Prepara data_json con dettaglio completo
      const dataJson = {
        litri_benzina: totalLitriBenzina,
        litri_gasolio: totalLitriGasolio,
        prezzo_benzina: prezzoBenzina,
        prezzo_gasolio: prezzoGasolio,
        ricavo_teorico: ricavoTotaleTeor,
        extra_incassi: closureState.data.extraIncassi,
        totale_atteso: closureState.data.totaleAtteso,
        incasso_reale: totaleReale,

        // Nuovo oggetto Scontrino Self
        scontrino_self: {
          banconote_incassate: selfCashIn,
          banconote_erogate: selfCashOut,
          bancomat_erogati: selfPos,
          transazioni_uta: selfFleet,
          id_gestore: selfManager,
          totale_scontrino: selfTotal
        },

        // Dettaglio Operatore
        dettaglio_incasso: {
          contanti_operatore: cashReal,
          pos_operatore: posReal,
          crediti: creditsReal,
          voucher: vouchersReal
        },

        discrepanza: discrepanza,
        is_final: isFinal,
        closure_type: closureState.data.closureType,
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
          incasso_contanti: incassoContanti,
          incasso_pos: incassoPos,
          incasso_uta_dkv: incassoUtaDkv,
          incasso_lordo: totaleReale,
          cash_in_finale: 0,
          cash_out_finale: incassoContanti,
          notes: notes,
          is_final: isFinal,
          data_json: dataJson
        }])
        .select()
        .single();

      if (closureError) throw closureError;

      // Salva contatori finali pistole SOLO se sono stati inseriti
      if (closureState.data.includeCounters) {
        const closureCounters = pistole.map(p => ({
          chiusura_id: closure.id,
          pistola_id: p.id,
          numeratore_chiusura: finalCounters[p.id],
          turno_id: turnoId
        }));

        const { error: countersError } = await supabase
          .from('chiusura_turno_pistole')
          .insert(closureCounters);

        if (countersError) throw countersError;
      }

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
        <div class="success-message">
          <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
          <h3>Chiusura ${isFinal ? 'FINALE' : 'PARZIALE'} Registrata!</h3>
          <p>Il turno è stato chiuso correttamente.</p>
          <div class="summary-box" style="margin-top: 20px; text-align: left;">
             <p>Discrepanza: <strong>${formatEuro(discrepanza)}</strong></p>
          </div>
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
}
