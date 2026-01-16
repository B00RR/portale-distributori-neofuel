/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { summarizeMovimenti, calculateTheoreticRevenue, calculateExpectedCash } from '../../js/core/rules.js';

describe('Core Rules - Closure Calculations', () => {

    describe('summarizeMovimenti', () => {
        it('should correctly sum movements by type', () => {
            const movimenti = [
                { tipo: 'credito', importo: 10 },
                { tipo: 'incasso', importo: 50 },
                { tipo: 'voucher', importo: 5 },
                { tipo: 'pagamento', descrizione: 'rimborso', importo: 20 },
                { tipo: 'altro', descrizione: 'buono voucher', importo: 15 }
            ];

            const result = summarizeMovimenti(movimenti);
            expect(result.credits).toBe(10);
            expect(result.extra_cash).toBe(50);
            expect(result.vouchers).toBe(20); // 5 + 15
            expect(result.refunds).toBe(20);
        });
    });

    describe('calculateTheoreticRevenue', () => {
        it('should calculate correct revenue with rounding', () => {
            const result = calculateTheoreticRevenue({
                litersB: 10.55,
                litersG: 20,
                priceB: 1.859,
                priceG: 1.749
            });
            // 10.55 * 1.859 = 19.61245
            // 20 * 1.749 = 34.98
            // Total = 54.59245 -> 54.59
            expect(result).toBe(54.59);
        });
    });

    describe('calculateExpectedCash', () => {
        it('should calculate expected cash correctly', () => {
            const params = {
                carburanteAtteso: 1000,
                totalPosOperatore: 100,
                totalUtaOperatore: 50,
                selfPos: 200,
                creditsSum: 30,
                vouchersSum: 20,
                selfCashIn: 500,
                selfCashOut: 100,
                refundsSum: 10,
                extraCashSum: 40,
                cashReal: 1030,
                tolerance: 5
            };

            // Expected = 1000 - 100 - 50 - 200 - 30 - 20 + (500-100) - 10 + 40
            // Expected = 1000 - 100 - 50 - 200 - 30 - 20 + 400 - 10 + 40
            // Expected = 1030

            const result = calculateExpectedCash(params);
            expect(result.expected_cash).toBe(1030);
            expect(result.cash_diff).toBe(0);
            expect(result.is_valid).toBe(true);
        });

        it('should signal invalid if outside tolerance', () => {
            const params = {
                carburanteAtteso: 100,
                cashReal: 110,
                tolerance: 5
                // others default to 0
            };
            const result = calculateExpectedCash(params);
            expect(result.cash_diff).toBe(10);
            expect(result.is_valid).toBe(false);
        });
    });
});
