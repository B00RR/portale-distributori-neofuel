/**
 * Operator Router Module
 * Handles navigation between different operator views
 */

import { showAperturaForm } from './opening.js';
import { startClosureWizard } from './closure.js';
import { showPrezziEditForm } from './prices.js';
import { showCreditsMenu } from './credits.js';
import { showOutflowMenu } from './outflows.js';
import { showExtraIncomeMenu } from './extra-income.js';
import { showVoucherMenu } from './vouchers.js';
import { showInvoiceMenu } from './invoices.js';
import { store } from '../shared/state.js';

class OperatorRouter {
    constructor() {
        this.currentView = null;
    }

    /**
     * Navigate to a view
     * @param {string} view - View name
     */
    async navigateTo(view) {
        const user = store.getUser();
        const stationId = user?.station_id || user?.assignedStations?.[0]?.id;
        const userId = user?.id;

        if (!stationId || !userId) {
            console.error('[Router] Missing user or station context');
            return;
        }

        console.log('[Router] Navigating to:', view);

        switch (view) {
            case 'apertura':
                showAperturaForm(stationId, userId);
                break;
            case 'chiusura':
                startClosureWizard(stationId, userId);
                break;
            case 'prezzi':
                showPrezziEditForm(stationId);
                break;
            case 'crediti':
                showCreditsMenu(stationId, userId);
                break;
            case 'uscite':
                showOutflowMenu(stationId, userId);
                break;
            case 'incassi':
                showExtraIncomeMenu(stationId, userId);
                break;
            case 'voucher':
                showVoucherMenu(stationId, userId);
                break;
            case 'fatture':
                showInvoiceMenu(stationId, userId);
                break;
            default:
                console.warn('[Router] Unknown view:', view);
        }
    }
}

export const router = new OperatorRouter();
