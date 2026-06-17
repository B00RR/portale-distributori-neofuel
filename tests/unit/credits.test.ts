/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUtils, mockOpening } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn(),
            maybeSingle: vi.fn(),
            single: vi.fn(),
            insert: vi.fn(),
            update: vi.fn()
        }))
    },
    mockToast: { show: vi.fn() },
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showInfoModal: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str),
        formatEuro: vi.fn((val) => `€${val.toFixed(2)}`)
    },
    mockOpening: {
        checkOpeningStatus: vi.fn()
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/operator/opening.js', () => mockOpening);

import { showCreditsMenu, processNewCredit, processPayment } from '../../js/operator/credits.js';

describe('Credits Module - Logic and UI Verification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div>';
    });

    it('should warn if no shift open', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue(null);
        await showCreditsMenu('123', '456');
        const modalBody = document.getElementById('modal-body');
        expect(modalBody?.innerHTML).toContain('Nessun Turno Aperto');
    });

    it('should render credits menu', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
        await showCreditsMenu('123', '456');
        const modalBody = document.getElementById('modal-body');
        expect(modalBody?.innerHTML).toContain('Nuovo Credito');
        expect(modalBody?.innerHTML).toContain('Pagamento');
    });

    it('should include importo: 0 when creating a new customer in processNewCredit', async () => {
        // Mock customer not found, then successful creation
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'CUST-1', saldo: 0 }, error: null }),
            update: vi.fn().mockReturnThis()
        });

        await processNewCredit('123', '456', 'Nuovo Cliente', 100, 'Gasolio', 'Test note');

        // Check customer creation includes importo: 0
        expect(mockSupabase.from).toHaveBeenCalledWith('crediti_clienti');
        expect(mockSupabase.from().insert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                cliente: 'Nuovo Cliente',
                importo: 0
            })
        ]));
    });

    it('should correctly process a payment in processPayment', async () => {
        mockSupabase.from.mockReturnValue({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ error: null })
        });

        const customer = { id: 'CUST-1', cliente: 'Cliente Test', saldo: 150 };
        await processPayment('123', '456', customer as any, 50, 'contanti');

        // Verify balance update
        expect(mockSupabase.from).toHaveBeenCalledWith('crediti_clienti');
        expect(mockSupabase.from().update).toHaveBeenCalledWith(expect.objectContaining({
            saldo: 100
        }));

        // Verify movements recorded
        expect(mockSupabase.from).toHaveBeenCalledWith('crediti_movimenti');
        expect(mockSupabase.from().insert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                tipo: 'incasso',
                importo: 50,
                metodo: 'contanti'
            })
        ]));
    });

    it('should have standard styled "Tutto" button in payment modal', async () => {
        // This requires mocking the flow to open the payment modal
        const { showPaymentModal } = await import('../../js/operator/credits.js') as any;
        const customer = { id: 'CUST-1', cliente: 'Cliente Test', saldo: 150 };

        // We can't easily call internal showPaymentModal unless we export it or trigger it via UI
        // Let's trigger it via UI by mocking the list of debtors
        mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [customer], error: null })
        });

        await showCreditsMenu('123', '456');
        document.getElementById('btn-payment-credit')?.click();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Click on the result item
        const resultItem = document.querySelector('.result-item') as HTMLElement;
        resultItem.click();

        // Check the modal content for the "Tutto" button class
        const tuttoBtn = document.getElementById('btn-full-amount');
        expect(tuttoBtn?.className).toContain('menu-button');
        expect(tuttoBtn?.className).toContain('secondary');
    });

    it('should have clean dropdown options (no parentheses)', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [{ id: 1, cliente: 'Test', saldo: 10 }], error: null })
        });

        await showCreditsMenu('123', '456');
        document.getElementById('btn-payment-credit')?.click();
        await new Promise(resolve => setTimeout(resolve, 50));
        (document.querySelector('.result-item') as HTMLElement).click();

        const select = document.getElementById('pay-method') as HTMLSelectElement;
        const options = Array.from(select.options).map(o => o.text);

        expect(options[0]).toBe('Contanti');
        expect(options[1]).toBe('POS');
        expect(options).not.toContain(expect.stringContaining('('));
    });
});
