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
 * Render the admin shell layout
 */
export function renderAdminShell(container: HTMLElement, onTabChange: TabChangeCallback): void {
    const user = store.getUser();
    const userRole = (user?.role || 'operator') as UserRole;
    const isFullAdmin = ['admin', 'super_admin', 'full_admin'].includes(userRole);

    console.log('[Layout] Rendering shell for role:', userRole, 'isFullAdmin:', isFullAdmin);

    container.innerHTML = `
        <div class="admin-container">
            <aside class="admin-sidebar" data-testid="admin-sidebar">
                <div class="sidebar-header">
                    <p class="sidebar-subtitle">Control Center</p>
                </div>
                <nav class="sidebar-nav">
                    <button class="nav-btn active" data-tab="dashboard" data-testid="nav-dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
                    
                    ${isFullAdmin ? `
                        <button class="nav-btn" data-tab="stations" data-testid="nav-stations"><i class="fas fa-gas-pump"></i> Distributori</button>
                        <button class="nav-btn" data-tab="operators" data-testid="nav-operators"><i class="fas fa-users-cog"></i> Gestione Operatori</button>
                    ` : ''}

                    ${(isFullAdmin || userRole === 'accounting') ? `
                        <button class="nav-btn" data-tab="vouchers" data-testid="nav-vouchers"><i class="fas fa-ticket-alt"></i> Gestione Voucher</button>
                        <button class="nav-btn" data-tab="shifts" data-testid="nav-shifts"><i class="fas fa-clock"></i> Turni e Chiusure</button>
                        <button class="nav-btn" data-tab="analytics" data-testid="nav-analytics"><i class="fas fa-chart-pie"></i> Analytics</button>
                        <button class="nav-btn" data-tab="crediti" data-testid="nav-crediti"><i class="fas fa-credit-card"></i> Crediti</button>
                    ` : ''}

                    ${(isFullAdmin || userRole === 'billing' || userRole === 'accounting') ? `
                        <button class="nav-btn" data-tab="invoices" data-testid="nav-invoices"><i class="fas fa-file-invoice"></i> Fatture</button>
                    ` : ''}

                    <button class="nav-btn" data-tab="notifiche" data-testid="nav-notifiche"><i class="fas fa-bell"></i> Notifiche</button>
                    
                    ${isFullAdmin ? `
                        <button class="nav-btn" data-tab="settings" data-testid="nav-settings"><i class="fas fa-cog"></i> Impostazioni</button>
                    ` : ''}

                    <button class="nav-btn logout-btn" id="admin-logout" data-testid="nav-logout"><i class="fas fa-sign-out-alt"></i> Esci</button>
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
            <div class="sidebar-overlay" id="sidebar-overlay"></div>
            <main class="admin-main">
                <header class="admin-header">
                    <div class="admin-header-center">
                        <button id="sidebar-toggle" title="Menu"><i class="fas fa-bars"></i></button>
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
    attachMobileListeners();
}

function attachMobileListeners(): void {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const navBtns = document.querySelectorAll('.nav-btn');

    function closeSidebar() {
        sidebar?.classList.remove('open');
        overlay?.classList.remove('visible');
    }

    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay?.classList.toggle('visible');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // Close on nav click
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
}

/**
 * Render breadcrumbs navigation
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
 * Attach navigation event listeners
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
 * Attach logout listener
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
 * Get human-readable role label
 */
function getRoleLabel(role: string): string {
    return ROLE_LABELS[role] || 'Utente';
}
