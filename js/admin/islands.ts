/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase, safeSupabaseQuery, getStationName } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showLoadingMessage, showInfoModal, openConfirmModal, showErrorMessage } from '../ui/ui.js';
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

/**
 * Open and render the Islands management modal for the specified station.
 *
 * Loads islands for the station, displays a compact UI showing each island with its pistol count,
 * and provides actions to add, edit, manage pistols, and delete islands (with safety checks and confirmations).
 *
 * @param stationId - The station identifier (number or string) whose islands will be managed
 */

export async function showIslandsModal(stationId: number | string): Promise<void> {
    const stationName = await getStationName(stationId);
    openModal(`Gestione Isole - ${escapeHtml(stationName)}`);
    // Compact layout
    const modalContent = document.querySelector('#app-modal .modal-content');
    if (modalContent) {
        modalContent.classList.add('modal-narrow');
    }
    const target = document.getElementById('modal-body');
    if (!target) return;

    const renderIslands = async () => {
        showLoadingMessage(target);

        try {
            // Load islands with guns count
            const { data: rawIslands, error } = await supabase
                .from('islands')
                .select(`
          island_id,
          nome,
          island_name,
          pistole (id)
        `)
                .eq('station_id', stationId)
                .order('island_id', { ascending: true });

            if (error) { throw error; }

            const islands = rawIslands as IslandWithGuns[];

            let html = `
        <div class="islands-list" style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h4>Isole Configurate</h4>
            <button class="menu-button primary small-btn" id="add-island-btn">
              <i class="fas fa-plus"></i> Aggiungi Isola
            </button>
          </div>
          ${(!islands || islands.length === 0) ? '<p>Nessuna isola configurata.</p>' : ''}
          <div class="islands-grid">
      `;

            if (islands && islands.length > 0) {
                islands.forEach(island => {
                    const gunsCount = island.pistole?.length || 0;
                    const name = island.nome || island.island_name || `Isola ${island.island_id}`;
                    html += `
            <div class="island-card" style="background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                  <h5 style="margin: 0 0 5px 0;">${escapeHtml(name)}</h5>
                  <span class="badge badge-info">${gunsCount} pistol${gunsCount !== 1 ? 'e' : 'a'}</span>
                </div>
                <button class="icon-btn delete-island" data-id="${island.island_id}" title="Elimina" style="color: #ef4444;">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button class="menu-button secondary small-btn edit-island" data-id="${island.island_id}">
                  <i class="fas fa-edit"></i> Modifica
                </button>
                <button class="menu-button primary small-btn manage-guns" data-id="${island.island_id}" data-name="${escapeHtml(name)}">
                  <i class="fas fa-gas-pump"></i> Gestisci Pistole
                </button>
              </div>
            </div>
          `;
                });
            }

            html += `
          </div>
        </div>
      `;

            target.innerHTML = html;

            // Event listeners
            const addBtn = document.getElementById('add-island-btn');
            if (addBtn) {
                addBtn.addEventListener('click', () => openIslandForm(stationId));
            }

            target.querySelectorAll('.edit-island').forEach(btn => {
                const b = btn as HTMLElement;
                b.addEventListener('click', () => {
                    const id = b.dataset.id;
                    if (id) openIslandForm(stationId, parseInt(id, 10));
                });
            });

            target.querySelectorAll('.manage-guns').forEach(btn => {
                const b = btn as HTMLElement;
                b.addEventListener('click', () => {
                    const id = b.dataset.id;
                    const name = b.dataset.name || '';
                    if (id) showGunsModal(parseInt(id, 10), name, stationId);
                });
            });

            target.querySelectorAll('.delete-island').forEach(btn => {
                const b = btn as HTMLElement;
                b.addEventListener('click', () => {
                    const id = b.dataset.id;
                    if (id) deleteIsland(parseInt(id, 10), stationId);
                });
            });

        } catch (err) {
            // Use showErrorMessage for consistent error UI inside modal
            (showErrorMessage as any)(target, err); // Assuming showErrorMessage handles generic error object
        }
    };

    renderIslands();
}

