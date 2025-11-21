import { supabase } from "./api.js";
import { createWarningMessage, createSuccessMessage, createErrorMessage, createBackButton, createFormActions } from "./operator-ui-components.js";
import { checkOpeningStatus } from "./operator-opening.js";

/**
 * Mostra il menu per la gestione delle uscite di cassa
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showOutflowMenu(stationId, userId) {
    const container = document.getElementById('operator-content');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

    try {
        // Verifica apertura turno
        const activeOpening = await checkOpeningStatus(stationId);
        if (!activeOpening) {
            container.innerHTML = createWarningMessage(
                "Nessun Turno Aperto",
                "Devi aprire un turno prima di poter registrare delle uscite."
            );
            return;
        }

        renderOutflowForm(container, stationId, userId, activeOpening.id);

    } catch (err) {
        container.innerHTML = createErrorMessage("Errore Caricamento", err);
    }
}

/**
 * Renderizza il form per l'inserimento dell'uscita
 */
function renderOutflowForm(container, stationId, userId, turnoId) {
    container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-hand-holding-usd"></i> Registra Uscita Cassa</h3>
      <p class="section-subtitle">Registra pagamenti, rimborsi o prelievi dal cassetto.</p>

      <form id="outflow-form">
        <div class="form-group">
          <label>Importo (€)</label>
          <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
        </div>

        <div class="form-group">
          <label>Tipo di Uscita</label>
          <select name="type" class="big-input" required>
            <option value="rimborso">Rimborso Cliente</option>
            <option value="pagamento">Pagamento Fattura/Fornitore</option>
            <option value="prelievo">Prelievo Titolare</option>
            <option value="altro_uscita">Altro</option>
          </select>
        </div>

        <div class="form-group">
          <label>Descrizione / Note</label>
          <textarea name="description" rows="3" class="big-input" placeholder="Dettagli operazione..." required></textarea>
        </div>

        ${createFormActions({ confirmText: 'Registra Uscita', confirmClass: 'danger' })}
      </form>
      
      <div style="margin-top: 20px;">
        ${createBackButton()}
      </div>
    </div>
  `;

    // Event Listeners
    document.getElementById('btn-back-menu').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
    });

    document.getElementById('btn-cancel').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
    });

    document.getElementById('outflow-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const amount = parseFloat(formData.get('amount'));
        const type = formData.get('type');
        const description = formData.get('description');

        if (!amount || amount <= 0) {
            alert("Inserire un importo valido.");
            return;
        }

        try {
            // Salva in movimenti_cassa
            // Nota: usiamo 'uscita' come macro-categoria nel campo 'tipo' se vogliamo semplificare,
            // oppure usiamo il valore specifico e poi filtriamo. 
            // Per coerenza con la chiusura, usiamo 'uscita' come tipo generico e mettiamo il dettaglio nella descrizione o in un campo note.
            // Tuttavia, la tabella movimenti_cassa ha un campo 'tipo'. 
            // Se usiamo 'uscita', poi dobbiamo assicurarci che la chiusura lo prenda.

            const { error } = await supabase
                .from('movimenti_cassa')
                .insert([{
                    station_id: stationId,
                    user_id: userId,
                    turno_id: turnoId,
                    tipo: 'uscita', // Macro-categoria per la query di chiusura
                    importo: amount,
                    descrizione: `[${type.toUpperCase()}] ${description}`,
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;

            container.innerHTML = `
        ${createSuccessMessage("Uscita Registrata", `L'uscita di € ${amount.toFixed(2)} è stata salvata correttamente.`)}
        <button class="menu-button primary full-width" id="btn-new-outflow">Registra Altra Uscita</button>
        <div style="margin-top: 10px;">
             ${createBackButton()}
        </div>
      `;

            document.getElementById('btn-new-outflow').addEventListener('click', () => {
                renderOutflowForm(container, stationId, userId, turnoId);
            });

            document.getElementById('btn-back-menu').addEventListener('click', () => {
                container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
            });

        } catch (err) {
            container.innerHTML = createErrorMessage("Errore Salvataggio", err);
            // Re-attach back button logic if error screen is shown
            const backBtn = document.getElementById('btn-back-menu');
            if (backBtn) backBtn.addEventListener('click', () => {
                container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
            });
        }
    });
}
