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

    describe('startClosureWizard', () => {
        it('should open modal and render closure-wizard component', async () => {
            await startClosureWizard('ST-123', 'user-456');

            expect(mockUI.openModal).toHaveBeenCalledWith('Chiusura Turno');

            const wizard = modalBody?.querySelector('closure-wizard');
            expect(wizard).not.toBeNull();
            expect(wizard?.getAttribute('stationId')).toBe('ST-123');
            expect(wizard?.getAttribute('userId')).toBe('user-456');
        });

        it('should attach cancel event listener to close modal', async () => {
            await startClosureWizard('ST-123', 'user-456');

            const wizard = document.querySelector('closure-wizard');
            const cancelEvent = new Event('cancel');
            wizard?.dispatchEvent(cancelEvent);

            expect(mockUI.closeModal).toHaveBeenCalled();
        });

        it('should handle errors and display error message', async () => {
            document.body.innerHTML = ''; // No modal-body

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            await startClosureWizard('ST-123', 'user-456');

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should convert numeric userId to string', async () => {
            await startClosureWizard(456, 789);

            const wizard = document.querySelector('closure-wizard');
            expect(wizard?.getAttribute('stationId')).toBe('456');
            expect(wizard?.getAttribute('userId')).toBe('789');
        });
    });
});
