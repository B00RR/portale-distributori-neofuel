import { supabase } from "../core/api.js";
import { showLoadingMessage, openModal } from "../ui/ui.js";
import { handleError } from "../shared/error-handler.js";
import { escapeHtml } from "../utils/utils.js";

// Necessario importare le funzioni modali se sono ancora in admin.js, o spostare anche quelle.
// Per ora assumiamo che openOperatorModal e openAssignStationModal siano globali o importate.
// Ma aspetta, openOperatorModal è definita in admin.js? Controlliamo.
// Se sono in admin.js, avremo un problema di dipendenze circolari se admin.js importa operators.js e viceversa.
// Soluzione: Spostare anche le modali nei rispettivi file o in un file separato.
// Per questo step, userò window.openOperatorModal se definito in admin.js e esposto,
// oppure dovrò estrarre anche la logica delle modali.
// Vediamo admin.js: openOperatorModal è lì.
// Per fare un refactoring pulito, dovrei spostare anche openOperatorModal in questo file o in un altro.
// Dato che questo file si chiama 'operators.js', ha senso mettere tutto qui.

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

// Funzioni dummy per ora, verranno spostate o collegate dopo
// Se sono definite in admin.js e esposte su window, funzioneranno.
// Altrimenti crasherà.
// Controllo se in admin.js le espongo su window.
