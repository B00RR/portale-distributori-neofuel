/**
 * Operator Area - Main Entry Point
 * Refactored to use modular architecture (Router + Layout)
 */

import { renderOperatorShell, OperatorHandlers } from './operator/layout.js';
import { router, OperatorView } from './operator/router.js';
import { store } from './shared/state.js';

/**
 * Initialize and display the Operator Area UI for a given operator and station.
 *
 * Synchronizes the stored user's station_id with the provided stationId when present, sets up navigation handlers for the operator layout, and renders the operator shell into the page's `main-content` container. If the container is not found, the function exits without side effects.
 *
 * @param userId - Operator identifier used for initialization context
 * @param stationId - Station identifier (may be a string or number); when present, the stored user's `station_id` will be updated to match this value
 */
export async function showOperatorMenu(userId: string, stationId: string | number): Promise<void> {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) { return; }

    console.log('[Operator] Initializing Operator Area. User:', userId, 'Station:', stationId);

    // Ensure state is updated (if not already set by app.js)
    const user = store.getUser();
    if (user && stationId) {
        // FORCE update of station_id to ensure it matches the one passed by app.js (authoritative from DB)
        const newStationId = typeof stationId === 'string' ? parseInt(stationId) : stationId;
        if (user.station_id !== newStationId) {
            console.log('[Operator] Updating stale station_id in store:', user.station_id, '->', newStationId);
            user.station_id = newStationId;
            store.setUser(user);
        }
    }

    // Define handlers for the layout
    const handlers: OperatorHandlers = {
        onNavigate: (view: OperatorView) => router.navigateTo(view),
        onOpening: (_stationId: string, _userId: string) => router.navigateTo('apertura'),
        onClosure: (_stationId: string, _userId: string) => router.navigateTo('chiusura')
    };

    // Render the operator shell
    await renderOperatorShell(mainContent, handlers);
}