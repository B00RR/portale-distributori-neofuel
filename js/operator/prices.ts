import { supabase } from '../core/api.js';
import { logger } from '../core/logger.js';
import { PriceUpdateSchema, safeParse } from '../core/schemas.js';
import { showErrorMessage, showInfoModal, openModal, closeModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml, getErrorMessage } from '../utils/utils.js';

interface PriceRecord {
  id: number;
  station_id: number;
  prezzo_benzina: number;
  prezzo_gasolio: number;
  data_validita: string;
  modificato_da: string | null;
}

/**
 * Mostra il form per modificare i prezzi del carburante
 * @param stationId - ID della stazione
 */
export async function showPrezziEditForm(stationId: number): Promise<void> {
  try {
    // Carica prezzi correnti
    const { data: current } = (await supabase
      .from('prezzi_distributore')
      .select('*')
      .eq('station_id', stationId)
      .lte('data_validita', new Date().toISOString())
      .order('data_validita', { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: PriceRecord | null };

    const benzina = current?.prezzo_benzina || 0;
    const gasolio = current?.prezzo_gasolio || 0;

    openModal('Modifica Prezzi');
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) {
      return;
    }

    setSafeHTML(
      modalBody,
      `
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
    `
    );

    // Event listener per aggiornare stile radio cards
    const radioCards = modalBody.querySelectorAll('.radio-card');
    const radioInputs = modalBody.querySelectorAll('input[name="validita"]');

    radioInputs.forEach(input => {
      input.addEventListener('change', () => {
        radioCards.forEach(card => card.classList.remove('selected'));
        const selectedCard = (input as HTMLInputElement).closest('.radio-card');
        if (selectedCard) {
          selectedCard.classList.add('selected');
        }
      });
    });

    // Inizializza selezione
    const checkedInput = modalBody.querySelector(
      'input[name="validita"]:checked'
    ) as HTMLInputElement;
    if (checkedInput) {
      checkedInput.closest('.radio-card')?.classList.add('selected');
    }

    // Event listener per submit form
    const form = modalBody.querySelector('#op-prezzi-form') as HTMLFormElement;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const validita = fd.get('validita') as string;

      try {
        const nextDay = new Date();
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        const dataValidita =
          validita === 'next_day' ? nextDay.toISOString() : new Date().toISOString();
        const validation = safeParse(PriceUpdateSchema, {
          station_id: stationId,
          prezzo_benzina: fd.get('benzina'),
          prezzo_gasolio: fd.get('gasolio'),
          data_validita: dataValidita
        });
        if (!validation.success) {
          showInfoModal('Errore: ' + validation.error);
          return;
        }
        const parsedPrices = validation.data;

        // NEW: Call Secure Edge Function
        const { data, error } = await supabase.functions.invoke('update-prices', {
          body: {
            station_id: parsedPrices.station_id,
            benzina: parsedPrices.prezzo_benzina,
            gasolio: parsedPrices.prezzo_gasolio,
            validita: validita
          }
        });

        if (error) {
          throw new Error(error.message || "Errore durante l'aggiornamento prezzi");
        }
        if (data && !data.success) {
          throw new Error(data.error || 'Errore sconosciuto dal server');
        }

        const validitaMsg =
          validita === 'next_day'
            ? 'I prezzi saranno validi a partire da domani alle 00:00.'
            : 'I prezzi sono validi da subito.';
        closeModal();
        showInfoModal(`Prezzi aggiornati con successo! ${validitaMsg}`);
      } catch (err: unknown) {
        logger.error('prices', 'Errore update-prices:', err);
        showInfoModal('Errore: ' + getErrorMessage(err));
      }
    });
  } catch (err: unknown) {
    const modalBody = document.getElementById('modal-body');
    showErrorMessage(modalBody, err, 'Errore caricamento prezzi');
    if (modalBody) {
      setSafeHTML(
        modalBody,
        `<p style="color: red; padding: 20px;">${escapeHtml(getErrorMessage(err))}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`
      );
      document.getElementById('btn-close-err')?.addEventListener('click', () => closeModal());
    }
  }
}
