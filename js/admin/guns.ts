import { supabase, safeSupabaseQuery } from '../core/api.js';
import { logger } from '../core/logger.js';
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

// --- DOM HELPERS ---

function createIcon(className: string): HTMLElement {
  const icon = document.createElement('i');
  icon.className = className;
  return icon;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    id?: string;
    classes?: string[];
    text?: string;
    attrs?: Record<string, string>;
    dataset?: Record<string, string>;
    style?: Record<string, string>;
    children?: (HTMLElement | Node)[];
  } = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.id) {el.id = options.id;}
  if (options.classes) {el.classList.add(...options.classes.filter(Boolean));}
  if (options.text !== undefined) {el.textContent = options.text;}
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      el.setAttribute(`data-${key}`, value);
    });
  }
  if (options.style) {
    Object.entries(options.style).forEach(([key, value]) => {
      el.style.setProperty(key, value);
    });
  }
  if (options.children) {
    options.children.forEach(child => el.appendChild(child));
  }
  return el;
}

// --- MAIN FUNCTIONS ---

export async function showGunsModal(islandId: number, islandName: string, stationId: number | string): Promise<void> {
  const stationIdNumber = typeof stationId === 'string' ? parseInt(stationId, 10) : stationId;
  openModal(`Pistole - ${escapeHtml(islandName)}`);
  // Remove narrow class if present
  const modalContent = document.querySelector('#app-modal .modal-content');
  if (modalContent) {
    modalContent.classList.remove('modal-narrow');
  }
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  showLoadingMessage(target);

  await renderGuns(target, islandId, islandName, stationIdNumber);
}

