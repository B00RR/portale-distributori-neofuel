/**
 * Admin Layout Module
 * Handles rendering of admin shell (sidebar, header, breadcrumbs)
 */

import { escapeHtml } from '../utils/utils.js';
import { loggedUser, clearSession } from '../core/auth.js';
import { openConfirmModal } from '../ui/ui.js';
import { router } from './router.js';

/**
 * Render the admin shell layout
 */
export function renderAdminShell(container, onTabChange) {
    const userRole = loggedUser?.role || 'operator';
    const isFullAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'full_admin';

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
                        <span class="sidebar-footer-name">${escapeHtml(loggedUser?.full_name || 'Utente')}</span>
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

    // Attach event listeners
    attachNavigationListeners(onTabChange);
    attachLogoutListener();
}

/**
 * Render breadcrumbs navigation
 */
export function renderBreadcrumbs(tab, subPath = '') {
    const container = document.getElementById('breadcrumbs');
    if (!container) return;

    const labels = {
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

    let html = `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="dashboard" style="cursor: pointer; text-decoration: none;"><i class="fas fa-home"></i> Home</a>`;

    if (labels[tab] && tab !== 'dashboard') {
        html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
        if (subPath) {
            html += `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="${tab}" style="cursor: pointer; text-decoration: none;">${labels[tab]}</a>`;
        } else {
            html += `<span class="breadcrumb-item active">${labels[tab]}</span>`;
        }
    }

    if (subPath) {
        html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
        html += `<span class="breadcrumb-item active">${subPath}</span>`;
    }

    container.innerHTML = html;

    // Attach breadcrumb click listeners
    container.querySelectorAll('.breadcrumb-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = /** @type {HTMLElement} */(link).dataset.tab;
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
function attachNavigationListeners(onTabChange) {
    const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = /** @type {HTMLElement} */(btn).dataset.tab;
            if (tab && onTabChange) {
                onTabChange(tab);
            }
        });
    });
}

/**
 * Attach logout listener
 */
function attachLogoutListener() {
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
function getRoleLabel(role) {
    const labels = {
        'admin': 'Amministratore',
        'super_admin': 'Amministratore',
        'accounting': 'Contabilità',
        'billing': 'Fatturazione',
        'operator': 'Operatore'
    };
    return labels[role] || 'Utente';
}
