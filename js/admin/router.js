/**
 * Admin Router
 * Handles navigation between admin tabs with lazy loading
 */

import { showLoadingMessage } from '../ui/ui.js';
import { handleError } from '../shared/error-handler.js';
import { store } from '../shared/state.js';
import { showDashboard } from './dashboard.js';
import { showStationsTab } from './stations.js';
import { showOperatorsTab } from './operators.js';
import { showChiusureTab } from './shifts.js';
import { showCreditiOverview as showCreditsTab } from './credits.js';
import { showFattureTab } from './invoices.js';
import { showSettingsTab } from './logic.js';

/**
 * Admin Router Class
 */
class AdminRouter {
    constructor() {
        this.currentTab = 'dashboard';
        this.userRole = null;
        this.isFullAdmin = false;
    }

    /**
     * Initialize router with user permissions
     */
    init(userRole) {
        this.userRole = userRole || 'operator';
        this.isFullAdmin = this.userRole === 'admin' || this.userRole === 'super_admin';
    }

    /**
     * Navigate to a specific tab
     */
    async navigateTo(tab) {
        this.currentTab = tab;

        const content = document.getElementById('admin-content');
        const headerActions = document.getElementById('header-actions');
        const pageSubtitle = document.getElementById('page-subtitle');

        if (!content) return;

        // Update active navigation button
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', /** @type {HTMLElement} */(b).dataset.tab === tab);
        });

        // Update page title
        const titles = {
            'dashboard': 'Dashboard',
            'stations': 'Gestione Distributori',
            'operators': 'Gestione Operatori',
            'shifts': 'Registro Chiusure',
            'crediti': 'Gestione Crediti',
            'invoices': 'Richieste Fatture',
            'vouchers': 'Gestione Voucher',
            'notifiche': 'Notifiche',
            'analytics': 'Analytics',
            'settings': 'Impostazioni'
        };

        if (pageSubtitle) {
            pageSubtitle.textContent = titles[tab] || 'Control Center';
        }

        // Get current filter from store
        const filter = store.getFilter();

        // Check permissions
        if (!this.checkPermission(tab)) {
            content.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-lock error-icon"></i>
                    <h2>Accesso Negato</h2>
                    <p>Non disponi dei permessi necessari per visualizzare questa sezione.</p>
                    <button class="menu-button primary" onclick="window.location.reload()">Torna alla Dashboard</button>
                </div>
            `;
            return;
        }

        // Route to appropriate handler
        await this.loadTab(tab, content, headerActions, filter);
    }

    /**
     * Check if user has permission for a tab
     */
    checkPermission(tab) {
        const { userRole, isFullAdmin } = this;

        if (['stations', 'operators', 'settings'].includes(tab) && !isFullAdmin) return false;
        if (tab === 'shifts' && !isFullAdmin && userRole !== 'accounting') return false;
        if (tab === 'crediti' && !isFullAdmin && userRole !== 'accounting') return false;
        if (tab === 'analytics' && !isFullAdmin && userRole !== 'accounting') return false;
        if (tab === 'invoices' && !isFullAdmin && userRole !== 'billing' && userRole !== 'accounting') return false;
        if (tab === 'vouchers' && !isFullAdmin && userRole !== 'accounting') return false;

        return true;
    }

    /**
     * Load the appropriate tab module
     */
    async loadTab(tab, content, headerActions, filter) {
        switch (tab) {
            case 'dashboard':
                showDashboard(content, filter);
                break;

            case 'stations':
                showStationsTab(content, headerActions);
                break;

            case 'operators':
                showOperatorsTab(content, headerActions);
                break;

            case 'shifts':
                showChiusureTab(content, headerActions, filter);
                break;

            case 'analytics':
                showLoadingMessage(content);
                try {
                    const { showAnalyticsTab } = await import('./analytics.js');
                    showAnalyticsTab(content, headerActions, filter);
                } catch (err) {
                    handleError(err, 'Caricamento modulo Analytics', content);
                }
                break;

            case 'crediti':
                if (typeof showCreditsTab !== 'undefined') {
                    showCreditsTab(content, headerActions);
                } else {
                    content.innerHTML = '<p>Modulo Crediti in caricamento...</p>';
                }
                break;

            case 'invoices':
                await import('./invoices.js').then(module => {
                    module.showFattureTab(content, headerActions, filter);
                });
                break;

            case 'vouchers':
                showLoadingMessage(content);
                try {
                    const { showVoucherAdminTab } = await import('./vouchers_reboot.js');
                    showVoucherAdminTab(content, headerActions);
                } catch (err) {
                    handleError(err, 'Caricamento modulo Voucher', content);
                }
                break;

            case 'notifiche':
                content.innerHTML = `
                    <div class="content-box" style="text-align: center; padding: 60px 20px;">
                        <i class="fas fa-bell" style="font-size: 4rem; color: var(--secondary-color); margin-bottom: 20px;"></i>
                        <h2 style="margin-bottom: 10px;">Notifiche</h2>
                        <p style="color: var(--text-secondary);">Questa funzionalità sarà disponibile prossimamente.</p>
                    </div>
                `;
                break;

            case 'settings':
                showSettingsTab(content, headerActions);
                break;

            default:
                showDashboard(content, filter);
        }
    }

    /**
     * Get current tab
     */
    getCurrentTab() {
        return this.currentTab;
    }
}

// Export singleton instance
export const router = new AdminRouter();