async function renderGuns(target: HTMLElement, islandId: number, islandName: string, stationId: number): Promise<void> {
  try {
    const { data: rawGuns, error } = await safeSupabaseQuery(async () => await supabase
      .from('pistole')
      .select('*')
      .eq('island_id', islandId)
      .order('nome')
    );

    if (error) {throw error;}

    const guns = rawGuns as Gun[];

    // Load latest counters
    const latestCounters: Record<number, number> = {};
    const { data: rawCounters, error: countersError } = await safeSupabaseQuery(async () => await supabase
      .from('shift_pistols')
      .select('pistola_id, closed_at_counter, shift_id')
      .order('created_at', { ascending: false })
      .limit(200)
    );

    if (countersError) {throw countersError;}

    const allCounters = rawCounters as { pistola_id: number; closed_at_counter: number | null; shift_id: number }[];

    if (allCounters && allCounters.length > 0) {
      const maxShiftId = Math.max(...allCounters.map(c => Number(c.shift_id)));
      const latest = allCounters.filter(c => Number(c.shift_id) === maxShiftId);
      latest.forEach(c => {
        if (c.closed_at_counter !== null && c.closed_at_counter !== undefined) {
          latestCounters[c.pistola_id] = Number(c.closed_at_counter);
        }
      });
    }

    target.innerHTML = '';

    if (!guns || guns.length === 0) {
      const emptyState = createEl('div', {
        style: {
          textAlign: 'center',
          padding: '40px',
          color: '#6b7280'
        },
        children: [
          createIcon('fas fa-gas-pump'),
          createEl('p', {
            style: { fontSize: '1.125rem', marginBottom: '20px' },
            text: 'Nessuna pistola configurata per questa isola'
          }),
          createEl('button', {
            id: 'add-gun-btn',
            classes: ['menu-button', 'primary'],
            children: [createIcon('fas fa-plus'), document.createTextNode(' Aggiungi Prima Pistola')]
          })
        ]
      });
      emptyState.querySelector('.fa-gas-pump')?.setAttribute('style', 'font-size: 3rem; margin-bottom: 15px; opacity: 0.3;');
      target.appendChild(emptyState);

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

    const wrapper = createEl('div', {
      style: { marginBottom: '20px' },
      children: [
        createEl('button', {
          id: 'add-gun-btn',
          classes: ['menu-button', 'primary'],
          children: [createIcon('fas fa-plus'), document.createTextNode(' Aggiungi Pistola')]
        })
      ]
    });

    guns.forEach(gun => {
      const latestVal = latestCounters[gun.id];
      // Fallback to gun.numero_litri if no closure record exists
      const currentCounter = latestVal !== undefined ? latestVal : gun.numero_litri;

      const counter = formatGunCounter(currentCounter);
      const color = fuelColors[gun.tipo_carburante] || '#6b7280';

      const card = createEl('div', {
        classes: ['gun-card'],
        style: {
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '15px',
          borderLeft: `4px solid ${color}`,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
      });

      const header = createEl('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' },
        children: [
          createEl('div', {
            children: [
              createEl('h3', {
                style: { margin: '0 0 8px 0', fontSize: '1.25rem', color: '#1f2937' },
                children: [
                  createIcon('fas fa-gas-pump'),
                  document.createTextNode(` ${escapeHtml(gun.nome)}`)
                ]
              }),
              createEl('div', {
                style: { display: 'flex', gap: '15px', alignItems: 'center' },
                children: [
                  createEl('span', {
                    style: {
                      background: `${color}15`,
                      color,
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    },
                    text: gun.tipo_carburante
                  }),
                  createEl('span', { style: { color: '#6b7280', fontSize: '0.875rem' }, text: `ID: ${gun.id}` })
                ]
              })
            ]
          }),
          createEl('div', {
            style: { display: 'flex', gap: '8px' },
            children: [
              createEl('button', {
                classes: ['icon-btn', 'edit-gun'],
                dataset: { id: String(gun.id) },
                attrs: { title: 'Modifica Pistola' },
                children: [createIcon('fas fa-edit')]
              }),
              createEl('button', {
                classes: ['icon-btn', 'delete-gun'],
                dataset: { id: String(gun.id) },
                attrs: { title: 'Elimina Pistola' },
                children: [createIcon('fas fa-trash')]
              })
            ]
          })
        ]
      });
      card.appendChild(header);

      header.querySelector('.fa-gas-pump')?.setAttribute('style', `color: ${color}; margin-right: 8px;`);

      const counterBox = createEl('div', {
        style: {
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '12px'
        },
        children: [
          createEl('div', {
            style: { fontSize: '0.875rem', color: '#0369a1', marginBottom: '5px', fontWeight: '500' },
            children: [createIcon('fas fa-tachometer-alt'), document.createTextNode(' Numeratore Attuale')]
          }),
          createEl('div', {
            style: { fontSize: '1.75rem', fontWeight: '700', color: '#0c4a6e' },
            children: [
              document.createTextNode(`${counter} `),
              createEl('span', { style: { fontSize: '1rem', fontWeight: '400' }, text: 'L' })
            ]
          })
        ]
      });
      card.appendChild(counterBox);

      const editCounterBtn = createEl('button', {
        classes: ['menu-button', 'secondary', 'edit-counter'],
        dataset: { id: String(gun.id), name: gun.nome, counter: String(currentCounter) },
        style: { width: '100%' },
        children: [createIcon('fas fa-edit'), document.createTextNode(' Modifica Numeratore')]
      });
      card.appendChild(editCounterBtn);

      wrapper.appendChild(card);
    });

    target.appendChild(wrapper);

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
    target.innerHTML = '';
    const errorDiv = createEl('div', {
      style: { color: '#dc2626', padding: '20px', textAlign: 'center' },
      children: [
        createIcon('fas fa-exclamation-triangle'),
        document.createTextNode(` Errore: ${escapeHtml((err as Error).message)}`)
      ]
    });
    target.appendChild(errorDiv);
  }
}

