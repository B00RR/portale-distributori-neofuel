import { supabase, safeSupabaseQuery } from "../core/api.js";
import { showLoadingMessage, openModal, closeModal, setButtonLoading } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml } from "../utils/utils.js";
import { Validators, validateForm, formatErrorMessages } from "../shared/validators.js";
import { Toast } from "../ui/toast.js";

export async function showOperatorsTab(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-operator-btn"><i class="fas fa-plus"></i> Nuovo Operatore</button>`;
    document.getElementById('add-operator-btn').addEventListener('click', () => openOperatorModal());
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        *,
        user_stations (
          station_id,
          fuel_stations ( station_name )
        )
      `)
      .eq('role', 'operator')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!users || users.length === 0) {
      container.innerHTML = '<p>Nessun operatore trovato.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Distributore</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    users.forEach(u => {
      const firstLink = Array.isArray(u.user_stations) ? u.user_stations[0] : u.user_stations;
      const stationName = firstLink?.fuel_stations?.station_name || '-';
      html += `
        <tr>
          <td>${escapeHtml(u.full_name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(stationName)}</td>
          <td>
            <button class="icon-btn edit-operator" data-id="${u.user_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn assign-station" data-id="${u.user_id}" title="Assegna Stazione"><i class="fas fa-map-marker-alt"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.edit-operator').forEach(btn => {
      btn.addEventListener('click', () => openOperatorModal(btn.dataset.id));
    });
    container.querySelectorAll('.assign-station').forEach(btn => {
      btn.addEventListener('click', () => openAssignStationModal(btn.dataset.id));
    });

  } catch (err) {
    handleError(err, 'showOperatorsTab', container);
  }
}

export async function openOperatorModal(userId = null) {
  const isEdit = !!userId;
  openModal(isEdit ? 'Modifica Operatore' : 'Nuovo Operatore');
  const target = document.getElementById('modal-body');

  let user = {};
  if (isEdit) {
    const { data } = await supabase.from('users').select('*').eq('user_id', userId).single();
    user = data || {};
  }

  target.innerHTML = `
    <form id="operator-form">
      <div class="form-group">
        <label>Nome Completo</label>
        <input type="text" name="full_name" value="${escapeHtml(user.full_name)}" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${escapeHtml(user.email)}" required ${isEdit ? 'readonly' : ''}>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" required minlength="6">
      </div>` : ''}
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Operatore'}</button>
    </form>
  `;

  document.getElementById('operator-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email');
    const password = fd.get('password');
    const fullName = fd.get('full_name');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const schema = {
      full_name: [Validators.required]
    };
    if (!isEdit) {
      schema.email = [Validators.required, Validators.email];
      schema.password = [Validators.required, Validators.minLength(6)];
    }

    const errors = validateForm({ full_name: fullName, email, password }, schema);
    if (errors) {
      Toast.show('Dati non validi:\n' + formatErrorMessages(errors), 'error');
      return;
    }

    try {
      setButtonLoading(submitBtn, true, 'Salvataggio...');
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from('users').update({ full_name: fullName }).eq('user_id', userId));
      } else {
        // Crea user in Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, role: 'operator' } }
        });
        if (authError) throw authError;

        if (!authData.user) throw new Error("Errore creazione utente Auth");

        // Inserimento manuale in public.users se non c'è trigger
        await safeSupabaseQuery(() => supabase.from('users').insert([{
          user_id: authData.user.id,
          email,
          full_name: fullName,
          role: 'operator'
        }]));
      }
      closeModal();
      // Reload operators tab if current
      // We can dispatch event or assume caller refreshes. 
      // Better to dispatch event for decoupling.
      const event = new CustomEvent('operators-updated');
      document.dispatchEvent(event);

      // If we are showing the tab, reload it
      const adminContent = document.getElementById('admin-content');
      if (adminContent && adminContent.querySelector('.edit-operator')) {
        showOperatorsTab(adminContent, document.getElementById('header-actions'));
      }

    } catch (err) {
      handleError(err, 'admin_action');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

export async function openAssignStationModal(userId) {
  openModal('Assegna Stazione');
  const target = document.getElementById('modal-body');

  const [stationsRes, currentRes] = await Promise.all([
    supabase.from('fuel_stations').select('*'),
    supabase.from('user_stations').select('station_id').eq('user_id', userId).maybeSingle()
  ]);

  const stations = stationsRes.data || [];
  const currentStationId = currentRes.data?.station_id;

  let html = `
    <form id="assign-station-form">
      <div class="form-group">
        <label>Seleziona Stazione</label>
        <select name="station_id" class="form-control">
          <option value="">Nessuna</option>
          ${stations.map(s => `<option value="${s.station_id}" ${s.station_id === currentStationId ? 'selected' : ''}>${escapeHtml(s.station_name)}</option>`).join('')}
        </select>
      </div>
      <button type="submit" class="menu-button primary">Salva Assegnazione</button>
    </form>
  `;
  target.innerHTML = html;

  document.getElementById('assign-station-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const stationId = e.target.station_id.value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    try {
      setButtonLoading(submitBtn, true, 'Salvataggio...');
      // Rimuovi precedente
      await supabase.from('user_stations').delete().eq('user_id', userId);

      if (stationId) {
        await safeSupabaseQuery(() => supabase.from('user_stations').insert([{ user_id: userId, station_id: stationId }]));
      }
      closeModal();
      Toast.show('Assegnazione salvata', 'success');
      // Reload
      const adminContent = document.getElementById('admin-content');
      if (adminContent && adminContent.querySelector('.edit-operator')) {
        showOperatorsTab(adminContent, document.getElementById('header-actions'));
      }
    } catch (err) {
      handleError(err, 'admin_action');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}
