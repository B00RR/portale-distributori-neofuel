/**
 * Operator Area - Main Entry Point
 * Refactored to use modular architecture (Router + Layout)
 */

import { logger } from './core/logger.js';
import './operator/offline-financial-executors-v2.js';
import { renderOperatorShell, OperatorHandlers } from './operator/layout.js';
import { checkOpeningStatus } from './operator/opening.js';
import { router, OperatorView, isOperatorView } from './operator/router.js';
import { setSelectedOperatorStation } from './operator/station-context.js';
import { getCurrentRoute, onHashChange } from './shared/hash-router.js';
import { store } from './shared/state.js';

let unsubscribeHashListener: (() => void) | null = null;

/**
 * Mostra il menu principale dell'operatore
 * @param userId - ID dell'operatore
 * @param stationId - ID della stazione
 */
export async function showOperatorMenu(_userId: string, stationId: string | number): Promise<void> {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) {
    return;
  }

  const selectedStationId = setSelectedOperatorStation(stationId) ?? String(stationId);

  // Ensure state is updated (if not already set by app.js)
  const user = store.getUser();
  if (user && selectedStationId) {
    // FORCE update of station_id to ensure it matches the selected operator context.
    if (String(user.station_id) !== selectedStationId) {
      store.setUser({ ...user, station_id: selectedStationId });
    }
  }

  // Define handlers for the layout
  const handlers: OperatorHandlers = {
    onNavigate: (view: OperatorView) => router.navigateTo(view),
    onOpening: (_stationId: string, _userId: string) => router.navigateTo('apertura'),
    onClosure: (_stationId: string, _userId: string) => router.navigateTo('chiusura'),
    onStationChange: nextStationId => {
      void showOperatorMenu(_userId, nextStationId);
    }
  };

  // Render the operator shell
  await renderOperatorShell(mainContent, handlers);

  // Register browser back/forward support without stacking listeners
  unsubscribeHashListener?.();
  unsubscribeHashListener = onHashChange('operator', view => {
    if (isOperatorView(view) && view !== router.getCurrentView()) {
      void router.navigateTo(view);
    }
  });

  // AUTO-NAVIGATE to prevent "White Screen" / Empty State
  // If a shift is open -> stay on dashboard
  // If closed -> go to Opening
  // A valid deep link always wins over the default auto-navigation.
  const route = getCurrentRoute();
  const deepLinkView =
    route && route.area === 'operator' && isOperatorView(route.view) ? route.view : null;

  if (deepLinkView) {
    router.navigateTo(deepLinkView);
  } else {
    try {
      const opening = await checkOpeningStatus(selectedStationId);
      if (!opening) {
        router.navigateTo('apertura');
      }
    } catch (err) {
      logger.error('operator', 'Auto-navigation failed:', err);
    }
  }
}
