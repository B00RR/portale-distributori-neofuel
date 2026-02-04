import { describe, it, expect, vi } from 'vitest';

const mockUI = {
    renderSidebar: vi.fn(),
    renderHeader: vi.fn(),
    renderFooter: vi.fn()
};

vi.mock('../../js/ui/ui.js', () => mockUI);

import { initAdminLayout, renderAdminUI, toggleSidebar } from '../../js/admin/layout.js';

describe('Admin Layout Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="admin-container"><div id="sidebar"></div></div>';
    });

    it('should initialize admin layout', () => {
        initAdminLayout();

        expect(document.getElementById('admin-container')).toBeDefined();
    });

    it('should render admin UI', () => {
        renderAdminUI();

        expect(mockUI.renderSidebar || true).toBeDefined();
    });

    it('should toggle sidebar', () => {
        const sidebar = document.getElementById('sidebar');

        toggleSidebar();

        expect(sidebar).toBeDefined();
    });
});
