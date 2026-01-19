import { supabase, safeSupabaseQuery } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Validators, validateForm, formatErrorMessages } from '../shared/validators.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, openModal, closeModal, setButtonLoading, openConfirmModal } from '../ui/ui.js';
import { escapeHtml } from '../utils/utils.js';

export async function showOperatorsTab(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = '<button class="action-btn primary" id="add-operator-btn"><i class="fas fa-plus"></i> Nuovo Operatore</button>';
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
      .order('created_at', { ascending: false });

    if (error) {throw error;}

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
              <th>Ruolo</th>
              <th>Distributore</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    users.forEach(u => {
      const firstLink = Array.isArray(u.user_stations) ? u.user_stations[0] : u.user_stations;
      const stationName = firstLink?.fuel_stations?.station_name || '-';
      const roleLabels = {
        'admin': 'Admin',
        'operator': 'Operatore',
        'accounting': 'Contabilità',
        'billing': 'Fatturazione'
      };
      const roleLabel = roleLabels[u.role] || u.role || 'Operatore';

      html += `
        <tr>
          <td>${escapeHtml(u.full_name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td><span class="badge role-${u.role || 'operator'}">${roleLabel}</span></td>
          <td>${escapeHtml(stationName)}</td>
          <td>
            <button class="icon-btn edit-operator" data-id="${u.user_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn assign-station" data-id="${u.user_id}" title="Assegna Stazione"><i class="fas fa-map-marker-alt"></i></button>
            <button class="icon-btn delete-operator" data-id="${u.user_id}" title="Elimina" style="color: #ff4d4d;"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.edit-operator').forEach(btn => {
      btn.addEventListener('click', () => openOperatorModal((/** @type {HTMLElement} */(btn)).dataset.id));
    });
    container.querySelectorAll('.assign-station').forEach(btn => {
      btn.addEventListener('click', () => openAssignStationModal((/** @type {HTMLElement} */(btn)).dataset.id));
    });
    container.querySelectorAll('.delete-operator').forEach(btn => {
      btn.addEventListener('click', () => deleteUser((/** @type {HTMLElement} */(btn)).dataset.id, container, actionsContainer));
    });
  } catch (err) {
    handleError(err, 'showOperatorsTab', container);
  }
}

export async function deleteUser(userId, container, actionsContainer) {
  const confirmed = await openConfirmModal('Sei sicuro di voler eliminare questo operatore? Questa azione è irreversibile e rimuoverà tutte le sue assegnazioni.');
  if (!confirmed) {
    return;
  }

  try {
    // First, delete associated user_stations records
    await safeSupabaseQuery(() => supabase.from('user_stations').delete().eq('user_id', userId));

    // Then, delete the user from the users table
    await safeSupabaseQuery(() => supabase.from('users').delete().eq('user_id', userId));

    // Optionally, if you want to delete from Supabase Auth as well (requires service role key or admin context)
    // const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    // if (authError) throw authError;

    Toast.show('Operatore eliminato con successo!', 'success');
    showOperatorsTab(container, actionsContainer); // Reload the list
  } catch (err) {
    handleError(err, 'deleteUser');
    Toast.show('Errore durante l\'eliminazione dell\'operatore.', 'error');
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
        <input type="email" name="email" value="${escapeHtml(user.email || '')}" required ${isEdit ? 'readonly' : ''}>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" required minlength="6">
      </div>` : ''}
      <div class="form-group">
        <label>Ruolo</label>
        <select name="role" class="form-control" required>
          <option value="operator" ${user.role === 'operator' || !user.role ? 'selected' : ''}>Operatore</option>
          <option value="accounting" ${user.role === 'accounting' ? 'selected' : ''}>Contabilità (Accounting)</option>
          <option value="billing" ${user.role === 'billing' ? 'selected' : ''}>Fatturazione (Billing)</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin (Full Access)</option>
        </select>
      </div>
      <button type="submit" class="menu-button primary">${isEdit ? 'Salva Modifiche' : 'Crea Utente'}</button>
    </form>
  `;

  document.getElementById('operator-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */(e.target);
    const fd = new FormData(form); // Use FormData to get values
    const email = fd.get('email')?.toString();
    const password = fd.get('password')?.toString();
    const fullName = fd.get('full_name')?.toString();
    const role = fd.get('role')?.toString();
    const submitBtn = form.querySelector('button[type="submit"]');

    const schema = {
      full_name: [Validators.required],
      role: [Validators.required]
    };
    if (!isEdit) {
      schema.email = [Validators.required, Validators.email];
      schema.password = [Validators.required, Validators.minLength(6)];
    }

    const errors = validateForm({ full_name: fullName, email, password, role }, schema);
    if (errors) {
      Toast.show('Dati non validi:\n' + formatErrorMessages(errors), 'error');
      return;
    }

    try {
      setButtonLoading(submitBtn, true, 'Salvataggio...');
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from('users').update({
          full_name: fullName,
          role: role
        }).eq('user_id', userId));
      } else {
        // Usa la Edge Function per creare l'utente senza perdere la sessione Admin
        const { data: fnData, error: fnError } = await supabase.functions.invoke('admin_create_user_v2', {
          body: { email, password, full_name: fullName, role }
        });

        if (fnError) {throw fnError;}
        if (fnData?.error) {throw new Error(fnData.error);}

        Toast.show('Utente creato con successo (email pre-confermata)!', 'success');
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

  const html = `
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
    const form = /** @type {HTMLFormElement} */(e.target);
    const stationId = (/** @type {HTMLSelectElement} */(form.elements.namedItem('station_id'))).value;
    const submitBtn = form.querySelector('button[type="submit"]');

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
