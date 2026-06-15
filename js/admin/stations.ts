/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, openModal, closeModal, openConfirmModal, setButtonLoading } from '../ui/ui.js';
import { escapeHtml } from '../utils/utils.js';

// Import modules that are still JS or being migrated
// We use 'any' for now to allow compilation until they are migrated
import { showIslandsModal } from './islands.js';
import { showPrezziAdminModal } from './prices.js';
import { showTanksAdminModal } from './tanks.js';

// --- INTERFACES ---

interface FuelStation {
    station_id: number;
    station_name: string;
    location: string;
    allow_partial_closure: boolean;
    created_at?: string;
}

interface CustomWindow extends Window {
    refreshUiIcons?: () => void;
}

declare const window: CustomWindow;

// --- MAIN FUNCTION ---

export async function showStationsTab(container: HTMLElement, actionsContainer: HTMLElement | null): Promise<void> {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = '<button class="action-btn primary" id="add-station-btn"><i class="fas fa-plus"></i> Nuovo Distributore</button>';
    const addBtn = document.getElementById('add-station-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => openStationModal());
    }
  }

  try {
    const { data: rawStations, error } = await supabase
      .from('fuel_stations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { throw error; }

    const stations = rawStations as FuelStation[];

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
          <td>${escapeHtml(st.location || '')}</td>
          <td>
            <button class="icon-btn edit-station" data-id="${st.station_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn prices-station" data-id="${st.station_id}" title="Prezzi"><i class="fas fa-tag"></i></button>
            <button class="icon-btn islands-station" data-id="${st.station_id}" title="Isole e Pistole"><i class="fas fa-gas-pump"></i></button>
            <button class="icon-btn tanks-station" data-id="${st.station_id}" title="Cisterne"><i class="fas fa-trailer"></i></button>
            <button class="icon-btn delete-station" data-id="${st.station_id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Update custom icons if present
    if (window.refreshUiIcons) {
      window.refreshUiIcons();
    }

    // Listeners
    container.querySelectorAll('.edit-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {openStationModal(parseInt(id, 10));}
      });
    });
    container.querySelectorAll('.prices-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        // These functions might assume string or number, keeping check safe
        if (id) {showPrezziAdminModal(id);}
      });
    });
    container.querySelectorAll('.islands-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        // showIslandsModal expects number
        if (id) {showIslandsModal(parseInt(id, 10));}
      });
    });
    container.querySelectorAll('.tanks-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {showTanksAdminModal(id);}
      });
    });
    container.querySelectorAll('.delete-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {deleteStation(parseInt(id, 10));}
      });
    });

  } catch (err) {
    handleError(err as Error, 'showStationsTab', container);
  }
}

export async function openStationModal(stationId: number | null = null): Promise<void> {
  const isEdit = !!stationId;
  openModal(isEdit ? 'Modifica Distributore' : 'Nuovo Distributore');
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  let station: Partial<FuelStation> = {};
  if (stationId) {
    const { data, error } = await supabase.from('fuel_stations').select('*').eq('station_id', stationId).single();
    if (!error && data) {
      station = data as FuelStation;
    }
  }

  // Default: true allowed if not specified (legacy rows might be null)
  const allowPartialClosure = station.allow_partial_closure !== false;

  target.innerHTML = `
    <form id="station-form">
      <div class="form-group">
        <label>Nome Distributore</label>
        <input type="text" name="station_name" value="${escapeHtml(station.station_name || '')}" required>
      </div>
      <div class="form-group">
        <label>Località (indirizzo / città)</label>
        <input type="text" name="location" value="${escapeHtml(station.location || '')}">
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

  const form = document.getElementById('station-form') as HTMLFormElement;
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const payload = {
        station_name: formData.get('station_name')?.toString() || '',
        location: formData.get('location')?.toString() || '',
        allow_partial_closure: formData.get('allow_partial_closure') === 'on'
      };
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

      try {
        setButtonLoading(submitBtn, true, 'Salvataggio...');
        if (isEdit && stationId) {
          await safeSupabaseQuery(() => supabase.from('fuel_stations').update(payload).eq('station_id', stationId));
        } else {
          await safeSupabaseQuery(() => supabase.from('fuel_stations').insert([payload]));
        }
        closeModal();

        // Dispatch event
        const event = new CustomEvent('stations-updated');
        document.dispatchEvent(event);

        // Also reload explicitly if called from stations tab
        const adminContent = document.getElementById('admin-content');
        if (adminContent && adminContent.querySelector('.edit-station')) {
          const headerActions = document.getElementById('header-actions');
          showStationsTab(adminContent, headerActions);
        }

      } catch (err) {
        // Cast error to handle potential varying error types
        Toast.show('Errore salvataggio: ' + (err as Error).message, 'error');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

export async function deleteStation(stationId: number): Promise<void> {
  if (!await openConfirmModal('Sei sicuro di voler eliminare questo distributore?')) { return; }
  try {
    await safeSupabaseQuery(() => supabase.from('fuel_stations').delete().eq('station_id', stationId));
    const event = new CustomEvent('stations-updated');
    document.dispatchEvent(event);

    // Also reload explicitly
    const adminContent = document.getElementById('admin-content');
    if (adminContent && adminContent.querySelector('.edit-station')) {
      const headerActions = document.getElementById('header-actions');
      showStationsTab(adminContent, headerActions);
    }
  } catch (err) {
    Toast.show('Errore eliminazione: ' + (err as Error).message, 'error');
  }
}
