/**
 * Operator Area - Main Entry Point
 * Refactored to use modular architecture (Router + Layout)
 */

import { store } from "./shared/state.js";
import { renderOperatorShell } from "./operator/layout.js";
import { router } from "./operator/router.js";

/**
 * Mostra il menu principale dell'operatore
 * @param {string} userId - ID dell'operatore
 * @param {string} stationId - ID della stazione
 */
export async function showOperatorMenu(userId, stationId) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  console.log('[Operator] Initializing Operator Area. User:', userId, 'Station:', stationId);

  // Ensure state is updated (if not already set by app.js)
  const user = store.getUser();
  if (user && !user.station_id && stationId) {
    user.station_id = stationId;
    store.setUser(user);
  }

  // Define handlers for the layout
  const handlers = {
    onNavigate: (view) => router.navigateTo(view),
    onOpening: () => router.navigateTo('apertura'),
    onClosure: () => router.navigateTo('chiusura')
  };

  // Render the operator shell
  await renderOperatorShell(mainContent, handlers);
}
