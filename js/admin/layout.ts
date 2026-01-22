/**
 * Admin Layout Module
 * Handles rendering of admin shell (sidebar, header, breadcrumbs)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { escapeHtml } from '../utils/utils.js';
import { clearSession } from '../core/auth.js';
import { store } from '../shared/state.js';
import { openConfirmModal } from '../ui/ui.js';
import { router, AdminTab } from './router.js';

// ========== TYPE DEFINITIONS ==========

type UserRole = 'admin' | 'super_admin' | 'full_admin' | 'operator' | 'accounting' | 'billing';

type TabChangeCallback = (tab: AdminTab) => void;

const TAB_LABELS: Record<AdminTab, string> = {
    'dashboard': 'Dashboard',
    'stations': 'Distributori',
    'operators': 'Operatori',
    'shifts': 'Chiusure',
    'crediti': 'Crediti',
    'invoices': 'Fatture',
    'vouchers': 'Voucher',
    'notifiche': 'Notifiche',
    'analytics': 'Analytics',
    'settings': 'Impostazioni'
};

const ROLE_LABELS: Record<string, string> = {
    'admin': 'Amministratore',
    'super_admin': 'Amministratore',
    'full_admin': 'Amministratore',
    'accounting': 'Contabilità',
    'billing': 'Fatturazione',
    'operator': 'Operatore'
};

// ========== FUNCTIONS ==========

/**
 * Render the admin shell (sidebar, header, breadcrumbs, and content area) into the provided container.
 *
 * Renders a role-aware sidebar and main layout, inserts it into `container`, and attaches navigation and logout handlers.
 *
 * @param container - The root HTMLElement where the admin shell will be rendered.
 * @param onTabChange - Callback invoked with the target tab identifier when a navigation button is activated.
 */
export function renderAdminShell(container: HTMLElement, onTabChange: TabChangeCallback): void {
    const user = store.getUser();
    const userRole = (user?.role || 'operator') as UserRole;
    const isFullAdmin = ['admin', 'super_admin', 'full_admin'].includes(userRole);

    console.log('[Layout] Rendering shell for role:', userRole, 'isFullAdmin:', isFullAdmin);

    container.innerHTML = `
        <div class="admin-container">
            <aside class="admin-sidebar">
                <div class="sidebar-header">
                    <p class="sidebar-subtitle">Control Center</p>
                </div>
                <nav class="sidebar-nav">
                    <button class="nav-btn active" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
                    
                    ${isFullAdmin ? `
                        <button class="nav-btn" data-tab="stations"><i class="fas fa-gas-pump"></i> Distributori</button>
                        <button class="nav-btn" data-tab="operators"><i class="fas fa-users-cog"></i> Gestione Operatori</button>
                    ` : ''}

                    ${(isFullAdmin || userRole === 'accounting') ? `
                        <button class="nav-btn" data-tab="vouchers"><i class="fas fa-ticket-alt"></i> Gestione Voucher</button>
                        <button class="nav-btn" data-tab="shifts"><i class="fas fa-clock"></i> Turni e Chiusure</button>
                        <button class="nav-btn" data-tab="analytics"><i class="fas fa-chart-pie"></i> Analytics</button>
                        <button class="nav-btn" data-tab="crediti"><i class="fas fa-credit-card"></i> Crediti</button>
                    ` : ''}

                    ${(isFullAdmin || userRole === 'billing' || userRole === 'accounting') ? `
                        <button class="nav-btn" data-tab="invoices"><i class="fas fa-file-invoice"></i> Fatture</button>
                    ` : ''}

                    <button class="nav-btn" data-tab="notifiche"><i class="fas fa-bell"></i> Notifiche</button>
                    
                    ${isFullAdmin ? `
                        <button class="nav-btn" data-tab="settings"><i class="fas fa-cog"></i> Impostazioni</button>
                    ` : ''}

                    <button class="nav-btn logout-btn" id="admin-logout"><i class="fas fa-sign-out-alt"></i> Esci</button>
                </nav>
                <div class="sidebar-footer">
                    <div class="sidebar-footer-avatar">
                        <i class="fas fa-user-shield"></i>
                    </div>
                    <div class="sidebar-footer-meta">
                        <span class="sidebar-footer-role">${escapeHtml(getRoleLabel(userRole))}</span>
                        <span class="sidebar-footer-name">${escapeHtml(user?.full_name || 'Utente')}</span>
                    </div>
                </div>
            </aside>
            <main class="admin-main">
                <header class="admin-header">
                    <div class="admin-header-center">
                        <img src="/assets/images/logo-svg.svg" alt="Neofuel" class="admin-header-logo" />
                        <div class="header-titles">
                            <p class="welcome-subtitle" id="page-subtitle">Dashboard</p>
                            <nav id="breadcrumbs" class="breadcrumbs"></nav>
                        </div>
                    </div>
                    <div class="admin-header-right">
                        <div id="header-actions" class="header-actions"></div>
                        <button class="header-icon-btn" type="button" title="Notifiche">
                            <i class="fas fa-bell"></i>
                        </button>
                    </div>
                </header>
                <div id="admin-content" class="admin-content-area">
                    <!-- Dynamic content -->
                </div>
            </main>
        </div>
    `;

    attachNavigationListeners(onTabChange);
    attachLogoutListener();
}

