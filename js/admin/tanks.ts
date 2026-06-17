import { supabase, safeSupabaseQuery, getStationName } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { openModal, openConfirmModal } from '../ui/ui.js';
import { escapeHtml, formatNumberIt } from '../utils/utils.js';

// --- INTERFACES ---

type FuelType = 'Benzina' | 'Gasolio' | 'AdBlue' | string;

interface Tank {
  id: number;
  station_id: number;
  name: string;
  fuel_type: FuelType;
  capacity: number;
}

interface IslandNested {
  island_id: number;
  nome: string;
  station_id: number;
}

interface Pump {
  id: number;
  nome: string;
  tipo_carburante: FuelType;
  islands?: IslandNested;
}

type LinkMode = 'auto' | 'manual';

interface TankPumpLink {
  id: number;
  station_id: number;
  tank_id: number;
  pump_id: number;
  mode: LinkMode;
  ratio: number | null;
  priority: number | null;
  is_active: boolean;
  notes: string | null;

  // Joins
  tanks?: Tank;
  pistole?: Pump;
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
    children?: (Node | HTMLElement)[];
  } = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.id) { el.id = options.id; }
  if (options.classes) { el.classList.add(...options.classes.filter(Boolean)); }
  if (options.text !== undefined) { el.textContent = options.text; }
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

function formatPumpLabel(pump: Partial<Pump>): string {
  const labelParts = [
    pump.nome || `Pistola #${pump.id}`,
    pump.islands?.nome ? `Isola ${pump.islands.nome}` : null,
    pump.tipo_carburante ? pump.tipo_carburante.toUpperCase() : null
  ].filter(Boolean);
  return labelParts.join(' · ');
}

