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
        badge.textContent = 'Aperto';
        badge.className = 'status-badge status-open';
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
            // Recupera l'ultima chiusura FINALE effettiva dal DB
            const { data: lastClosureData, error: lastClosureError } = await supabase
                .from('closing_shift')
                .select('id, date_time, data_json')
                .eq('station_id', stationId)
                .eq('is_final', true)
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
