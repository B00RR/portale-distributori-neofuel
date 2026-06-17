/**
 * Operator Router Module
 * Handles navigation between different operator views
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { store, User } from '../shared/state.js';

import { startClosureWizard } from './closure.js';
import { showCreditsMenu } from './credits.js';
import { showExtraIncomeMenu } from './extra-income.js';
import { showInvoiceMenu } from './invoices.js';
import { showAperturaForm } from './opening.js';
import { showOutflowMenu } from './outflows.js';
import { showPrezziEditForm } from './prices.js';
import { showVoucherMenu } from './vouchers.js';


// ========== TYPE DEFINITIONS ==========

export type OperatorView =
    | 'apertura'
    | 'chiusura'
    | 'prezzi'
    | 'crediti'
    | 'uscite'
    | 'incassi'
    | 'voucher'
    | 'fatture';

interface ExtendedUser extends User {
    assignedStations?: Array<{ id: string }>;
}

// ========== ROUTER CLASS ==========

class OperatorRouter {
  private currentView: OperatorView | null;

  constructor() {
    this.currentView = null;
  }

  /**
     * Navigate to a view
     */
  async navigateTo(view: OperatorView): Promise<void> {
    const user = store.getUser() as ExtendedUser | null;
    const stationId = user?.station_id || user?.assignedStations?.[0]?.id;
    const userId = user?.id || user?.user_id;

    if (!stationId || !userId) {
      console.error('[Router] Missing user or station context');
      return;
    }

    this.currentView = view;
    console.log('[Router] Navigating to:', view);

    switch (view) {
      case 'apertura':
        (showAperturaForm as any)(stationId, userId);
        break;
      case 'chiusura':
        startClosureWizard(stationId, userId);
        break;
      case 'prezzi':
        showPrezziEditForm(Number(stationId));
        break;
      case 'crediti':
        (showCreditsMenu as any)(stationId, userId);
        break;
      case 'uscite':
        (showOutflowMenu as any)(stationId, userId);
        break;
      case 'incassi':
        (showExtraIncomeMenu as any)(stationId, userId);
        break;
      case 'voucher':
        showVoucherMenu(stationId, userId);
        break;
      case 'fatture':
        (showInvoiceMenu as any)(stationId, userId);
        break;
      default:
        console.warn('[Router] Unknown view:', view);
    }
  }

  /**
     * Get current view
     */
  getCurrentView(): OperatorView | null {
    return this.currentView;
  }
}

export const router = new OperatorRouter();