function renderTanksAdminContent(
  target: HTMLElement,
  tanksData: Tank[],
  pumpsData: Pump[],
  tankLinks: TankPumpLink[]
): void {
  target.textContent = '';

  const tanksListSection = createEl('div', {
    classes: ['tanks-list'],
    children: [createEl('h4', { text: 'Cisterne Esistenti' })]
  });

  const tanksUl = createEl('ul', { classes: ['list-group'] });

  if (tanksData.length) {
    tanksData.forEach(t => {
      const li = createEl('li', { classes: ['list-item', 'tank-row'] });
      const infoDiv = createEl('div');
      infoDiv.appendChild(createEl('strong', { text: t.name }));
      infoDiv.appendChild(createEl('span', { classes: ['badge', 'badge-info'], text: t.fuel_type }));
      infoDiv.appendChild(createEl('span', {
        classes: ['tank-meta'],
        text: `Capacità: ${formatNumberIt(t.capacity)} L`
      }));
      li.appendChild(infoDiv);

      const deleteBtn = createEl('button', {
        classes: ['icon-btn', 'delete-tank'],
        attrs: { title: 'Elimina' },
        dataset: { id: String(t.id) }
      });
      deleteBtn.appendChild(createIcon('fas fa-trash'));
      li.appendChild(deleteBtn);

      tanksUl.appendChild(li);
    });
  } else {
    tanksUl.appendChild(createEl('p', { text: 'Nessuna cisterna configurata.' }));
  }

  tanksListSection.appendChild(tanksUl);

  const addTankFormDiv = createEl('div', { classes: ['add-tank-form', 'content-box'] });
  addTankFormDiv.appendChild(createEl('h4', { text: 'Aggiungi Nuova Cisterna' }));

  const addForm = createEl('form', { id: 'add-tank-form' });

  const nameGroup = createEl('div', { classes: ['form-group'] });
  nameGroup.appendChild(createEl('label', { text: 'Nome (es. Cisterna 1)' }));
  nameGroup.appendChild(createEl('input', {
    attrs: {
      type: 'text',
      name: 'name',
      required: 'required',
      placeholder: 'Cisterna 1'
    }
  }));

  const fuelGroup = createEl('div', { classes: ['form-group'] });
  fuelGroup.appendChild(createEl('label', { text: 'Tipo Carburante' }));
  const fuelSelect = createEl('select', { attrs: { name: 'fuel_type', required: 'required' } });
  fuelSelect.appendChild(createEl('option', { attrs: { value: 'Benzina' }, text: 'Benzina' }));
  fuelSelect.appendChild(createEl('option', { attrs: { value: 'Gasolio' }, text: 'Gasolio' }));
  fuelSelect.appendChild(createEl('option', { attrs: { value: 'AdBlue' }, text: 'AdBlue' }));
  fuelGroup.appendChild(fuelSelect);

  const row1 = createEl('div', { classes: ['form-row'] });
  row1.appendChild(nameGroup);
  row1.appendChild(fuelGroup);
  addForm.appendChild(row1);

  const capGroup = createEl('div', { classes: ['form-group'] });
  capGroup.appendChild(createEl('label', { text: 'Capacità Totale (Litri)' }));
  capGroup.appendChild(createEl('input', {
    attrs: {
      type: 'number',
      name: 'capacity',
      required: 'required',
      min: '0',
      step: '1'
    }
  }));
  addForm.appendChild(capGroup);

  addForm.appendChild(createEl('button', {
    classes: ['menu-button', 'success', 'small-btn'],
    attrs: { type: 'submit' },
    text: 'Aggiungi Cisterna'
  }));

  addTankFormDiv.appendChild(addForm);

  const formDisabled = !(pumpsData.length && tanksData.length);

  const tankLinksSection = createEl('div', { classes: ['content-box', 'tank-links-section'] });

  const headerDiv = createEl('div', { classes: ['section-header'] });
  const headerTextDiv = createEl('div');
  headerTextDiv.appendChild(createEl('h4', { text: 'Associazioni Pistole ↔︎ Cisterne' }));
  headerTextDiv.appendChild(createEl('p', {
    classes: ['section-subtitle'],
    text: 'Configura se una pistola attinge automaticamente da più serbatoi o se richiede la scelta dell\'operatore.'
  }));
  headerDiv.appendChild(headerTextDiv);
  tankLinksSection.appendChild(headerDiv);

  const tableResponsive = createEl('div', { classes: ['table-responsive'] });
  const table = createEl('table', { classes: ['admin-table', 'tank-links-table'] });
  const thead = createEl('thead');
  const headerTr = createEl('tr');
  ['Pistola', 'Cisterna', 'Modalità', 'Ripartizione / Priorità', 'Stato', 'Azioni'].forEach(h => {
    headerTr.appendChild(createEl('th', { text: h }));
  });
  thead.appendChild(headerTr);
  table.appendChild(thead);

  const tbody = createEl('tbody');

  if (tankLinks.length) {
    tankLinks.forEach(link => {
      const tr = createEl('tr');

      const pumpLabel = formatPumpLabel(link.pistole || {});
      const tankLabel = link.tanks?.name
        ? `${link.tanks.name} (${link.tanks.fuel_type || '-'})`
        : `Cisterna #${link.tank_id}`;

      tr.appendChild(createEl('td', { text: pumpLabel }));
      tr.appendChild(createEl('td', { text: tankLabel }));

      const modeTd = createEl('td');
      modeTd.appendChild(createEl('span', {
        classes: ['badge', link.mode === 'manual' ? 'badge-warning' : 'badge-info'],
        text: link.mode === 'manual' ? 'Manuale' : 'Automatica'
      }));
      tr.appendChild(modeTd);

      tr.appendChild(createEl('td', {
        text: link.mode === 'manual' ? `Priorità ${link.priority || 1}` : `${link.ratio || 0}%`
      }));

      const statusTd = createEl('td');
      statusTd.appendChild(createEl('span', {
        classes: ['badge', link.is_active ? 'badge-success' : 'badge-muted'],
        text: link.is_active ? 'Attiva' : 'Disattiva'
      }));
      tr.appendChild(statusTd);

      const actionsTd = createEl('td');
      const actionsDiv = createEl('div', { classes: ['table-actions'] });

      const toggleBtn = createEl('button', {
        classes: ['icon-btn', 'tank-link-toggle'],
        attrs: { title: 'Attiva/Disattiva' },
        dataset: { id: String(link.id), active: String(link.is_active) }
      });
      toggleBtn.appendChild(createIcon(link.is_active ? 'fas fa-toggle-on' : 'fas fa-toggle-off'));
      actionsDiv.appendChild(toggleBtn);

      const deleteLinkBtn = createEl('button', {
        classes: ['icon-btn', 'tank-link-delete'],
        attrs: { title: 'Rimuovi Associazione' },
        dataset: { id: String(link.id) }
      });
      deleteLinkBtn.appendChild(createIcon('fas fa-trash'));
      actionsDiv.appendChild(deleteLinkBtn);

      actionsTd.appendChild(actionsDiv);

      if (link.notes) {
        actionsTd.appendChild(createEl('div', { classes: ['tank-link-note'], text: link.notes }));
      }

      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
  } else {
    const emptyTr = createEl('tr');
    const emptyTd = createEl('td', {
      attrs: { colspan: '6' },
      text: 'Nessuna associazione configurata.'
    });
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
  }

  table.appendChild(tbody);
  tableResponsive.appendChild(table);
  tankLinksSection.appendChild(tableResponsive);

  const linkForm = createEl('form', {
    id: 'tank-link-form',
    classes: ['tank-link-form', formDisabled ? 'form-disabled' : '']
  });

  linkForm.appendChild(createEl('h5', {
    text: formDisabled
      ? 'Configura almeno una pistola e una cisterna per creare un\'associazione'
      : 'Crea nuova associazione'
  }));

  const pumpGroup = createEl('div', { classes: ['form-group'] });
  pumpGroup.appendChild(createEl('label', { text: 'Pistola' }));
  const pumpSelect = createEl('select', {
    attrs: {
      name: 'pump_id',
      required: 'required',
      ...(pumpsData.length ? {} : { disabled: 'disabled' })
    }
  });
  if (pumpsData.length) {
    pumpsData.forEach(p => {
      pumpSelect.appendChild(createEl('option', {
        attrs: { value: String(p.id) },
        text: formatPumpLabel(p)
      }));
    });
  } else {
    pumpSelect.appendChild(createEl('option', { attrs: { value: '' }, text: 'Nessuna pistola disponibile' }));
  }
  pumpGroup.appendChild(pumpSelect);

  const tankGroup = createEl('div', { classes: ['form-group'] });
  tankGroup.appendChild(createEl('label', { text: 'Cisterna' }));
  const tankSelect = createEl('select', {
    attrs: {
      name: 'tank_id',
      required: 'required',
      ...(tanksData.length ? {} : { disabled: 'disabled' })
    }
  });
  if (tanksData.length) {
    tanksData.forEach(t => {
      tankSelect.appendChild(createEl('option', {
        attrs: { value: String(t.id) },
        text: `${t.name} (${t.fuel_type || '-'})`
      }));
    });
  } else {
    tankSelect.appendChild(createEl('option', { attrs: { value: '' }, text: 'Nessuna cisterna disponibile' }));
  }
  tankGroup.appendChild(tankSelect);

  const rowPumpTank = createEl('div', { classes: ['form-row'] });
  rowPumpTank.appendChild(pumpGroup);
  rowPumpTank.appendChild(tankGroup);
  linkForm.appendChild(rowPumpTank);

  const modeGroup = createEl('div', { classes: ['form-group'] });
  modeGroup.appendChild(createEl('label', { text: 'Modalità' }));
  const modeSelect = createEl('select', { attrs: { name: 'mode', id: 'tank-link-mode' } });
  if (formDisabled) { modeSelect.setAttribute('disabled', 'disabled'); }
  modeSelect.appendChild(createEl('option', { attrs: { value: 'auto' }, text: 'Automatica (ripartizione)' }));
  modeSelect.appendChild(createEl('option', { attrs: { value: 'manual' }, text: 'Manuale (scelta operatore)' }));
  modeGroup.appendChild(modeSelect);

  const ratioGroup = createEl('div', { classes: ['form-group'], attrs: { 'data-role': 'ratio-group' } });
  ratioGroup.appendChild(createEl('label', { text: 'Percentuale (automatica)' }));
  const ratioInput = createEl('input', {
    attrs: { type: 'number', name: 'ratio', value: '100', min: '1', max: '100', step: '1' }
  });
  if (formDisabled) { ratioInput.setAttribute('disabled', 'disabled'); }
  ratioGroup.appendChild(ratioInput);

  const priorityGroup = createEl('div', {
    classes: ['form-group'],
    attrs: { 'data-role': 'priority-group' },
    style: { display: 'none' }
  });
  priorityGroup.appendChild(createEl('label', { text: 'Priorità manuale' }));
  const priorityInput = createEl('input', {
    attrs: { type: 'number', name: 'priority', value: '1', min: '1', step: '1' }
  });
  if (formDisabled) { priorityInput.setAttribute('disabled', 'disabled'); }
  priorityGroup.appendChild(priorityInput);

  const rowMode = createEl('div', { classes: ['form-row'] });
  rowMode.appendChild(modeGroup);
  rowMode.appendChild(ratioGroup);
  rowMode.appendChild(priorityGroup);
  linkForm.appendChild(rowMode);

  const checkboxGroup = createEl('div', { classes: ['form-group', 'checkbox-group'] });
  const checkboxLabel = createEl('label', { classes: ['checkbox'] });
  const checkboxInput = createEl('input', { attrs: { type: 'checkbox', name: 'is_active' } });
  if (formDisabled) { checkboxInput.setAttribute('disabled', 'disabled'); }
  checkboxInput.checked = true;
  checkboxLabel.appendChild(checkboxInput);
  checkboxLabel.appendChild(document.createTextNode(' Associazione attiva'));
  checkboxGroup.appendChild(checkboxLabel);

  const notesGroup = createEl('div', { classes: ['form-group'], style: { flex: '2' } });
  notesGroup.appendChild(createEl('label', { text: 'Note (opzionale)' }));
  notesGroup.appendChild(createEl('input', {
    attrs: {
      type: 'text',
      name: 'notes',
      placeholder: 'Es. Devia verso cisterna 2 in caso di scorta'
    }
  }));

  const rowCheckNotes = createEl('div', { classes: ['form-row'] });
  rowCheckNotes.appendChild(checkboxGroup);
  rowCheckNotes.appendChild(notesGroup);
  linkForm.appendChild(rowCheckNotes);

  const saveBtn = createEl('button', {
    classes: ['menu-button', 'primary', 'small-btn'],
    attrs: { type: 'submit' },
    children: [createIcon('fas fa-plug'), document.createTextNode(' Salva Associazione')]
  });
  if (formDisabled) { saveBtn.setAttribute('disabled', 'disabled'); }
  linkForm.appendChild(saveBtn);

  tankLinksSection.appendChild(linkForm);

  target.appendChild(tanksListSection);
  target.appendChild(addTankFormDiv);
  target.appendChild(tankLinksSection);
}

// --- MAIN FUNCTIONS ---

export async function showTanksAdminModal(stationId: number | string): Promise<void> {
  const stationIdNum = Number(stationId);
  const stationName = await getStationName(stationId);
  openModal(`Gestione Cisterne - ${escapeHtml(stationName)}`);
  const target = document.getElementById('modal-body');
  if (!target) { return; }

  const renderTanks = async (): Promise<void> => {
    const loadingP = createEl('p', { classes: ['loading-text'], text: 'Caricamento cisterne e connessioni...' });
    target.textContent = '';
    target.appendChild(loadingP);

    try {
      const [tanksResult, linksResult, pumpsResult] = await Promise.all([
        supabase
          .from('tanks')
          .select('*')
          .eq('station_id', stationIdNum)
          .order('name'),
        supabase
          .from('tank_pump_links')
          .select(`
                      id,
                      station_id,
                      tank_id,
                      pump_id,
                      mode,
                      ratio,
                      priority,
                      is_active,
                      notes,
                      tanks ( id, name, fuel_type ),
                      pistole ( id, nome, tipo_carburante, islands(nome) )
                    `)
          .eq('station_id', stationIdNum)
          .order('pump_id'),
        supabase
          .from('pistole')
          .select('id, nome, tipo_carburante, islands!inner(island_id, nome, station_id)')
          .eq('islands.station_id', stationIdNum)
          .order('nome')
      ]);

      const { data: tanks, error: tanksError } = tanksResult;
      if (tanksError) {
        handleError(tanksError, 'renderTanks', target);
        return;
      }

      let tankLinks: TankPumpLink[] = [];
      if (linksResult.data) {
        tankLinks = linksResult.data as unknown as TankPumpLink[];
      }
      if (linksResult.error) {
        if (linksResult.error.code !== '42P01') {
          handleError(linksResult.error, 'renderTanks_links', target);
          tankLinks = [];
        }
      }

      const { data: pumps, error: pumpsError } = pumpsResult;
      if (pumpsError) {
        handleError(pumpsError, 'renderTanks_pumps', target);
        return;
      }

      const tanksData = (tanks ?? []) as Tank[];
      const pumpsData = (pumps ?? []) as Pump[];

      renderTanksAdminContent(target, tanksData, pumpsData, tankLinks);

      // Listeners per cisterne
      target.querySelectorAll('.delete-tank').forEach(btnElement => {
        const btn = btnElement as HTMLElement;
        btn.addEventListener('click', async () => {
          const confirmed = await openConfirmModal('Eliminare questa cisterna?');
          if (!confirmed) { return; }
          const id = btn.dataset.id;
          if (id) {
            await safeSupabaseQuery(() => supabase.from('tanks').delete().eq('id', Number(id)));
            renderTanks();
          }
        });
      });

      const addTankForm = document.getElementById('add-tank-form');
      addTankForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const fd = new FormData(form);
        const payload = {
          station_id: stationIdNum,
          name: fd.get('name')?.toString() || '',
          fuel_type: fd.get('fuel_type')?.toString() || '',
          capacity: parseFloat(fd.get('capacity')?.toString() || '0')
        };

        try {
          await safeSupabaseQuery(() => supabase.from('tanks').insert([payload]));
          form.reset();
          renderTanks();
        } catch (err) {
          handleError(err, 'addTank');
        }
      });

      // Gestione associazioni
      const linkForm = document.getElementById('tank-link-form');
      const modeSelect = document.getElementById('tank-link-mode') as HTMLSelectElement;
      const ratioGroup = linkForm?.querySelector('[data-role="ratio-group"]') as HTMLElement;
      const priorityGroup = linkForm?.querySelector('[data-role="priority-group"]') as HTMLElement;

      const refreshModeFields = (): void => {
        if (!modeSelect || !ratioGroup || !priorityGroup) { return; }
        const mode = modeSelect.value;
        const isFormDisabled = linkForm?.classList.contains('form-disabled');
        const ratioInput = ratioGroup.querySelector('input');
        const priorityInput = priorityGroup.querySelector('input');

        if (mode === 'manual') {
          ratioGroup.style.display = 'none';
          if (ratioInput) { ratioInput.disabled = true; }
          priorityGroup.style.display = 'block';
          if (priorityInput) { priorityInput.disabled = isFormDisabled ? true : false; }
        } else {
          ratioGroup.style.display = 'block';
          if (ratioInput) { ratioInput.disabled = isFormDisabled ? true : false; }
          priorityGroup.style.display = 'none';
          if (priorityInput) { priorityInput.disabled = true; }
        }
      };

      modeSelect?.addEventListener('change', refreshModeFields);
      refreshModeFields();

      linkForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const fd = new FormData(form);
        const mode = fd.get('mode')?.toString() || 'auto';
        const payload = {
          station_id: stationIdNum,
          pump_id: parseInt(fd.get('pump_id')?.toString() || '0', 10),
          tank_id: parseInt(fd.get('tank_id')?.toString() || '0', 10),
          mode,
          ratio: mode === 'auto' ? (parseFloat(fd.get('ratio')?.toString() || '0') || 0) : null,
          priority: mode === 'manual' ? (parseInt(fd.get('priority')?.toString() || '0', 10) || 1) : null,
          is_active: fd.get('is_active') !== null,
          notes: fd.get('notes')?.toString().trim() || null
        };

        try {
          await safeSupabaseQuery(() => supabase.from('tank_pump_links').insert([payload]));
          form.reset();
          refreshModeFields();
          renderTanks();
        } catch (err) {
          handleError(err, 'addTankLink');
        }
      });

      // Toggle stato associazione
      target.querySelectorAll('.tank-link-toggle').forEach(btnElement => {
        const btn = btnElement as HTMLElement;
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const current = btn.dataset.active === 'true';
          if (id) {
            await safeSupabaseQuery(() => supabase.from('tank_pump_links').update({ is_active: !current }).eq('id', Number(id)));
            renderTanks();
          }
        });
      });

      // Elimina associazione
      target.querySelectorAll('.tank-link-delete').forEach(btnElement => {
        const btn = btnElement as HTMLElement;
        btn.addEventListener('click', async () => {
          const confirmed = await openConfirmModal('Rimuovere questa associazione pistola/cisterna?');
          if (!confirmed) { return; }
          const id = btn.dataset.id;
          if (id) {
            await safeSupabaseQuery(() => supabase.from('tank_pump_links').delete().eq('id', Number(id)));
            renderTanks();
          }
        });
      });

    } catch (err) {
      handleError(err, 'renderTanks_main', target);
    }
  };

  await renderTanks();
}

export async function showTanksTab(container: HTMLElement, headerActions: HTMLElement | null): Promise<void> {
  if (headerActions) { headerActions.textContent = ''; }
  const wrapper = createEl('div', { classes: ['content-box'] });
  wrapper.appendChild(createEl('h3', { text: 'Gestione Cisterne' }));
  wrapper.appendChild(createEl('p', {
    text: 'Seleziona un distributore dalla sezione "Distributori" per gestirne le cisterne.'
  }));
  const gotoBtn = createEl('button', {
    classes: ['menu-button', 'primary'],
    text: 'Vai a Distributori'
  });
  gotoBtn.addEventListener('click', () => {
    document.querySelector('[data-tab="stations"]')?.dispatchEvent(new Event('click'));
  });
  wrapper.appendChild(gotoBtn);
  container.textContent = '';
  container.appendChild(wrapper);
}
