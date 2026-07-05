import { supabase, safeSupabaseQuery, getStationName } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { createEl, createIcon } from '../ui/dom-helpers.js';
import { Toast } from '../ui/toast.js';
import {
  openModal,
  closeModal,
  showLoadingMessage,
  showInfoModal,
  openConfirmModal,
  showErrorMessage
} from '../ui/ui.js';
import { escapeHtml } from '../utils/utils.js';

import { showGunsModal } from './guns.js';

// --- INTERFACES ---

interface Island {
  island_id: number;
  nome: string; // nome or island_name depending on legacy
  island_name?: string;
  station_id: number;
}

interface IslandWithGuns extends Island {
  pistole: { id: number }[]; // Count only
}

// --- MAIN FUNCTION ---

export async function showIslandsModal(stationId: number | string): Promise<void> {
  const stationName = await getStationName(stationId);
  openModal(`Gestione Isole - ${escapeHtml(stationName)}`);
  // Compact layout
  const modalContent = document.querySelector('#app-modal .modal-content');
  if (modalContent) {
    modalContent.classList.add('modal-narrow');
  }
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  const renderIslands = async (): Promise<void> => {
    showLoadingMessage(target);

    try {
      // Load islands with guns count
      const { data: rawIslands, error } = await supabase
        .from('islands')
        .select(
          `
          island_id,
          nome,
          island_name,
          pistole (id)
        `
        )
        .eq('station_id', Number(stationId))
        .order('island_id', { ascending: true });

      if (error) {
        throw error;
      }

      const islands = rawIslands as IslandWithGuns[];

      target.replaceChildren();

      const wrapper = createEl('div', {
        classes: ['islands-list'],
        style: { marginBottom: '20px' }
      });

      const header = createEl('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px'
        },
        children: [
          createEl('h4', { text: 'Isole Configurate' }),
          createEl('button', {
            id: 'add-island-btn',
            classes: ['menu-button', 'primary', 'small-btn'],
            children: [createIcon('fas fa-plus'), document.createTextNode(' Aggiungi Isola')]
          })
        ]
      });
      wrapper.appendChild(header);

      if (!islands || islands.length === 0) {
        wrapper.appendChild(createEl('p', { text: 'Nessuna isola configurata.' }));
      } else {
        const grid = createEl('div', { classes: ['islands-grid'] });

        islands.forEach(island => {
          const gunsCount = island.pistole?.length || 0;
          const name = island.nome || island.island_name || `Isola ${island.island_id}`;

          const card = createEl('div', {
            classes: ['island-card'],
            style: {
              background: 'var(--bg-body)',
              padding: '15px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }
          });

          const cardHeader = createEl('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
              marginBottom: '10px'
            },
            children: [
              createEl('div', {
                children: [
                  createEl('h5', { style: { margin: '0 0 5px 0' }, text: escapeHtml(name) }),
                  createEl('span', {
                    classes: ['badge', 'badge-info'],
                    text: `${gunsCount} pistol${gunsCount !== 1 ? 'e' : 'a'}`
                  })
                ]
              }),
              createEl('button', {
                classes: ['icon-btn', 'delete-island'],
                dataset: { id: String(island.island_id) },
                attrs: { title: 'Elimina', 'aria-label': 'Elimina' },
                style: { color: 'var(--danger-color)' },
                children: [createIcon('fas fa-trash')]
              })
            ]
          });
          card.appendChild(cardHeader);

          const actions = createEl('div', {
            style: { display: 'flex', gap: '8px', marginTop: '10px' },
            children: [
              createEl('button', {
                classes: ['menu-button', 'secondary', 'small-btn', 'edit-island'],
                dataset: { id: String(island.island_id) },
                children: [createIcon('fas fa-edit'), document.createTextNode(' Modifica')]
              }),
              createEl('button', {
                classes: ['menu-button', 'primary', 'small-btn', 'manage-guns'],
                dataset: { id: String(island.island_id), name: escapeHtml(name) },
                children: [
                  createIcon('fas fa-gas-pump'),
                  document.createTextNode(' Gestisci Pistole')
                ]
              })
            ]
          });
          card.appendChild(actions);

          grid.appendChild(card);
        });

        wrapper.appendChild(grid);
      }

      target.appendChild(wrapper);

      // Event listeners
      const addBtn = document.getElementById('add-island-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => openIslandForm(stationId));
      }

      target.querySelectorAll('.edit-island').forEach(btn => {
        const b = btn as HTMLElement;
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          if (id) {
            openIslandForm(stationId, parseInt(id, 10));
          }
        });
      });

      target.querySelectorAll('.manage-guns').forEach(btn => {
        const b = btn as HTMLElement;
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          const name = b.dataset.name || '';
          if (id) {
            showGunsModal(parseInt(id, 10), name, stationId);
          }
        });
      });

      target.querySelectorAll('.delete-island').forEach(btn => {
        const b = btn as HTMLElement;
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          if (id) {
            deleteIsland(parseInt(id, 10), stationId);
          }
        });
      });
    } catch (err) {
      // Use showErrorMessage for consistent error UI inside modal
      showErrorMessage(target, err);
    }
  };

  renderIslands();
}

