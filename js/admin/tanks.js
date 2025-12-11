
import { supabase, safeSupabaseQuery, getStationName } from "../core/api.js";
import { openModal, closeModal } from "../ui/ui.js";
import { escapeHtml, formatNumberIt } from "../utils/utils.js";
import { Toast } from "../ui/toast.js";
import { handleError } from "../shared/error-handler.js";

export async function showTanksAdminModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Gestione Cisterne - ${escapeHtml(stationName)}`);
  const target = document.getElementById('modal-body');

  const renderTanks = async () => {
    target.innerHTML = '<p class="loading-text">Caricamento cisterne e connessioni...</p>';

    const [tanksResult, linksResult, pumpsResult] = await Promise.all([
      supabase
        .from('tanks')
        .select('*')
        .eq('station_id', stationId)
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
        .eq('station_id', stationId)
        .order('pump_id'),
      supabase
        .from('pistole')
        .select('id, nome, tipo_carburante, islands!inner(island_id, nome, station_id)')
        .eq('islands.station_id', stationId)
        .order('nome')
    ]);

    const { data: tanks, error: tanksError } = tanksResult;
    if (tanksError) {
      handleError(tanksError, 'renderTanks', target);
      return;
    }

    let tankLinks = linksResult?.data || [];
    if (linksResult?.error) {
      if (linksResult.error.code && linksResult.error.code !== '42P01') {
        handleError(linksResult.error, 'renderTanks_links', target);
        return;
      }
      tankLinks = [];
    }

    const { data: pumps, error: pumpsError } = pumpsResult;
    if (pumpsError) {
      handleError(pumpsError, 'renderTanks_pumps', target);
      return;
    }

    const formatPumpLabel = (pump) => {
      const labelParts = [
        pump?.nome || `Pistola #${pump?.id}`,
        pump?.islands?.nome ? `Isola ${pump.islands.nome}` : null,
        pump?.tipo_carburante ? pump.tipo_carburante.toUpperCase() : null
      ].filter(Boolean);
      return labelParts.join(' · ');
    };

    const tanksList = Array.isArray(tanks) && tanks.length
      ? tanks.map(t => `
          <li class="list-item tank-row">
            <div>
              <strong>${escapeHtml(t.name)}</strong>
              <span class="badge badge-info">${escapeHtml(t.fuel_type)}</span>
              <span class="tank-meta">Capacità: ${formatNumberIt(t.capacity)} L</span>
            </div>
            <button class="icon-btn delete-tank" data-id="${t.id}" title="Elimina">
              <i class="fas fa-trash"></i>
            </button>
          </li>
        `).join('')
      : '<p>Nessuna cisterna configurata.</p>';

    const linkRows = Array.isArray(tankLinks) && tankLinks.length
      ? tankLinks.map(link => {
        const pumpLabel = formatPumpLabel(link.pistole || {});
        const tankLabel = link.tanks?.name ? `${link.tanks.name} (${link.tanks.fuel_type || '-'})` : `Cisterna #${link.tank_id}`;
        const modeBadge = link.mode === 'manual'
          ? '<span class="badge badge-warning">Manuale</span>'
          : '<span class="badge badge-info">Automatica</span>';
        const metaValue = link.mode === 'manual'
          ? `Priorità ${link.priority || 1}`
          : `${link.ratio || 0}%`;
        const statusBadge = link.is_active
          ? '<span class="badge badge-success">Attiva</span>'
          : '<span class="badge badge-muted">Disattiva</span>';
        const noteText = link.notes ? `<div class="tank-link-note">${escapeHtml(link.notes)}</div>` : '';
        return `
            <tr>
              <td>${escapeHtml(pumpLabel)}</td>
              <td>${escapeHtml(tankLabel)}</td>
              <td>${modeBadge}</td>
              <td>${escapeHtml(metaValue)}</td>
              <td>${statusBadge}</td>
              <td>
                <div class="table-actions">
                  <button class="icon-btn tank-link-toggle" data-id="${link.id}" data-active="${link.is_active}" title="Attiva/Disattiva">
                    <i class="fas ${link.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                  </button>
                  <button class="icon-btn tank-link-delete" data-id="${link.id}" title="Rimuovi Associazione">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                ${noteText}
              </td>
            </tr>
          `;
      }).join('')
      : '<tr><td colspan="6">Nessuna associazione configurata.</td></tr>';

    const pumpOptions = Array.isArray(pumps) && pumps.length
      ? pumps.map(p => `<option value="${p.id}">${escapeHtml(formatPumpLabel(p))}</option>`).join('')
      : '<option value="">Nessuna pistola disponibile</option>';

    const tankOptions = Array.isArray(tanks) && tanks.length
      ? tanks.map(t => `<option value="${t.id}">${escapeHtml(`${t.name} (${t.fuel_type || '-'})`)}</option>`).join('')
      : '<option value="">Nessuna cisterna disponibile</option>';

    const formDisabled = !(pumps?.length && tanks?.length);

    target.innerHTML = `
      <div class="tanks-list">
        <h4>Cisterne Esistenti</h4>
        <ul class="list-group">
          ${tanksList}
        </ul>
      </div>

      <div class="add-tank-form content-box">
        <h4>Aggiungi Nuova Cisterna</h4>
        <form id="add-tank-form">
          <div class="form-row">
            <div class="form-group">
              <label>Nome (es. Cisterna 1)</label>
              <input type="text" name="name" required placeholder="Cisterna 1">
            </div>
            <div class="form-group">
              <label>Tipo Carburante</label>
              <select name="fuel_type" required>
                <option value="Benzina">Benzina</option>
                <option value="Gasolio">Gasolio</option>
                <option value="AdBlue">AdBlue</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Capacità Totale (Litri)</label>
            <input type="number" name="capacity" required min="0" step="1">
          </div>
          <button type="submit" class="menu-button success small-btn">Aggiungi Cisterna</button>
        </form>
      </div>

      <div class="content-box tank-links-section">
        <div class="section-header">
          <div>
            <h4>Associazioni Pistole ↔︎ Cisterne</h4>
            <p class="section-subtitle">Configura se una pistola attinge automaticamente da più serbatoi o se richiede la scelta dell'operatore.</p>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table tank-links-table">
            <thead>
              <tr>
                <th>Pistola</th>
                <th>Cisterna</th>
                <th>Modalità</th>
                <th>Ripartizione / Priorità</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              ${linkRows}
            </tbody>
          </table>
        </div>

        <form id="tank-link-form" class="tank-link-form ${formDisabled ? 'form-disabled' : ''}">
          <h5>${formDisabled ? 'Configura almeno una pistola e una cisterna per creare un\'associazione' : 'Crea nuova associazione'}</h5>
          <div class="form-row">
            <div class="form-group">
              <label>Pistola</label>
              <select name="pump_id" ${!pumps?.length ? 'disabled' : ''} required>
                ${pumpOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Cisterna</label>
              <select name="tank_id" ${!tanks?.length ? 'disabled' : ''} required>
                ${tankOptions}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Modalità</label>
              <select name="mode" id="tank-link-mode" ${formDisabled ? 'disabled' : ''}>
                <option value="auto">Automatica (ripartizione)</option>
                <option value="manual">Manuale (scelta operatore)</option>
              </select>
            </div>
            <div class="form-group" data-role="ratio-group">
              <label>Percentuale (automatica)</label>
              <input type="number" name="ratio" value="100" min="1" max="100" step="1" ${formDisabled ? 'disabled' : ''}>
            </div>
            <div class="form-group" data-role="priority-group" style="display:none;">
              <label>Priorità manuale</label>
              <input type="number" name="priority" value="1" min="1" step="1" ${formDisabled ? 'disabled' : ''}>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group checkbox-group">
              <label class="checkbox">
                <input type="checkbox" name="is_active" ${formDisabled ? 'disabled' : ''} checked>
                Associazione attiva
              </label>
            </div>
            <div class="form-group" style="flex:2;">
              <label>Note (opzionale)</label>
              <input type="text" name="notes" placeholder="Es. Devia verso cisterna 2 in caso di scorta">
            </div>
          </div>
          <button type="submit" class="menu-button primary small-btn" ${formDisabled ? 'disabled' : ''}>
            <i class="fas fa-plug"></i> Salva Associazione
          </button>
        </form>
      </div>
    `;

    // Listeners per cisterne
    target.querySelectorAll('.delete-tank').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Eliminare questa cisterna?')) return;
        await safeSupabaseQuery(() => supabase.from('tanks').delete().eq('id', btn.dataset.id));
        renderTanks();
      });
    });

    const addTankForm = document.getElementById('add-tank-form');
    addTankForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        station_id: stationId,
        name: fd.get('name'),
        fuel_type: fd.get('fuel_type'),
        capacity: parseFloat(fd.get('capacity'))
      };

      try {
        await safeSupabaseQuery(() => supabase.from('tanks').insert([payload]));
        e.target.reset();
        renderTanks();
      } catch (err) {
        handleError(err, 'addTank');
      }
    });

    // Gestione associazioni
    const linkForm = document.getElementById('tank-link-form');
    const modeSelect = document.getElementById('tank-link-mode');
    const ratioGroup = linkForm?.querySelector('[data-role="ratio-group"]');
    const priorityGroup = linkForm?.querySelector('[data-role="priority-group"]');

    const refreshModeFields = () => {
      if (!modeSelect || !ratioGroup || !priorityGroup) return;
      const mode = modeSelect.value;
      const isFormDisabled = linkForm?.classList.contains('form-disabled');
      const ratioInput = ratioGroup.querySelector('input');
      const priorityInput = priorityGroup.querySelector('input');
      if (mode === 'manual') {
        ratioGroup.style.display = 'none';
        if (ratioInput) ratioInput.disabled = true;
        priorityGroup.style.display = 'block';
        if (priorityInput) priorityInput.disabled = isFormDisabled ? true : false;
      } else {
        ratioGroup.style.display = 'block';
        if (ratioInput) ratioInput.disabled = isFormDisabled ? true : false;
        priorityGroup.style.display = 'none';
        if (priorityInput) priorityInput.disabled = true;
      }
    };

    modeSelect?.addEventListener('change', refreshModeFields);
    refreshModeFields();

    linkForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const mode = fd.get('mode');
      const payload = {
        station_id: stationId,
        pump_id: parseInt(fd.get('pump_id'), 10),
        tank_id: parseInt(fd.get('tank_id'), 10),
        mode,
        ratio: mode === 'auto' ? (parseFloat(fd.get('ratio')) || 0) : null,
        priority: mode === 'manual' ? (parseInt(fd.get('priority'), 10) || 1) : null,
        is_active: fd.get('is_active') !== null,
        notes: fd.get('notes')?.trim() || null
      };

      try {
        await safeSupabaseQuery(() => supabase.from('tank_pump_links').insert([payload]));
        e.target.reset();
        refreshModeFields();
        renderTanks();
      } catch (err) {
        handleError(err, 'addTankLink');
      }
    });

    // Toggle stato associazione
    target.querySelectorAll('.tank-link-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const current = btn.dataset.active === 'true';
        await safeSupabaseQuery(() => supabase.from('tank_pump_links').update({ is_active: !current }).eq('id', id));
        renderTanks();
      });
    });

    // Elimina associazione
    target.querySelectorAll('.tank-link-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Rimuovere questa associazione pistola/cisterna?')) return;
        await safeSupabaseQuery(() => supabase.from('tank_pump_links').delete().eq('id', btn.dataset.id));
        renderTanks();
      });
    });
  };

  renderTanks();
}

export async function showTanksTab(container, headerActions) {
  if (headerActions) headerActions.innerHTML = '';
  container.innerHTML = `
        <div class="content-box">
            <h3>Gestione Cisterne</h3>
            <p>Seleziona un distributore dalla sezione "Distributori" per gestirne le cisterne.</p>
            <button class="menu-button primary" onclick="document.querySelector('[data-tab=\\'stations\\']').click()">Vai a Distributori</button>
        </div>
    `;
}
