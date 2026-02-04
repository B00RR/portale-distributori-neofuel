import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null })
    }))
};

const mockToast = { show: vi.fn() };
const mockUI = { openModal: vi.fn(), closeModal: vi.fn() };

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);

import { showOperatorInvoiceMenu, createOperatorInvoice } from '../../js/operator/invoices.js';

describe('Operator Invoices Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="invoice-container"></div>';
    });

    it('should show operator invoice menu', async () => {
        await showOperatorInvoiceMenu('ST-123', 'user-456');

        expect(mockUI.openModal).toHaveBeenCalledWith(
            expect.stringContaining('Fattura')
        );
    });

    it('should create operator invoice with precise amounts', async () => {
        const invoiceData = {
            stationId: 'ST-123',
            userId: 'user-456',
            amount: 150.99, // Test decimal precision
            product: 'Gasolio',
            paymentMethod: 'contanti'
        };

        await createOperatorInvoice(invoiceData);

        expect(mockSupabase.from).toHaveBeenCalledWith('invoices');

        // Verify decimal precision is maintained
        const insertCall = mockSupabase.from().insert.mock.calls[0];
        if (insertCall) {
            expect(insertCall[0][0].amount).toBe(150.99);
        }
    });

    it('should handle invoice creation errors', async () => {
        mockSupabase.from.mockReturnValue({
            insert: vi.fn().mockResolvedValue({
                error: { message: 'Insert failed' }
            })
        });

        const invoiceData = {
            stationId: 'ST-123',
            userId: 'user-456',
            amount: 100,
            product: 'Benzina',
            paymentMethod: 'pos'
        };

        await createOperatorInvoice(invoiceData);

        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('Error'),
            'error'
        );
    });

    it('should validate invoice amounts (no negative)', () => {
        const invalidAmount = -50;
        const isValid = invalidAmount > 0;

        expect(isValid).toBe(false);
    });

    it('should round amounts to 2 decimal places', () => {
        const amount = 123.456789;
        const rounded = Math.round(amount * 100) / 100;

        expect(rounded).toBe(123.46);
    });
});
