/**
 * Admin Guns Management Module
 * Gestisce le operazioni CRUD per le pistole (guns) nel pannello admin
 */

import { supabase } from '../core/api.js';
import { safeSupabaseQuery } from '../core/api.js';
import { openModal, closeModal, showInfoModal, openConfirmModal, showLoadingMessage } from '../ui/ui.js';
import { escapeHtml, formatNumberIt, parseNumberFlexible, formatGunCounter, parseGunCounter } from '../utils/utils.js';
import { Toast } from '../ui/toast.js';

/**
 * Mostra modal con lista pistole per un'isola
 * @param {number} islandId - ID isola
 * @param {string} islandName - Nome isola
 * @param {number} stationId - ID distributore
 */
export async function showGunsModal(islandId, islandName, stationId) {
  openModal(`Pistole - ${escapeHtml(islandName)}`);
  // Per pistole usiamo la versione larga: rimuovi eventuale classe compatta
  const modalContent = document.querySelector('#app-modal .modal-content');
  if (modalContent) {
    modalContent.classList.remove('modal-narrow');
  }
  const target = document.getElementById('modal-body');

  showLoadingMessage(target, 'Caricamento pistole...');

  await renderGuns(target, islandId, islandName, stationId);
}

/**
 * Renderizza lista pistole
 * @param {HTMLElement} target - Elemento DOM target
 * @param {number} islandId - ID isola
 * @param {string} islandName - Nome isola
 * @param {number} stationId - ID distributore
 */
