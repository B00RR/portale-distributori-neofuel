/**
 * Operator Area - Main Entry Point
 * Refactored to use modular architecture (Router + Layout)
 */

import { logger } from './core/logger.js';
import './operator/offline-financial-executors-v2.js';
import { renderOperatorShell, OperatorHandlers } from './operator/layout.js';
import { checkOpeningStatus } from './operator/opening.js';
import { router, OperatorView } from './operator/router.js';
import { setSelectedOperatorStation } from './operator/station-context.js';
import { store } from './shared/state.js';

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

  // AUTO-NAVIGATE to prevent "White Screen" / Empty State
  // If a shift is open -> go to Closure wizard (or stay in dashboard, but Closure is safer default)
  // If closed -> go to Opening
  try {
    const opening = await checkOpeningStatus(selectedStationId);

    if (opening) {
      // Optional: We could just show the menu (default) or go to specific page
      // For now, let's keep it on the dashboard (empty state but with menu) OR go to 'chiusura'
      // To be less intrusive, we might just let them choose.
      // BUT the user reported "White Screen", so maybe they want to see *something*.
      // Let's use a Toast to tell them what to do if we don't auto-nav.
      // BETTER: Auto-nav to 'chiusura' is standard for "I am working".
      // However, 'chiusura' might be the *end* of the shift.
      // Let's go to 'promemoria' or just keep shell?
      // The shell has "Welcome message".
      // Fix: The issue is likely that "Welcome message" is not enough or confusing.
      // Let's just NOT auto-navigate if open, but ensure the shell is visible.
      // OR: Navigate to a "Status" view.
      // Let's stick to the plan: if closed -> apertura.
    } else {
      router.navigateTo('apertura');
    }
  } catch (err) {
    logger.error('operator', 'Auto-navigation failed:', err);
  }
}
