import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUIComponents, mockOpening, mockLogger } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            insert: vi.fn(() => Promise.resolve({ error: null }))
        }))
    },
    mockToast: { show: vi.fn() },
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showInfoModal: vi.fn()
    },
    mockUIComponents: {
        createErrorMessage: vi.fn((title, err) => `<div>${title}: ${err}</div>`),
        createFormActions: vi.fn((opts) => `<div><button id="btn-cancel">${opts.confirmText || 'Confirm'}</button></div>`)
    },
    mockOpening: {
        checkOpeningStatus: vi.fn()
    },
    mockLogger: {
        error: vi.fn(() => 'ERR-TEST'),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        getUserMessage: vi.fn((errorId: string) => `Si è verificato un errore. Riferimento: ${errorId}`)
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/core/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/operator/ui-components.js', () => mockUIComponents);
vi.mock('../../js/operator/opening.js', () => mockOpening);

import { showOutflowMenu } from '../../js/operator/outflows.js';

describe('Operator Outflows Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div>';
    });

    describe('showOutflowMenu', () => {
        it('should warn if no shift is open', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue(null);

            await showOutflowMenu('ST-123', 'user-456');

            expect(mockUI.openModal).toHaveBeenCalledWith('Registra Uscita Cassa');
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Nessun Turno Aperto');
        });

        it('should render form when shift is open', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });

            await showOutflowMenu('ST-123', 'user-456');

            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.querySelector('#outflow-form')).not.toBeNull();
        });

        it('should submit form and save to database', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
            mockSupabase.from.mockReturnValue({
                insert: vi.fn(() => Promise.resolve({ error: null }))
            });

            await showOutflowMenu('ST-123', 'user-456');

            const form = document.getElementById('outflow-form') as HTMLFormElement;
            const amountInput = form.querySelector('[name="amount"]') as HTMLInputElement;
            const typeSelect = form.querySelector('[name="type"]') as HTMLSelectElement;
            const descriptionInput = form.querySelector('[name="description"]') as HTMLTextAreaElement;

            amountInput.value = '75.50';
            typeSelect.value = 'rimborso';
            descriptionInput.value = 'Client refund';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockSupabase.from).toHaveBeenCalledWith('movimenti_cassa');
            expect(mockUI.closeModal).toHaveBeenCalled();
            expect(mockUI.showInfoModal).toHaveBeenCalledWith(expect.stringContaining('75.50'));
        });

        it('should show error on invalid amount', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });

            await showOutflowMenu('ST-123', 'user-456');

            const form = document.getElementById('outflow-form') as HTMLFormElement;
            const amountInput = form.querySelector('[name="amount"]') as HTMLInputElement;

            amountInput.value = '-10';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('valido'), 'warning');
        });

        it('should handle and log database errors', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
            mockSupabase.from.mockReturnValue({
                insert: vi.fn(() => Promise.resolve({ error: { message: 'Insert failed' } }))
            });

            await showOutflowMenu('ST-123', 'user-456');

            const form = document.getElementById('outflow-form') as HTMLFormElement;
            const amountInput = form.querySelector('[name="amount"]') as HTMLInputElement;
            const descriptionInput = form.querySelector('[name="description"]') as HTMLTextAreaElement;

            amountInput.value = '200';
            descriptionInput.value = 'Test';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockLogger.error).toHaveBeenCalledWith(
                'showOutflowMenu_submit',
                expect.objectContaining({ message: 'Insert failed' })
            );
            expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('Insert failed'), 'error');
        });
    });
});
