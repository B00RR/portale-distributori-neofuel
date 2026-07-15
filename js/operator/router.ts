/**
 * Operator Router Module
 * Handles navigation between different operator views
 */

import { logger } from '../core/logger.js';
import { updateHash } from '../shared/hash-router.js';
import { store, User } from '../shared/state.js';

import { startClosureWizard } from './closure.js';
import { showCreditsMenu } from './credits.js';
import { showExtraIncomeMenu } from './extra-income.js';
import { showInvoiceMenu } from './invoices.js';
import { showAperturaForm } from './opening.js';
import { showOutflowMenu } from './outflows.js';
import { showPrezziEditForm } from './prices.js';
import { getSelectedOperatorStationId } from './station-context.js';
import { showVoucherMenu } from './vouchers.js';

// ========== TYPE DEFINITIONS ==========

export type OperatorView =
  'apertura' | 'chiusura' | 'prezzi' | 'crediti' | 'uscite' | 'incassi' | 'voucher' | 'fatture';

export const OPERATOR_VIEWS: readonly OperatorView[] = [
  'apertura',
  'chiusura',
  'prezzi',
  'crediti',
  'uscite',
  'incassi',
  'voucher',
  'fatture'
] as const;

export function isOperatorView(value: string): value is OperatorView {
  return (OPERATOR_VIEWS as readonly string[]).includes(value);
}

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
    const stationId = getSelectedOperatorStationId(user);
    // #248: due identità distinte. user.user_id è l'id numerico della tabella
    // users (finisce in operator_id di shifts/movimenti_cassa/crediti_movimenti);
    // user.id è l'UUID di Supabase Auth, richiesto SOLO dalla RPC voucher
    // (redeem_voucher_validated ha p_operator_id uuid). Il vecchio
    // `user.id || user.user_id` passava sempre l'UUID: Number(UUID) = NaN
    // bloccava l'apertura turno e parseInt(UUID) troncava/lanciava nei crediti.
    const numericUserId = user?.user_id;

    if (!stationId || !numericUserId) {
      logger.error('operatorRouter', 'Missing user or station context');
      return;
    }

    const authUserId = user?.id || numericUserId;

    this.currentView = view;
    updateHash('operator', view);

    switch (view) {
      case 'apertura':
        showAperturaForm(stationId);
        break;
      case 'chiusura':
        startClosureWizard(stationId, numericUserId);
        break;
      case 'prezzi':
        showPrezziEditForm(Number(stationId));
        break;
      case 'crediti':
        showCreditsMenu(stationId, numericUserId);
        break;
      case 'uscite':
        showOutflowMenu(stationId, numericUserId);
        break;
      case 'incassi':
        showExtraIncomeMenu(stationId, numericUserId);
        break;
      case 'voucher':
        showVoucherMenu(stationId, authUserId);
        break;
      case 'fatture':
        showInvoiceMenu(stationId, numericUserId);
        break;
      default:
        logger.warn('operatorRouter', 'Unknown view:', view);
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
