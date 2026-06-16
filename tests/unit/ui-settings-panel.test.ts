/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderSettingsPanel } from '../../js/ui/ui-settings-panel.js';
import { BusinessLogicManager } from '../../js/core/business-logic-manager.js';

describe('UI Settings Panel', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    it('should safely escape error messages to prevent XSS', async () => {
        const container = document.createElement('div');

        // Mock to throw an error with XSS payload
        vi.spyOn(BusinessLogicManager, 'loadRules').mockRejectedValue(new Error('<img src="x" onerror="alert(1)">'));

        await renderSettingsPanel(container);

        const rulesGrid = container.querySelector('#business-rules-grid');
        expect(rulesGrid).toBeTruthy();
        expect(rulesGrid?.innerHTML).not.toContain('<img src="x" onerror="alert(1)">');
        expect(rulesGrid?.innerHTML).toContain('&lt;img src="x" onerror="alert(1)"&gt;');
    });
});
