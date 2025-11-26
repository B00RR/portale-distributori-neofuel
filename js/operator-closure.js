// ==========================================
// OPERATOR CLOSURE WIZARD
// Gestione chiusura turno con wizard a 3 step
// ==========================================
import { supabase } from "./api.js";
import { showLoadingMessage, showErrorMessage, openModal, closeModal } from "./ui.js";
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
  try {
    // Apri il modal subito per mostrare il caricamento
    openModal('Chiusura Turno');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = '<p style="text-align: center; padding: 20px;">Caricamento...</p>';

    // 1. Controlla se esiste un'apertura attiva
    const activeOpening = await checkOpeningStatus(stationId);

    if (!activeOpening) {
      modalBody.innerHTML = createWarningMessage(
        'Nessuna Apertura Attiva',
        'Devi prima aprire il turno prima di poterlo chiudere.',
        'Clicca su <strong>Apertura</strong> per iniziare un nuovo turno.'
      ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
      return;
    }

    // Carica tutti i dati in parallelo
    const [
      openingCountersResult,
      pistoleResult,
      prezziResult,
      movimentiResult,
      stationDataResult
    ] = await Promise.all([
      // 2. Carica contatori di apertura dal turno corrente in shift_pistols
      supabase
        .from('shift_pistols')
        .select('pistola_id, opened_at_counter')
        .eq('shift_id', activeOpening.id),
      // 3. Carica pistole
      supabase
        .from('pistole')
        .select('*, islands!inner(nome, station_id)')
        .eq('islands.station_id', stationId)
        .order('id'),
      // 4. Carica prezzi correnti
      supabase
        .from('prezzi_distributore')
        .select('*')
        .eq('station_id', stationId)
        .order('data_validita', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // 5. Carica movimenti cassa (extra) del turno corrente
      supabase
        .from('movimenti_cassa')
        .select('*')
        .eq('station_id', stationId)
        .gte('created_at', activeOpening.opened_at || activeOpening.date_time),
      // 6. Carica impostazione chiusura parziale dalla stazione
      supabase
        .from('fuel_stations')
        .select('allow_partial_closure')
        .eq('station_id', stationId)
        .single()
    ]);

    // Processa contatori di apertura
    const openingMap = {};
    try {
      const { data: openingCounters } = openingCountersResult;
      if (openingCounters && openingCounters.length > 0) {
        openingCounters.forEach(c => {
          const parsed = parseFloat(c.opened_at_counter);
          openingMap[c.pistola_id] = Number.isFinite(parsed) ? parsed : 0;
        });
      }
    } catch (err) {
      console.warn('Errore caricamento contatori apertura:', err);
    }

    // Processa pistole
    const { data: allPistole } = pistoleResult;
    if (!allPistole || allPistole.length === 0) {
      modalBody.innerHTML = createWarningMessage(
        'Nessuna Pistola Configurata',
        'Non ci sono pistole configurate per questa stazione.',
        ''
      ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning2" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById('btn-close-warning2').addEventListener('click', () => closeModal());
      return;
    }

    // Processa prezzi
    const { data: prezzi } = prezziResult;
    const prezzoBenzina = prezzi?.prezzo_benzina || 0;
    const prezzoGasolio = prezzi?.prezzo_gasolio || 0;

    // Processa movimenti
    const { data: movimenti } = movimentiResult;

    // Processa impostazione stazione
    const { data: stationData } = stationDataResult;

    const allowPartialClosure = stationData?.allow_partial_closure !== false; // Default true se non specificato

    const partialCompleted = activeOpening.closing_data?.closure_stage === 'partial';
    const previousClosing = activeOpening.closing_data || {};
    // NOTA: I dati self (banconote, bancomat, UTA/DKV) NON si sommano - sono sempre gli stessi per tutto il turno
    // Solo l'ID gestore si somma tra turni. I dati operatore (POS, UTA/DKV) si sommano.
    const partialAggregates = partialCompleted ? {
      selfManager: Number(previousClosing?.scontrino_self?.id_gestore) || 0, // Solo ID gestore si somma
      operatorPos: Number(previousClosing?.dettaglio_incasso?.pos_operatore) || 0,
      operatorUta: Number(previousClosing?.dettaglio_incasso?.uta_dkv_operatore) || 0
    } : null;

    // Recupera UTA/DKV/Iscard da opening_data (se presente)
    const openingUtaDkvIscard = activeOpening.opening_data?.uta_dkv_iscard || 0;

    // Reset state
    closureState = {
      step: 1,
      data: {
        stationId,
        userId,
        turnoId: activeOpening.id,
        openingDate: activeOpening.opened_at || activeOpening.date_time,
        pistole: allPistole,
        openingCounters: openingMap,
        prezzoBenzina,
        prezzoGasolio,
        movimenti: movimenti || [],
        existingClosingData: previousClosing,
        partialAggregates,
        partialCompleted,
        allowPartialClosure, // Flag per abilitare/disabilitare chiusura parziale
        openingUtaDkvIscard, // UTA/DKV/Iscard inserito in apertura
        // Default State
        closureType: partialCompleted ? 'final' : (allowPartialClosure ? 'partial' : 'final'), // Se disabilitata, forza 'final'
        includeCounters: partialCompleted ? true : false
      }
    };

    showClosureStep1();

  } catch (err) {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">Errore: ${escapeHtml(err.message)}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-error" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById('btn-close-error').addEventListener('click', () => closeModal());
  }
}

/**
 * Step 1: Selezione Tipo e Inserimento contatori
 */
function showClosureStep1() {
  openModal('Chiusura Turno - Step 1/3');
  const container = document.getElementById('modal-body');
  const { pistole, openingCounters, closureType, includeCounters, openingDate, partialCompleted, allowPartialClosure } = closureState.data;

  // Se la chiusura parziale è disabilitata, forza sempre 'final'
  const isFinal = partialCompleted ? true : (!allowPartialClosure ? true : closureType === 'final');
  const showCounters = isFinal || includeCounters;
  const formattedDate = new Date(openingDate).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const infoBanner = partialCompleted ? `
    <div class="warning-message" style="margin-bottom: 15px;">
      <h3>Chiusura Parziale già registrata</h3>
      <p>Completa ora la chiusura finale per terminare il turno.</p>
    </div>
  ` : '';

  // Mostra l'opzione parziale solo se abilitata e non c'è già una chiusura parziale
  const showPartialOption = allowPartialClosure && !partialCompleted;

  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-door-closed"></i> Chiusura Turno - Step 1/3</h3>
      <p class="section-subtitle">Turno aperto il: <strong>${formattedDate}</strong></p>
      <p class="section-subtitle">Configurazione Chiusura</p>
      ${infoBanner}
      
      <form id="closure-step1-form">
        
        <!-- TIPO CHIUSURA -->
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 15px;">
                ${showPartialOption ? `
                <label class="radio-card ${!isFinal ? 'selected' : ''}" data-type="partial" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <input type="radio" name="closure_type" value="partial" ${!isFinal ? 'checked' : ''} style="display: none;">
                    <i class="fas fa-clock" style="font-size: 1.5rem; color: #3b82f6; margin-bottom: 8px; display: block;"></i>
                    <div style="font-weight: 600; color: #1e293b;">Parziale</div>
                    <div style="font-size: 0.8rem; color: #64748b;">Cambio Turno</div>
                </label>
                ` : ''}
                
                <label class="radio-card ${isFinal ? 'selected' : ''}" data-type="final" style="flex: ${showPartialOption ? '1' : '1'}; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
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
                        step="0.01"
                        min="${opening}"
                        class="big-input gun-counter-input"
                        ${showCounters ? '' : 'disabled'}
                        placeholder="Lascia vuoto se invariato"
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
  const partialAlreadyDone = closureState.data.partialCompleted;
  const allowPartial = closureState.data.allowPartialClosure;
  const partialCard = document.querySelector('.radio-card[data-type="partial"]');
  const finalCard = document.querySelector('.radio-card[data-type="final"]');

  function updateUI() {
    let type = 'final';
    if (!partialAlreadyDone && allowPartial) {
      const selected = document.querySelector('input[name="closure_type"]:checked');
      type = selected ? selected.value : 'partial';
    }
    const include = countersCheck ? countersCheck.checked : true;
    const shouldShowCounters = type === 'final' || include;

    // Update selection styles
    [partialCard, finalCard].forEach(c => c?.classList.remove('selected'));
    if (type === 'final') {
      finalCard?.classList.add('selected');
    } else if (partialCard) {
      partialCard?.classList.add('selected');
    }

    // Nascondi il toggle contatori se la chiusura parziale è disabilitata o se è già stata fatta una parziale
    countersToggleContainer.style.display = (type === 'final' || partialAlreadyDone || !allowPartial) ? 'none' : 'block';
    pistoleSection.style.display = shouldShowCounters ? 'block' : 'none';
    gunInputs.forEach(i => {
      i.required = shouldShowCounters;
      i.disabled = !shouldShowCounters;
    });
  }

  radioInputs.forEach(r => r.addEventListener('change', updateUI));
  countersCheck?.addEventListener('change', updateUI);

  document.getElementById('btn-cancel-closure').addEventListener('click', () => {
    closeModal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    // Se la chiusura parziale è disabilitata o già completata, forza 'final'
    const type = partialCompleted || !allowPartial ? 'final' : formData.get('closure_type');
    const include = type === 'final' ? true : (countersCheck ? countersCheck.checked : false);

    closureState.data.closureType = type;
    closureState.data.includeCounters = include;
    closureState.data.finalCounters = {};

    if (include) {
      pistole.forEach(p => {
        const counterValue = formData.get(`counter_${p.id}`);
        // Se il campo è vuoto, il numeratore non è variato (chiusura = apertura)
        if (counterValue === '' || counterValue === null) {
          closureState.data.finalCounters[p.id] = openingCounters[p.id] || 0;
        } else {
          closureState.data.finalCounters[p.id] = parseFloat(counterValue) || 0;
        }
      });
    }

    closureState.step = 2;
    showClosureStep2();
  });
}

/**
 * Step 2: Riepilogo litri e inserimento incassi (Self + Operatore)
 */
function showClosureStep2() {
  openModal('Chiusura Turno - Step 2/3');
  const container = document.getElementById('modal-body');
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

  // Calcolo Extra (Crediti, Voucher, Rimborsi, Incassi da movimenti)
  const movimenti = closureState.data.movimenti || [];

  // 1. Crediti (Nuovi Debiti) -> Sottrarre dal contante atteso (Carburante venduto ma non incassato)
  const creditsSum = movimenti
    .filter(m => m.tipo === 'credito' || (m.descrizione && m.descrizione.toLowerCase().includes('credito') && m.tipo !== 'incasso'))
    .reduce((sum, m) => sum + Number(m.importo), 0);

  // 2. Voucher -> Sottrarre dal contante atteso (Prepagato)
  const vouchersSum = movimenti
    .filter(m => m.tipo === 'voucher' || (m.descrizione && m.descrizione.toLowerCase().includes('voucher')))
    .reduce((sum, m) => sum + Number(m.importo), 0);

  // 3. Rimborsi -> Sottrarre dal contante atteso (Soldi usciti dalla cassa)
  // Include 'pagamento', 'uscita' (nuovo) e descrizioni con 'rimborso'
  const refundsSum = movimenti
    .filter(m => m.tipo === 'pagamento' || m.tipo === 'uscita' || (m.descrizione && m.descrizione.toLowerCase().includes('rimborso')))
    .reduce((sum, m) => sum + Number(m.importo), 0);

  // 4. Incassi Extra (Olio, Recupero Crediti, ecc.) -> Aggiungere al contante atteso
  // Escludiamo i crediti (nuovi debiti) e i voucher. Includiamo tutto ciò che è 'incasso'.
  const extraCashSum = movimenti
    .filter(m => m.tipo === 'incasso')
    .reduce((sum, m) => sum + Number(m.importo), 0);

  // Recupera valori precedenti o default
  const d = closureState.data;
  const selfCashIn = d.selfCashIn !== undefined && d.selfCashIn !== null ? d.selfCashIn : '';
  const selfCashOut = d.selfCashOut !== undefined && d.selfCashOut !== null ? d.selfCashOut : '';
  const selfPos = d.selfPos !== undefined && d.selfPos !== null ? d.selfPos : '';
  const selfFleet = d.selfFleet !== undefined && d.selfFleet !== null ? d.selfFleet : '';
  const selfManager = d.selfManager !== undefined && d.selfManager !== null ? d.selfManager : '';
  const selfReceiptTotal = d.selfReceiptTotal !== undefined && d.selfReceiptTotal !== null ? d.selfReceiptTotal : '';
  const partialAgg = d.partialAggregates || {};
  const prevSelfManager = partialAgg?.selfManager || 0; // Solo ID gestore si somma tra turni
  const prevOperatorPos = partialAgg?.operatorPos || 0;
  const prevOperatorUta = partialAgg?.operatorUta || 0;

  // Totale venduto da self (solo erogazioni) - NOTA: bancomat e UTA/DKV self NON si sommano, sono sempre gli stessi
  // Solo l'ID gestore si somma tra turni
  const totalSelfManager = selfManager + prevSelfManager;
  const selfTotalVenduto = selfCashOut + selfPos + selfFleet + totalSelfManager;
  const selfDeltaContante = selfCashIn - selfCashOut;

  // Logica Totale Atteso (SOLO CARBURANTE come richiesto)
  let totaleAtteso;
  if (closureState.data.includeCounters) {
    totaleAtteso = ricavoTotaleTeor; // Solo carburante
  } else {
    // Fallback: Se non leggiamo le pompe, l'atteso è il venduto riportato dallo scontrino self
    totaleAtteso = selfTotalVenduto;
  }

  closureState.data.ricavoTotaleTeor = ricavoTotaleTeor;
  closureState.data.creditsSum = creditsSum;
  closureState.data.vouchersSum = vouchersSum;
  closureState.data.refundsSum = refundsSum;
  closureState.data.extraCashSum = extraCashSum;
  closureState.data.totaleAtteso = totaleAtteso;

  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-calculator"></i> Chiusura Turno - Step 2/3</h3>
      <p class="section-subtitle">Dati Scontrino Self e Incassi Operatore</p>
      
      <div class="summary-box">
        <h4>Riepilogo Vendite Carburante ${!closureState.data.includeCounters ? '(Stimato da Self)' : ''}</h4>
        ${closureState.data.includeCounters ? `
        <div class="summary-row">
          <span>Totale Litri:</span>
          <strong>${formatLitri(totalLitriBenzina + totalLitriGasolio)} L</strong>
        </div>
        ` : ''}
        <div class="summary-row total">
          <span>Totale Atteso (Solo Carburante):</span>
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
              <small style="color: #6b7280;">(Resto erogato - usato per totale venduto e delta contante)</small>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>3. Bancomat Erogati (€)</label>
              <input type="number" name="self_pos" step="0.01" min="0" value="${selfPos}" class="big-input self-input" required>
              <small style="color: #6b7280;">(Valore unico per tutto il turno - non si somma)</small>
            </div>
            <div class="form-group">
              <label>4. Transazioni UTA/DKV (€)</label>
              <input type="number" name="self_fleet" step="0.01" min="0" value="${selfFleet}" class="big-input self-input" required>
              <small style="color: #6b7280;">(Valore unico per tutto il turno - non si somma)</small>
            </div>
          </div>

          <div class="form-group">
            <label>5. ID Gestore (€)</label>
            <input type="number" name="self_manager" step="0.01" min="0" value="${selfManager}" class="big-input self-input" required>
            ${prevSelfManager ? `<small style="color: #6b7280;">Turno precedente: ${formatEuro(prevSelfManager)}</small>` : ''}
            <small style="color: #6b7280;">(Fondi cambio turno/test)</small>
          </div>

          <div class="summary-row total" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
            <span>Totale Self (Venduto):</span>
            <strong id="self-total-display">${formatEuro(selfTotalVenduto)}</strong>
          </div>
          <div class="summary-row" style="font-size: 0.9rem; color: #475569;">
            <span>Delta Contante (Incassato - Erogato):</span>
            <strong id="self-delta-display">${formatEuro(selfDeltaContante)}</strong>
          </div>

          <div class="form-group" style="margin-top: 15px;">
            <label>Totale Scontrino (Da Ricevuta) (€)</label>
            <input type="number" name="self_receipt_total" step="0.01" min="0" value="${selfReceiptTotal}" class="big-input" placeholder="Inserisci totale scontrino...">
            <small style="color: #6b7280;">Inserire il totale riportato sullo scontrino cartaceo per confronto.</small>
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
              <input type="number" name="cash_real" step="0.01" min="0" value="${d.cashReal || ''}" class="big-input" required>
              <small style="color: #6b7280;">Inserire il contante effettivamente presente in cassa.</small>
            </div>
            <div class="form-group">
              <label>POS Manuale (€)</label>
              <input type="number" name="pos_real" step="0.01" min="0" value="${d.posReal || ''}" class="big-input" required>
              ${prevOperatorPos ? `<small style="color: #6b7280;">Turno precedente: ${formatEuro(prevOperatorPos)}</small>` : ''}
            </div>
          </div>

          <div class="form-group">
             <label>Transazioni UTA/DKV/Fine Mese (€)</label>
             <input type="number" name="uta_dkv_real" step="0.01" min="0" value="${d.utaDkvReal || ''}" class="big-input" required>
             ${closureState.data.openingUtaDkvIscard > 0 ? `<small style="color: #6b7280; display: block; margin-top: 5px;">Da apertura: ${formatEuro(closureState.data.openingUtaDkvIscard)}</small>` : ''}
             ${prevOperatorUta ? `<small style="color: #6b7280; display: block; margin-top: 5px;">Turno precedente: ${formatEuro(prevOperatorUta)}</small>` : ''}
          </div>
          
          ${creditsSum > 0 ? `
          <div class="form-group">
            <label>Crediti (Nuovi Debiti)</label>
            <input type="text" value="${formatEuro(creditsSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <input type="hidden" name="credits_real" value="${creditsSum}">
          </div>
          ` : '<input type="hidden" name="credits_real" value="0">'}

          ${vouchersSum > 0 ? `
          <div class="form-group">
            <label>Voucher (Prepagati)</label>
            <input type="text" value="${formatEuro(vouchersSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <input type="hidden" name="vouchers_real" value="${vouchersSum}">
          </div>
          ` : '<input type="hidden" name="vouchers_real" value="0">'}
          
          ${refundsSum > 0 ? `
          <div class="form-group">
            <label>Rimborsi / Uscite Cassa</label>
            <input type="text" value="${formatEuro(refundsSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <input type="hidden" name="refunds_real" value="${refundsSum}">
            <div style="margin-top: 5px; font-size: 0.85em; color: #64748b; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                <strong>Dettaglio Uscite:</strong>
                <ul style="margin: 5px 0 0 0; padding-left: 20px;">
                    ${movimenti
        .filter(m => m.tipo === 'pagamento' || m.tipo === 'uscita' || (m.descrizione && m.descrizione.toLowerCase().includes('rimborso')))
        .map(m => `<li>${new Date(m.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: ${escapeHtml(m.descrizione || 'Uscita')} (${formatEuro(m.importo)})</li>`)
        .join('')}
                </ul>
            </div>
          </div>
          ` : '<input type="hidden" name="refunds_real" value="0">'}

          ${extraCashSum > 0 ? `
           <div class="form-group">
            <label>Incassi Extra (Olio, Rec. Crediti)</label>
            <input type="text" value="${formatEuro(extraCashSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <div style="margin-top: 5px; font-size: 0.85em; color: #64748b; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                <strong>Dettaglio Incassi:</strong>
                <ul style="margin: 5px 0 0 0; padding-left: 20px;">
                    ${movimenti
        .filter(m => m.tipo === 'incasso')
        .map(m => `<li>${new Date(m.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: ${escapeHtml(m.descrizione || 'Incasso')} (${formatEuro(m.importo)})</li>`)
        .join('')}
                </ul>
            </div>
          </div>
          ` : ''}

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
  const deltaDisplay = document.getElementById('self-delta-display');
  const expectedDisplay = document.getElementById('total-expected-display');

  function updateTotals() {
    const cashIn = parseFloat(form.self_cash_in.value) || 0;
    const cashOut = parseFloat(form.self_cash_out.value) || 0;
    const pos = parseFloat(form.self_pos.value) || 0;
    const fleet = parseFloat(form.self_fleet.value) || 0;
    const manager = parseFloat(form.self_manager.value) || 0;
    const prevManager = closureState.data.partialAggregates?.selfManager || 0;

    // NOTA: bancomat e UTA/DKV self NON si sommano - solo ID gestore si somma
    const totalVenduto = cashOut + pos + fleet + (manager + prevManager);
    const deltaContante = cashIn - cashOut;
    totalDisplay.textContent = formatEuro(totalVenduto);
    deltaDisplay.textContent = formatEuro(deltaContante);

    // If counters are NOT included, Expected Total depends on Self Total
    if (!closureState.data.includeCounters) {
      // Fallback: Totale Atteso = Totale Scontrino Self (Calculated)
      expectedDisplay.textContent = formatEuro(totalVenduto);
      closureState.data.totaleAtteso = totalVenduto;
    }

    closureState.data.selfDeltaContante = deltaContante;
  }

  selfInputs.forEach(input => {
    input.addEventListener('input', updateTotals);
  });
  updateTotals();

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
    closureState.data.selfReceiptTotal = parseFloat(formData.get('self_receipt_total')) || 0;

    // Save Operator Data
    closureState.data.cashReal = parseFloat(formData.get('cash_real')) || 0;
    closureState.data.posReal = parseFloat(formData.get('pos_real')) || 0;
    closureState.data.utaDkvReal = parseFloat(formData.get('uta_dkv_real')) || 0;

    closureState.data.notes = formData.get('notes') || '';

    closureState.step = 3;
    showClosureStep3();
  });
}

/**
 * Step 3: Conferma finale e salvataggio
 */
function showClosureStep3() {
  openModal('Chiusura Turno - Step 3/3');
  const container = document.getElementById('modal-body');
  const {
    ricavoTotaleTeor,
    // Self Data
    selfCashIn, selfCashOut, selfPos, selfFleet, selfManager, selfReceiptTotal,
    // Operator Data
    cashReal, posReal, utaDkvReal, creditsSum, vouchersSum, refundsSum, extraCashSum,
    // Totals
    totalLitriBenzina, totalLitriGasolio, prezzoBenzina, prezzoGasolio, notes
  } = closureState.data;

  const partialAgg = closureState.data.partialAggregates || {};
  const prevSelfManager = partialAgg?.selfManager || 0; // Solo ID gestore si somma tra turni
  const prevOperatorPos = partialAgg?.operatorPos || 0;
  const prevOperatorUta = partialAgg?.operatorUta || 0;

  // Calcoli Totali
  // NOTA: bancomat e UTA/DKV self NON si sommano - sono sempre gli stessi per tutto il turno
  const totalSelfManager = selfManager + prevSelfManager; // Solo ID gestore si somma
  const selfTotalVenduto = selfCashOut + selfPos + selfFleet + totalSelfManager;
  const totalPosOperatore = posReal + prevOperatorPos;
  // Somma UTA/DKV inserito dall'operatore + quello da apertura + eventuali chiusure parziali precedenti
  const openingUtaDkv = closureState.data.openingUtaDkvIscard || 0;
  const totalUtaOperatore = utaDkvReal + openingUtaDkv + prevOperatorUta;

  // Totale Dichiarato (Contanti + POS + UTA + Crediti + Voucher)
  // Nota: Questo è solo per visualizzazione, non per il controllo contanti
  const operatorTotalDeclared = cashReal + totalPosOperatore + totalUtaOperatore;

  // Totale Atteso Globale = Carburante + Extra Cash
  const totaleAttesoGlobale = closureState.data.totaleAtteso + (extraCashSum || 0);

  // VALIDAZIONE CONTANTI (FORMULA UTENTE)
  // Contanti Attesi = (Totale Carburante) - POS Operatore - UTA/DKV Operatore - Bancomat Self - Crediti - Voucher + (SelfIn - SelfOut) - Rimborsi + Incassi Extra
  // NOTA: Bancomat Self e UTA/DKV Self NON si sommano tra turni - sono sempre gli stessi

  const selfDelta = selfCashIn - selfCashOut; // Differenza banconote self

  const carburanteAtteso = closureState.data.totaleAtteso;

  const expectedCash = carburanteAtteso
    - totalPosOperatore
    - totalUtaOperatore
    - selfPos  // Bancomat Self (non si somma, è sempre lo stesso)
    - creditsSum
    - vouchersSum
    + selfDelta
    - refundsSum
    + extraCashSum;

  const cashDiff = cashReal - expectedCash;
  const isCashValid = Math.abs(cashDiff) <= 5;
  const discrepanza = cashDiff; // La discrepanza principale è sui contanti
  const discrepanzaClass = discrepanza >= 0 ? 'positive' : 'negative';

  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-check-circle"></i> Chiusura Turno - Step 3/3</h3>
      <p class="section-subtitle">Conferma i dati prima di salvare</p>
      
      ${!isCashValid ? `
      <div class="warning-message" style="margin-bottom: 20px; border-left: 4px solid #f59e0b; background: #fffbeb; padding: 15px;">
        <div style="display: flex; align-items: center; gap: 10px; color: #b45309; font-weight: bold; margin-bottom: 5px;">
            <i class="fas fa-exclamation-triangle"></i> Attenzione: Discrepanza Contanti
        </div>
        <p style="margin: 0; color: #92400e;">
            I contanti inseriti (${formatEuro(cashReal)}) differiscono da quelli attesi (${formatEuro(expectedCash)}) di <strong>${formatEuro(cashDiff)}</strong>.
            <br>Il limite consentito è +/- 5,00 €. Verifica di aver contato bene.
        </p>
      </div>
      ` : ''}

      <div class="summary-box">
        <h4>Riepilogo Finale</h4>
        
        <!-- Totale Atteso -->
        <div class="summary-row">
          <span>Totale Atteso (Carburante):</span>
          <strong>${formatEuro(closureState.data.totaleAtteso)}</strong>
        </div>
        
        <div class="section-divider"></div>
        
        <!-- Dettaglio Self -->
        <div class="summary-row">
          <span>Totale Scontrino Self (Venduto):</span>
          <strong>${formatEuro(selfTotalVenduto)}</strong>
        </div>
        ${selfReceiptTotal > 0 ? `
        <div class="summary-row" style="font-size: 0.9em; color: #64748b;">
          <span>Totale Scontrino (Manuale):</span>
          <span>${formatEuro(selfReceiptTotal)}</span>
        </div>
        ` : ''}
        <div style="font-size: 0.85rem; color: #6b7280; padding-left: 10px; margin-bottom: 5px;">
          Incassato: ${formatEuro(selfCashIn)} | Erogato: ${formatEuro(selfCashOut)}<br>
          POS: ${formatEuro(selfPos)} | Fleet: ${formatEuro(selfFleet)} | ID: ${formatEuro(totalSelfManager)}${prevSelfManager ? ` (prev. ${formatEuro(prevSelfManager)})` : ''}
        </div>

        <!-- Dettaglio Operatore -->
        <div class="summary-row">
          <span>Totale Operatore:</span>
          <strong>${formatEuro(operatorTotalDeclared)}</strong>
        </div>
        <div style="font-size: 0.85rem; color: #6b7280; padding-left: 10px; margin-bottom: 5px;">
          Cassa: ${formatEuro(cashReal)} | POS: ${formatEuro(totalPosOperatore)}${prevOperatorPos ? ` (prev. ${formatEuro(prevOperatorPos)})` : ''} | UTA: ${formatEuro(totalUtaOperatore)}${prevOperatorUta ? ` (prev. ${formatEuro(prevOperatorUta)})` : ''}<br>
          Crediti: ${formatEuro(creditsSum)} | Voucher: ${formatEuro(vouchersSum)}
        </div>

        <!-- Extra e Rimborsi -->
        ${extraCashSum > 0 ? `
        <div class="summary-row">
            <span>Incassi Extra:</span>
            <strong style="color: #10b981;">+ ${formatEuro(extraCashSum)}</strong>
        </div>` : ''}
        
        ${refundsSum > 0 ? `
        <div class="summary-row">
            <span>Rimborsi / Uscite:</span>
            <strong style="color: #ef4444;">- ${formatEuro(refundsSum)}</strong>
        </div>` : ''}

        <div class="section-divider"></div>

        <!-- Dettaglio Calcolo Contanti Attesi -->
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #64748b;">
          <h5 style="margin-top: 0; color: #475569; font-size: 0.95rem;">Dettaglio Calcolo Contanti Attesi:</h5>
          <div style="font-size: 0.85rem; color: #64748b; line-height: 1.8;">
            <div>Totale Carburante: <strong>${formatEuro(carburanteAtteso)}</strong></div>
            <div style="margin-left: 20px; color: #ef4444;">
              - POS Operatore: <strong>${formatEuro(totalPosOperatore)}</strong>${prevOperatorPos ? ` (di cui ${formatEuro(prevOperatorPos)} da turno precedente)` : ''}
            </div>
            <div style="margin-left: 20px; color: #ef4444;">
              - UTA/DKV Operatore: <strong>${formatEuro(totalUtaOperatore)}</strong>${prevOperatorUta ? ` (di cui ${formatEuro(prevOperatorUta)} da turno precedente)` : ''}
            </div>
            ${selfPos > 0 ? `<div style="margin-left: 20px; color: #ef4444;">
              - Bancomat Self: <strong>${formatEuro(selfPos)}</strong>
            </div>` : ''}
            ${creditsSum > 0 ? `<div style="margin-left: 20px; color: #ef4444;">- Crediti: <strong>${formatEuro(creditsSum)}</strong></div>` : ''}
            ${vouchersSum > 0 ? `<div style="margin-left: 20px; color: #ef4444;">- Voucher: <strong>${formatEuro(vouchersSum)}</strong></div>` : ''}
            ${selfDelta !== 0 ? `<div style="margin-left: 20px; color: ${selfDelta > 0 ? '#10b981' : '#ef4444'};">
              ${selfDelta > 0 ? '+' : ''} Delta Self: <strong>${formatEuro(selfDelta)}</strong> (Incassato ${formatEuro(selfCashIn)} - Erogato ${formatEuro(selfCashOut)})
            </div>` : ''}
            ${refundsSum > 0 ? `<div style="margin-left: 20px; color: #ef4444;">- Rimborsi/Uscite: <strong>${formatEuro(refundsSum)}</strong></div>` : ''}
            ${extraCashSum > 0 ? `<div style="margin-left: 20px; color: #10b981;">+ Incassi Extra: <strong>${formatEuro(extraCashSum)}</strong></div>` : ''}
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-weight: 600; color: #1e293b;">
              = Contanti Attesi: <strong>${formatEuro(expectedCash)}</strong>
            </div>
          </div>
        </div>

        <!-- Totale Finale -->
        <div class="summary-row total">
          <span>Contanti Attesi:</span>
          <strong>${formatEuro(expectedCash)}</strong>
        </div>

        <div class="summary-row">
          <span>Contanti Inseriti (Cassa):</span>
          <strong>${formatEuro(cashReal)}</strong>
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
    showClosureStep2();
  });

  document.getElementById('btn-confirm-closure').addEventListener('click', async () => {
    const isFinal = closureState.data.closureType === 'final';

    if (!isCashValid) {
      if (!confirm('ATTENZIONE: C\'è una discrepanza significativa nei contanti (> 5€). Sei sicuro di voler procedere?')) return;
    }

    if (!confirm(`Confermi la chiusura ${isFinal ? 'FINALE' : 'PARZIALE'} del turno?`)) return;

    showLoadingMessage(container);

    try {
      const { stationId, userId, turnoId, pistole, finalCounters } = closureState.data;

      // Calcolo Aggregati per DB
      // Incasso Contanti = (Self Cash In - Self Cash Out) + Operator Cash
      const incassoContanti = (selfCashIn - selfCashOut) + cashReal;

      // Incasso POS = Self POS + Operator POS (NOTA: selfPos non si somma tra turni)
      const incassoPos = selfPos + totalPosOperatore;

      // Incasso UTA/DKV = Self Fleet + Operator UTA + Crediti + Voucher (NOTA: selfFleet non si somma tra turni)
      const incassoUtaDkv = selfFleet + totalUtaOperatore + creditsSum + vouchersSum;

      // Totale Lordo (Dichiarato)
      const totaleReale = incassoContanti + incassoPos + incassoUtaDkv;

      // Prepara data_json con dettaglio completo
      const dataJson = {
        litri_benzina: totalLitriBenzina,
        litri_gasolio: totalLitriGasolio,
        prezzo_benzina: prezzoBenzina,
        prezzo_gasolio: prezzoGasolio,
        ricavo_teorico: ricavoTotaleTeor,
        extra_incassi: extraCashSum,
        totale_atteso: totaleAttesoGlobale,
        incasso_reale: totaleReale,
        closure_stage: closureState.data.closureType,

        // Nuovo oggetto Scontrino Self
        // NOTA: bancomat_erogati e transazioni_uta NON si sommano - sono sempre gli stessi per tutto il turno
        // Solo id_gestore si somma tra turni
        scontrino_self: {
          banconote_incassate: selfCashIn,
          banconote_erogate: selfCashOut,
          bancomat_erogati: selfPos,
          transazioni_uta: selfFleet,
          id_gestore: totalSelfManager,
          totale_scontrino_calcolato: selfTotalVenduto,
          totale_scontrino_manuale: selfReceiptTotal
        },

        // Dettaglio Operatore
        dettaglio_incasso: {
          contanti_operatore: cashReal,
          pos_operatore: totalPosOperatore,
          uta_dkv_operatore: totalUtaOperatore,
          crediti: creditsSum,
          voucher: vouchersSum,
          rimborsi_uscite: refundsSum
        },

        discrepanza: discrepanza,
        is_final: isFinal,
        closure_type: closureState.data.closureType,
        notes: notes
      };

      // Salva chiusura: aggiorna il record esistente in shifts
      const updatePayload = {
        closing_data: dataJson,
        status: isFinal ? 'closed' : 'open'
      };

      if (isFinal) {
        updatePayload.closed_at = new Date().toISOString();
      }

      const { data: closure, error: closureError } = await supabase
        .from('shifts')
        .update(updatePayload)
        .eq('id', turnoId)
        .select()
        .single();

      if (closureError) throw closureError;

      // Aggiorna contatori finali pistole SOLO se sono stati inseriti
      if (closureState.data.includeCounters) {
        // Aggiorna i record esistenti in shift_pistols con i contatori finali
        for (const p of pistole) {
          const { error: counterError } = await supabase
            .from('shift_pistols')
            .update({
              closed_at_counter: finalCounters[p.id]
            })
            .eq('shift_id', turnoId)
            .eq('pistola_id', p.id);

          if (counterError) {
            console.error(`Errore aggiornamento contatore pistola ${p.id}:`, counterError);
          }
        }
      }

      // Aggiorna contatori pistole nella tabella 'pistole' se è chiusura finale
      if (isFinal) {
        for (const p of pistole) {
          await supabase
            .from('pistole')
            .update({ numero_litri: finalCounters[p.id] })
            .eq('id', p.id);
        }
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

      const operatorContent = document.getElementById('operator-content');
      document.getElementById('btn-home').addEventListener('click', () => {
        closeModal();
        if (operatorContent) {
          operatorContent.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
        }
        updateOpeningStatus(stationId);
      });

    } catch (err) {
      container.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">Errore: ${escapeHtml(err.message)}</p>`;
    }
  });
}
