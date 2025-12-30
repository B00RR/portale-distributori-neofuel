
import { supabase, safeSupabaseQuery, getStationName } from "../core/api.js";
import { showLoadingMessage, showErrorMessage, openModal, closeModal, openConfirmModal, setButtonLoading } from "../ui/ui.js";
import { Validators, validateForm, formatErrorMessages } from "../shared/validators.js";
import { escapeHtml } from "../utils/utils.js";
import { showPrezziAdminModal } from "./prices.js";
import { showIslandsModal } from "./islands.js";
import { showTanksAdminModal } from "./tanks.js";
import { Toast } from "../ui/toast.js";
import { handleError } from "../shared/error-handler.js";

// ==========================================
// STATIONS (Distributori)
// ==========================================
export async function showStationsTab(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-station-btn"><i class="fas fa-plus"></i> Nuovo Distributore</button>`;
    document.getElementById('add-station-btn').addEventListener('click', () => openStationModal());
  }

  try {
    const { data: stations, error } = await supabase
      .from('fuel_stations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!stations || stations.length === 0) {
      container.innerHTML = '<p>Nessun distributore trovato.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Località</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    stations.forEach(st => {
      html += `
        <tr>
          <td>${escapeHtml(st.station_name)}</td>
          <td>${escapeHtml(st.location)}</td>
          <td>
            <button class="icon-btn edit-station" data-id="${st.station_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn prices-station" data-id="${st.station_id}" title="Prezzi"><i class="fas fa-tag"></i></button>
            <button class="icon-btn islands-station" data-id="${st.station_id}" title="Isole e Pistole"><i class="fas fa-gas-pump"></i></button>
            <button class="icon-btn tanks-station" data-id="${st.station_id}" title="Cisterne"><span class="icon-svg-wrapper" style="display: inline-block; width: 16px; height: 16px; vertical-align: middle;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="5" /><path d="M16 5h3a1 1 0 0 1 1 1v1h-5V6a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/><rect x="6" y="17" width="2" height="2" fill="currentColor" stroke="none"/><rect x="16" y="17" width="2" height="2" fill="currentColor" stroke="none"/><path d="M6 14.5l2-3.5 2 3.5h-4z" /></svg></span></button>
            <button class="icon-btn delete-station" data-id="${st.station_id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    // Aggiorna le icone personalizzate se presenti
    if ((/** @type {import('../types.js').CustomWindow} */(/** @type {any} */(window))).refreshUiIcons) {
      (/** @type {import('../types.js').CustomWindow} */(/** @type {any} */(window))).refreshUiIcons();
    }

    // Listeners
    container.querySelectorAll('.edit-station').forEach(btn => {
      btn.addEventListener('click', () => openStationModal((/** @type {HTMLElement} */(btn)).dataset.id));
    });
    container.querySelectorAll('.prices-station').forEach(btn => {
      btn.addEventListener('click', () => showPrezziAdminModal((/** @type {HTMLElement} */(btn)).dataset.id));
    });
    container.querySelectorAll('.islands-station').forEach(btn => {
      btn.addEventListener('click', () => showIslandsModal(parseInt((/** @type {HTMLElement} */(btn)).dataset.id || '0')));
    });
    container.querySelectorAll('.tanks-station').forEach(btn => {
      btn.addEventListener('click', () => showTanksAdminModal((/** @type {HTMLElement} */(btn)).dataset.id));
    });
    container.querySelectorAll('.delete-station').forEach(btn => {
      btn.addEventListener('click', () => deleteStation((/** @type {HTMLElement} */(btn)).dataset.id));
    });

  } catch (err) {
    showErrorMessage(container, err);
  }
}

export async function openStationModal(stationId = null) {
  const isEdit = !!stationId;
  openModal(isEdit ? 'Modifica Distributore' : 'Nuovo Distributore');
  const target = document.getElementById('modal-body');

  let station = {};
  if (isEdit) {
    const { data } = await supabase.from('fuel_stations').select('*').eq('station_id', stationId).single();
    station = data || {};
  }

  // Valore di default per allow_partial_closure: true se non specificato
  const allowPartialClosure = station.allow_partial_closure !== false;

  target.innerHTML = `
    <form id="station-form">
      <div class="form-group">
        <label>Nome Distributore</label>
        <input type="text" name="station_name" value="${escapeHtml(station.station_name)}" required>
      </div>
      <div class="form-group">
        <label>Località (indirizzo / città)</label>
        <input type="text" name="location" value="${escapeHtml(station.location)}">
      </div>
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
          <input type="checkbox" name="allow_partial_closure" ${allowPartialClosure ? 'checked' : ''} style="width: 18px; height: 18px;">
          <span>Consenti chiusura parziale per gli operatori</span>
        </label>
        <small style="color: #666; margin-top: 5px; display: block;">
          Se disabilitato, gli operatori di questo distributore potranno effettuare solo chiusure finali.
        </small>
      </div>
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Distributore'}</button>
    </form>
  `;

  document.getElementById('station-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */(e.target);
    const formData = new FormData(form);
    const payload = {
      station_name: formData.get('station_name')?.toString() || '',
      location: formData.get('location')?.toString() || '',
      allow_partial_closure: formData.get('allow_partial_closure') === 'on'
    };
    const submitBtn = form.querySelector('button[type="submit"]');

    try {
      setButtonLoading(submitBtn, true, 'Salvataggio...');
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from('fuel_stations').update(payload).eq('station_id', stationId));
      } else {
        await safeSupabaseQuery(() => supabase.from('fuel_stations').insert([payload]));
      }
      closeModal();
      // Reload current tab via event or callback could be better, but for now we rely on the main function re-calling this
      // Ideally we would pass a callback to reload
      const event = new CustomEvent('stations-updated');
      document.dispatchEvent(event);
    } catch (err) {
      Toast.show('Errore salvataggio: ' + err.message, 'error');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

export async function deleteStation(stationId) {
  if (!await openConfirmModal('Sei sicuro di voler eliminare questo distributore?')) return;
  try {
    await safeSupabaseQuery(() => supabase.from('fuel_stations').delete().eq('station_id', stationId));
    const event = new CustomEvent('stations-updated');
    document.dispatchEvent(event);
  } catch (err) {
    Toast.show('Errore eliminazione: ' + err.message, 'error');
  }
}
