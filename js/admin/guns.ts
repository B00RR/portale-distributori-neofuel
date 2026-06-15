/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, showInfoModal, openConfirmModal, showLoadingMessage } from '../ui/ui.js';
import { escapeHtml, formatGunCounter, parseGunCounter } from '../utils/utils.js';

// --- INTERFACES ---

type FuelType = 'benzina' | 'gasolio' | string;

interface Gun {
  id: number;
  nome: string;
  tipo_carburante: FuelType;
  numero_litri: number;
  island_id: number;
}

interface CounterRecord {
  id: number;
  pistola_id: number;
  numeratore_chiusura: number;
  turno_id: number;
}

// --- MAIN FUNCTIONS ---

export async function showGunsModal(islandId: number, islandName: string, stationId: number | string): Promise<void> {
  openModal(`Pistole - ${escapeHtml(islandName)}`);
  // Remove narrow class if present
  const modalContent = document.querySelector('#app-modal .modal-content');
  if (modalContent) {
    modalContent.classList.remove('modal-narrow');
  }
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  showLoadingMessage(target);

  await renderGuns(target, islandId, islandName, stationId);
}

async function renderGuns(target: HTMLElement, islandId: number, islandName: string, stationId: number | string): Promise<void> {
  try {
    const { data: rawGuns, error } = await supabase
      .from('pistole')
      .select('*')
      .eq('island_id', islandId)
      .order('nome');

    if (error) {throw error;}

    const guns = rawGuns as Gun[];

    // Load latest counters
    const latestCounters: Record<number, number> = {};
    const { data: rawCounters } = await supabase
      .from('chiusura_turno_pistole')
      .select('pistola_id, numeratore_chiusura, turno_id')
      .order('turno_id', { ascending: false })
      .limit(200);

    const allCounters = rawCounters as CounterRecord[];

    if (allCounters && allCounters.length > 0) {
      const maxTurnoId = Math.max(...allCounters.map(c => c.turno_id));
      const latest = allCounters.filter(c => c.turno_id === maxTurnoId);
      latest.forEach(c => {
        latestCounters[c.pistola_id] = c.numeratore_chiusura;
      });
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

    const fuelColors: Record<string, string> = {
      benzina: '#22c55e',
      gasolio: '#eab308'
    };

    const gunsHtml = guns.map(gun => {
      const latestVal = latestCounters[gun.id];
      // Fallback to gun.numero_litri if no closure record exists
      const currentCounter = latestVal !== undefined ? latestVal : gun.numero_litri;

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
    const addBtn = document.getElementById('add-gun-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        openGunForm(islandId, islandName, stationId);
      });
    }

    target.querySelectorAll('.edit-gun').forEach(btn => {
      const b = btn as HTMLElement;
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        openGunForm(islandId, islandName, stationId, id ? parseInt(id, 10) : null);
      });
    });

    target.querySelectorAll('.delete-gun').forEach(btn => {
      const b = btn as HTMLElement;
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        if (id) {deleteGun(parseInt(id, 10), islandId, islandName, stationId);}
      });
    });

    target.querySelectorAll('.edit-counter').forEach(btn => {
      const b = btn as HTMLElement;
      b.addEventListener('click', () => {
        showCounterEditModal(
          parseInt(b.dataset.id || '0', 10),
          b.dataset.name || '',
          parseFloat(b.dataset.counter || '0'),
          islandId,
          islandName,
          stationId
        );
      });
    });

  } catch (err) {
    target.innerHTML = `
      <div style="color: #dc2626; padding: 20px; text-align: center;">
        <i class="fas fa-exclamation-triangle"></i> Errore: ${escapeHtml((err as Error).message)}
      </div>
    `;
  }
}

