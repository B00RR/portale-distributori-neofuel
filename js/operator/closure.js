// ==========================================
// OPERATOR CLOSURE WIZARD
// Gestione chiusura turno con wizard a 3 step
// ==========================================
import { supabase } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, showErrorMessage, openModal, closeModal, openConfirmModal } from '../ui/ui.js';
import { calculationEngine, CALCULATION_SCOPES } from '../utils/calculation-engine.js';
import { escapeHtml, formatLitri, formatEuro } from '../utils/utils.js';

import { checkOpeningStatus, updateOpeningStatus } from './opening.js';
import {
  createWarningMessage,
  createBackButton,
  createContentBox,
  attachBackButtonListener
} from './ui-components.js';

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
      ) + '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>';
      document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
      return;
    }

    // Carica tutti i dati in parallelo
    // 5. Prepara query movimenti cassa
    const movimentiQuery = supabase
      .from('movimenti_cassa')
      .select('*')
      .eq('station_id', stationId)
      .gte('created_at', activeOpening.opened_at || activeOpening.date_time);

    // Se c'è una chiusura parziale, carica solo i movimenti DOPO la chiusura parziale
    // per evitare di contare due volte i movimenti già conteggiati
    // NOTA: I movimenti vengono sempre conteggiati dal momento dell'apertura, quindi
    // se c'è una chiusura parziale, dobbiamo escludere i movimenti già conteggiati
    // Tuttavia, la chiusura parziale non "consuma" i movimenti, quindi dobbiamo
    // caricare tutti i movimenti dal momento dell'apertura. Il problema potrebbe
    // essere che i crediti vengono inseriti due volte in movimenti_cassa.

    const [
      openingCountersResult,
      pistoleResult,
      prezziResult,
      movimentiResult,
      stationDataResult,
      tankLinksResult
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
      movimentiQuery,
      // 6. Carica impostazione chiusura parziale dalla stazione
      supabase
        .from('fuel_stations')
        .select('allow_partial_closure')
        .eq('station_id', stationId)
        .single(),
      // 7. Configurazioni serbatoi ↔︎ pistole
      supabase
        .from('tank_pump_links')
        .select(`
          id,
          pump_id,
          tank_id,
          mode,
          ratio,
          priority,
          is_active,
          tanks ( id, name, fuel_type ),
          pistole ( id, nome, islands(nome) )
        `)
        .eq('station_id', stationId)
        .eq('is_active', true)
        .order('pump_id')
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
      ) + '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning2" class="menu-button primary">Chiudi</button></div>';
      document.getElementById('btn-close-warning2').addEventListener('click', () => closeModal());
      return;
    }

    // Processa prezzi
    const { data: prezzi } = prezziResult;
    const prezzoBenzina = prezzi?.prezzo_benzina || 0;
    const prezzoGasolio = prezzi?.prezzo_gasolio || 0;

    // Processa movimenti
    const { data: movimentiRaw } = movimentiResult;
    // Rimuovi duplicati basati su tipo, importo e created_at (arrotondato al secondo)
    // per evitare di contare due volte gli stessi movimenti (es. crediti inseriti due volte)
    const movimentiMap = new Map();
    (movimentiRaw || []).forEach(m => {
      // Arrotonda la data al secondo per gestire piccole differenze di timestamp
      const dateKey = m.created_at ? new Date(m.created_at).setMilliseconds(0).toString() : '';
      const key = `${m.tipo}_${m.importo}_${dateKey}`;
      // Se esiste già un movimento con la stessa chiave, mantieni quello con l'ID più basso (il primo)
      if (!movimentiMap.has(key) || (m.id && movimentiMap.get(key).id > m.id)) {
        movimentiMap.set(key, m);
      }
    });
    const movimenti = Array.from(movimentiMap.values());

    // Log per debug: verifica se ci sono crediti duplicati
    if (movimentiRaw && movimentiRaw.length !== movimenti.length) {
      console.warn(`Rimossi ${movimentiRaw.length - movimenti.length} movimenti duplicati`);
    }

    // Processa impostazione stazione
    const { data: stationData } = stationDataResult;

    const allowPartialClosure = stationData?.allow_partial_closure !== false; // Default true se non specificato

    // Configurazioni serbatoi ↔︎ pistole
    const { data: tankLinksData, error: tankLinksError } = tankLinksResult || {};
    if (tankLinksError && tankLinksError.code !== '42P01') {
      console.warn('Errore configurazione serbatoi/pistole:', tankLinksError);
    }
    const tankLinksByPump = {};
    (tankLinksData || []).forEach(link => {
      if (!link?.pump_id || !link?.tank_id) {return;}
      const normalized = {
        id: link.id,
        pump_id: link.pump_id,
        tank_id: link.tank_id,
        mode: link.mode || 'auto',
        ratio: Number(link.ratio) || 0,
        priority: Number(link.priority) || 1,
        tankName: link.tanks?.name || `Cisterna #${link.tank_id}`,
        tankFuel: link.tanks?.fuel_type || '',
        pumpName: link.pistole?.nome || `Pistola #${link.pump_id}`,
        islandName: link.pistole?.islands?.nome || ''
      };
      if (!tankLinksByPump[link.pump_id]) {
        tankLinksByPump[link.pump_id] = [];
      }
      tankLinksByPump[link.pump_id].push(normalized);
    });

    Object.values(tankLinksByPump).forEach(list => {
      list.sort((a, b) => {
        if (a.mode !== b.mode) {return a.mode === 'manual' ? -1 : 1;}
        if (a.mode === 'manual') {
          return (a.priority || 999) - (b.priority || 999);
        }
        return (b.ratio || 0) - (a.ratio || 0);
      });
    });

    const hasManualTankLinks = Object.values(tankLinksByPump).some(list => list.some(link => link.mode === 'manual'));
    const pumpLabelMap = {};
    allPistole.forEach(p => {
      pumpLabelMap[p.id] = p.nome || `Pistola #${p.id}`;
    });

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
        includeCounters: partialCompleted ? true : false,
        tankLinksByPump,
        tankSelections: {},
        hasManualTankLinks,
        pumpLabelMap,
        litersPerPump: {}
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
  const {
    pistole,
    openingCounters,
    closureType,
    includeCounters,
    openingDate,
    partialCompleted,
    allowPartialClosure,
    tankLinksByPump = {},
    tankSelections = {},
    hasManualTankLinks = false
  } = closureState.data;

  // Se la chiusura parziale è disabilitata, forza sempre 'final'
  const isFinal = partialCompleted ? true : (!allowPartialClosure ? true : closureType === 'final');
  const showCounters = isFinal || includeCounters;
  const keepSectionVisible = hasManualTankLinks;
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
    const links = tankLinksByPump[p.id] || [];
    const manualLinks = links.filter(l => l.mode === 'manual');
    const autoLinks = links.filter(l => l.mode !== 'manual');
    const savedSelection = tankSelections[p.id]?.tankId;
    const manualSelectHtml = manualLinks.length ? `
      <div class="form-group tank-link-panel">
        <label class="tank-link-title">Serbatoio collegato</label>
        <select name="tank_select_${p.id}" data-pump="${p.id}" class="big-input tank-select" ${manualLinks.length ? 'required' : ''}>
          <option value="">Seleziona serbatoio...</option>
          ${manualLinks.map((link, idx) => {
    const isSelected = savedSelection
      ? savedSelection === link.tank_id
      : (manualLinks.length === 1 && idx === 0);
    return `<option value="${link.tank_id}" ${isSelected ? 'selected' : ''}>${escapeHtml(link.tankName)}${link.priority ? ` (prio ${link.priority})` : ''}</option>`;
  }).join('')}
        </select>
      </div>
    ` : '';

    const autoInfoHtml = autoLinks.length ? `
      <div class="tank-link-panel">
        <p class="tank-link-title">Ripartizione automatica</p>
        <div class="tank-link-info">
          ${autoLinks.map(link => `<span class="badge badge-outline">${escapeHtml(link.tankName)} · ${link.ratio ? `${link.ratio}%` : 'equamente'}</span>`).join('')}
        </div>
      </div>
    ` : '';

    const tankInfoHtml = links.length ? `${manualSelectHtml}${autoInfoHtml}` : '';

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
                    ${tankInfoHtml || '<p class="tank-link-empty">Nessun serbatoio collegato</p>'}
                </div>
                `;
  }).join('')}
            </div>
        </div>
        
        <div class="form-actions">
          <button type="button" class="menu-button btn-danger" id="btn-cancel-closure">
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
  const tankSelects = form.querySelectorAll('.tank-select');
  const partialAlreadyDone = closureState.data.partialCompleted;
  const allowPartial = closureState.data.allowPartialClosure;
  const partialCard = document.querySelector('.radio-card[data-type="partial"]');
  const finalCard = document.querySelector('.radio-card[data-type="final"]');

  function updateUI() {
    let type = 'final';
    if (!partialAlreadyDone && allowPartial) {
      const selected = /** @type {HTMLInputElement} */(document.querySelector('input[name="closure_type"]:checked'));
      type = selected ? selected.value : 'partial';
    }
    const include = countersCheck ? (/** @type {HTMLInputElement} */(countersCheck)).checked : true;
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
    const shouldDisplayGrid = shouldShowCounters || keepSectionVisible;
    pistoleSection.style.display = shouldDisplayGrid ? 'block' : 'none';
    gunInputs.forEach(i => {
      const input = /** @type {HTMLInputElement} */(i);
      input.required = shouldShowCounters;
      input.disabled = !shouldShowCounters;
    });
  }

  radioInputs.forEach(r => r.addEventListener('change', updateUI));
  countersCheck?.addEventListener('change', updateUI);

  document.getElementById('btn-cancel-closure').addEventListener('click', () => {
    closeModal();
  });

  tankSelects.forEach(selectElement => {
    const select = /** @type {HTMLSelectElement} */(selectElement);
    const pumpId = Number(select.dataset.pump);
    const savedValue = tankSelections[pumpId]?.tankId;
    if (!savedValue && select.options.length === 2) {
      select.selectedIndex = 1;
    }
    if (select.value) {
      closureState.data.tankSelections = closureState.data.tankSelections || {};
      closureState.data.tankSelections[pumpId] = {
        tankId: Number(select.value),
        mode: 'manual'
      };
    }
    select.addEventListener('change', () => {
      closureState.data.tankSelections = closureState.data.tankSelections || {};
      closureState.data.tankSelections[pumpId] = {
        tankId: select.value ? Number(select.value) : null,
        mode: 'manual'
      };
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(/** @type {HTMLFormElement} */(e.target));

    // Se la chiusura parziale è disabilitata o già completata, forza 'final'
    const type = partialCompleted || !allowPartial ? 'final' : formData.get('closure_type')?.toString() || 'final';
    const include = type === 'final' ? true : (countersCheck ? (/** @type {HTMLInputElement} */(countersCheck)).checked : false);

    closureState.data.closureType = type;
    closureState.data.includeCounters = include;
    closureState.data.finalCounters = {};

    if (include) {
      pistole.forEach(p => {
        const counterValue = formData.get(`counter_${p.id}`)?.toString() || '';
        // Se il campo è vuoto, il numeratore non è variato (chiusura = apertura)
        if (counterValue === '' || counterValue === null) {
          closureState.data.finalCounters[p.id] = openingCounters[p.id] || 0;
        } else {
          closureState.data.finalCounters[p.id] = parseFloat(counterValue) || 0;
        }
      });
    }

    // Valida selezioni manuali
    const selections = {};
    /** @type {import('../types.js').Pistola | null} */
    let missingSelection = null;
    pistole.forEach(p => {
      const manualLinks = (tankLinksByPump[p.id] || []).filter(l => l.mode === 'manual');
      if (manualLinks.length > 0) {
        const selectedTank = formData.get(`tank_select_${p.id}`)?.toString();
        if (!selectedTank) {
          missingSelection = p;
        } else {
          selections[p.id] = {
            tankId: Number(selectedTank),
            mode: 'manual'
          };
        }
      }
    });

    if (missingSelection) {
      Toast.show(`Seleziona il serbatoio per ${missingSelection.nome || `Pistola #${missingSelection.id}`}`, 'warning');
      const selectEl = /** @type {HTMLElement} */(form.querySelector(`[name="tank_select_${missingSelection.id}"]`));
      selectEl?.focus();
      return;
    }

    closureState.data.tankSelections = selections;

    closureState.step = 2;
    await showClosureStep2();
  });
}

/**
 * Step 2: Riepilogo litri e inserimento incassi (Self + Operatore)
 */
async function showClosureStep2() {
  openModal('Chiusura Turno - Step 2/3');
  const container = document.getElementById('modal-body');
  const { pistole, openingCounters, finalCounters, prezzoBenzina, prezzoGasolio } = closureState.data;

  // Calcola litri erogati per ogni pistola (SE presenti)
  let totalLitriBenzina = 0;
  let totalLitriGasolio = 0;
  let ricavoTotaleTeor = 0;
  const litersPerPump = {};

  if (closureState.data.includeCounters) {
    pistole.forEach(p => {
      const opening = openingCounters[p.id] || 0;
      const closing = finalCounters[p.id] || 0;
      const litri = Math.max(0, closing - opening);
      litersPerPump[p.id] = litri;

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

  closureState.data.litersPerPump = litersPerPump;

  closureState.data.totalLitriBenzina = totalLitriBenzina;
  closureState.data.totalLitriGasolio = totalLitriGasolio;

  // Calcolo Extra (Crediti, Voucher, Rimborsi, Incassi da movimenti)
  const movimenti = closureState.data.movimenti || [];

  // 1. Crediti (Nuovi Debiti) -> Sottrarre dal contante atteso (Carburante venduto ma non incassato)
  let creditsSum = 0;
  let vouchersSum = 0;
  let refundsSum = 0;
  let extraCashSum = 0;
  try {
    const movimentiSummary = await calculationEngine.run(CALCULATION_SCOPES.CHIUSURE_MOVIMENTI, { movimenti });
    creditsSum = Number(movimentiSummary?.credits ?? 0);
    vouchersSum = Number(movimentiSummary?.vouchers ?? 0);
    refundsSum = Number(movimentiSummary?.refunds ?? 0);
    extraCashSum = Number(movimentiSummary?.extra_cash ?? 0);
  } catch (err) {
    console.warn('Motore calcoli movimenti indisponibile:', err);
    creditsSum = movimenti
      .filter(m => m.tipo === 'credito' || (m.descrizione && m.descrizione.toLowerCase().includes('credito') && m.tipo !== 'incasso'))
      .reduce((sum, m) => sum + Number(m.importo), 0);
    vouchersSum = movimenti
      .filter(m => m.tipo === 'voucher' || m.tipo === 'punti' || (m.descrizione && (m.descrizione.toLowerCase().includes('voucher') || m.descrizione.toLowerCase().includes('punti'))))
      .reduce((sum, m) => sum + Number(m.importo), 0);
    refundsSum = movimenti
      .filter(m => m.tipo === 'pagamento' || m.tipo === 'uscita' || (m.descrizione && m.descrizione.toLowerCase().includes('rimborso')))
      .reduce((sum, m) => sum + Number(m.importo), 0);
    extraCashSum = movimenti
      .filter(m => m.tipo === 'incasso')
      .reduce((sum, m) => sum + Number(m.importo), 0);
  }

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
  // Solo l'ID gestore si somma tra turni (se chiusura parziale abilitata)
  // Se chiusura parziale disabilitata, è "Totale Gestore" e non si somma
  const totalSelfManager = closureState.data.allowPartialClosure ? (selfManager + prevSelfManager) : selfManager;
  const selfTotalVenduto = selfCashOut + selfPos + selfFleet + totalSelfManager;
  const selfDeltaContante = selfCashIn - selfCashOut;

  // Logica Totale Atteso (SOLO CARBURANTE come richiesto)
  let totaleAtteso;
  try {
    const totalsResult = await calculationEngine.run(CALCULATION_SCOPES.CHIUSURE_TOTALE_ATTESO, {
      includeCounters: closureState.data.includeCounters,
      totalLitriBenzina,
      totalLitriGasolio,
      prezzoBenzina,
      prezzoGasolio,
      selfTotalVenduto
    });
    const ricavoEngine = Number(totalsResult?.ricavo_teorico ?? ricavoTotaleTeor);
    ricavoTotaleTeor = Number.isFinite(ricavoEngine) ? ricavoEngine : ricavoTotaleTeor;
    totaleAtteso = Number(totalsResult?.totale_atteso);
    if (!Number.isFinite(totaleAtteso)) {
      totaleAtteso = closureState.data.includeCounters ? ricavoTotaleTeor : selfTotalVenduto;
    }
  } catch (err) {
    console.warn('Motore calcoli totale atteso indisponibile:', err);
    totaleAtteso = closureState.data.includeCounters ? ricavoTotaleTeor : selfTotalVenduto;
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
            <label>5. ${closureState.data.allowPartialClosure ? 'ID Gestore' : 'Totale Gestore'} (€)</label>
            <input type="number" name="self_manager" step="0.01" min="0" value="${selfManager}" class="big-input self-input" required>
            ${closureState.data.allowPartialClosure && prevSelfManager ? `<small style="color: #6b7280;">Turno precedente: ${formatEuro(prevSelfManager)}</small>` : ''}
            <small style="color: #6b7280;">${closureState.data.allowPartialClosure ? '(Fondi cambio turno/test)' : '(Totale di entrambi gli operatori)'}</small>
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
  const form = /** @type {HTMLFormElement} */(document.getElementById('closure-step2-form'));
  const selfInputs = form.querySelectorAll('.self-input');
  const totalDisplay = document.getElementById('self-total-display');
  const deltaDisplay = document.getElementById('self-delta-display');
  const expectedDisplay = document.getElementById('total-expected-display');

  function updateTotals() {
    const cashIn = parseFloat(/** @type {HTMLInputElement} */(form.elements.namedItem('self_cash_in')).value) || 0;
    const cashOut = parseFloat(/** @type {HTMLInputElement} */(form.elements.namedItem('self_cash_out')).value) || 0;
    const pos = parseFloat(/** @type {HTMLInputElement} */(form.elements.namedItem('self_pos')).value) || 0;
    const fleet = parseFloat(/** @type {HTMLInputElement} */(form.elements.namedItem('self_fleet')).value) || 0;
    const manager = parseFloat(/** @type {HTMLInputElement} */(form.elements.namedItem('self_manager')).value) || 0;
    const prevManager = closureState.data.allowPartialClosure ? (closureState.data.partialAggregates?.selfManager || 0) : 0;

    // NOTA: bancomat e UTA/DKV self NON si sommano - solo ID gestore si somma (se chiusura parziale abilitata)
    // Se chiusura parziale disabilitata, è "Totale Gestore" e non si somma
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
    showClosureStep1();
  });

  document.getElementById('closure-step2-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(/** @type {HTMLFormElement} */(e.target));

    // Save Self Data
    closureState.data.selfCashIn = parseFloat(formData.get('self_cash_in')?.toString() || '0') || 0;
    closureState.data.selfCashOut = parseFloat(formData.get('self_cash_out')?.toString() || '0') || 0;
    closureState.data.selfPos = parseFloat(formData.get('self_pos')?.toString() || '0') || 0;
    closureState.data.selfFleet = parseFloat(formData.get('self_fleet')?.toString() || '0') || 0;
    closureState.data.selfManager = parseFloat(formData.get('self_manager')?.toString() || '0') || 0;
    closureState.data.selfReceiptTotal = parseFloat(formData.get('self_receipt_total')?.toString() || '0') || 0;

    // Save Operator Data
    closureState.data.cashReal = parseFloat(formData.get('cash_real')?.toString() || '0') || 0;
    closureState.data.posReal = parseFloat(formData.get('pos_real')?.toString() || '0') || 0;
    closureState.data.utaDkvReal = parseFloat(formData.get('uta_dkv_real')?.toString() || '0') || 0;

    closureState.data.notes = formData.get('notes')?.toString() || '';

    closureState.step = 3;
    await showClosureStep3();
  });
}

/**
 * Step 3: Conferma finale e salvataggio
 */
async function showClosureStep3() {
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
  const prevSelfManager = partialAgg?.selfManager || 0; // Solo ID gestore si somma tra turni (se chiusura parziale abilitata)
  const prevOperatorPos = partialAgg?.operatorPos || 0;
  const prevOperatorUta = partialAgg?.operatorUta || 0;

  // Calcoli Totali
  // NOTA: bancomat e UTA/DKV self NON si sommano - sono sempre gli stessi per tutto il turno
  // Se chiusura parziale disabilitata, è "Totale Gestore" e non si somma
  const totalSelfManager = closureState.data.allowPartialClosure ? (selfManager + prevSelfManager) : selfManager;
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

  // CALCOLO SERVER-SIDE SECURE (Edge Function)
  const selfDelta = selfCashIn - selfCashOut; // Needed for UI
  const carburanteAtteso = closureState.data.totaleAtteso; // Needed for UI

  let expectedCash = 0;
  let cashDiff = 0;
  let isCashValid = true;
  let discrepanza = 0;
  let serverResult = null;

  try {
    // Show loading equivalent (optional, but good for UX if slow)
    // Preparing payload
    const payload = {
      station_id: closureState.data.stationId,
      shift_id: closureState.data.turnoId,
      include_counters: closureState.data.includeCounters,
      allow_partial: closureState.data.allowPartialClosure,
      closing_counters: closureState.data.finalCounters, // map {id: val}
      self_data: {
        cash_in: selfCashIn,
        cash_out: selfCashOut,
        pos: selfPos,
        fleet: selfFleet,
        manager: selfManager // Totale Gestore for calculation
      },
      operator_data: {
        cash: cashReal,
        pos: totalPosOperatore,
        uta: totalUtaOperatore,
        credits: creditsSum,
        vouchers: vouchersSum,
        refunds: refundsSum
      }
    };

    const { data, error } = await supabase.functions.invoke('calculate-closure', {
      body: payload
    });

    if (error) {throw new Error(error.message);}
    if (data && !data.success) {throw new Error(data.error);}

    serverResult = data.data;

    // Use Server Data
    expectedCash = serverResult.expected_total; // expected_total from server is effectively expected revenue? 
    // Wait, expected_total in server:
    // if counters: FuelRevenue
    // if not: SelfTotal
    // BUT "Contanti Attesi" (Net Cash) is different from "Totale Atteso" (Revenue).
    // My Edge Function returns 'expected_total' (Revenue) and 'real_total' (Revenue).
    // Discrepancy = Real - Expected.
    // And Discrepancy is also CashDiff.
    // So CashDiff = Discrepanza.
    // Expected Cash = CashReal - Discrepanza.

    discrepanza = serverResult.discrepancy;
    cashDiff = discrepanza;
    expectedCash = cashReal - cashDiff;
    // Logic: If Real (100) - Expected (110) = -10 Discrepancy (Missing)
    // Then Expected Cash should have been Real (100) - (-10) = 110? No.
    // Expected Cash = CashReal - Discrepancy?
    // If I found 90 (CashReal). Discrepancy is -10. Expected was 100.
    // 90 - (-10) = 100. Yes.

    isCashValid = Math.abs(cashDiff) <= 5;

  } catch (err) {
    console.error('Edge Function Error:', err);
    // Fallback to local calculation if server fails (or show error)
    // For robust production, maybe explicit error? For now, keep fallback logic?
    // User requested "Cleanup", implies removing local logic.
    // But if network fails, user is stuck.
    // Let's alert error and try fallback logic just for display, or block.
    // I will show alert and use basic fallback.
    Toast.show('Attenzione: Impossibile contattare il server per il calcolo sicuro. Uso calcolo locale di emergenza.', 'warning');

    // Fallback Replica
    const selfDelta = selfCashIn - selfCashOut;
    expectedCash = closureState.data.totaleAtteso
      - totalPosOperatore
      - totalUtaOperatore
      - selfPos
      - creditsSum
      - vouchersSum
      + selfDelta
      - refundsSum
      + (extraCashSum || 0);

    cashDiff = cashReal - expectedCash;
    isCashValid = Math.abs(cashDiff) <= 5;
    discrepanza = cashDiff;
  }
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
          POS: ${formatEuro(selfPos)} | Fleet: ${formatEuro(selfFleet)} | ${closureState.data.allowPartialClosure ? 'ID' : 'Totale Gestore'}: ${formatEuro(totalSelfManager)}${closureState.data.allowPartialClosure && prevSelfManager ? ` (prev. ${formatEuro(prevSelfManager)})` : ''}
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
        <button type="button" class="menu-button btn-success" id="btn-confirm-closure">
          <i class="fas fa-save"></i> Conferma e Salva
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-back-step3').addEventListener('click', async () => {
    closureState.step = 2;
    await showClosureStep2();
  });

  document.getElementById('btn-confirm-closure').addEventListener('click', async () => {
    const isFinal = closureState.data.closureType === 'final';

    if (!isCashValid) {
      const confirmProceed = await openConfirmModal('ATTENZIONE: C\'è una discrepanza significativa nei contanti (> 5€). Sei sicuro di voler procedere?');
      if (!confirmProceed) {return;}
    }

    const confirmClosure = await openConfirmModal(`Confermi la chiusura ${isFinal ? 'FINALE' : 'PARZIALE'} del turno?`);
    if (!confirmClosure) {return;}

    showLoadingMessage(container);

    try {
      const {
        stationId,
        userId,
        turnoId,
        pistole,
        finalCounters,
        tankLinksByPump = {},
        tankSelections = {},
        litersPerPump = {},
        pumpLabelMap = {}
      } = closureState.data;

      const tankUsageRecords = [];
      Object.entries(tankLinksByPump).forEach(([pumpId, links]) => {
        if (!Array.isArray(links) || links.length === 0) {return;}
        const manualLinks = links.filter(l => l.mode === 'manual');
        const autoLinks = links.filter(l => l.mode !== 'manual');
        const litersValue = Number.isFinite(litersPerPump[pumpId]) ? litersPerPump[pumpId] : null;
        const pumpName = pumpLabelMap[pumpId] || `Pistola #${pumpId}`;

        if (manualLinks.length) {
          const selectedTankId = tankSelections[pumpId]?.tankId;
          const chosenLink = manualLinks.find(l => l.tank_id === selectedTankId) || manualLinks[0];
          if (chosenLink) {
            tankUsageRecords.push({
              pump_id: Number(pumpId),
              pump_name: pumpName,
              tank_id: chosenLink.tank_id,
              tank_name: chosenLink.tankName,
              mode: 'manual',
              ratio: null,
              liters: litersValue
            });
          }
        } else if (autoLinks.length) {
          const ratioTotal = autoLinks.reduce((sum, link) => sum + (Number(link.ratio) || 0), 0);
          autoLinks.forEach(link => {
            let share = null;
            if (litersValue !== null) {
              if (ratioTotal > 0) {
                share = (litersValue * (Number(link.ratio) || 0)) / ratioTotal;
              } else {
                share = litersValue / autoLinks.length;
              }
              share = Number(share.toFixed(3));
            }
            tankUsageRecords.push({
              pump_id: Number(pumpId),
              pump_name: pumpName,
              tank_id: link.tank_id,
              tank_name: link.tankName,
              mode: 'auto',
              ratio: link.ratio || null,
              liters: share
            });
          });
        }
      });

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
        notes: notes,
        tank_usage: tankUsageRecords
      };

      // Salva chiusura: USARE RPC SICURA
      const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_shift_closure', {
        p_shift_id: turnoId,
        p_station_id: stationId,
        p_closing_data: dataJson,
        p_is_final: isFinal,
        p_final_counters: closureState.data.includeCounters ? finalCounters : null,
        p_tank_usage: tankUsageRecords
      });

      if (rpcError) {throw rpcError;}
      if (rpcResult && !rpcResult.success) {
        throw new Error(rpcResult.error || 'Errore durante il salvataggio della chiusura.');
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
