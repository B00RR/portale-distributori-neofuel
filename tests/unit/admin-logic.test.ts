import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRenderSettingsPanel } = vi.hoisted(() => ({
    mockRenderSettingsPanel: vi.fn()
}));

vi.mock('../../js/ui/ui-settings-panel.js', () => ({
    renderSettingsPanel: mockRenderSettingsPanel
}));

import { showSettingsTab } from '../../js/admin/logic.js';

describe('Admin Logic Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="settings-container"></div>';
    });

    it('should show settings tab', async () => {
        const container = document.getElementById('settings-container')!;

        await showSettingsTab(container, null);

        expect(mockRenderSettingsPanel).toHaveBeenCalled();
    });

    it('should render settings shell', async () => {
        const container = document.getElementById('settings-container')!;

        await showSettingsTab(container, null);

        expect(container.innerHTML).toContain('settings-shell');
    });
});