async function openIslandForm(
  stationId: number | string,
  islandId: number | null = null
): Promise<void> {
  const isEdit = !!islandId;

  openModal(isEdit ? 'Modifica Isola' : 'Nuova Isola');
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  let island: Partial<Island> = { nome: '', island_name: '' };
  if (isEdit && islandId) {
    const { data } = await supabase.from('islands').select('*').eq('island_id', islandId).single();
    if (data) {
      island = data as Island;
    }
  }

  target.replaceChildren();

  const form = createEl('form', { id: 'island-form' });

  const formGroup = createEl('div', { classes: ['form-group'] });
  formGroup.appendChild(createEl('label', { text: 'Nome Isola' }));
  formGroup.appendChild(
    createEl('input', {
      attrs: {
        type: 'text',
        name: 'nome',
        required: 'required',
        placeholder: 'es. Isola 1'
      },
      value: island.nome || island.island_name || ''
    })
  );
  form.appendChild(formGroup);

  const actions = createEl('div', { style: { display: 'flex', gap: '10px' } });
  actions.appendChild(
    createEl('button', {
      id: 'cancel-btn',
      classes: ['menu-button', 'btn-danger'],
      attrs: { type: 'button' },
      text: 'Annulla'
    })
  );
  actions.appendChild(
    createEl('button', {
      classes: ['menu-button', 'btn-success'],
      attrs: { type: 'submit' },
      text: isEdit ? 'Salva Modifiche' : 'Crea Isola'
    })
  );
  form.appendChild(actions);

  target.appendChild(form);

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal();
      showIslandsModal(stationId);
    });
  }

  const formEl = document.getElementById('island-form');
  if (formEl) {
    formEl.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const nome = fd.get('nome')?.toString() || '';
      const payload = {
        nome: nome,
        island_name: nome,
        station_id: Number(stationId)
      };

      try {
        if (isEdit && islandId) {
          await safeSupabaseQuery(() =>
            supabase.from('islands').update(payload).eq('island_id', islandId)
          );
          showInfoModal('Isola aggiornata con successo!');
        } else {
          await safeSupabaseQuery(() => supabase.from('islands').insert([payload]));
          showInfoModal('Isola creata con successo!');
        }
        closeModal();
        showIslandsModal(stationId);
      } catch (err) {
        handleError(err, 'saveIsland');
      }
    });
  }
}

async function deleteIsland(islandId: number, stationId: number | string): Promise<void> {
  try {
    // Find if has guns
    const { data: guns } = await supabase.from('pistole').select('id').eq('island_id', islandId);

    if (guns && guns.length > 0) {
      Toast.show(
        `Impossibile eliminare: l'isola ha ${guns.length} pistol${guns.length !== 1 ? 'e' : 'a'} associate. Rimuovile prima.`,
        'warning'
      );
      return;
    }

    if (!(await openConfirmModal('Sei sicuro di voler eliminare questa isola?'))) {
      return;
    }

    await safeSupabaseQuery(() => supabase.from('islands').delete().eq('island_id', islandId));

    showInfoModal('Isola eliminata con successo!');
    showIslandsModal(stationId);
  } catch (err) {
    handleError(err, 'deleteIsland');
  }
}
