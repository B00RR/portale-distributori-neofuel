// ==========================================
// OPERATOR OPENING SHIFT MANAGEMENT
// Gestione apertura turno con caricamento contatori
// ==========================================
import { supabase } from "./api.js";
import { showLoadingMessage, showErrorMessage } from "./ui.js";
import {
    createWarningMessage,
    createSuccessMessage,
    createErrorMessage,
    createBackButton,
    createContentBox,
    attachBackButtonListener
} from "./operator-ui-components.js";
import { escapeHtml, formatLitri } from "./utils.js";

/**
 * Aggiorna il badge di stato apertura nel menu principale
 * @param {number} stationId - ID della stazione
 */
export async function updateOpeningStatus(stationId) {
    const badge = document.getElementById('opening-status');
    if (!badge) return;

    const activeOpening = await checkOpeningStatus(stationId);

    if (activeOpening) {
        const hasPartial = activeOpening.closing_data?.closure_stage === 'partial';
        const statusLabel = hasPartial ? 'Parziale' : 'Aperto';
        badge.textContent = statusLabel;
        badge.className = `status-badge ${hasPartial ? 'status-partial' : 'status-open'}`;
        badge.title = `Aperto da ${activeOpening.users?.full_name || 'Operatore'} il ${new Date(activeOpening.date_time).toLocaleString('it-IT')}`;
    } else {
        badge.textContent = 'Chiuso';
        badge.className = 'status-badge status-closed';
        badge.title = 'Nessuna apertura attiva';
    }
}

/**
 * Controlla se esiste un'apertura attiva per la stazione
 * @param {number} stationId - ID della stazione
 * @returns {Promise<Object|null>} Dati apertura attiva o null
 */
export async function checkOpeningStatus(stationId) {
    try {
        // Usa la nuova tabella shifts unificata
        const { data } = await supabase
            .from('shifts')
            .select('id, opened_at, operator_id, status, closing_data, users!operator_id(full_name)')
            .eq('station_id', stationId)
            .is('closed_at', null)
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!data) return null;

        // Ritorna i dati con formato compatibile (date_time -> opened_at)
        return {
            ...data,
            date_time: data.opened_at
        };
    } catch (err) {
        console.error('Errore controllo apertura:', err);
        return null;
    }
}

