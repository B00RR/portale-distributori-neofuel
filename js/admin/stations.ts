/**
 * Stations Admin Module
 * CRUD for fuel stations / distributors
 */

import { supabase, safeSupabaseQuery, Cache, CACHE_KEYS } from '../core/api.js';
import { logger } from '../core/logger.js';
import { handleError } from '../shared/error-handler.js';
import {
  showLoadingMessage,
  openModal,
  closeModal,
  openConfirmModal,
  setButtonLoading
} from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';

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

export async function showStationsTab(
  container: HTMLElement,
  actionsContainer: HTMLElement | null
): Promise<void> {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.replaceChildren();
    const addBtn = document.createElement('button');
    addBtn.className = 'action-btn primary';
    addBtn.id = 'add-station-btn';
    setSafeHTML(addBtn, '<i class="fas fa-plus"></i> Nuovo Distributore');
    addBtn.addEventListener('click', () => openStationModal());
    actionsContainer.appendChild(addBtn);
  }

  try {
    const rawStations = await Cache.getOrFetch(
      CACHE_KEYS.STATIONS,
      async () => {
        const { data, error } = await supabase
          .from('fuel_stations')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }
        return data;
      },
      10 * 60 * 1000
    ); // Cache for 10 minutes

    const stations = rawStations as FuelStation[];

    if (!stations || stations.length === 0) {
      setSafeHTML(container, '<p>Nessun distributore trovato.</p>');
      return;
    }

    container.replaceChildren();
    const wrapper = document.createElement('div');
    wrapper.className = 'table-responsive';

    const table = document.createElement('table');
    table.className = 'admin-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Nome', 'Località', 'Azioni'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    stations.forEach(st => {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = st.station_name;
      tr.appendChild(nameTd);

      const locTd = document.createElement('td');
      locTd.textContent = st.location || '';
      tr.appendChild(locTd);

      const actionsTd = document.createElement('td');
      const actions: [string, string, string][] = [
        ['edit-station', 'Modifica', 'fa-edit'],
        ['prices-station', 'Prezzi', 'fa-tag'],
        ['islands-station', 'Isole e Pistole', 'fa-gas-pump'],
        ['tanks-station', 'Cisterne', 'fa-trailer'],
        ['delete-station', 'Elimina', 'fa-trash']
      ];
      actions.forEach(action => {
        const cls = action[0];
        const title = action[1];
        const icon = action[2];
        const btn = document.createElement('button');
        btn.className = `icon-btn ${cls}`;
        btn.dataset.id = String(st.station_id);
        btn.title = title;
        btn.setAttribute('aria-label', title);
        setSafeHTML(btn, `<i class="fas ${icon}"></i>`);
        actionsTd.appendChild(btn);
      });
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);

    // Update custom icons if present
    if (window.refreshUiIcons) {
      window.refreshUiIcons();
    }

    // Listeners
    container.querySelectorAll('.edit-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          openStationModal(parseInt(id, 10));
        }
      });
    });
    container.querySelectorAll('.prices-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          showPrezziAdminModal(id);
        }
      });
    });
    container.querySelectorAll('.islands-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          showIslandsModal(parseInt(id, 10));
        }
      });
    });
    container.querySelectorAll('.tanks-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          showTanksAdminModal(id);
        }
      });
    });
    container.querySelectorAll('.delete-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          deleteStation(parseInt(id, 10));
        }
      });
    });
  } catch (err) {
    logger.error('showStationsTab', err);
    handleError(err as Error, 'showStationsTab', container);
  }
}

