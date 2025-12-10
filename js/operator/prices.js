// ==========================================
// OPERATOR PRICES MANAGEMENT
// Gestione modifica prezzi carburante
// ==========================================
import { supabase, safeSupabaseQuery } from "../core/api.js";
import { showLoadingMessage, showErrorMessage, showInfoModal, openModal, closeModal } from "../ui/ui.js";
import { createContentBox } from "./ui-components.js";
import { loggedUser } from "../core/auth.js";
import { escapeHtml } from "../utils/utils.js";

/**
 * Mostra il form per modificare i prezzi del carburante
 * @param {number} stationId - ID della stazione
 */
export async function showPrezziEditForm(stationId) {
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

    openModal('Modifica Prezzi');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
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
    `;

    // Event listener per aggiornare stile radio cards
    const radioCards = modalBody.querySelectorAll('.radio-card');
    const radioInputs = modalBody.querySelectorAll('input[name="validita"]');

    radioInputs.forEach(input => {
      input.addEventListener('change', () => {
        radioCards.forEach(card => card.classList.remove('selected'));
        const selectedCard = input.closest('.radio-card');
        if (selectedCard) selectedCard.classList.add('selected');
      });
    });

    // Inizializza selezione
    const checkedInput = modalBody.querySelector('input[name="validita"]:checked');
    if (checkedInput) {
      checkedInput.closest('.radio-card')?.classList.add('selected');
    }

    // Event listener per submit form
    modalBody.querySelector('#op-prezzi-form').addEventListener('submit', async (e) => {
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
        // OLD: Direct DB Insert
        // await safeSupabaseQuery(() => supabase.from('prezzi_distributore').insert([payload]));

        // NEW: Call Secure Edge Function
        const { data, error } = await supabase.functions.invoke('update-prices', {
          body: {
            station_id: stationId,
            benzina: parseFloat(fd.get('benzina')),
            gasolio: parseFloat(fd.get('gasolio')),
            validita: validita
          }
        });

        if (error) throw new Error(error.message || 'Errore durante l\'aggiornamento prezzi');
        if (data && !data.success) throw new Error(data.error || 'Errore sconosciuto dal server');

        const validitaMsg = validita === 'next_day'
          ? 'I prezzi saranno validi a partire da domani alle 00:00.'
          : 'I prezzi sono validi da subito.';
        closeModal();
        showInfoModal(`Prezzi aggiornati con successo! ${validitaMsg}`);
      } catch (err) {
        console.error("Errore update-prices:", err);
        showInfoModal('Errore: ' + err.message);
      }
    });
  } catch (err) {
    openModal('Errore');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `<p style="color: red; padding: 20px;">${escapeHtml(err.message)}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById('btn-close-err').addEventListener('click', () => closeModal());
  }
}
