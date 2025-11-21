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
                movimenti: movimenti || []
            }
        };

        showClosureStep1(container);

    } catch (err) {
        showErrorMessage(container, err);
    }
}

/**
 * Step 1: Inserimento contatori finali
 */
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

/**
 * Step 2: Riepilogo litri e inserimento incassi
 */
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
    <div class="content-box">
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
    </div>
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

/**
 * Step 3: Conferma finale e salvataggio
 */
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
    <div class="content-box">
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
    </div>
  `;

    document.getElementById('btn-back-step3').addEventListener('click', () => {
        closureState.step = 2;
        showClosureStep2(container);
    });

    document.getElementById('btn-confirm-closure').addEventListener('click', async () => {
        const isFinal = document.getElementById('is-final-closure').checked;

        if (!confirm(`Confermi la chiusura ${isFinal ? 'FINALE' : 'PARZIALE'} del turno?`)) return;

        showLoadingMessage(container);

        try {
            const { stationId, userId, turnoId, pistole, finalCounters } = closureState.data;

            // Prepara data_json
            const dataJson = {
                litri_benzina: totalLitriBenzina,
                litri_gasolio: totalLitriGasolio,
                prezzo_benzina: prezzoBenzina,
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
                    incasso_uta_dkv: creditsReal + vouchersReal,
                    incasso_lordo: totaleReale,
                    cash_in_finale: 0,
                    cash_out_finale: cashReal,
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
                numeratore_chiusura: finalCounters[p.id],
                turno_id: turnoId
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
        <div class="success-message">
          <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
          <h3>Chiusura Registrata!</h3>
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