/**
 * Mostra il form per l'apertura turno
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showAperturaForm(stationId, userId) {
    const container = document.getElementById('operator-content');
    showLoadingMessage(container);

    try {
        // 1. Controlla se esiste già un'apertura attiva
        const activeOpening = await checkOpeningStatus(stationId);

        if (activeOpening) {
            const operatorName = activeOpening.users?.full_name || 'un operatore';
            const openingDate = new Date(activeOpening.date_time).toLocaleString('it-IT');

            container.innerHTML = createContentBox(
                createWarningMessage(
                    'Apertura Già Effettuata',
                    `Il turno è già stato aperto da ${operatorName}`,
                    `Data apertura: ${openingDate}. Devi prima chiudere il turno corrente prima di aprirne uno nuovo.`
                ) + createBackButton()
            );

            attachBackButtonListener('btn-back-menu', container);
            return;
        }

        // 2. Carica islands
        const { data: islandsData, error: islandsError } = await supabase
            .from('islands')
            .select('island_id, nome, island_name')
            .eq('station_id', stationId)
            .order('nome');

        if (islandsError) {
            container.innerHTML = createContentBox(
                createErrorMessage('Errore Caricamento Isole', islandsError) +
                createBackButton()
            );
            attachBackButtonListener('btn-back-menu', container);
            return;
        }

        // Normalizza islands
        const islands = (islandsData || []).map((isola, idx) => ({
            id: isola?.island_id ?? idx + 1,
            nome: isola?.nome ?? isola?.island_name ?? `Isola ${idx + 1}`
        }));

        if (!islands || islands.length === 0) {
            container.innerHTML = createContentBox(
                createWarningMessage(
                    'Nessuna Isola Configurata',
                    'Non ci sono isole configurate per questa stazione.',
                    'Contatta l\'amministratore per configurare le isole e le pistole.'
                ) + createBackButton()
            );
            attachBackButtonListener('btn-back-menu', container);
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
            container.innerHTML = createContentBox(
                createWarningMessage(
                    'Nessuna Pistola Configurata',
                    'Non ci sono pistole configurate per questa stazione.',
                    'Contatta l\'amministratore per configurare le pistole.'
                ) + createBackButton()
            );
            attachBackButtonListener('btn-back-menu', container);
            return;
        }

        // 4. Recupera ultimi contatori con fallback a cascata
        let lastClosureCounters = {};
        let countersSourceDescription = 'Caricamento contatori...';

        // 4b. Carica Cisterne
        const { data: tanks } = await supabase
            .from('tanks')
            .select('*')
            .eq('station_id', stationId)
            .order('name');

        try {
            // STRATEGIA FALLBACK A CASCATA:
            // 1. Cerca in shift_pistols (nuove chiusure)
            // 2. Se non trova, cerca in chiusura_turno_pistole (vecchie chiusure, turno_id più alto)
            // 3. Se ancora non trova, usa pistole.numero_litri (fallback finale)

            for (const p of allPistole) {
                let counterValue = null;

                // STEP 1: Cerca in shift_pistols (nuova tabella)
                const { data: newCounter } = await supabase
                    .from('shift_pistols')
                    .select('closed_at_counter')
                    .eq('pistola_id', p.id)
                    .not('closed_at_counter', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (newCounter && newCounter.closed_at_counter !== null) {
                    counterValue = parseFloat(newCounter.closed_at_counter);
                    countersSourceDescription = 'Caricati da shift_pistols (nuova tabella)';
                } else {
                    // STEP 2: Fallback a chiusura_turno_pistole (vecchia tabella)
                    const { data: oldCounter } = await supabase
                        .from('chiusura_turno_pistole')
                        .select('numeratore_chiusura, turno_id, created_at')
                        .eq('pistola_id', p.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (oldCounter && oldCounter.numeratore_chiusura !== null) {
                        counterValue = parseFloat(oldCounter.numeratore_chiusura);
                        countersSourceDescription = 'Caricati da chiusura_turno_pistole (dati storici)';
                    } else {
                        // STEP 3: Fallback finale a pistole.numero_litri
                        counterValue = parseFloat(p.numero_litri);
                        countersSourceDescription = 'Caricati da pistole.numero_litri (fallback)';
                    }
                }

                // Salva il valore trovato
                if (Number.isFinite(counterValue)) {
                    lastClosureCounters[p.id] = counterValue;
                }
            }

        } catch (closureErr) {
            console.warn('Errore recupero ultimi contatori:', closureErr);
            countersSourceDescription = 'Errore caricamento: uso contatori attuali';
            // Fallback finale: usa pistole.numero_litri
            allPistole.forEach(p => {
                const val = parseFloat(p.numero_litri);
                if (Number.isFinite(val)) {
                    lastClosureCounters[p.id] = val;
                }
            });
        }

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
            lastClosureCounters.hasOwnProperty(p.id)
                ? lastClosureCounters[p.id]
                : 0
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

                // Salva apertura nella nuova tabella shifts
                const { data: opening, error: openingError } = await supabase
                    .from('shifts')
                    .insert([{
                        operator_id: userId,
                        station_id: stationId,
                        opened_at: new Date().toISOString(),
                        status: 'open',
                        opening_data: {
                            cash_in: cashIn,
                            cash_out: cashOut,
                            pos_amount: posAmount,
                            total_amount: totalAmount,
                            cash_in_minus_out: cashIn - cashOut
                        }
                    }])
                    .select()
                    .single();

                if (openingError) throw openingError;

                // Salva contatori nella nuova tabella shift_pistols
                const counterInserts = allPistole.map(p => {
                    const finalClosureCounter = parseFloat(lastClosureCounters[p.id]);
                    const fallbackCounter = parseFloat(p.numero_litri);
                    const latestCounter = Number.isFinite(finalClosureCounter) ? finalClosureCounter : fallbackCounter;
                    return {
                        shift_id: opening.id,
                        pistola_id: p.id,
                        opened_at_counter: Number.isFinite(latestCounter) ? latestCounter : 0,
                        closed_at_counter: null  // Sarà popolato alla chiusura
                    };
                });

                const { error: countersError } = await supabase
                    .from('shift_pistols')
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

                    if (tankError) console.error('Errore salvataggio cisterne:', tankError);
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
