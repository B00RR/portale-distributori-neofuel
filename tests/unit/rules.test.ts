import { describe, it, expect } from 'vitest';
import {
    validateVoucher,
    summarizeMovimenti,
    calculateTheoreticRevenue,
    calculateExpectedCash,
    type Voucher,
    type Movement,
    type RevenueParams,
    type CashParams
} from '../../js/core/rules.js';

describe('Business Rules', () => {

    describe('validateVoucher', () => {
        it('should return valid:true for active voucher with future expiration', () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);

            const voucher: Voucher = {
                id: '123',
                code: 'TEST-001',
                amount: 50,
                status: 'active',
                expiration_date: futureDate.toISOString()
            };

            const result = validateVoucher(voucher);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should return error for null voucher', () => {
            const result = validateVoucher(null);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Voucher inesistente');
            expect(result.reason).toBe('not_found');
        });

        it('should return error for undefined voucher', () => {
            const result = validateVoucher(undefined);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Voucher inesistente');
            expect(result.reason).toBe('not_found');
        });

        it('should return error for redeemed voucher', () => {
            const voucher: Voucher = {
                id: '456',
                code: 'TEST-002',
                amount: 100,
                status: 'redeemed',
                redeemed_at: '2024-01-15T10:30:00Z'
            };

            const result = validateVoucher(voucher);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Voucher Già Riscattato');
            expect(result.reason).toBe('redeemed');
            expect(result.details?.date).toBe('2024-01-15T10:30:00Z');
        });

        it('should return error for expired voucher (by status)', () => {
            const voucher: Voucher = {
                id: '789',
                code: 'TEST-003',
                amount: 25,
                status: 'expired'
            };

            const result = validateVoucher(voucher);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Voucher Scaduto');
            expect(result.reason).toBe('expired');
        });

        it('should return error for expired voucher (by date)', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 10);

            const voucher: Voucher = {
                id: '999',
                code: 'TEST-004',
                amount: 75,
                status: 'active',
                expiration_date: pastDate.toISOString()
            };

            const result = validateVoucher(voucher);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Voucher Scaduto');
            expect(result.reason).toBe('expired');
            expect(result.details?.date).toBe(pastDate.toISOString());
        });
    });

    describe('summarizeMovimenti', () => {
        it('should return zeros for empty array', () => {
            const result = summarizeMovimenti([]);
            expect(result.credits).toBe(0);
            expect(result.vouchers).toBe(0);
            expect(result.refunds).toBe(0);
            expect(result.extra_cash).toBe(0);
        });

        it('should sum credits correctly', () => {
            const movimenti: Movement[] = [
                { tipo: 'credito', importo: 50 },
                { tipo: 'altro', importo: 30, descrizione: 'Credito cliente' },
                { tipo: 'incasso', importo: 20, descrizione: 'credito speciale' } // Should NOT count (tipo incasso)
            ];

            const result = summarizeMovimenti(movimenti);
            expect(result.credits).toBe(80); // 50 + 30
        });

        it('should sum vouchers correctly', () => {
            const movimenti: Movement[] = [
                { tipo: 'voucher', importo: 25 },
                { tipo: 'punti', importo: 15 },
                { tipo: 'altro', importo: 10, descrizione: 'Riscatto voucher' },
                { tipo: 'altro', importo: 5, descrizione: 'Punti fedeltà' }
            ];

            const result = summarizeMovimenti(movimenti);
            expect(result.vouchers).toBe(55); // 25 + 15 + 10 + 5
        });

        it('should sum refunds correctly', () => {
            const movimenti: Movement[] = [
                { tipo: 'pagamento', importo: 100 },
                { tipo: 'uscita', importo: 50 },
                { tipo: 'altro', importo: 25, descrizione: 'Rimborso cliente' }
            ];

            const result = summarizeMovimenti(movimenti);
            expect(result.refunds).toBe(175); // 100 + 50 + 25
        });

        it('should sum extra_cash correctly', () => {
            const movimenti: Movement[] = [
                { tipo: 'incasso', importo: 200 },
                { tipo: 'incasso', importo: 150, descrizione: 'Extra revenue' }
            ];

            const result = summarizeMovimenti(movimenti);
            expect(result.extra_cash).toBe(350); // 200 + 150
        });

        it('should handle mixed movements correctly', () => {
            const movimenti: Movement[] = [
                { tipo: 'credito', importo: 100 },
                { tipo: 'voucher', importo: 50 },
                { tipo: 'pagamento', importo: 30 },
                { tipo: 'incasso', importo: 20 }
            ];

            const result = summarizeMovimenti(movimenti);
            expect(result.credits).toBe(100);
            expect(result.vouchers).toBe(50);
            expect(result.refunds).toBe(30);
            expect(result.extra_cash).toBe(20);
        });
    });

    describe('calculateTheoreticRevenue', () => {
        it('should calculate revenue correctly with positive numbers', () => {
            const params: RevenueParams = {
                litersB: 100,
                litersG: 50,
                priceB: 1.80,
                priceG: 1.95
            };

            const result = calculateTheoreticRevenue(params);
            // (100 * 1.80) + (50 * 1.95) = 180 + 97.5 = 277.5
            expect(result).toBe(277.5);
        });

        it('should handle zero values', () => {
            const params: RevenueParams = {
                litersB: 0,
                litersG: 100,
                priceB: 1.80,
                priceG: 0
            };

            const result = calculateTheoreticRevenue(params);
            expect(result).toBe(0);
        });

        it('should round to 2 decimal places', () => {
            const params: RevenueParams = {
                litersB: 33.333,
                litersG: 66.666,
                priceB: 1.799,
                priceG: 1.899
            };

            const result = calculateTheoreticRevenue(params);
            // (33.333 * 1.799) + (66.666 * 1.899) = 59.966067 + 126.597534 = 186.563601
            expect(result).toBeCloseTo(186.56, 2);
        });
    });

    describe('calculateExpectedCash', () => {
        it('should calculate expected cash correctly with all inputs', () => {
            const params: CashParams = {
                carburanteAtteso: 1000,
                totalPosOperatore: 200,
                totalUtaOperatore: 100,
                selfPos: 50,
                creditsSum: 30,
                vouchersSum: 20,
                selfCashIn: 500,
                selfCashOut: 100,
                refundsSum: 10,
                extraCashSum: 50,
                cashReal: 1040,
                tolerance: 5
            };

            const result = calculateExpectedCash(params);
            // Expected = 1000 - 200 - 100 - 50 - 30 - 20 + (500-100) - 10 + 50 = 1040
            expect(result.expected_cash).toBe(1040);
            expect(result.cash_diff).toBe(0); // 1040 - 1040
            expect(result.is_valid).toBe(true);
        });

        it('should mark as valid when difference is within tolerance', () => {
            const params: CashParams = {
                carburanteAtteso: 1000,
                totalPosOperatore: 200,
                totalUtaOperatore: 100,
                selfPos: 50,
                creditsSum: 30,
                vouchersSum: 20,
                selfCashIn: 0,
                selfCashOut: 0,
                refundsSum: 0,
                extraCashSum: 0,
                cashReal: 603, // Expected: 600, diff: 3
                tolerance: 5
            };

            const result = calculateExpectedCash(params);
            expect(result.expected_cash).toBe(600);
            expect(result.cash_diff).toBe(3);
            expect(result.is_valid).toBe(true); // 3 <= 5
        });

        it('should mark as invalid when difference exceeds tolerance', () => {
            const params: CashParams = {
                carburanteAtteso: 1000,
                totalPosOperatore: 200,
                totalUtaOperatore: 100,
                selfPos: 50,
                creditsSum: 30,
                vouchersSum: 20,
                selfCashIn: 0,
                selfCashOut: 0,
                refundsSum: 0,
                extraCashSum: 0,
                cashReal: 610, // Expected: 600, diff: 10
                tolerance: 5
            };

            const result = calculateExpectedCash(params);
            expect(result.expected_cash).toBe(600);
            expect(result.cash_diff).toBe(10);
            expect(result.is_valid).toBe(false); // 10 > 5
        });

        it('should handle missing/undefined values as zero', () => {
            const params: Partial<CashParams> = {
                carburanteAtteso: 1000,
                totalPosOperatore: 200,
                totalUtaOperatore: undefined,
                selfPos: null as unknown as undefined,
                creditsSum: 0,
                vouchersSum: 0,
                selfCashIn: 0,
                selfCashOut: 0,
                refundsSum: 0,
                extraCashSum: 0,
                cashReal: 800
            };

            const result = calculateExpectedCash(params as unknown as CashParams);
            // Expected = 1000 - 200 - 0 - 0 - 0 - 0 + 0 - 0 + 0 = 800
            expect(result.expected_cash).toBe(800);
            expect(result.cash_diff).toBe(0);
            expect(result.is_valid).toBe(true);
        });
    });
});