async function openGunForm(islandId: number, islandName: string, stationId: number, gunId: number | null = null): Promise<void> {
  const isEdit = !!gunId;
  openModal(isEdit ? 'Modifica Pistola' : 'Nuova Pistola');
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  let gun: Partial<Gun> = { nome: '', tipo_carburante: 'benzina', numero_litri: 0 };
  if (isEdit && gunId) {
    const { data, error } = await safeSupabaseQuery(async () => await supabase
      .from('pistole')
      .select('*')
      .eq('id', gunId)
      .single()
    );
    if (error) {throw error;}
    gun = (data as Gun | null) || gun;
  }

  target.innerHTML = '';

  const counterFormatted = formatGunCounter(gun.numero_litri || 0);

  const form = createEl('form', { id: 'gun-form' });

  const nomeGroup = createEl('div', { classes: ['form-group'] });
  nomeGroup.appendChild(createEl('label', { text: 'Nome Pistola' }));
  const nomeInput = createEl('input', {
    attrs: { type: 'text', name: 'nome', required: 'required', placeholder: 'es. Pistola 1', value: gun.nome || '' }
  });
  nomeGroup.appendChild(nomeInput);
  form.appendChild(nomeGroup);

  const tipoGroup = createEl('div', { classes: ['form-group'] });
  tipoGroup.appendChild(createEl('label', { text: 'Tipo Carburante' }));
  const tipoSelect = createEl('select', { attrs: { name: 'tipo_carburante', required: 'required' } });
  const benzinaOption = createEl('option', { attrs: { value: 'benzina' }, text: 'Benzina' });
  if (gun.tipo_carburante === 'benzina') {benzinaOption.selected = true;}
  const gasolioOption = createEl('option', { attrs: { value: 'gasolio' }, text: 'Gasolio' });
  if (gun.tipo_carburante === 'gasolio') {gasolioOption.selected = true;}
  tipoSelect.appendChild(benzinaOption);
  tipoSelect.appendChild(gasolioOption);
  tipoGroup.appendChild(tipoSelect);
  form.appendChild(tipoGroup);

  const numeroGroup = createEl('div', { classes: ['form-group'] });
  numeroGroup.appendChild(createEl('label', { text: 'Numeratore Iniziale' }));
  numeroGroup.appendChild(createEl('input', {
    attrs: {
      type: 'text',
      name: 'numero_litri',
      required: 'required',
      placeholder: 'es. 1.234,56',
      pattern: '[0-9.,]+',
      value: counterFormatted
    }
  }));
  form.appendChild(numeroGroup);

  const actions = createEl('div', { style: { display: 'flex', gap: '10px' } });
  actions.appendChild(createEl('button', {
    id: 'cancel-btn',
    classes: ['menu-button', 'btn-danger'],
    attrs: { type: 'button' },
    text: 'Annulla'
  }));
  actions.appendChild(createEl('button', {
    classes: ['menu-button', 'btn-success'],
    attrs: { type: 'submit' },
    text: isEdit ? 'Salva Modifiche' : 'Crea Pistola'
  }));
  form.appendChild(actions);

  target.appendChild(form);

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    });
  }

  const gunForm = document.getElementById('gun-form');
  if (gunForm) {
    gunForm.addEventListener('submit', async (e) => {
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
          const { error: updateError } = await safeSupabaseQuery(async () => await supabase.from('pistole').update(payload).eq('id', gunId));
          if (updateError) { throw updateError; }
          showInfoModal('Pistola aggiornata con successo!');
        } else {
          const { error: insertError } = await safeSupabaseQuery(async () => await supabase.from('pistole').insert([payload]));
          if (insertError) { throw insertError; }
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

async function showCounterEditModal(gunId: number, gunName: string, currentCounter: number, islandId: number, islandName: string, stationId: number): Promise<void> {
  openModal(`Modifica Numeratore - ${escapeHtml(gunName)}`);
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  target.innerHTML = '';

  const counterFormatted = formatGunCounter(Number(currentCounter));

  const currentBox = createEl('div', {
    style: {
      background: '#f0f9ff',
      padding: '15px',
      borderRadius: '8px',
      marginBottom: '20px',
      borderLeft: '4px solid #0284c7'
    },
    children: [
      createEl('div', { style: { fontSize: '0.875rem', color: '#0369a1', marginBottom: '5px' }, text: 'Numeratore Attuale' }),
      createEl('div', { style: { fontSize: '1.5rem', fontWeight: '700', color: '#0c4a6e' }, text: `${counterFormatted} L` })
    ]
  });
  target.appendChild(currentBox);

  const form = createEl('form', { id: 'counter-form' });

  const numeroGroup = createEl('div', { classes: ['form-group'] });
  numeroGroup.appendChild(createEl('label', { text: 'Nuovo Numeratore' }));
  numeroGroup.appendChild(createEl('input', {
    attrs: {
      type: 'text',
      name: 'numero_litri',
      required: 'required',
      placeholder: 'es. 12.345,67',
      pattern: '[0-9.,]+',
      value: counterFormatted
    },
    style: { fontSize: '1.125rem', fontWeight: '600' }
  }));
  form.appendChild(numeroGroup);

  const warningBox = createEl('div', {
    style: {
      background: '#fef3c7',
      padding: '12px',
      borderRadius: '6px',
      marginBottom: '15px',
      borderLeft: '3px solid #f59e0b'
    },
    children: [
      createEl('div', {
        style: { fontSize: '0.875rem', color: '#92400e' },
        children: [
          createIcon('fas fa-exclamation-triangle'),
          document.createTextNode(' '),
          createEl('strong', { text: 'Attenzione:' }),
          document.createTextNode(' Modificare il numeratore influenzerà i calcoli delle chiusure future.')
        ]
      })
    ]
  });
  form.appendChild(warningBox);

  const actions = createEl('div', { style: { display: 'flex', gap: '10px' } });
  actions.appendChild(createEl('button', {
    id: 'cancel-btn',
    classes: ['menu-button', 'btn-danger'],
    attrs: { type: 'button' },
    text: 'Annulla'
  }));
  actions.appendChild(createEl('button', {
    classes: ['menu-button', 'btn-success'],
    attrs: { type: 'submit' },
    text: 'Salva Numeratore'
  }));
  form.appendChild(actions);

  target.appendChild(form);

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    });
  }

  const counterForm = document.getElementById('counter-form');
  if (counterForm) {
    counterForm.addEventListener('submit', async (e) => {
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
        const { error: basicError } = await safeSupabaseQuery(async () => await supabase.from('pistole').update({ numero_litri: numeroLitri }).eq('id', gunId));
        if (basicError) { throw basicError; }

        // 2. Find latest shift_id
        let currentShiftId: number | null = null;
        try {
          const { data: lastCounters, error: lastCountersError } = await safeSupabaseQuery(async () => await supabase
            .from('shift_pistols')
            .select('shift_id')
            .order('created_at', { ascending: false })
            .limit(1)
          );

          if (lastCountersError) {throw lastCountersError;}

          const lastData = lastCounters as { shift_id: number }[];
          if (lastData && lastData.length > 0) {
            const first = lastData[0];
            if (first) {
              currentShiftId = Number(first.shift_id);
            }
          }
        } catch (err) {
          logger.warn('showCounterEditModal', 'Errore recupero ultimo shift_id: ' + (err as Error).message);
        }

        // 3. Update or Insert
        if (currentShiftId !== null) {
          const { data: existing, error: existingError } = await safeSupabaseQuery(async () => await supabase
            .from('shift_pistols')
            .select('id')
            .eq('pistola_id', gunId)
            .eq('shift_id', currentShiftId)
            .single()
          );

          if (existingError && existingError.code !== 'PGRST116') {throw existingError;}

          if (existing) {
            const { error: updateCounterError } = await safeSupabaseQuery(async () => await supabase.from('shift_pistols')
              .update({ closed_at_counter: numeroLitri })
              .eq('pistola_id', gunId)
              .eq('shift_id', currentShiftId)
            );
            if (updateCounterError) { throw updateCounterError; }
          } else {
            const { error: insertCounterError } = await safeSupabaseQuery(async () => await supabase.from('shift_pistols').insert([{
              pistola_id: gunId,
              closed_at_counter: numeroLitri,
              shift_id: currentShiftId,
              opened_at_counter: numeroLitri
            }])
            );
            if (insertCounterError) { throw insertCounterError; }
          }
        } else {
          const { error: initCounterError } = await safeSupabaseQuery(async () => await supabase.from('shift_pistols').insert([{
            pistola_id: gunId,
            closed_at_counter: numeroLitri,
            shift_id: 1, // Init with 1 if nothing exists
            opened_at_counter: numeroLitri
          }])
          );
          if (initCounterError) { throw initCounterError; }
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

async function deleteGun(gunId: number, islandId: number, islandName: string, stationId: number): Promise<void> {
  try {
    if (!await openConfirmModal('Sei sicuro di voler eliminare questa pistola?')) { return; }

    const { error: deleteError } = await safeSupabaseQuery(async () => await supabase.from('pistole').delete().eq('id', gunId));
    if (deleteError) { throw deleteError; }

    showInfoModal('Pistola eliminata con successo!');
    showGunsModal(islandId, islandName, stationId);
  } catch (err) {
    Toast.show('Errore eliminazione: ' + (err as Error).message, 'error');
  }
}
