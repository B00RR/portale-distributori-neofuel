import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUI } = vi.hoisted(() => ({
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn()
    }
}));

vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/ui/components/ClosureWizard.js', () => ({}));

import { startClosureWizard } from '../../js/operator/closure.js';

describe('Operator Closure Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div>';
    });

    it('should open modal for closure', async () => {
        await startClosureWizard('ST-1', 'USER-1');

        expect(mockUI.openModal).toHaveBeenCalled();
        const modalBody = document.getElementById('modal-body');
        expect(modalBody?.innerHTML).toContain('closure-wizard');
    });

    it('should set attributes on wizard', async () => {
        await startClosureWizard('ST-1', 'USER-1');

        const wizard = document.querySelector('closure-wizard');
        expect(wizard).not.toBeNull();
        expect(wizard?.getAttribute('stationId')).toBe('ST-1');
    });
});
