// ==========================================
// OPERATOR PRICES MANAGEMENT
// Gestione modifica prezzi carburante
// ==========================================
import { supabase, safeSupabaseQuery } from "./api.js";
import { showLoadingMessage, showErrorMessage, showInfoModal } from "./ui.js";
import { createContentBox } from "./operator-ui-components.js";

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
      <h3>Modifica Prezzi</h3>
      <form id="op-prezzi-form">
        <div class="form-row">
          <div class="form-group">
            <label>Benzina</label>
            <input type="number" step="0.001" name="benzina" value="${benzina}" class="big-input">
          </div>
          <div class="form-group">
            <label>Gasolio</label>
            <input type="number" step="0.001" name="gasolio" value="${gasolio}" class="big-input">
          </div>
        </div>
        <button type="submit" class="menu-button primary full-width">Aggiorna Prezzi</button>
      </form>
    `);

        // Event listener per submit form
        document.getElementById('op-prezzi-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const payload = {
                station_id: stationId,
                prezzo_benzina: parseFloat(fd.get('benzina')),
                prezzo_gasolio: parseFloat(fd.get('gasolio')),
                data_validita: new Date().toISOString()
            };

            try {
                await safeSupabaseQuery(() => supabase.from('prezzi_distributore').insert([payload]));
                showInfoModal('Prezzi aggiornati con successo!');
                container.innerHTML = '<div class="success-message"><i class="fas fa-check-circle"></i> Prezzi aggiornati.</div>';
            } catch (err) {
                showInfoModal('Errore: ' + err.message);
            }
        });
    } catch (err) {
        showErrorMessage(container, err);
    }
}
