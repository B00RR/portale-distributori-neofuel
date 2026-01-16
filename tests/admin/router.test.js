// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { router } from '../../js/admin/router.js';

// Mock dependencies
vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn()
}));

vi.mock('../../js/shared/error-handler.js', () => ({
    handleError: vi.fn()
}));

vi.mock('../../js/shared/state.js', () => ({
    store: {
        getFilter: vi.fn(() => null)
    }
}));

// Mock all tab modules
vi.mock('../../js/admin/dashboard.js', () => ({
    showDashboard: vi.fn()
}));

vi.mock('../../js/admin/stations.js', () => ({
    showStationsTab: vi.fn()
}));

vi.mock('../../js/admin/operators.js', () => ({
    showOperatorsTab: vi.fn()
}));

vi.mock('../../js/admin/shifts.js', () => ({
    showChiusureTab: vi.fn()
}));

vi.mock('../../js/admin/credits.js', () => ({
    showCreditiOverview: vi.fn()
}));

vi.mock('../../js/admin/invoices.js', () => ({
    showFattureTab: vi.fn()
}));

vi.mock('../../js/admin/logic.js', () => ({
    showSettingsTab: vi.fn()
}));

describe('Admin Router', () => {
    beforeEach(() => {
        // Reset router state
        router.currentTab = 'dashboard';
        router.userRole = null;
        router.isFullAdmin = false;

        // Mock DOM elements
        global.document = {
            getElementById: vi.fn((id) => {
                if (id === 'admin-content') return {};
                if (id === 'page-subtitle') return { textContent: '' };
                return null;
            }),
            querySelectorAll: vi.fn(() => [])
        };
    });

    describe('Initialization', () => {
        it('should initialize with operator role by default', () => {
            router.init('operator');
            expect(router.userRole).toBe('operator');
            expect(router.isFullAdmin).toBe(false);
        });

        it('should recognize admin role', () => {
            router.init('admin');
            expect(router.userRole).toBe('admin');
            expect(router.isFullAdmin).toBe(true);
        });

        it('should recognize super_admin role', () => {
            router.init('super_admin');
            expect(router.isFullAdmin).toBe(true);
        });
    });

    describe('Permission Checks', () => {
        it('should allow admin access to all tabs', () => {
            router.init('admin');
            expect(router.checkPermission('stations')).toBe(true);
            expect(router.checkPermission('operators')).toBe(true);
            expect(router.checkPermission('settings')).toBe(true);
            expect(router.checkPermission('shifts')).toBe(true);
            expect(router.checkPermission('vouchers')).toBe(true);
        });

        it('should restrict operator from admin-only tabs', () => {
            router.init('operator');
            expect(router.checkPermission('stations')).toBe(false);
            expect(router.checkPermission('operators')).toBe(false);
            expect(router.checkPermission('settings')).toBe(false);
        });

        it('should allow accounting access to shifts and vouchers', () => {
            router.init('accounting');
            expect(router.checkPermission('shifts')).toBe(true);
            expect(router.checkPermission('vouchers')).toBe(true);
            expect(router.checkPermission('analytics')).toBe(true);
            expect(router.checkPermission('crediti')).toBe(true);
        });

        it('should allow billing access to invoices', () => {
            router.init('billing');
            expect(router.checkPermission('invoices')).toBe(true);
        });

        it('should restrict billing from other tabs', () => {
            router.init('billing');
            expect(router.checkPermission('operators')).toBe(false);
            expect(router.checkPermission('stations')).toBe(false);
        });
    });

    describe('Navigation', () => {
        it('should update current tab', () => {
            router.init('admin');
            router.navigateTo('stations');
            expect(router.getCurrentTab()).toBe('stations');
        });

        it('should show error for unauthorized access', async () => {
            router.init('operator');
            const content = { innerHTML: '' };
            global.document.getElementById = vi.fn(() => content);

            await router.navigateTo('stations');
            expect(content.innerHTML).toContain('Accesso Negato');
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing DOM elements gracefully', async () => {
            global.document.getElementById = vi.fn(() => null);
            router.init('admin');

            // Should not throw
            await expect(router.navigateTo('dashboard')).resolves.not.toThrow();
        });

        it('should default to dashboard for unknown tab', async () => {
            router.init('admin');
            const content = {};
            global.document.getElementById = vi.fn(() => content);

            await router.loadTab('unknown-tab', content, null, null);
            // Should have called showDashboard (default case)
        });
    });
});
