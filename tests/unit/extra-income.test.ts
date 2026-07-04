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

import { showExtraIncomeMenu } from '../../js/operator/extra-income.js';

describe('Operator Extra Income Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div>';
    });

    describe('showExtraIncomeMenu', () => {
        it('should warn if no shift is open', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue(null);

            await showExtraIncomeMenu('ST-123', 'user-456');

            expect(mockUI.openModal).toHaveBeenCalledWith('Registra Incasso Extra');
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Nessun Turno Aperto');
        });

        it('should render form when shift is open', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });

            await showExtraIncomeMenu('ST-123', 'user-456');

            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.querySelector('#extra-income-form')).not.toBeNull();
        });

        it('should handle product type changes and required description', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });

            await showExtraIncomeMenu('ST-123', 'user-456');

            const productTypeSelect = document.getElementById('product-type') as HTMLSelectElement;
            const descriptionField = document.getElementById('description-field') as HTMLTextAreaElement;

            productTypeSelect.value = 'accessori';
            productTypeSelect.dispatchEvent(new Event('change'));

            expect(descriptionField.required).toBe(true);

            productTypeSelect.value = 'olio';
            productTypeSelect.dispatchEvent(new Event('change'));

            expect(descriptionField.required).toBe(false);
        });

        it('should submit form and save to database', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
            mockSupabase.from.mockReturnValue({
                insert: vi.fn(() => Promise.resolve({ error: null }))
            });

            await showExtraIncomeMenu('ST-123', 'user-456');

            const form = document.getElementById('extra-income-form') as HTMLFormElement;
            const amountInput = form.querySelector('[name="amount"]') as HTMLInputElement;
            const typeSelect = form.querySelector('[name="type"]') as HTMLSelectElement;
            const descriptionInput = form.querySelector('[name="description"]') as HTMLTextAreaElement;

            amountInput.value = '50.00';
            typeSelect.value = 'adblue';
            descriptionInput.value = 'Test sale';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockSupabase.from).toHaveBeenCalledWith('movimenti_cassa');
            expect(mockUI.closeModal).toHaveBeenCalled();
            expect(mockUI.showInfoModal).toHaveBeenCalledWith(expect.stringContaining('50.00'));
        });

        it('should show error on invalid amount', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });

            await showExtraIncomeMenu('ST-123', 'user-456');

            const form = document.getElementById('extra-income-form') as HTMLFormElement;
            const amountInput = form.querySelector('[name="amount"]') as HTMLInputElement;

            amountInput.value = '0';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('valido'), 'warning');
        });

        it('should handle database errors', async () => {
            mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
            mockSupabase.from.mockReturnValue({
                insert: vi.fn(() => Promise.resolve({ error: { message: 'DB error' } }))
            });

            await showExtraIncomeMenu('ST-123', 'user-456');

            const form = document.getElementById('extra-income-form') as HTMLFormElement;
            const amountInput = form.querySelector('[name="amount"]') as HTMLInputElement;

            amountInput.value = '100';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('DB error'), 'error');
        });
    });
});
