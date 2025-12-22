// ==========================================
// ADMIN - ISLANDS MANAGEMENT
// ==========================================
import { supabase, safeSupabaseQuery, getStationName } from "../core/api.js";
import { openModal, closeModal, showLoadingMessage, showErrorMessage, showInfoModal, openConfirmModal } from "../ui/ui.js";
import { escapeHtml, formatNumberIt } from "../utils/utils.js";
import { showGunsModal } from "./guns.js";
import { Toast } from "../ui/toast.js";

/**
 * Mostra modal gestione isole per un distributore
 * @param {number} stationId - ID del distributore
 */
export async function showIslandsModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Gestione Isole - ${escapeHtml(stationName)}`);
  // Modale isole: usa layout più compatto
  const modalContent = document.querySelector('#app-modal .modal-content');
  if (modalContent) {
    modalContent.classList.add('modal-narrow');
  }
  const target = document.getElementById('modal-body');

  const renderIslands = async () => {
    showLoadingMessage(target);

    try {
      // Carica isole con conteggio pistole
      const { data: islands, error } = await supabase
        .from('islands')
        .select(`
          island_id,
          nome,
          island_name,
          pistole (id)
        `)
        .eq('station_id', stationId)
        .order('island_id', { ascending: true });

      if (error) throw error;

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
          html += `
            <div class="island-card" style="background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                  <h5 style="margin: 0 0 5px 0;">${escapeHtml(island.nome || island.island_name)}</h5>
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
                <button class="menu-button primary small-btn manage-guns" data-id="${island.island_id}" data-name="${escapeHtml(island.nome || island.island_name)}">
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
        btn.addEventListener('click', () => openIslandForm(stationId, parseInt((/** @type {HTMLElement} */(btn)).dataset.id || '0')));
      });

      target.querySelectorAll('.manage-guns').forEach(btn => {
        btn.addEventListener('click', () => {
          showGunsModal(parseInt((/** @type {HTMLElement} */(btn)).dataset.id || '0'), (/** @type {HTMLElement} */(btn)).dataset.name || '', stationId);
        });
      });

      target.querySelectorAll('.delete-island').forEach(btn => {
        btn.addEventListener('click', () => deleteIsland(parseInt((/** @type {HTMLElement} */(btn)).dataset.id || '0'), stationId));
      });

    } catch (err) {
      showErrorMessage(target, err);
    }
  };

  renderIslands();
}

/**
 * Form per creare/modificare isola
 * @param {number} stationId - ID del distributore
 * @param {number|null} islandId - ID isola (null per nuova)
 */
async function openIslandForm(stationId, islandId = null) {
  const isEdit = !!islandId;
  const stationName = await getStationName(stationId);
  openModal(isEdit ? 'Modifica Isola' : 'Nuova Isola');
  const target = document.getElementById('modal-body');

  let island = { nome: '', island_name: '' };
  if (isEdit) {
    const { data } = await supabase
      .from('islands')
      .select('*')
      .eq('island_id', islandId)
      .single();
    island = data || island;
  }

  target.innerHTML = `
    <form id="island-form">
      <div class="form-group">
        <label>Nome Isola</label>
        <input type="text" name="nome" value="${escapeHtml(island.nome)}" required placeholder="es. Isola 1">
      </div>
      <div style="display: flex; gap: 10px;">
        <button type="button" class="menu-button btn-danger" id="cancel-btn">Annulla</button>
        <button type="submit" class="menu-button btn-success">${isEdit ? 'Salva Modifiche' : 'Crea Isola'}</button>
      </div>
    </form>
  `;

  document.getElementById('cancel-btn').addEventListener('click', () => {
    closeModal();
    showIslandsModal(stationId);
  });

  document.getElementById('island-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */(e.target));
    const nome = fd.get('nome')?.toString() || '';
    const payload = {
      nome: nome,
      island_name: nome,
      station_id: stationId
    };

    try {
      if (isEdit) {
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
      Toast.show('Errore: ' + err.message, 'error');
    }
  });
}

/**
 * Elimina isola
 * @param {number} islandId - ID isola
 * @param {number} stationId - ID distributore (per refresh)
 */
async function deleteIsland(islandId, stationId) {
  try {
    // Verifica se ha pistole associate
    const { data: guns } = await supabase
      .from('pistole')
      .select('id')
      .eq('island_id', islandId);

    if (guns && guns.length > 0) {
      Toast.show(`Impossibile eliminare: l'isola ha ${guns.length} pistol${guns.length !== 1 ? 'e' : 'a'} associate. Rimuovile prima.`, 'warning');
      return;
    }

    if (!await openConfirmModal('Sei sicuro di voler eliminare questa isola?')) return;

    await safeSupabaseQuery(() =>
      supabase.from('islands').delete().eq('island_id', islandId)
    );

    showInfoModal('Isola eliminata con successo!');
    showIslandsModal(stationId);
  } catch (err) {
    Toast.show('Errore eliminazione: ' + err.message, 'error');
  }
}
