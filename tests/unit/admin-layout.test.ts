import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStore, mockRouter, mockClearSession, mockOpenConfirmModal, mockLogger } = vi.hoisted(
  () => ({
    mockStore: {
      getUser: vi.fn()
    },
    mockRouter: {
      navigateTo: vi.fn()
    },
    mockClearSession: vi.fn(),
    mockOpenConfirmModal: vi.fn(),
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  })
);

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));
vi.mock('../../js/admin/router.js', () => ({ router: mockRouter }));
vi.mock('../../js/core/auth.js', () => ({ clearSession: mockClearSession }));
vi.mock('../../js/core/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../js/ui/ui.js', () => ({ openConfirmModal: mockOpenConfirmModal }));

import { renderAdminShell, renderBreadcrumbs } from '../../js/admin/layout.js';

describe('Admin Layout Module', () => {
  let container: HTMLElement;
  const onTabChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="test-container"></div>';
    container = document.getElementById('test-container') as HTMLElement;
    vi.resetModules();
  });

  describe('renderAdminShell', () => {
    it('renders the admin shell with sidebar, header, and main content', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('.admin-container')).toBeTruthy();
      expect(container.querySelector('.admin-sidebar')).toBeTruthy();
      expect(container.querySelector('.admin-main')).toBeTruthy();
      expect(container.querySelector('#admin-sidebar')).toBeTruthy();
      expect(container.querySelector('[data-testid="admin-sidebar"]')).toBeTruthy();
    });

    it('renders sidebar with header subtitle', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const subtitle = container.querySelector('.sidebar-subtitle');
      expect(subtitle?.textContent).toBe('Control Center');
    });

    it('renders navigation items for full admin user', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('[data-testid="nav-dashboard"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-stations"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-operators"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-vouchers"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-shifts"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-analytics"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-crediti"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-invoices"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-notifiche"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-settings"]')).toBeTruthy();
    });

    it('does not render stations/operators for accounting user', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-2',
        user_id: '2',
        email: 'accounting@test.com',
        role: 'accounting',
        full_name: 'Accounting User'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('[data-testid="nav-stations"]')).toBeNull();
      expect(container.querySelector('[data-testid="nav-operators"]')).toBeNull();
      expect(container.querySelector('[data-testid="nav-vouchers"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-shifts"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-analytics"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-crediti"]')).toBeTruthy();
    });

    it('does not render settings for non-full-admin users', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-2',
        user_id: '2',
        email: 'accounting@test.com',
        role: 'accounting',
        full_name: 'Accounting User'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('[data-testid="nav-settings"]')).toBeNull();
    });

    it('always renders dashboard and notifiche tabs', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-2',
        user_id: '2',
        email: 'accounting@test.com',
        role: 'accounting',
        full_name: 'Accounting User'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('[data-testid="nav-dashboard"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-notifiche"]')).toBeTruthy();
    });

    it('sets dashboard tab as active by default', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const dashboardBtn = container.querySelector('[data-testid="nav-dashboard"]') as HTMLElement;
      expect(dashboardBtn.classList.contains('active')).toBe(true);
    });

    it('renders logout button with correct styling', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const logoutBtn = container.querySelector('#admin-logout');
      expect(logoutBtn).toBeTruthy();
      expect(logoutBtn?.classList.contains('logout-btn')).toBe(true);
      expect(logoutBtn?.getAttribute('data-testid')).toBe('nav-logout');
    });

    it('renders user footer with role and name', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Marco Rossi'
      });

      renderAdminShell(container, onTabChange);

      const roleSpan = container.querySelector('.sidebar-footer-role');
      const nameSpan = container.querySelector('.sidebar-footer-name');
      expect(roleSpan?.textContent).toBe('Amministratore');
      expect(nameSpan?.textContent).toBe('Marco Rossi');
    });

    it('handles missing user full name gracefully', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: undefined
      });

      renderAdminShell(container, onTabChange);

      const nameSpan = container.querySelector('.sidebar-footer-name');
      expect(nameSpan?.textContent).toBe('Utente');
    });

    it('renders header with logo and sidebar toggle', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const toggle = container.querySelector('#sidebar-toggle');
      const logo = container.querySelector('.admin-header-logo');
      expect(toggle).toBeTruthy();
      expect(toggle?.getAttribute('aria-label')).toBe('Apri menu');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(logo).toBeTruthy();
      expect(logo?.getAttribute('alt')).toBe('Neofuel');
    });

    it('renders breadcrumbs container and initial dashboard subtitle', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const breadcrumbs = container.querySelector('#breadcrumbs');
      const subtitle = container.querySelector('#page-subtitle');
      expect(breadcrumbs).toBeTruthy();
      expect(subtitle?.textContent).toBe('Dashboard');
    });

    it('renders notification button in header', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const notifBtn = container.querySelector('.header-icon-btn');
      expect(notifBtn).toBeTruthy();
      expect(notifBtn?.getAttribute('aria-label')).toBe('Notifiche');
    });

    it('calls onTabChange when navigation button is clicked', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const stationsBtn = container.querySelector('[data-testid="nav-stations"]') as HTMLElement;
      stationsBtn.click();

      expect(onTabChange).toHaveBeenCalledWith('stations');
    });

    it('calls onTabChange with correct tab on multiple nav clicks', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const operatorsBtn = container.querySelector('[data-testid="nav-operators"]') as HTMLElement;
      const vouchersBtn = container.querySelector('[data-testid="nav-vouchers"]') as HTMLElement;

      operatorsBtn.click();
      vouchersBtn.click();

      expect(onTabChange).toHaveBeenCalledWith('operators');
      expect(onTabChange).toHaveBeenCalledWith('vouchers');
    });

    it('clears previous container content before rendering', () => {
      container.innerHTML = '<div>existing content</div>';
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('div:nth-child(1)').className).toBe('admin-container');
    });

    it('handles super_admin role correctly', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'super_admin',
        full_name: 'Super Admin'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('[data-testid="nav-stations"]')).toBeTruthy();
      const roleSpan = container.querySelector('.sidebar-footer-role');
      expect(roleSpan?.textContent).toBe('Amministratore');
    });

    it('handles full_admin role correctly', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'full_admin',
        full_name: 'Full Admin'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('[data-testid="nav-stations"]')).toBeTruthy();
    });

    it('shows billing tab only for billing role', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-2',
        user_id: '2',
        email: 'billing@test.com',
        role: 'billing',
        full_name: 'Billing User'
      });

      renderAdminShell(container, onTabChange);

      expect(container.querySelector('[data-testid="nav-invoices"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="nav-stations"]')).toBeNull();
    });

    it('renders sidebar overlay for mobile', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const overlay = container.querySelector('#sidebar-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.classList.contains('sidebar-overlay')).toBe(true);
    });

    it('handles null user gracefully', () => {
      mockStore.getUser.mockReturnValue(null);

      renderAdminShell(container, onTabChange);

      const dashboardBtn = container.querySelector('[data-testid="nav-dashboard"]');
      expect(dashboardBtn).toBeTruthy();
    });
  });

  describe('renderBreadcrumbs', () => {
    beforeEach(() => {
      const breadcrumbsContainer = document.createElement('div');
      breadcrumbsContainer.id = 'breadcrumbs';
      document.body.appendChild(breadcrumbsContainer);
    });

    it('renders home link as first breadcrumb', () => {
      renderBreadcrumbs('dashboard');

      const homeLink = document.querySelector('.breadcrumb-link');
      expect(homeLink).toBeTruthy();
      expect(homeLink?.textContent).toContain('Home');
    });

    it('does not render additional breadcrumbs for dashboard tab', () => {
      renderBreadcrumbs('dashboard');

      const breadcrumbs = document.getElementById('breadcrumbs');
      const links = breadcrumbs?.querySelectorAll('.breadcrumb-link');
      expect(links?.length).toBe(1); // Only home link
    });

    it('renders tab name as active breadcrumb for non-dashboard tabs', () => {
      renderBreadcrumbs('stations');

      const breadcrumbs = document.getElementById('breadcrumbs');
      const activeBreadcrumb = breadcrumbs?.querySelector('.breadcrumb-item.active');
      expect(activeBreadcrumb?.textContent).toBe('Distributori');
    });

    it('renders subpath as final active breadcrumb', () => {
      renderBreadcrumbs('stations', 'Stazione Roma');

      const breadcrumbs = document.getElementById('breadcrumbs');
      const activeBreadcrumbs = breadcrumbs?.querySelectorAll('.breadcrumb-item.active');
      expect(activeBreadcrumbs?.length).toBeGreaterThanOrEqual(1);
      const lastActive = Array.from(activeBreadcrumbs || []).pop();
      expect(lastActive?.textContent).toBe('Stazione Roma');
    });

    it('renders tab link when subpath is provided', () => {
      renderBreadcrumbs('operators', 'Marco Rossi');

      const breadcrumbs = document.getElementById('breadcrumbs');
      const links = breadcrumbs?.querySelectorAll('.breadcrumb-link');
      expect(links?.length).toBe(2); // Home + Operators
    });

    it('renders chevron separators', () => {
      renderBreadcrumbs('stations', 'Roma');

      const breadcrumbs = document.getElementById('breadcrumbs');
      const separators = breadcrumbs?.querySelectorAll('.breadcrumb-separator');
      expect(separators?.length).toBe(2); // Two separators for three items
    });

    it('clears existing breadcrumbs before rendering', () => {
      const breadcrumbs = document.getElementById('breadcrumbs') as HTMLElement;
      breadcrumbs.innerHTML = '<div>old content</div>';

      renderBreadcrumbs('dashboard');

      expect(breadcrumbs.children.length).toBe(1);
      expect(breadcrumbs.querySelector('div')).toBeNull();
    });

    it('handles all known tab types', () => {
      const tabs = [
        'dashboard',
        'stations',
        'operators',
        'shifts',
        'crediti',
        'invoices',
        'vouchers',
        'reconciliation',
        'notifiche',
        'analytics',
        'settings'
      ] as const;

      tabs.forEach(tab => {
        renderBreadcrumbs(tab);
        const breadcrumbs = document.getElementById('breadcrumbs');
        expect(breadcrumbs?.querySelector('.breadcrumb-link')).toBeTruthy();
      });
    });

    it('navigates to dashboard when home link is clicked', () => {
      renderBreadcrumbs('operators');

      const homeLink = document.querySelector('.breadcrumb-link') as HTMLElement;
      homeLink.click();

      expect(mockRouter.navigateTo).toHaveBeenCalledWith('dashboard');
    });

    it('navigates to tab when tab breadcrumb link is clicked', () => {
      renderBreadcrumbs('operators', 'Marco Rossi');

      const breadcrumbs = document.getElementById('breadcrumbs');
      const tabLink = breadcrumbs?.querySelectorAll('.breadcrumb-link')[1] as HTMLElement;
      tabLink.click();

      expect(mockRouter.navigateTo).toHaveBeenCalledWith('operators');
    });

    it('handles missing breadcrumbs container gracefully', () => {
      const breadcrumbs = document.getElementById('breadcrumbs') as HTMLElement;
      breadcrumbs.remove();

      expect(() => renderBreadcrumbs('dashboard')).not.toThrow();
    });

    it('updates breadcrumbs when called multiple times', () => {
      renderBreadcrumbs('dashboard');
      let breadcrumbs = document.getElementById('breadcrumbs');
      let children = breadcrumbs?.children.length;

      renderBreadcrumbs('stations', 'Roma');
      breadcrumbs = document.getElementById('breadcrumbs');
      expect(breadcrumbs?.children.length).toBeGreaterThan(children || 0);
    });

    it('renders correct labels for each tab', () => {
      const tabLabels = {
        stations: 'Distributori',
        operators: 'Operatori',
        shifts: 'Chiusure',
        crediti: 'Crediti',
        invoices: 'Fatture',
        vouchers: 'Voucher',
        notifiche: 'Notifiche',
        analytics: 'Analytics',
        settings: 'Impostazioni'
      };

      Object.entries(tabLabels).forEach(([tab, label]) => {
        renderBreadcrumbs(tab as any);
        const breadcrumbs = document.getElementById('breadcrumbs');
        const activeBreadcrumb = breadcrumbs?.querySelector('.breadcrumb-item.active');
        expect(activeBreadcrumb?.textContent).toBe(label);
      });
    });
  });

  describe('Mobile interactions', () => {
    it('toggles sidebar open state on toggle button click', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const toggle = container.querySelector('#sidebar-toggle') as HTMLElement;
      const sidebar = container.querySelector('.admin-sidebar') as HTMLElement;

      toggle.click();
      expect(sidebar.classList.contains('open')).toBe(true);

      toggle.click();
      expect(sidebar.classList.contains('open')).toBe(false);
    });

    it('closes sidebar when overlay is clicked', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const toggle = container.querySelector('#sidebar-toggle') as HTMLElement;
      const overlay = container.querySelector('#sidebar-overlay') as HTMLElement;
      const sidebar = container.querySelector('.admin-sidebar') as HTMLElement;

      toggle.click();
      expect(sidebar.classList.contains('open')).toBe(true);

      overlay.click();
      expect(sidebar.classList.contains('open')).toBe(false);
    });

    it('updates aria-expanded attribute on toggle', () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const toggle = container.querySelector('#sidebar-toggle') as HTMLElement;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Logout functionality', () => {
    it('shows confirmation modal on logout button click', async () => {
      mockOpenConfirmModal.mockResolvedValue(false);
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const logoutBtn = container.querySelector('#admin-logout') as HTMLElement;
      logoutBtn.click();

      await new Promise(r => setTimeout(r, 50));

      expect(mockOpenConfirmModal).toHaveBeenCalledWith(
        'Sei sicuro di voler uscire dal Portale Neofuel?'
      );
    });

    it('calls clearSession when logout is confirmed', async () => {
      mockOpenConfirmModal.mockResolvedValue(true);
      mockClearSession.mockResolvedValue(undefined);
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const logoutBtn = container.querySelector('#admin-logout') as HTMLElement;
      logoutBtn.click();

      await new Promise(r => setTimeout(r, 150));

      expect(mockClearSession).toHaveBeenCalled();
    });

    it('does not call clearSession when logout is not confirmed', async () => {
      mockOpenConfirmModal.mockResolvedValue(false);
      mockStore.getUser.mockReturnValue({
        id: 'user-1',
        user_id: '1',
        email: 'admin@test.com',
        role: 'admin',
        full_name: 'Admin User'
      });

      renderAdminShell(container, onTabChange);

      const logoutBtn = container.querySelector('#admin-logout') as HTMLElement;
      logoutBtn.click();

      await new Promise(r => setTimeout(r, 50));

      expect(mockClearSession).not.toHaveBeenCalled();
    });
  });
});
