/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Validators, validateForm, formatErrorMessages } from '../shared/validators.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, openModal, closeModal, setButtonLoading, openConfirmModal } from '../ui/ui.js';
import { escapeHtml } from '../utils/utils.js';

// --- INTERFACES ---

interface FuelStationNested {
    station_name: string;
}

interface UserStation {
    station_id: number;
    fuel_stations?: FuelStationNested;
}

interface User {
    user_id: string;
    full_name: string;
    email: string;
    role: 'admin' | 'super_admin' | 'operator' | 'accounting' | 'billing';
    created_at: string;

    // Joins
    user_stations?: UserStation | UserStation[]; // Can be array or single depending on query
}

interface FuelStation {
    station_id: number;
    station_name: string;
}

// --- MAIN FUNCTION ---

export async function showOperatorsTab(container: HTMLElement, actionsContainer: HTMLElement | null): Promise<void> {
    showLoadingMessage(container);

    if (actionsContainer) {
        actionsContainer.innerHTML = '<button class="action-btn primary" id="add-operator-btn"><i class="fas fa-plus"></i> Nuovo Operatore</button>';
        const addBtn = document.getElementById('add-operator-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => openOperatorModal());
        }
    }

    try {
        const { data: rawUsers, error } = await supabase
            .from('users')
            .select(`
                *,
                user_stations (
                    station_id,
                    fuel_stations ( station_name )
                )
            `)
            .order('created_at', { ascending: false });

        if (error) { throw error; }

        const users = rawUsers as User[];

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
            // Handle array or single object from join
            let firstLink: UserStation | undefined;
            if (Array.isArray(u.user_stations)) {
                firstLink = u.user_stations[0];
            } else {
                firstLink = u.user_stations;
            }

            const stationName = firstLink?.fuel_stations?.station_name || '-';

            const roleLabels: Record<string, string> = {
                'admin': 'Admin',
                'super_admin': 'Super Admin',
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

        // Bind events
        container.querySelectorAll('.edit-operator').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id;
                if (id) openOperatorModal(id);
            });
        });
        container.querySelectorAll('.assign-station').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id;
                if (id) openAssignStationModal(id);
            });
        });
        container.querySelectorAll('.delete-operator').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id;
                if (id) deleteUser(id, container, actionsContainer);
            });
        });

    } catch (err) {
        handleError(err, 'showOperatorsTab', container);
    }
}

export async function deleteUser(userId: string, container: HTMLElement, actionsContainer: HTMLElement | null): Promise<void> {
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

        (Toast as any).show('Operatore eliminato con successo!', 'success');
        showOperatorsTab(container, actionsContainer); // Reload the list
    } catch (err) {
        handleError(err, 'deleteUser');
        (Toast as any).show('Errore durante l\'eliminazione dell\'operatore.', 'error');
    }
}

export async function openOperatorModal(userId: string | null = null): Promise<void> {
    const isEdit = !!userId;
    openModal(isEdit ? 'Modifica Operatore' : 'Nuovo Operatore');
    const target = document.getElementById('modal-body');
    if (!target) return;

    let user: Partial<User> = {};
    if (userId) {
        const { data } = await supabase.from('users').select('*').eq('user_id', userId).single();
        user = (data as User) || {};
    }

    target.innerHTML = `
    <form id="operator-form">
      <div class="form-group">
        <label>Nome Completo</label>
        <input type="text" name="full_name" value="${escapeHtml(user.full_name || '')}" required>
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

    const form = document.getElementById('operator-form') as HTMLFormElement;
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form); // Use FormData to get values
            const email = fd.get('email')?.toString();
            const password = fd.get('password')?.toString();
            const fullName = fd.get('full_name')?.toString();
            const role = fd.get('role')?.toString();
            const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

            // SECURITY: Validate with Zod schema
            const { CreateUserSchema, UpdateUserSchema, safeParse } = await import('../core/schemas.js');

            let validation;
            if (isEdit) {
                validation = safeParse(UpdateUserSchema, { full_name: fullName, role });
            } else {
                validation = safeParse(CreateUserSchema, {
                    email,
                    password,
                    full_name: fullName,
                    role
                });
            }

            if (!validation.success) {
                (Toast as any).show('Dati non validi: ' + validation.error, 'error');
                return;
            }

            try {
                setButtonLoading(submitBtn, true, 'Salvataggio...');
                if (isEdit && userId) {
                    await safeSupabaseQuery(() => supabase.from('users').update({
                        full_name: validation.data.full_name,
                        role: validation.data.role
                    }).eq('user_id', userId));
                } else {
                    // Usa la Edge Function per creare l'utente senza perdere la sessione Admin
                    const { data: fnData, error: fnError } = await supabase.functions.invoke('admin_create_user_v2', {
                        body: validation.data // Already validated by Zod
                    });

                    if (fnError) { throw fnError; }
                    if (fnData?.error) { throw new Error(fnData.error); }

                    (Toast as any).show('Utente creato con successo (email pre-confermata)!', 'success');
                }
                closeModal();

                // Dispatch event for update
                const event = new CustomEvent('operators-updated');
                document.dispatchEvent(event);

                // Reload current tab if it is operators tab
                const adminContent = document.getElementById('admin-content');
                if (adminContent && adminContent.querySelector('.edit-operator')) {
                    const headerActions = document.getElementById('header-actions');
                    showOperatorsTab(adminContent, headerActions);
                }

            } catch (err) {
                handleError(err, 'admin_action');
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }
}

export async function openAssignStationModal(userId: string): Promise<void> {
    openModal('Assegna Stazione');
    const target = document.getElementById('modal-body');
    if (!target) return;

    const [stationsRes, currentRes] = await Promise.all([
        supabase.from('fuel_stations').select('*'),
        supabase.from('user_stations').select('station_id').eq('user_id', userId).maybeSingle()
    ]);

    const stations = (stationsRes.data as FuelStation[]) || [];
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

    const form = document.getElementById('assign-station-form') as HTMLFormElement;
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const stationSelect = form.elements.namedItem('station_id') as HTMLSelectElement;
            const stationId = stationSelect.value;
            const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

            try {
                setButtonLoading(submitBtn, true, 'Salvataggio...');

                // Use server-side RPC function for secure station assignment
                const { error } = await supabase.rpc('admin_assign_station', {
                    p_user_id: userId,
                    p_station_id: stationId ? parseInt(stationId, 10) : null
                });

                if (error) { throw error; }

                closeModal();
                (Toast as any).show('Assegnazione salvata', 'success');
                // Reload
                const adminContent = document.getElementById('admin-content');
                if (adminContent && adminContent.querySelector('.edit-operator')) {
                    const headerActions = document.getElementById('header-actions');
                    showOperatorsTab(adminContent, headerActions);
                }
            } catch (err) {
                handleError(err, 'admin_action');
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }
}
