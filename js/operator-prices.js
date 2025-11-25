// ==========================================
// OPERATOR PRICES MANAGEMENT
// Gestione modifica prezzi carburante
// ==========================================
import { supabase, safeSupabaseQuery } from "./api.js";
import { showLoadingMessage, showErrorMessage, showInfoModal } from "./ui.js";
import { createContentBox } from "./operator-ui-components.js";
import { loggedUser } from "./auth.js";

/**
 * Mostra il form per modificare i prezzi del carburante
 * @param {number} stationId - ID della stazione
 */
export async function showPrezziEditForm(stationId) {
    const container = document.getElementById('operator-content');
    showLoadingMessage(container);

    try {
        // Carica prezzi correnti
        const { data: current } = await supabase
            .from('prezzi_distributore')
            .select('*')
            .eq('station_id', stationId)
            .order('data_validita', { ascending: false })
            .maybeSingle();

        const benzina = current?.prezzo_benzina || 0;
        const gasolio = current?.prezzo_gasolio || 0;

        container.innerHTML = createContentBox(`
      <h3><i class="fas fa-tags"></i> Modifica Prezzi</h3>
      <form id="op-prezzi-form">
        <div class="form-row">
          <div class="form-group">
            <label>Benzina (€/L)</label>
            <input type="number" step="0.001" name="benzina" value="${benzina}" class="big-input" required>
          </div>
          <div class="form-group">
            <label>Gasolio (€/L)</label>
            <input type="number" step="0.001" name="gasolio" value="${gasolio}" class="big-input" required>
          </div>
        </div>
        
        <div class="form-group" style="margin-top: 20px;">
          <label style="margin-bottom: 10px; display: block; font-weight: 600;">Validità Prezzi:</label>
          <div style="display: flex; gap: 20px; justify-content: center;">
            <label class="radio-card" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
              <input type="radio" name="validita" value="immediate" checked style="display: none;">
              <i class="fas fa-bolt" style="font-size: 1.5rem; color: #f59e0b; margin-bottom: 8px; display: block;"></i>
              <div style="font-weight: 600; color: #1e293b;">Immediata</div>
              <div style="font-size: 0.8rem; color: #64748b;">Valido da subito</div>
            </label>
            
            <label class="radio-card" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
              <input type="radio" name="validita" value="next_day" style="display: none;">
              <i class="fas fa-calendar-day" style="font-size: 1.5rem; color: #3b82f6; margin-bottom: 8px; display: block;"></i>
              <div style="font-weight: 600; color: #1e293b;">Giornata Successiva</div>
              <div style="font-size: 0.8rem; color: #64748b;">Valido da domani 00:00</div>
            </label>
          </div>
        </div>
        
        <button type="submit" class="menu-button primary full-width" style="margin-top: 20px;">
          <i class="fas fa-save"></i> Aggiorna Prezzi
        </button>
      </form>
      
      <style>
        .radio-card.selected {
          border-color: #3b82f6 !important;
          background-color: #eff6ff !important;
          box-shadow: 0 0 0 2px #3b82f633;
        }
        input[type="radio"]:checked + * {
          color: #3b82f6;
        }
      </style>
    `);

        // Event listener per aggiornare stile radio cards
        const radioCards = document.querySelectorAll('.radio-card');
        const radioInputs = document.querySelectorAll('input[name="validita"]');
        
        radioInputs.forEach(input => {
            input.addEventListener('change', () => {
                radioCards.forEach(card => card.classList.remove('selected'));
                const selectedCard = input.closest('.radio-card');
                if (selectedCard) selectedCard.classList.add('selected');
            });
        });
        
        // Inizializza selezione
        const checkedInput = document.querySelector('input[name="validita"]:checked');
        if (checkedInput) {
            checkedInput.closest('.radio-card')?.classList.add('selected');
        }

        // Event listener per submit form
        document.getElementById('op-prezzi-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const validita = fd.get('validita');
            
            // Calcola data_validita in base alla scelta
            let dataValidita;
            if (validita === 'next_day') {
                // Domani alle 00:00
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                dataValidita = tomorrow.toISOString();
            } else {
                // Immediata - ora corrente
                dataValidita = new Date().toISOString();
            }
            
            const payload = {
                station_id: stationId,
                prezzo_benzina: parseFloat(fd.get('benzina')),
                prezzo_gasolio: parseFloat(fd.get('gasolio')),
                data_validita: dataValidita,
                modificato_da: loggedUser?.user_id || null
            };

            try {
                await safeSupabaseQuery(() => supabase.from('prezzi_distributore').insert([payload]));
                const validitaMsg = validita === 'next_day' 
                    ? 'I prezzi saranno validi a partire da domani alle 00:00.'
                    : 'I prezzi sono validi da subito.';
                showInfoModal(`Prezzi aggiornati con successo! ${validitaMsg}`);
                container.innerHTML = `
                    <div class="success-message">
                        <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
                        <h3>Prezzi Aggiornati!</h3>
                        <p>${validitaMsg}</p>
                        <button onclick="location.reload()" class="menu-button primary" style="margin-top: 15px;">
                            <i class="fas fa-redo"></i> Ricarica
                        </button>
                    </div>
                `;
            } catch (err) {
                showInfoModal('Errore: ' + err.message);
            }
        });
    } catch (err) {
        showErrorMessage(container, err);
    }
}
