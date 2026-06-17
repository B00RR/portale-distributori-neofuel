/**
 * Admin Layout Module
 * Handles rendering of admin shell (sidebar, header, breadcrumbs)
 */

import { clearSession } from '../core/auth.js';
import { logger } from '../core/logger.js';
import { store } from '../shared/state.js';
import { openConfirmModal } from '../ui/ui.js';
import { escapeHtml } from '../utils/utils.js';

import { router, AdminTab } from './router.js';

// ========== TYPE DEFINITIONS ==========

type UserRole = 'admin' | 'super_admin' | 'full_admin' | 'operator' | 'accounting' | 'billing';

type TabChangeCallback = (tab: AdminTab) => void;

const TAB_LABELS = new Map<AdminTab, string>([
  ['dashboard', 'Dashboard'],
  ['stations', 'Distributori'],
  ['operators', 'Operatori'],
  ['shifts', 'Chiusure'],
  ['crediti', 'Crediti'],
  ['invoices', 'Fatture'],
  ['vouchers', 'Voucher'],
  ['notifiche', 'Notifiche'],
  ['analytics', 'Analytics'],
  ['settings', 'Impostazioni']
]);

const ROLE_LABELS = new Map<string, string>([
  ['admin', 'Amministratore'],
  ['super_admin', 'Amministratore'],
  ['full_admin', 'Amministratore'],
  ['accounting', 'Contabilità'],
  ['billing', 'Fatturazione'],
  ['operator', 'Operatore']
]);

// ========== FUNCTIONS ==========

/**
 * Render the admin shell layout
 */
export function renderAdminShell(container: HTMLElement, onTabChange: TabChangeCallback): void {
  const user = store.getUser();
  const userRole = (user?.role || 'operator') as UserRole;
  const isFullAdmin = ['admin', 'super_admin', 'full_admin'].includes(userRole);

  logger.info('Layout', 'Rendering shell for role: ' + userRole + ' isFullAdmin: ' + isFullAdmin);

  container.innerHTML = '';

  const adminContainer = document.createElement('div');
  adminContainer.className = 'admin-container';

  const sidebar = document.createElement('aside');
  sidebar.className = 'admin-sidebar';
  sidebar.dataset.testid = 'admin-sidebar';

  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'sidebar-header';
  const subtitle = document.createElement('p');
  subtitle.className = 'sidebar-subtitle';
  subtitle.textContent = 'Control Center';
  sidebarHeader.appendChild(subtitle);
  sidebar.appendChild(sidebarHeader);

  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';

  const navItems: { tab: AdminTab; icon: string; label: string; visible: boolean }[] = [
    { tab: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard', visible: true },
    { tab: 'stations', icon: 'fa-gas-pump', label: 'Distributori', visible: isFullAdmin },
    { tab: 'operators', icon: 'fa-users-cog', label: 'Gestione Operatori', visible: isFullAdmin },
    { tab: 'vouchers', icon: 'fa-ticket-alt', label: 'Gestione Voucher', visible: isFullAdmin || userRole === 'accounting' },
    { tab: 'shifts', icon: 'fa-clock', label: 'Turni e Chiusure', visible: isFullAdmin || userRole === 'accounting' },
    { tab: 'analytics', icon: 'fa-chart-pie', label: 'Analytics', visible: isFullAdmin || userRole === 'accounting' },
    { tab: 'crediti', icon: 'fa-credit-card', label: 'Crediti', visible: isFullAdmin || userRole === 'accounting' },
    { tab: 'invoices', icon: 'fa-file-invoice', label: 'Fatture', visible: isFullAdmin || userRole === 'billing' || userRole === 'accounting' },
    { tab: 'notifiche', icon: 'fa-bell', label: 'Notifiche', visible: true },
    { tab: 'settings', icon: 'fa-cog', label: 'Impostazioni', visible: isFullAdmin }
  ];

  navItems.forEach(item => {
    if (!item.visible) { return; }
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (item.tab === 'dashboard' ? ' active' : '');
    btn.dataset.tab = item.tab;
    btn.dataset.testid = 'nav-' + item.tab;
    const icon = document.createElement('i');
    icon.className = 'fas ' + item.icon;
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' ' + escapeHtml(item.label)));
    nav.appendChild(btn);
  });

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'nav-btn logout-btn';
  logoutBtn.id = 'admin-logout';
  logoutBtn.dataset.testid = 'nav-logout';
  logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Esci';
  nav.appendChild(logoutBtn);

  sidebar.appendChild(nav);

  const sidebarFooter = document.createElement('div');
  sidebarFooter.className = 'sidebar-footer';

  const avatar = document.createElement('div');
  avatar.className = 'sidebar-footer-avatar';
  avatar.innerHTML = '<i class="fas fa-user-shield"></i>';
  sidebarFooter.appendChild(avatar);

  const meta = document.createElement('div');
  meta.className = 'sidebar-footer-meta';
  const roleSpan = document.createElement('span');
  roleSpan.className = 'sidebar-footer-role';
  roleSpan.textContent = getRoleLabel(userRole);
  const nameSpan = document.createElement('span');
  nameSpan.className = 'sidebar-footer-name';
  nameSpan.textContent = user?.full_name || 'Utente';
  meta.appendChild(roleSpan);
  meta.appendChild(nameSpan);
  sidebarFooter.appendChild(meta);

  sidebar.appendChild(sidebarFooter);
  adminContainer.appendChild(sidebar);

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebar-overlay';
  adminContainer.appendChild(overlay);

  const main = document.createElement('main');
  main.className = 'admin-main';

  const header = document.createElement('header');
  header.className = 'admin-header';

  const headerCenter = document.createElement('div');
  headerCenter.className = 'admin-header-center';

  const toggle = document.createElement('button');
  toggle.id = 'sidebar-toggle';
  toggle.title = 'Menu';
  toggle.innerHTML = '<i class="fas fa-bars"></i>';
  headerCenter.appendChild(toggle);

  const logo = document.createElement('img');
  logo.src = '/assets/images/logo-svg.svg';
  logo.alt = 'Neofuel';
  logo.className = 'admin-header-logo';
  headerCenter.appendChild(logo);

  const headerTitles = document.createElement('div');
  headerTitles.className = 'header-titles';
  const pageSubtitle = document.createElement('p');
  pageSubtitle.className = 'welcome-subtitle';
  pageSubtitle.id = 'page-subtitle';
  pageSubtitle.textContent = 'Dashboard';
  headerTitles.appendChild(pageSubtitle);
  const breadcrumbs = document.createElement('nav');
  breadcrumbs.id = 'breadcrumbs';
  breadcrumbs.className = 'breadcrumbs';
  headerTitles.appendChild(breadcrumbs);
  headerCenter.appendChild(headerTitles);
  header.appendChild(headerCenter);

  const headerRight = document.createElement('div');
  headerRight.className = 'admin-header-right';

  const headerActions = document.createElement('div');
  headerActions.id = 'header-actions';
  headerActions.className = 'header-actions';
  headerRight.appendChild(headerActions);

  const notifBtn = document.createElement('button');
  notifBtn.className = 'header-icon-btn';
  notifBtn.type = 'button';
  notifBtn.title = 'Notifiche';
  notifBtn.innerHTML = '<i class="fas fa-bell"></i>';
  headerRight.appendChild(notifBtn);
  header.appendChild(headerRight);

  const adminContent = document.createElement('div');
  adminContent.id = 'admin-content';
  adminContent.className = 'admin-content-area';
  main.appendChild(header);
  main.appendChild(adminContent);

  adminContainer.appendChild(main);
  container.appendChild(adminContainer);

  attachNavigationListeners(onTabChange);
  attachLogoutListener();
  attachMobileListeners();
}

