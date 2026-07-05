/**
 * ADMIN AREA - Bootstrap
 * Entry point for admin panel, orchestrates layout and routing
 */

import { showDashboardConfigPanel } from './admin/dashboard-config.js';
import { renderAdminShell, renderBreadcrumbs } from './admin/layout.js';
import { router, AdminTab } from './admin/router.js';
import { supabase, safeSupabaseQuery } from './core/api.js';
import { logger } from './core/logger.js';
import { store } from './shared/state.js';
import { FuelStation } from './types.js';

/**
 * Main entry point for Admin Area
 */
export function showAdminArea(): void {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) {
    return;
  }

  const user = store.getUser();
  const userRole = user?.role || 'operator';
  const isFullAdmin = ['admin', 'super_admin', 'full_admin'].includes(userRole);

  logger.info('Admin', 'showAdminArea role: ' + userRole + ' isFullAdmin: ' + isFullAdmin);

  // Initialize router with user role
  router.init(userRole);

  // Render the admin shell
  renderAdminShell(mainContent, async (tab: AdminTab) => {
    await router.navigateTo(tab);
    renderBreadcrumbs(tab);
    await renderGlobalFilter();
  });

  // Setup global filter
  async function renderGlobalFilter(): Promise<void> {
    const container = document.getElementById('header-actions');
    if (!container) {
      return;
    }

    let stations = store.getStations() as FuelStation[];

    if (!stations || stations.length === 0) {
      const { data } = await safeSupabaseQuery(() =>
        supabase.from('fuel_stations').select('station_id, station_name').order('station_name')
      );
      if (data) {
        store.setStations(data as FuelStation[]);
        stations = data as FuelStation[];
      }
    }

    const assignedStations = user?.assignedStations || [];
    let options = stations || [];

    if (!isFullAdmin) {
      options = options.filter(s => assignedStations.some(as => as.id === s.station_id));
    }

    const currentFilter = store.getFilter();

    if (currentFilter === null && !isFullAdmin && options.length > 0 && options[0]) {
      store.setStationFilter(String(options[0].station_id));
    }

    const finalFilter = store.getFilter();

    // Use a dedicated wrapper for the filter to avoid overwriting actions
    let filterWrapper = document.getElementById('global-filter-container');
    if (!filterWrapper) {
      filterWrapper = document.createElement('div');
      filterWrapper.id = 'global-filter-container';
      container.prepend(filterWrapper); // Filter on the left, buttons on the right
    }

    // Build filter DOM safely
    filterWrapper.replaceChildren(); // clear previous
    const wrapper = document.createElement('div');
    wrapper.className = 'global-filter-wrapper';

    const icon = document.createElement('i');
    icon.className = 'fas fa-filter filter-icon';
    wrapper.appendChild(icon);

    const select = document.createElement('select');
    select.id = 'global-station-filter';
    select.className = 'global-filter-select';

    if (isFullAdmin) {
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = 'Tutte le Stazioni';
      select.appendChild(allOpt);
    }

    const finalFilterStr = finalFilter ?? '';
    options.forEach(s => {
      const opt = document.createElement('option');
      opt.value = String(s.station_id);
      opt.textContent = s.station_name;
      if (finalFilterStr === String(s.station_id)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    wrapper.appendChild(select);
    filterWrapper.appendChild(wrapper);

    select.addEventListener('change', (e: Event) => {
      const val = (e.target as HTMLSelectElement).value;
      store.setStationFilter(val || null);
      router.navigateTo(router.getCurrentTab());
    });
  }

  // Pre-initialize filter for restricted users
  if (!isFullAdmin && user?.assignedStations && user.assignedStations.length > 0) {
    const firstAssigned = user.assignedStations[0];
    if (store.getFilter() === null && firstAssigned) {
      store.setStationFilter(String(firstAssigned.id));
    }
  }

  // Initial load
  renderGlobalFilter();
  router.navigateTo('dashboard');
  renderBreadcrumbs('dashboard');

  // Dashboard configuration listener (delegated)
  const adminContent = document.getElementById('admin-content');
  adminContent?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).closest('#btn-configure-dashboard')) {
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
