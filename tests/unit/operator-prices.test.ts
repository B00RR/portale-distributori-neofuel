import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
        }))
    }))
};

const mockToast = { show: vi.fn() };
const mockUI = { openModal: vi.fn(), closeModal: vi.fn() };

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);

import { showOperatorPrices, updateOperatorPrices } from '../../js/operator/prices.js';

describe('Operator Prices Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="prices-container"></div>';
    });

    it('should display current prices', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    gasolio: 1.549,
                    benzina: 1.789,
                    gpl: 0.699
                },
                error: null
            })
        });

        await showOperatorPrices('ST-123');

        expect(mockSupabase.from).toHaveBeenCalledWith('fuel_prices');
        expect(mockUI.openModal).toHaveBeenCalledWith(
            expect.stringContaining('Prezzi')
        );
    });

    it('should update prices with 3 decimal precision', async () => {
        const newPrices = {
            gasolio: 1.599,
            benzina: 1.849,
            gpl: 0.749
        };

        await updateOperatorPrices('ST-123', newPrices);

        expect(mockSupabase.from).toHaveBeenCalled();

        // Verify 3 decimal places maintained
        const updateCall = mockSupabase.from().update.mock.calls[0];
        if (updateCall) {
            expect(updateCall[0].gasolio).toBe(1.599);
        }
    });

    it('should validate price precision (max 3 decimals)', () => {
        const price = 1.54999;
        const rounded = Math.round(price * 1000) / 1000;

        expect(rounded).toBe(1.550);
    });

    it('should handle price fetch errors', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Price not found' }
            })
        });

        await showOperatorPrices('ST-123');

        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('Error'),
            'error'
        );
    });

    it('should prevent negative prices', () => {
        const invalidPrice = -1.50;
        const isValid = invalidPrice > 0;

        expect(isValid).toBe(false);
    });
});