/**
 * Open a modal to create a new island or edit an existing island for the specified station.
 *
 * If `islandId` is provided, the function loads the island data and pre-fills the form. The form allows updating the island's name or creating a new island; on successful submit it saves the changes to the backend, shows a success message, closes the modal, and refreshes the islands list. The cancel action closes the modal and refreshes the islands list.
 *
 * @param stationId - Identifier of the station the island belongs to
 * @param islandId - Optional island identifier; when provided the form is loaded for editing that island
 */
async function openIslandForm(stationId: number | string, islandId: number | null = null): Promise<void> {
    const isEdit = !!islandId;

    openModal(isEdit ? 'Modifica Isola' : 'Nuova Isola');
    const target = document.getElementById('modal-body');
    if (!target) return;

    let island: Partial<Island> = { nome: '', island_name: '' };
    if (isEdit && islandId) {
        const { data } = await supabase
            .from('islands')
            .select('*')
            .eq('island_id', islandId)
            .single();
        if (data) {
            island = data as Island;
        }
    }

    target.innerHTML = `
    <form id="island-form">
      <div class="form-group">
        <label>Nome Isola</label>
        <input type="text" name="nome" value="${escapeHtml(island.nome || island.island_name || '')}" required placeholder="es. Isola 1">
      </div>
      <div style="display: flex; gap: 10px;">
        <button type="button" class="menu-button btn-danger" id="cancel-btn">Annulla</button>
        <button type="submit" class="menu-button btn-success">${isEdit ? 'Salva Modifiche' : 'Crea Isola'}</button>
      </div>
    </form>
  `;

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeModal();
            showIslandsModal(stationId);
        });
    }

    const form = document.getElementById('island-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            const nome = fd.get('nome')?.toString() || '';
            const payload = {
                nome: nome,
                island_name: nome,
                station_id: stationId
            };

            try {
                if (isEdit && islandId) {
                    await safeSupabaseQuery(() =>
                        supabase.from('islands').update(payload).eq('island_id', islandId)
                    );
                    showInfoModal('Isola aggiornata con successo!');
                } else {
                    await safeSupabaseQuery(() =>
                        supabase.from('islands').insert([payload])
                    );
                    showInfoModal('Isola creata con successo!');
                }
                closeModal();
                showIslandsModal(stationId);
            } catch (err) {
                Toast.show('Errore: ' + (err as Error).message, 'error');
            }
        });
    }
}

/**
 * Delete an island after verifying it has no associated pistols and confirming with the user.
 *
 * Checks whether the island has any associated pistols; if so, shows a warning toast and aborts.
 * Otherwise, prompts the user for confirmation, deletes the island from the database on confirmation,
 * shows a success info modal, and refreshes the islands view for the given station. On error, shows an error toast.
 *
 * @param islandId - The identifier of the island to delete
 * @param stationId - The station identifier used to refresh the islands modal after deletion
 */
async function deleteIsland(islandId: number, stationId: number | string): Promise<void> {
    try {
        // Find if has guns
        const { data: guns } = await supabase
            .from('pistole')
            .select('id')
            .eq('island_id', islandId);

        if (guns && guns.length > 0) {
            Toast.show(`Impossibile eliminare: l'isola ha ${guns.length} pistol${guns.length !== 1 ? 'e' : 'a'} associate. Rimuovile prima.`, 'warning');
            return;
        }

        if (!await openConfirmModal('Sei sicuro di voler eliminare questa isola?')) { return; }

        await safeSupabaseQuery(() =>
            supabase.from('islands').delete().eq('island_id', islandId)
        );

        showInfoModal('Isola eliminata con successo!');
        showIslandsModal(stationId);
    } catch (err) {
        Toast.show('Errore eliminazione: ' + (err as Error).message, 'error');
    }
}