function attachMobileListeners(): void {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const navBtns = document.querySelectorAll('.nav-btn');

  function closeSidebar(): void {
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
  if (!container) {return;}

  container.innerHTML = '';

  const homeLink = document.createElement('a');
  homeLink.href = '#';
  homeLink.className = 'breadcrumb-item breadcrumb-link';
  homeLink.dataset.tab = 'dashboard';
  homeLink.style.cursor = 'pointer';
  homeLink.style.textDecoration = 'none';
  const homeIcon = document.createElement('i');
  homeIcon.className = 'fas fa-home';
  homeLink.appendChild(homeIcon);
  homeLink.appendChild(document.createTextNode(' Home'));
  container.appendChild(homeLink);

  const tabLabel = TAB_LABELS.get(tab) ?? null;
  if (tabLabel && tab !== 'dashboard') {
    const sep1 = document.createElement('i');
    sep1.className = 'fas fa-chevron-right breadcrumb-separator';
    container.appendChild(sep1);

    if (subPath) {
      const tabLink = document.createElement('a');
      tabLink.href = '#';
      tabLink.className = 'breadcrumb-item breadcrumb-link';
      tabLink.dataset.tab = tab;
      tabLink.style.cursor = 'pointer';
      tabLink.style.textDecoration = 'none';
      tabLink.textContent = tabLabel;
      container.appendChild(tabLink);
    } else {
      const tabSpan = document.createElement('span');
      tabSpan.className = 'breadcrumb-item active';
      tabSpan.textContent = tabLabel;
      container.appendChild(tabSpan);
    }
  }

  if (subPath) {
    const sep2 = document.createElement('i');
    sep2.className = 'fas fa-chevron-right breadcrumb-separator';
    container.appendChild(sep2);
    const subSpan = document.createElement('span');
    subSpan.className = 'breadcrumb-item active';
    subSpan.textContent = subPath;
    container.appendChild(subSpan);
  }

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
  return ROLE_LABELS.get(role) || 'Utente';
}
