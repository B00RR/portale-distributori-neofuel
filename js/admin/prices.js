
import { supabase, safeSupabaseQuery, getStationName } from "../core/api.js";
import { openModal, closeModal } from "../ui/ui.js";
import { escapeHtml, escapeNumber } from "../utils/utils.js";
import { Toast } from "../ui/toast.js";
import { handleError } from "../shared/error-handler.js";

export async function showPrezziAdminModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Modifica Prezzi - ${escapeHtml(stationName)}`);
  const target = document.getElementById('modal-body');

  const { data: current } = await supabase
    .from('prezzi_distributore')
    .select('*')
    .eq('station_id', stationId)
    .order('data_validita', { ascending: false })
    .limit(1)
    .maybeSingle();

  const benzinaValue = escapeNumber(current?.prezzo_benzina);
  const gasolioValue = escapeNumber(current?.prezzo_gasolio);

  target.innerHTML = `
    <form id="admin-prezzi-form">
      <div class="form-group"><label>Benzina</label><input class="price-input" type="number" step="0.001" min="0" name="benzina" value="${benzinaValue}" /></div>
      <div class="form-group"><label>Gasolio</label><input class="price-input" type="number" step="0.001" min="0" name="gasolio" value="${gasolioValue}" /></div>
      <fieldset class="form-group prezzi-validita-group">
        <legend>Validità</legend>
        <div class="validita-grid">
          <label class="validita-option">
            <input type="radio" name="validita" value="ora" checked>
            <span>Da ora</span>
          </label>
          <label class="validita-option">
            <input type="radio" name="validita" value="prossima">
            <span>Dalla prossima chiusura</span>
          </label>
        </div>
      </fieldset>
      <button type="submit" class="menu-button primary">Salva Prezzi</button>
    </form>
  `;

  document.getElementById('admin-prezzi-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */(e.target));
    const validita = fd.get('validita')?.toString() || 'ora';

    // Calcola data validità
    let dataValidita = new Date();
    if (validita === 'prossima') {
      // ... logica per prossima chiusura
    }

    const payload = {
      station_id: stationId,
      prezzo_benzina: parseFloat(fd.get('benzina')?.toString() || '0') || 0,
      prezzo_gasolio: parseFloat(fd.get('gasolio')?.toString() || '0') || 0,
      prezzo_gpl: null,
      prezzo_metano: null,
      data_validita: dataValidita.toISOString()
    };

    try {
      await safeSupabaseQuery(() => supabase.from('prezzi_distributore').insert([payload]));
      closeModal();
      Toast.show('Prezzi aggiornati!', 'success');
    } catch (err) {
      handleError(err, 'savePrices');
    }
  });

  // Export showPricesTab if it existed, but it seemed to only be showPrezziAdminModal being used by stations
  // However, there IS a 'prices' tab in admin.js switch
}
export async function showPricesTab(container, headerActions) {
  if (headerActions) headerActions.innerHTML = '';
  container.innerHTML = `
        <div class="content-box">
            <h3>Gestione Prezzi</h3>
            <p>Seleziona un distributore dalla sezione "Distributori" per modificarne i prezzi.</p>
            <button class="menu-button primary" onclick="document.querySelector('[data-tab=\\'stations\\']').click()">Vai a Distributori</button>
        </div>
    `;
}
