// ==========================================
// OPERATOR OPENING SHIFT MANAGEMENT
// Gestione apertura turno con caricamento contatori
// ==========================================
import { supabase } from "./api.js";
import { showLoadingMessage, showErrorMessage, openModal, closeModal } from "./ui.js";
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
            .select('id, opened_at, operator_id, status, opening_data, closing_data, users!operator_id(full_name)')
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
    try {
        // 1. Controlla se esiste già un'apertura attiva
        const activeOpening = await checkOpeningStatus(stationId);

        if (activeOpening) {
            const openingDate = new Date(activeOpening.date_time).toLocaleString('it-IT');
            openModal('Apertura Già Effettuata');
            const modalBody = document.getElementById('modal-body');
            modalBody.innerHTML = createWarningMessage(
                'Apertura Già Effettuata',
                'Il turno è già stato aperto',
                `Data apertura: ${openingDate}. Devi prima chiudere il turno corrente prima di aprirne uno nuovo.`
            ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>`;
            document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
            return;
        }

        // Apri il modal subito per mostrare il form velocemente
        openModal('Apertura Turno');
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = '<p style="text-align: center; padding: 20px;">Caricamento...</p>';

        // Carica i dati in parallelo
        const [islandsResult, tanksResult] = await Promise.all([
            supabase
                .from('islands')
                .select('island_id, nome, island_name')
                .eq('station_id', stationId)
                .order('island_id', { ascending: true }),
            supabase
                .from('tanks')
                .select('*')
                .eq('station_id', stationId)
                .order('name')
        ]);

        const { data: islandsData, error: islandsError } = islandsResult;
        const { data: tanks } = tanksResult;

        if (islandsError) {
            modalBody.innerHTML = createErrorMessage('Errore Caricamento Isole', islandsError) + 
                `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-error" class="menu-button primary">Chiudi</button></div>`;
            document.getElementById('btn-close-error').addEventListener('click', () => closeModal());
            return;
        }

        // Normalizza islands
        const islands = (islandsData || []).map((isola, idx) => ({
            id: isola?.island_id ?? idx + 1,
            nome: isola?.nome ?? isola?.island_name ?? `Isola ${idx + 1}`
        }));

        if (!islands || islands.length === 0) {
            modalBody.innerHTML = createWarningMessage(
                'Nessuna Isola Configurata',
                'Non ci sono isole configurate per questa stazione.',
                'Contatta l\'amministratore per configurare le isole e le pistole.'
            ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning2" class="menu-button primary">Chiudi</button></div>`;
            document.getElementById('btn-close-warning2').addEventListener('click', () => closeModal());
            return;
        }

        // Carica pistole
        const islandIds = islands.map(i => i.id);
        const { data: allPistole, error: pistoleError } = await supabase
            .from('pistole')
            .select('*, islands(nome)')
            .in('island_id', islandIds)
            .order('id');

        if (pistoleError) throw pistoleError;

        if (!allPistole || allPistole.length === 0) {
            modalBody.innerHTML = createWarningMessage(
                'Nessuna Pistola Configurata',
                'Non ci sono pistole configurate per questa stazione.',
                'Contatta l\'amministratore per configurare le pistole.'
            ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning3" class="menu-button primary">Chiudi</button></div>`;
            document.getElementById('btn-close-warning3').addEventListener('click', () => closeModal());
            return;
        }

        // Recupera ultimi contatori in modo ottimizzato (una query per tutte le pistole)
        let lastClosureCounters = {};
        const pistolaIds = allPistole.map(p => p.id);

        try {
            // Carica tutti i contatori in una singola query invece di una per ogni pistola
            const [newCountersResult, oldCountersResult] = await Promise.all([
                supabase
                    .from('shift_pistols')
                    .select('pistola_id, closed_at_counter')
                    .in('pistola_id', pistolaIds)
                    .not('closed_at_counter', 'is', null)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('chiusura_turno_pistole')
                    .select('pistola_id, numeratore_chiusura')
                    .in('pistola_id', pistolaIds)
                    .order('created_at', { ascending: false })
            ]);

            // Crea mappe per lookup veloce
            const newCountersMap = new Map();
            if (newCountersResult.data) {
                // Prendi solo il più recente per ogni pistola
                const seen = new Set();
                newCountersResult.data.forEach(c => {
                    if (!seen.has(c.pistola_id)) {
                        seen.add(c.pistola_id);
                        newCountersMap.set(c.pistola_id, parseFloat(c.closed_at_counter));
                    }
                });
            }

            const oldCountersMap = new Map();
            if (oldCountersResult.data) {
                const seen = new Set();
                oldCountersResult.data.forEach(c => {
                    if (!seen.has(c.pistola_id) && c.numeratore_chiusura !== null) {
                        seen.add(c.pistola_id);
                        oldCountersMap.set(c.pistola_id, parseFloat(c.numeratore_chiusura));
                    }
                });
            }

            // Assegna i contatori con fallback
            allPistole.forEach(p => {
                const counterValue = newCountersMap.get(p.id) || 
                                   oldCountersMap.get(p.id) || 
                                   parseFloat(p.numero_litri);
                if (Number.isFinite(counterValue)) {
                    lastClosureCounters[p.id] = counterValue;
                }
            });

        } catch (closureErr) {
            console.warn('Errore recupero ultimi contatori:', closureErr);
            // Fallback finale: usa pistole.numero_litri
            allPistole.forEach(p => {
                const val = parseFloat(p.numero_litri);
                if (Number.isFinite(val)) {
                    lastClosureCounters[p.id] = val;
                }
            });
        }

        // Mostra form apertura
        
        modalBody.innerHTML = `
        <form id="apertura-form">
          <div class="form-row">
            <div class="form-group">
              <label>Banconote incassate (€)</label>
              <input type="number" name="cash_in" step="0.01" min="0" class="big-input">
            </div>
            <div class="form-group">
              <label>Banconote erogate (€)</label>
              <input type="number" name="cash_out" step="0.01" min="0" class="big-input">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Bancomat erogati (€)</label>
              <input type="number" name="pos_amount" step="0.01" min="0" class="big-input">
            </div>
            <div class="form-group">
              <label>Uta/Dkv/Iscard (€)</label>
              <input type="number" name="uta_dkv_iscard" step="0.01" min="0" class="big-input">
              <small style="color: #6b7280; display: block; margin-top: 5px;">Queste transazioni si sommeranno in fase di chiusura a quelle inserite dall'operatore.</small>
            </div>
          </div>

          <div class="form-group">
            <label>Totale scontrino (€)</label>
            <input type="number" name="total_amount" step="0.01" min="0" class="big-input">
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
    `;

        // Event listeners
        document.getElementById('btn-cancel-apertura').addEventListener('click', () => {
            closeModal();
        });

        const form = document.getElementById('apertura-form');
        let isSubmitting = false;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Previeni doppi invii
            if (isSubmitting) {
                console.warn('Submit già in corso, ignorato');
                return;
            }

            if (!confirm('Confermi l\'apertura del turno?')) return;

            // Disabilita il form per prevenire doppi invii
            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            const cancelBtn = form.querySelector('#btn-cancel-apertura');
            submitBtn.disabled = true;
            cancelBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...';

            const loadingEl = document.createElement('p');
            loadingEl.textContent = 'Caricamento...';
            loadingEl.style.textAlign = 'center';
            loadingEl.style.padding = '20px';
            modalBody.innerHTML = '';
            modalBody.appendChild(loadingEl);

            try {
                // Verifica di nuovo se esiste già un'apertura attiva (doppio controllo)
                const activeOpening = await checkOpeningStatus(stationId);
                if (activeOpening) {
                    throw new Error('Il turno è già stato aperto. Ricarica la pagina per vedere lo stato aggiornato.');
                }

                const formData = new FormData(e.target);
                const cashIn = parseFloat(formData.get('cash_in')) || 0;
                const cashOut = parseFloat(formData.get('cash_out')) || 0;
                const posAmount = parseFloat(formData.get('pos_amount')) || 0;
                const totalAmount = parseFloat(formData.get('total_amount')) || 0;
                const utaDkvIscard = parseFloat(formData.get('uta_dkv_iscard')) || 0;

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
                            uta_dkv_iscard: utaDkvIscard,
                            cash_in_minus_out: cashIn - cashOut
                        }
                    }])
                    .select()
                    .single();

                if (openingError) {
                    // Se l'errore è di chiave duplicata, verifica se esiste già un turno aperto
                    if (openingError.code === '23505' || openingError.message?.includes('duplicate key')) {
                        const checkAgain = await checkOpeningStatus(stationId);
                        if (checkAgain) {
                            throw new Error('Il turno è già stato aperto. Ricarica la pagina per vedere lo stato aggiornato.');
                        }
                    }
                    throw openingError;
                }

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

                // Mostra successo e chiudi modal
                closeModal();
                const container = document.getElementById('operator-content');
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
                isSubmitting = false;
                submitBtn.disabled = false;
                cancelBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Conferma Apertura';
                
                modalBody.innerHTML = createErrorMessage('Errore Apertura Turno', err) + 
                    `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-error" class="menu-button primary">Chiudi</button></div>`;
                document.getElementById('btn-close-error').addEventListener('click', () => closeModal());
            }
        });

    } catch (err) {
        openModal('Errore');
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `<p style="color: red; padding: 20px;">${escapeHtml(err.message)}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
        document.getElementById('btn-close-err').addEventListener('click', () => closeModal());
    }
}