/**
 * Update the breadcrumb trail for the given admin tab and optional subpath in the element with id "breadcrumbs".
 *
 * If the container is present, replaces its contents with a Home link, the tab label (if not dashboard), and an optional subpath,
 * then attaches click handlers to breadcrumb links to navigate to the selected tab.
 *
 * @param tab - The current admin tab to show in the breadcrumb trail
 * @param subPath - Optional secondary label to append as an active breadcrumb segment
 */
export function renderBreadcrumbs(tab: AdminTab, subPath: string = ''): void {
    const container = document.getElementById('breadcrumbs');
    if (!container) return;

    let html = `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="dashboard" style="cursor: pointer; text-decoration: none;"><i class="fas fa-home"></i> Home</a>`;

    if (TAB_LABELS[tab] && tab !== 'dashboard') {
        html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
        if (subPath) {
            html += `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="${tab}" style="cursor: pointer; text-decoration: none;">${TAB_LABELS[tab]}</a>`;
        } else {
            html += `<span class="breadcrumb-item active">${TAB_LABELS[tab]}</span>`;
        }
    }

    if (subPath) {
        html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
        html += `<span class="breadcrumb-item active">${subPath}</span>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.breadcrumb-link').forEach(link => {
        link.addEventListener('click', (e: Event) => {
            e.preventDefault();
            const targetTab = (link as HTMLElement).dataset.tab as AdminTab;
            if (targetTab) {
                router.navigateTo(targetTab);
                renderBreadcrumbs(targetTab);
            }
        });
    });
}

/**
 * Wires click handlers on sidebar navigation buttons so selecting a button triggers a tab change.
 *
 * @param onTabChange - Callback invoked with the `data-tab` value from the clicked `.nav-btn` element
 */
function attachNavigationListeners(onTabChange: TabChangeCallback): void {
    const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = (btn as HTMLElement).dataset.tab as AdminTab;
            if (tab && onTabChange) {
                onTabChange(tab);
            }
        });
    });
}

/**
 * Wires the admin logout button to a confirmation flow that clears the session and reloads the page.
 *
 * If an element with id `admin-logout` exists, clicking it opens a confirmation modal (Italian prompt).
 * When the user confirms, the session is cleared, execution pauses briefly (~100ms), and the browser navigates
 * to the current path to effectively reload the app. If the logout element is not present, the function does nothing.
 */
function attachLogoutListener(): void {
    const logoutBtn = document.getElementById('admin-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const confirmLogout = await openConfirmModal('Sei sicuro di voler uscire dal Portale Neofuel?');
            if (confirmLogout) {
                await clearSession();
                await new Promise(resolve => setTimeout(resolve, 100));
                window.location.href = window.location.pathname;
            }
        });
    }
}

/**
 * Get the human-readable label for a user role.
 *
 * @param role - Internal role key (e.g., 'admin', 'operator', 'billing')
 * @returns The human-readable label for `role` (for example, 'Amministratore'); returns `'Utente'` if the role is not recognized
 */
function getRoleLabel(role: string): string {
    return ROLE_LABELS[role] || 'Utente';
}