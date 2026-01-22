/**
 * ADMIN AREA - Bootstrap
 * Entry point for admin panel, orchestrates layout and routing
 */

import { showDashboardConfigPanel } from './admin/dashboard-config.js';
import { renderAdminShell, renderBreadcrumbs } from './admin/layout.js';
import { router, AdminTab } from './admin/router.js';
import { supabase, safeSupabaseQuery } from './core/api.js';
import { store } from './shared/state.js';
import { escapeHtml } from './utils/utils.js';
import { FuelStation } from './types.js';

/**
 * Initialize and render the admin area UI, its routing, global station filter, and related event handlers.
 *
 * Finds the main admin container (id "main-content") and aborts if absent. Infers the current user's role and
 * admin capability, initializes the admin router, renders the admin shell (wiring tab navigation and breadcrumbs),
 * and renders a header global station filter that sources stations from the store or remote and restricts options
 * for non-full-admin users. Ensures a sensible default filter for restricted users, navigates to the dashboard on
 * first load, and attaches handlers for opening the dashboard configuration panel and refreshing the dashboard when
 * configuration changes occur.
 */
export function showAdminArea(): void {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) { return; }

    const user = store.getUser();
    const userRole = user?.role || 'operator';
    const isFullAdmin = ['admin', 'super_admin', 'full_admin'].includes(userRole);

    console.log('[Admin] showAdminArea role:', userRole, 'isFullAdmin:', isFullAdmin, 'userObj:', user);

    // Initialize router with user role
    router.init(userRole);

    // Render the admin shell
    renderAdminShell(mainContent, async (tab: AdminTab) => {
        await router.navigateTo(tab);
        renderBreadcrumbs(tab);
        await renderGlobalFilter();
    });

    /**
     * Render and wire the global station filter UI inside the header actions container.
     *
     * Fetches station data into the central store if missing, builds filter options restricted to the current user's assigned stations when the user is not a full admin, initializes a default station filter for restricted users when none is set, inserts the select control into the header, and attaches a change handler that updates the store and re-navigates to the current tab.
     */
    async function renderGlobalFilter(): Promise<void> {
        const container = document.getElementById('header-actions');
        if (!container) { return; }

        let stations = store.getStations() as FuelStation[];

        if (!stations || stations.length === 0) {
            const { data } = await safeSupabaseQuery(() =>
                supabase.from('fuel_stations').select('station_id, station_name').order('station_name')
            );
            if (data) {
                store.setStations(data as any);
                stations = data as any;
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

        container.innerHTML = `
            <div class="global-filter-wrapper">
                <i class="fas fa-filter filter-icon"></i>
                <select id="global-station-filter" class="global-filter-select">
                    ${isFullAdmin ? '<option value="">Tutte le Stazioni</option>' : ''}
                    ${options.map(s => `<option value="${s.station_id}" ${finalFilter == String(s.station_id) ? 'selected' : ''}>${escapeHtml(s.station_name)}</option>`).join('')}
                </select>
            </div>
        `;

        const filterSelect = document.getElementById('global-station-filter') as HTMLSelectElement | null;
        if (filterSelect) {
            filterSelect.addEventListener('change', (e: Event) => {
                const val = (e.target as HTMLSelectElement).value;
                store.setStationFilter(val || null);
                router.navigateTo(router.getCurrentTab());
            });
        }
    }

    // Pre-initialize filter for restricted users
    if (!isFullAdmin && (user as any)?.assignedStations && (user as any).assignedStations.length > 0) {
        if (store.getFilter() === null) {
            store.setStationFilter(String((user as any).assignedStations[0].id));
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