async function openGunForm(islandId: number, islandName: string, stationId: number | string, gunId: number | null = null): Promise<void> {
  const isEdit = !!gunId;
  openModal(isEdit ? 'Modifica Pistola' : 'Nuova Pistola');
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  let gun: Partial<Gun> = { nome: '', tipo_carburante: 'benzina', numero_litri: 0 };
  if (isEdit && gunId) {
    const { data } = await supabase
      .from('pistole')
      .select('*')
      .eq('id', gunId)
      .single();
    gun = (data as Gun) || gun;
  }

  const counterFormatted = formatGunCounter(gun.numero_litri || 0);

  target.innerHTML = `
    <form id="gun-form">
      <div class="form-group">
        <label>Nome Pistola</label>
        <input type="text" name="nome" value="${escapeHtml(gun.nome || '')}" required placeholder="es. Pistola 1">
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

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    });
  }

  const form = document.getElementById('gun-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);

      const numeroLitriStr = fd.get('numero_litri')?.toString() || '0';
      const numeroLitri = Math.round(parseGunCounter(numeroLitriStr) * 100) / 100;

      const payload = {
        nome: fd.get('nome')?.toString() || '',
        tipo_carburante: fd.get('tipo_carburante')?.toString() || 'benzina',
        numero_litri: numeroLitri,
        island_id: islandId
      };

      try {
        if (isEdit && gunId) {
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
        Toast.show('Errore: ' + (err as Error).message, 'error');
      }
    });
  }
}

async function showCounterEditModal(gunId: number, gunName: string, currentCounter: number, islandId: number, islandName: string, stationId: number | string): Promise<void> {
  openModal(`Modifica Numeratore - ${escapeHtml(gunName)}`);
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  const counterFormatted = formatGunCounter(Number(currentCounter));

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

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    });
  }

  const form = document.getElementById('counter-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);

      const numeroLitriStr = fd.get('numero_litri')?.toString() || '0';
      const numeroLitri = Math.round(parseGunCounter(numeroLitriStr) * 100) / 100;

      if (numeroLitri < 0) {
        Toast.show('Il numeratore non può essere negativo!', 'warning');
        return;
      }

      try {
        // 1. Update basic record
        await safeSupabaseQuery(() =>
          supabase.from('pistole').update({ numero_litri: numeroLitri }).eq('id', gunId)
        );

        // 2. Find latest turno_id
        let currentTurnoId: number | null = null;
        try {
          const { data: lastCounters } = await supabase
            .from('chiusura_turno_pistole')
            .select('turno_id')
            .order('turno_id', { ascending: false })
            .limit(1);

          const lastData = lastCounters as { turno_id: number }[];
          if (lastData && lastData.length > 0) {
            currentTurnoId = lastData[0]!.turno_id;
          }
        } catch (err) {
          console.warn('Errore recupero ultimo turno_id:', err);
        }

        // 3. Update or Insert
        if (currentTurnoId !== null) {
          const { data: existing } = await supabase
            .from('chiusura_turno_pistole')
            .select('id')
            .eq('pistola_id', gunId)
            .eq('turno_id', currentTurnoId)
            .single();

          if (existing) {
            await safeSupabaseQuery(() =>
              supabase.from('chiusura_turno_pistole')
                .update({ numeratore_chiusura: numeroLitri })
                .eq('pistola_id', gunId)
                .eq('turno_id', currentTurnoId)
            );
          } else {
            await safeSupabaseQuery(() =>
              supabase.from('chiusura_turno_pistole').insert([{
                pistola_id: gunId,
                numeratore_chiusura: numeroLitri,
                turno_id: currentTurnoId
              }])
            );
          }
        } else {
          await safeSupabaseQuery(() =>
            supabase.from('chiusura_turno_pistole').insert([{
              pistola_id: gunId,
              numeratore_chiusura: numeroLitri,
              turno_id: 1 // Init with 1 if nothing exists
            }])
          );
        }

        showInfoModal(`Numeratore aggiornato a ${formatGunCounter(numeroLitri)} L`);
        closeModal();
        showGunsModal(islandId, islandName, stationId);
      } catch (err) {
        Toast.show('Errore: ' + (err as Error).message, 'error');
      }
    });
  }
}

async function deleteGun(gunId: number, islandId: number, islandName: string, stationId: number | string): Promise<void> {
  try {
    if (!await openConfirmModal('Sei sicuro di voler eliminare questa pistola?')) { return; }

    await safeSupabaseQuery(() =>
      supabase.from('pistole').delete().eq('id', gunId)
    );

    showInfoModal('Pistola eliminata con successo!');
    showGunsModal(islandId, islandName, stationId);
  } catch (err) {
    Toast.show('Errore eliminazione: ' + (err as Error).message, 'error');
  }
}
