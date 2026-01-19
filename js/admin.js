/**
 * ADMIN AREA - Bootstrap
 * Entry point for admin panel, orchestrates layout and routing
 */

import { loadDashboardConfig, showDashboardConfigPanel } from './admin/dashboard-config.js';
import { renderAdminShell, renderBreadcrumbs } from './admin/layout.js';
import { router } from './admin/router.js';
import { supabase, safeSupabaseQuery } from './core/api.js';
import { loggedUser } from './core/auth.js';
import { store } from './shared/state.js';
import { escapeHtml } from './utils/utils.js';

/**
 * Main entry point for Admin Area
 */
export function showAdminArea() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) {return;}

  const user = store.getUser();
  const userRole = user?.role || 'operator';
  const isFullAdmin = ['admin', 'super_admin', 'full_admin'].includes(userRole);

  console.log('[Admin] showAdminArea role:', userRole, 'isFullAdmin:', isFullAdmin, 'userObj:', user);

  // Initialize router with user role
  router.init(userRole);

  // Render the admin shell
  renderAdminShell(mainContent, async (tab) => {
    await router.navigateTo(tab);
    renderBreadcrumbs(tab);
    await renderGlobalFilter();
  });

  // Setup global filter
  async function renderGlobalFilter() {
    const container = document.getElementById('header-actions');
    if (!container) {return;}

    let stations = store.state.stations;

    if (!stations || stations.length === 0) {
      const { data } = await safeSupabaseQuery(() =>
        supabase.from('fuel_stations').select('station_id, station_name').order('station_name')
      );
      if (data) {
        store.setStations(data);
        stations = data;
      }
    }

    const assignedStations = user?.assignedStations || [];
    let options = stations || [];

    if (!isFullAdmin) {
      options = options.filter(s => assignedStations.some(as => as.id === s.station_id));
    }

    const currentFilter = store.getFilter();

    if (currentFilter === null && !isFullAdmin && options.length > 0) {
      store.setStationFilter(options[0].station_id);
    }

    const finalFilter = store.getFilter();

    container.innerHTML = `
            <div class="global-filter-wrapper">
                <i class="fas fa-filter filter-icon"></i>
                <select id="global-station-filter" class="global-filter-select">
                    ${isFullAdmin ? '<option value="">Tutte le Stazioni</option>' : ''}
                    ${options.map(s => `<option value="${s.station_id}" ${finalFilter == s.station_id ? 'selected' : ''}>${escapeHtml(s.station_name)}</option>`).join('')}
                </select>
            </div>
        `;

    const filterSelect = document.getElementById('global-station-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        const val = /** @type {HTMLSelectElement} */(e.target).value;
        const newFilter = val ? parseInt(val) : null;
        store.setStationFilter(newFilter);
        router.navigateTo(router.getCurrentTab());
      });
    }
  }

  // Pre-initialize filter for restricted users
  if (!isFullAdmin && user?.assignedStations?.length > 0) {
    if (store.getFilter() === null) {
      store.setStationFilter(user.assignedStations[0].id);
    }
  }

  // Initial load
  renderGlobalFilter();
  router.navigateTo('dashboard');
  renderBreadcrumbs('dashboard');

  // Dashboard configuration listener (delegated)
  document.getElementById('admin-content')?.addEventListener('click', (e) => {
    if (/** @type {HTMLElement} */(e.target).closest('#btn-configure-dashboard')) {
      showDashboardConfigPanel();
    }
  });

  // Listen for dashboard config changes
  document.addEventListener('dashboard-config-changed', () => {
    if (router.getCurrentTab() === 'dashboard') {
      router.navigateTo('dashboard');
    }
  });
}
