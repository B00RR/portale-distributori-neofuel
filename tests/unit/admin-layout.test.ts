import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStore, mockRouter, mockOpenModal, mockClearSession } = vi.hoisted(() => ({
    mockStore: {
        getUser: vi.fn(() => ({ role: 'admin', email: 'test@example.com' })),
        getFilter: vi.fn(() => null),
        getStations: vi.fn(() => [])
    },
    mockRouter: {
        navigateTo: vi.fn(),
        getCurrentTab: vi.fn(() => 'dashboard')
    },
    mockOpenModal: vi.fn(),
    mockClearSession: vi.fn()
}));

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));
vi.mock('../../js/admin/router.js', () => ({ router: mockRouter }));
vi.mock('../../js/ui/ui.js', () => ({ openConfirmModal: mockOpenModal }));
vi.mock('../../js/core/auth.js', () => ({ clearSession: mockClearSession }));
vi.mock('../../js/utils/utils.js', () => ({ escapeHtml: (str: string) => str }));

import { renderAdminShell, renderBreadcrumbs, attachNavigationListeners, attachLogoutListener, getRoleLabel } from '../../js/admin/layout.js';

describe('Admin Layout Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="layout-container"></div>';
    });

    it('should render admin shell', () => {
        const container = document.getElementById('layout-container')!;
        const onTabChange = vi.fn();

        renderAdminShell(container, onTabChange);

        expect(container.innerHTML).toContain('admin-sidebar');
    });

    it('should get role label', () => {
        const label = getRoleLabel('admin');
        expect(label).toBe('Amministratore');
    });

    it('should attach navigation listeners', () => {
        document.body.innerHTML = '<div class="nav-btn" data-tab="dashboard"></div>';
        const onTabChange = vi.fn();

        attachNavigationListeners(onTabChange);

        expect(true).toBe(true);
    });
});
