/**
 * Admin Router
 * Handles navigation between admin tabs with lazy loading
 */

import { handleError } from '../shared/error-handler.js';
import { updateHash } from '../shared/hash-router.js';
import { isAdminRole, normalizeUserRole, type UserRole } from '../shared/roles.js';
import { store } from '../shared/state.js';
import { showLoadingMessage } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';

import { showBusinessRulesSettings } from './business-rules-settings.js';
import { showCreditiOverview as showCreditsTab } from './credits.js';
import { showDashboard } from './dashboard.js';
import { showOperatorsTab } from './operators.js';
import { showChiusureTab } from './shifts.js';
import { showStationsTab } from './stations.js';

// ========== TYPE DEFINITIONS ==========

export type AdminTab =
  | 'dashboard'
  | 'stations'
  | 'operators'
  | 'shifts'
  | 'crediti'
  | 'invoices'
  | 'vouchers'
  | 'notifiche'
  | 'analytics'
  | 'settings';

export const ADMIN_TABS: readonly AdminTab[] = [
  'dashboard',
  'stations',
  'operators',
  'shifts',
  'crediti',
  'invoices',
  'vouchers',
  'notifiche',
  'analytics',
  'settings'
] as const;

export function isAdminTab(value: string): value is AdminTab {
  return (ADMIN_TABS as readonly string[]).includes(value);
}

export type { UserRole } from '../shared/roles.js';

const TAB_TITLES: Record<AdminTab, string> = {
  dashboard: 'Dashboard',
  stations: 'Gestione Distributori',
  operators: 'Gestione Operatori',
  shifts: 'Registro Chiusure',
  crediti: 'Gestione Crediti',
  invoices: 'Richieste Fatture',
  vouchers: 'Gestione Voucher',
  notifiche: 'Notifiche',
  analytics: 'Analytics',
  settings: 'Impostazioni'
};

// ========== ROUTER CLASS ==========

class AdminRouter {
  private currentTab: AdminTab;
  private userRole: UserRole;
  private isFullAdmin: boolean;

  constructor() {
    this.currentTab = 'dashboard';
    this.userRole = 'operator';
    this.isFullAdmin = false;
  }

  /**
   * Initialize router with user permissions
   */
  init(userRole: string | null | undefined): void {
    this.userRole = normalizeUserRole(userRole) ?? 'operator';
    this.isFullAdmin = isAdminRole(this.userRole);
  }

  /**
   * Navigate to a specific tab
   */
  async navigateTo(tab: AdminTab): Promise<void> {
    this.currentTab = tab;
    updateHash('admin', tab);

    const content = document.getElementById('admin-content');
    const headerActions = document.getElementById('header-actions');
    const pageSubtitle = document.getElementById('page-subtitle');

    if (!content) {
      return;
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
      const element = btn as HTMLElement;
      element.classList.toggle('active', element.dataset.tab === tab);
    });

    if (pageSubtitle) {
      // eslint-disable-next-line security/detect-object-injection -- tab is a typed AdminTab key into a static, developer-defined title map
      pageSubtitle.textContent = TAB_TITLES[tab] || 'Control Center';
    }

    const filter = store.getFilter();

    if (this.checkPermission(tab)) {
      await this.loadTab(tab, content, headerActions, filter);

      // Move focus to the freshly rendered region so keyboard/screen-reader users
      // are taken to the new content instead of being left on the sidebar.
      if (!content.hasAttribute('aria-label')) {
        content.setAttribute('aria-label', 'Contenuto principale');
      }
      content.setAttribute('tabindex', '-1');
      content.focus();
    } else {
      setSafeHTML(
        content,
        `
                <div class="error-container">
                    <i class="fas fa-lock error-icon"></i>
                    <h2>Accesso Negato</h2>
                    <p>Non disponi dei permessi necessari per visualizzare questa sezione.</p>
                    <button class="menu-button primary" onclick="window.location.reload()">Torna alla Dashboard</button>
                </div>
            `
      );
    }
  }

  /**
   * Check if user has permission for a tab
   */
  private checkPermission(tab: AdminTab): boolean {
    const { userRole, isFullAdmin } = this;

    if (['stations', 'operators', 'settings'].includes(tab) && !isFullAdmin) {
      return false;
    }
    if (tab === 'shifts' && !isFullAdmin && userRole !== 'accounting') {
      return false;
    }
    if (tab === 'crediti' && !isFullAdmin && userRole !== 'accounting') {
      return false;
    }
    if (tab === 'analytics' && !isFullAdmin && userRole !== 'accounting') {
      return false;
    }
    if (tab === 'invoices' && !isFullAdmin && userRole !== 'billing' && userRole !== 'accounting') {
      return false;
    }
    if (tab === 'vouchers' && !isFullAdmin && userRole !== 'accounting') {
      return false;
    }

    return true;
  }

  /**
   * Load the appropriate tab module
   */
  private async loadTab(
    tab: AdminTab,
    content: HTMLElement,
    headerActions: HTMLElement | null,
    filter: string | null
  ): Promise<void> {
    switch (tab) {
      case 'dashboard':
        await showDashboard(content, filter);
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
          const stationId = filter ? parseInt(filter, 10) : null;
          showAnalyticsTab(content, headerActions, stationId);
        } catch (err) {
          handleError(err, 'Caricamento modulo Analytics', content);
        }
        break;

      case 'crediti':
        showCreditsTab(content, headerActions);
        break;

      case 'invoices':
        try {
          const module = await import('./invoices.js');
          const stationId = filter ? parseInt(filter, 10) : null;
          module.showFattureTab(content, headerActions, stationId);
        } catch (err) {
          handleError(err, 'Caricamento modulo Fatture', content);
        }
        break;

      case 'vouchers':
        showLoadingMessage(content);
        try {
          const { showVoucherAdminTab } = await import('./vouchers_reboot.js');
          await showVoucherAdminTab(content, headerActions);
        } catch (err) {
          handleError(err, 'Caricamento modulo Voucher', content);
        }
        break;

      case 'notifiche':
        setSafeHTML(
          content,
          `
                    <div class="content-box" style="text-align: center; padding: 60px 20px;">
                        <i class="fas fa-bell" style="font-size: 4rem; color: var(--secondary-color); margin-bottom: 20px;"></i>
                        <h2 style="margin-bottom: 10px;">Notifiche</h2>
                        <p style="color: var(--text-secondary);">Questa funzionalità sarà disponibile prossimamente.</p>
                    </div>
                `
        );
        break;

      case 'settings':
        if (headerActions) {
          headerActions.replaceChildren();
        }
        showBusinessRulesSettings(content);
        break;

      default:
        showDashboard(content, filter);
    }
  }

  /**
   * Get current tab
   */
  getCurrentTab(): AdminTab {
    return this.currentTab;
  }
}

// Export singleton instance
export const router = new AdminRouter();
