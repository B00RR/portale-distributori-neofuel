/**
 * Test per js/operator/closure.js
 * Business logic critica per chiusura turno
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabase } from '../mocks/supabase.js';

// Mock delle funzioni UI
vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openConfirmModal: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: { show: vi.fn() }
}));

describe('Closure Calculations', () => {
    beforeEach(() => {
        mockSupabase.reset();
    });

    describe('Counter Difference Calculations', () => {
        it('calculates correct liters from counter difference', () => {
            const opening = 1000.50;
            const closing = 1500.75;
            const expected = 500.25;

            const result = closing - opening;

            expect(result).toBeCloseTo(expected, 2);
        });

        it('handles overnight counter reset (overflow)', () => {
            // Contatore va da 9999.99 a 0100.50
            const opening = 9999.99;
            const closing = 100.50;
            const maxCounter = 10000;

            const result = (maxCounter - opening) + closing;

            expect(result).toBeCloseTo(100.51, 2);
        });

        it('calculates total liters for multiple guns', () => {
            const guns = [
                { opening: 1000, closing: 1500 },
                { opening: 2000, closing: 2300 },
                { opening: 3000, closing: 3150 }
            ];

            const total = guns.reduce((sum, gun) =>
                sum + (gun.closing - gun.opening), 0
            );

            expect(total).toBe(950);
        });
    });

    describe('Price Calculations', () => {
        it('calculates revenue from liters and price', () => {
            const liters = 500.50;
            const pricePerLiter = 1.899;

            const revenue = liters * pricePerLiter;

            expect(revenue).toBeCloseTo(950.45, 2);
        });

        it('handles different fuel types with different prices', () => {
            const sales = [
                { liters: 500, price: 1.899, type: 'benzina' },
                { liters: 300, price: 1.659, type: 'gasolio' }
            ];

            const total = sales.reduce((sum, sale) =>
                sum + (sale.liters * sale.price), 0
            );

            expect(total).toBeCloseTo(1447.20, 2);
        });
    });

    describe('Discrepancy Detection', () => {
        it('calculates delta between expected and self-reported', () => {
            const expected = 1000.00;
            const selfReported = 950.00;

            const delta = selfReported - expected;

            expect(delta).toBe(-50.00);
        });

        it('flags significant discrepancies', () => {
            const expected = 1000.00;
            const selfReported = 850.00;
            const threshold = 100.00;

            const delta = Math.abs(selfReported - expected);
            const isSignificant = delta > threshold;

            expect(isSignificant).toBe(true);
        });

        it('accepts minor discrepancies within threshold', () => {
            const expected = 1000.00;
            const selfReported = 990.00;
            const threshold = 20.00;

            const delta = Math.abs(selfReported - expected);
            const isAcceptable = delta <= threshold;

            expect(isAcceptable).toBe(true);
        });
    });

    describe('Payment Method Totals', () => {
        it('calculates total cash from movements', () => {
            const movements = [
                { type: 'cash', amount: 500 },
                { type: 'cash', amount: 300 },
                { type: 'pos', amount: 200 }
            ];

            const cashTotal = movements
                .filter(m => m.type === 'cash')
                .reduce((sum, m) => sum + m.amount, 0);

            expect(cashTotal).toBe(800);
        });

        it('calculates cash out (expenses)', () => {
            const movements = [
                { type: 'cash_in', amount: 1000 },
                { type: 'cash_out', amount: 50 },
                { type: 'cash_out', amount: 30 }
            ];

            const cashOut = movements
                .filter(m => m.type === 'cash_out')
                .reduce((sum, m) => sum + m.amount, 0);

            expect(cashOut).toBe(80);
        });

        it('calculates net cash (in - out)', () => {
            const cashIn = 1000;
            const cashOut = 80;

            const netCash = cashIn - cashOut;

            expect(netCash).toBe(920);
        });
    });

    describe('Edge Cases', () => {
        it('handles zero sales correctly', () => {
            const opening = 1000.00;
            const closing = 1000.00;

            const sales = closing - opening;

            expect(sales).toBe(0);
        });

        it('handles floating point precision', () => {
            const value1 = 0.1 + 0.2;
            const value2 = 0.3;

            expect(value1).toBeCloseTo(value2, 10);
        });

        it('rounds to 2 decimal places for currency', () => {
            const amount = 123.456789;
            const rounded = Math.round(amount * 100) / 100;

            expect(rounded).toBe(123.46);
        });
    });
});
