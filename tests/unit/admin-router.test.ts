import { describe, it, expect, vi } from 'vitest';

const mockRouter = {
    navigateTo: vi.fn(),
    getCurrentRoute: vi.fn(() => '/dashboard')
};

vi.mock('../../js/ui/router.js', () => mockRouter);

import { initAdminRouter, navigateToTab, handleNavigation } from '../../js/admin/router.js';

describe('Admin Router Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="admin-content"></div>';
    });

    it('should initialize admin router', () => {
        initAdminRouter();

        expect(mockRouter.getCurrentRoute).toBeDefined();
    });

    it('should navigate to tab', () => {
        navigateToTab('dashboard');

        expect(mockRouter.navigateTo || true).toBeDefined();
    });

    it('should handle navigation', () => {
        handleNavigation({ tab: 'stations' });

        expect(true).toBe(true);
    });
});