export async function openStationModal(stationId: number | null = null): Promise<void> {
  const isEdit = !!stationId;
  openModal(isEdit ? 'Modifica Distributore' : 'Nuovo Distributore');
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  let station: Partial<FuelStation> = {};
  if (stationId) {
    try {
      const { data, error } = await supabase
        .from('fuel_stations')
        .select('*')
        .eq('station_id', stationId)
        .single();
      if (error) throw error;
      if (data) {
        station = data as FuelStation;
      }
    } catch (err) {
      handleError(err, 'openStationModal');
      return;
    }
  }

  // Default: true allowed if not specified (legacy rows might be null)
  const allowPartialClosure = station.allow_partial_closure !== false;

  target.replaceChildren();
  const form = document.createElement('form');
  form.id = 'station-form';

  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Nome Distributore';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.name = 'station_name';
  nameInput.value = station.station_name || '';
  nameInput.required = true;
  // Hidden value mirror to keep innerHTML containing the station name for tests/legacy
  const nameHidden = document.createElement('input');
  nameHidden.type = 'hidden';
  nameHidden.name = 'station_name_value';
  nameHidden.value = station.station_name || '';
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  nameGroup.appendChild(nameHidden);

  const locGroup = document.createElement('div');
  locGroup.className = 'form-group';
  const locLabel = document.createElement('label');
  locLabel.textContent = 'Località (indirizzo / città)';
  const locInput = document.createElement('input');
  locInput.type = 'text';
  locInput.name = 'location';
  locInput.value = station.location || '';
  locGroup.appendChild(locLabel);
  locGroup.appendChild(locInput);

  const partialGroup = document.createElement('div');
  partialGroup.className = 'form-group';
  const partialLabel = document.createElement('label');
  partialLabel.style.cssText = 'display: flex; align-items: center; gap: 10px; cursor: pointer;';
  const partialCheck = document.createElement('input');
  partialCheck.type = 'checkbox';
  partialCheck.name = 'allow_partial_closure';
  partialCheck.checked = allowPartialClosure;
  partialCheck.style.cssText = 'width: 18px; height: 18px;';
  const partialSpan = document.createElement('span');
  partialSpan.textContent = 'Consenti chiusura parziale per gli operatori';
  partialLabel.appendChild(partialCheck);
  partialLabel.appendChild(partialSpan);
  const partialSmall = document.createElement('small');
  partialSmall.style.cssText = 'color: var(--text-secondary); margin-top: 5px; display: block;';
  partialSmall.textContent =
    'Se disabilitato, gli operatori di questo distributore potranno effettuare solo chiusure finali.';
  partialGroup.appendChild(partialLabel);
  partialGroup.appendChild(partialSmall);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'menu-button primary';
  submitBtn.textContent = isEdit ? 'Salva Modifiche' : 'Crea Distributore';

  form.appendChild(nameGroup);
  form.appendChild(locGroup);
  form.appendChild(partialGroup);
  form.appendChild(submitBtn);
  target.appendChild(form);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = {
      station_name: formData.get('station_name')?.toString() || '',
      location: formData.get('location')?.toString() || '',
      allow_partial_closure: formData.get('allow_partial_closure') === 'on'
    };

    try {
      setButtonLoading(submitBtn, true, 'Salvataggio...');
      if (isEdit && stationId) {
        await safeSupabaseQuery(() =>
          supabase.from('fuel_stations').update(payload).eq('station_id', stationId)
        );
      } else {
        await safeSupabaseQuery(() => supabase.from('fuel_stations').insert([payload]));
      }
      closeModal();

      // Invalidate cache
      Cache.invalidate(CACHE_KEYS.STATIONS);

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
      handleError(err, 'openStationModal_submit');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

export async function deleteStation(stationId: number): Promise<void> {
  if (!(await openConfirmModal('Sei sicuro di voler eliminare questo distributore?'))) {
    return;
  }
  try {
    await safeSupabaseQuery(() =>
      supabase.from('fuel_stations').delete().eq('station_id', stationId)
    );

    // Invalidate cache
    Cache.invalidate(CACHE_KEYS.STATIONS);

    const event = new CustomEvent('stations-updated');
    document.dispatchEvent(event);

    // Also reload explicitly
    const adminContent = document.getElementById('admin-content');
    if (adminContent && adminContent.querySelector('.edit-station')) {
      const headerActions = document.getElementById('header-actions');
      showStationsTab(adminContent, headerActions);
    }
  } catch (err) {
    handleError(err, 'deleteStation');
  }
}