async function renderGuns(target, islandId, islandName, stationId) {
  try {
    // Carica pistole
    const { data: guns } = await supabase
      .from('pistole')
      .select('*')
      .eq('island_id', islandId)
      .order('nome');

    // Carica ultimi numeratori da chiusura_turno_pistole
    const latestCounters = {};
    const { data: allCounters } = await supabase
      .from('chiusura_turno_pistole')
      .select('pistola_id, numeratore_chiusura, turno_id')
      .order('turno_id', { ascending: false })
      .limit(200);

    if (allCounters && allCounters.length > 0) {
      // Trova il turno_id più alto (ultima chiusura)
      const maxTurnoId = Math.max(...allCounters.map(c => c.turno_id));

      console.log('DEBUG: turno_id più alto:', maxTurnoId);
      console.log('DEBUG: record trovati:', allCounters.length);

      // Filtra solo i contatori con il turno_id più alto
      const latest = allCounters.filter(c => c.turno_id === maxTurnoId);

      console.log('DEBUG: contatori per ultimo turno:', latest);

      // Popola la mappa dei contatori
      latest.forEach(c => {
        latestCounters[c.pistola_id] = parseFloat(c.numeratore_chiusura);
      });

      console.log('DEBUG: mappa latestCounters:', latestCounters);
    } else {
      console.log('DEBUG: Nessun contatore trovato in chiusura_turno_pistole');
    }

    if (!guns || guns.length === 0) {
      target.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6b7280;">
          <i class="fas fa-gas-pump" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;"></i>
          <p style="font-size: 1.125rem; margin-bottom: 20px;">Nessuna pistola configurata per questa isola</p>
          <button class="menu-button primary" id="add-gun-btn">
            <i class="fas fa-plus"></i> Aggiungi Prima Pistola
          </button>
        </div>
      `;

      const addFirstBtn = document.getElementById('add-gun-btn');
      if (addFirstBtn) {
        addFirstBtn.addEventListener('click', () => {
          openGunForm(islandId, islandName, stationId);
        });
      }

      return;
    }

    const fuelColors = {
      benzina: '#22c55e',
      gasolio: '#eab308'
    };

    const gunsHtml = guns.map(gun => {
      const latestVal = latestCounters[gun.id];
      const fallbackVal = gun.numero_litri;
      // Usa il valore da chiusura_turno_pistole se presente, altrimenti fallback su pistole.numero_litri
      const currentCounter = latestVal !== undefined ? latestVal : fallbackVal;

      console.log(`DEBUG: Gun ${gun.nome} (ID: ${gun.id}) - Latest: ${latestVal}, Fallback: ${fallbackVal}, Used: ${currentCounter}`);

      const counter = formatGunCounter(currentCounter);
      const color = fuelColors[gun.tipo_carburante] || '#6b7280';

      return `
        <div class="gun-card" style="
          background: white;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 15px;
          border-left: 4px solid ${color};
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
            <div>
              <h3 style="margin: 0 0 8px 0; font-size: 1.25rem; color: #1f2937;">
                <i class="fas fa-gas-pump" style="color: ${color}; margin-right: 8px;"></i>
                ${escapeHtml(gun.nome)}
              </h3>
              <div style="display: flex; gap: 15px; align-items: center;">
                <span style="
                  background: ${color}15;
                  color: ${color};
                  padding: 4px 12px;
                  border-radius: 6px;
                  font-size: 0.875rem;
                  font-weight: 600;
                  text-transform: uppercase;
                ">
                  ${escapeHtml(gun.tipo_carburante)}
                </span>
                <span style="color: #6b7280; font-size: 0.875rem;">
                  ID: ${gun.id}
                </span>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="icon-btn edit-gun" data-id="${gun.id}" title="Modifica Pistola">
                <i class="fas fa-edit"></i>
              </button>
              <button class="icon-btn delete-gun" data-id="${gun.id}" title="Elimina Pistola">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          
          <div style="
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 12px;
          ">
            <div style="font-size: 0.875rem; color: #0369a1; margin-bottom: 5px; font-weight: 500;">
              <i class="fas fa-tachometer-alt"></i> Numeratore Attuale
            </div>
            <div style="font-size: 1.75rem; font-weight: 700; color: #0c4a6e;">
              ${counter} <span style="font-size: 1rem; font-weight: 400;">L</span>
            </div>
          </div>

          <button 
            class="menu-button secondary edit-counter" 
            data-id="${gun.id}" 
            data-name="${escapeHtml(gun.nome)}"
            data-counter="${currentCounter}"
            style="width: 100%;"
          >
            <i class="fas fa-edit"></i> Modifica Numeratore
          </button>
        </div>
      `;
    }).join('');

    target.innerHTML = `
      <div style="margin-bottom: 20px;">
        <button class="menu-button primary" id="add-gun-btn">
          <i class="fas fa-plus"></i> Aggiungi Pistola
        </button>
      </div>
      ${gunsHtml}
    `;

    // Event listeners
    document.getElementById('add-gun-btn').addEventListener('click', () => {
      openGunForm(islandId, islandName, stationId);
    });

    document.querySelectorAll('.edit-gun').forEach(btn => {
      btn.addEventListener('click', () => {
        openGunForm(islandId, islandName, stationId, btn.dataset.id);
      });
    });

    document.querySelectorAll('.delete-gun').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteGun(btn.dataset.id, islandId, islandName, stationId);
      });
    });

    document.querySelectorAll('.edit-counter').forEach(btn => {
      btn.addEventListener('click', () => {
        showCounterEditModal(
          btn.dataset.id,
          btn.dataset.name,
          btn.dataset.counter,
          islandId,
          islandName,
          stationId
        );
      });
    });

  } catch (err) {
    target.innerHTML = `
      <div style="color: #dc2626; padding: 20px; text-align: center;">
        <i class="fas fa-exclamation-triangle"></i> Errore: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

/**
 * Apre form per creare/modificare pistola
 * @param {number} islandId - ID isola
 * @param {string} islandName - Nome isola
 * @param {number} stationId - ID distributore
 * @param {number|null} gunId - ID pistola (null per nuova)
 */
async function openGunForm(islandId, islandName, stationId, gunId = null) {
  const isEdit = !!gunId;
  openModal(isEdit ? 'Modifica Pistola' : 'Nuova Pistola');
  const target = document.getElementById('modal-body');

  let gun = { nome: '', tipo_carburante: 'benzina', numero_litri: 0 };
  if (isEdit) {
    const { data } = await supabase
      .from('pistole')
      .select('*')
      .eq('id', gunId)
      .single();
    gun = data || gun;
  }

  const counterFormatted = formatGunCounter(gun.numero_litri);

  target.innerHTML = `
    <form id="gun-form">
      <div class="form-group">
        <label>Nome Pistola</label>
        <input type="text" name="nome" value="${escapeHtml(gun.nome)}" required placeholder="es. Pistola 1">
      </div>
      <div class="form-group">
        <label>Tipo Carburante</label>
        <select name="tipo_carburante" required>
          <option value="benzina" ${gun.tipo_carburante === 'benzina' ? 'selected' : ''}>Benzina</option>
          <option value="gasolio" ${gun.tipo_carburante === 'gasolio' ? 'selected' : ''}>Gasolio</option>
        </select>
      </div>
      <div class="form-group">
        <label>Numeratore Iniziale</label>
        <input 
          type="text" 
          name="numero_litri" 
          value="${counterFormatted}" 
          required 
          placeholder="es. 1.234,56"
          pattern="[0-9.,]+"
        >
      </div>
      <div style="display: flex; gap: 10px;">
        <button type="button" class="menu-button btn-danger" id="cancel-btn">Annulla</button>
        <button type="submit" class="menu-button btn-success">${isEdit ? 'Salva Modifiche' : 'Crea Pistola'}</button>
      </div>
    </form>
  `;

  document.getElementById('cancel-btn').addEventListener('click', () => {
    closeModal();
    showGunsModal(islandId, islandName, stationId);
  });

  document.getElementById('gun-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    const numeroLitriStr = fd.get('numero_litri');
    const numeroLitri = Math.round(parseGunCounter(numeroLitriStr) * 100) / 100; // Arrotonda a 2 decimali

    const payload = {
      nome: fd.get('nome'),
      tipo_carburante: fd.get('tipo_carburante'),
      numero_litri: numeroLitri,
      island_id: islandId
    };

    try {
      if (isEdit) {
        await safeSupabaseQuery(() =>
          supabase.from('pistole').update(payload).eq('id', gunId)
        );
        showInfoModal('Pistola aggiornata con successo!');
      } else {
        await safeSupabaseQuery(() =>
          supabase.from('pistole').insert([payload])
        );
        showInfoModal('Pistola creata con successo!');
      }
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    } catch (err) {
      Toast.show('Errore: ' + err.message, 'error');
    }
  });
}

/**
 * Mostra modal per modifica numeratore pistola
 * @param {number} gunId - ID pistola
 * @param {string} gunName - Nome pistola
 * @param {number} currentCounter - Numeratore attuale
 * @param {number} islandId - ID isola
 * @param {string} islandName - Nome isola
 * @param {number} stationId - ID distributore
 */
async function showCounterEditModal(gunId, gunName, currentCounter, islandId, islandName, stationId) {
  openModal(`Modifica Numeratore - ${escapeHtml(gunName)}`);
  const target = document.getElementById('modal-body');

  const counterFormatted = formatGunCounter(parseFloat(currentCounter));

  target.innerHTML = `
    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0284c7;">
      <div style="font-size: 0.875rem; color: #0369a1; margin-bottom: 5px;">Numeratore Attuale</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #0c4a6e;">${counterFormatted} L</div>
    </div>

    <form id="counter-form">
      <div class="form-group">
        <label>Nuovo Numeratore</label>
        <input 
          type="text" 
          name="numero_litri" 
          value="${counterFormatted}" 
          required 
          placeholder="es. 12.345,67"
          pattern="[0-9.,]+"
          style="font-size: 1.125rem; font-weight: 600;"
        >
      </div>

      <div style="background: #fef3c7; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 3px solid #f59e0b;">
        <div style="font-size: 0.875rem; color: #92400e;">
          <i class="fas fa-exclamation-triangle"></i> <strong>Attenzione:</strong> Modificare il numeratore influenzerà i calcoli delle chiusure future.
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button type="button" class="menu-button btn-danger" id="cancel-btn">Annulla</button>
        <button type="submit" class="menu-button btn-success">Salva Numeratore</button>
      </div>
    </form>
  `;

  document.getElementById('cancel-btn').addEventListener('click', () => {
    closeModal();
    showGunsModal(islandId, islandName, stationId);
  });

  document.getElementById('counter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    const numeroLitriStr = fd.get('numero_litri');
    const numeroLitri = Math.round(parseGunCounter(numeroLitriStr) * 100) / 100; // Arrotonda a 2 decimali

    if (numeroLitri < 0) {
      Toast.show('Il numeratore non può essere negativo!', 'warning');
      return;
    }

    try {
      // 1. Aggiorna la tabella pistole (valore di fallback)
      await safeSupabaseQuery(() =>
        supabase.from('pistole').update({ numero_litri: numeroLitri }).eq('id', gunId)
      );

      // 2. Trova l'ultimo turno_id da chiusura_turno_pistole
      let currentTurnoId = null;
      try {
        const { data: lastCounters } = await supabase
          .from('chiusura_turno_pistole')
          .select('turno_id')
          .order('turno_id', { ascending: false })
          .limit(1);

        if (lastCounters && lastCounters.length > 0) {
          currentTurnoId = lastCounters[0].turno_id;
        }
      } catch (err) {
        console.warn('Errore recupero ultimo turno_id:', err);
      }

      // 3. Aggiorna o inserisci record in chiusura_turno_pistole
      if (currentTurnoId !== null) {
        // Verifica se esiste già un record per questa pistola con il turno_id corrente
        const { data: existing } = await supabase
          .from('chiusura_turno_pistole')
          .select('id')
          .eq('pistola_id', gunId)
          .eq('turno_id', currentTurnoId)
          .single();

        if (existing) {
          // Aggiorna il record esistente
          await safeSupabaseQuery(() =>
            supabase.from('chiusura_turno_pistole')
              .update({ numeratore_chiusura: numeroLitri })
              .eq('pistola_id', gunId)
              .eq('turno_id', currentTurnoId)
          );
        } else {
          // Inserisci nuovo record con lo stesso turno_id
          await safeSupabaseQuery(() =>
            supabase.from('chiusura_turno_pistole').insert([{
              pistola_id: gunId,
              numeratore_chiusura: numeroLitri,
              turno_id: currentTurnoId
            }])
          );
        }
      } else {
        // Nessun turno esistente, crea il primo con turno_id = 1
        await safeSupabaseQuery(() =>
          supabase.from('chiusura_turno_pistole').insert([{
            pistola_id: gunId,
            numeratore_chiusura: numeroLitri,
            turno_id: 1
          }])
        );
      }

      showInfoModal(`Numeratore aggiornato a ${formatGunCounter(numeroLitri)} L`);
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    } catch (err) {
      Toast.show('Errore: ' + err.message, 'error');
    }
  });
}

/**
 * Elimina pistola
 * @param {number} gunId - ID pistola
 * @param {number} islandId - ID isola
 * @param {string} islandName - Nome isola
 * @param {number} stationId - ID distributore
 */
async function deleteGun(gunId, islandId, islandName, stationId) {
  try {
    if (!await openConfirmModal('Sei sicuro di voler eliminare questa pistola?')) return;

    await safeSupabaseQuery(() =>
      supabase.from('pistole').delete().eq('id', gunId)
    );

    showInfoModal('Pistola eliminata con successo!');
    showGunsModal(islandId, islandName, stationId);
  } catch (err) {
    Toast.show('Errore eliminazione: ' + err.message, 'error');
  }
}
