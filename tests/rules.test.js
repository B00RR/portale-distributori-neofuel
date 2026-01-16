// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateVoucher } from '../js/core/rules.js';

describe('Business Rules: Voucher Validation', () => {

    it('rejects null voucher', () => {
        const result = validateVoucher(null);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('not_found');
    });

    it('rejects redeemed voucher', () => {
        const voucher = { status: 'redeemed', redeemed_at: '2023-01-01' };
        const result = validateVoucher(voucher);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('redeemed');
        expect(result.details.date).toBe('2023-01-01');
    });

    it('rejects expired voucher (status)', () => {
        const voucher = { status: 'expired' };
        const result = validateVoucher(voucher);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
    });

    it('rejects expired voucher (date in past)', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);

        const voucher = {
            status: 'active',
            expiration_date: pastDate.toISOString()
        };
        const result = validateVoucher(voucher);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
    });

    it('accepts valid active voucher', () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);

        const voucher = {
            status: 'active',
            expiration_date: futureDate.toISOString()
        };
        const result = validateVoucher(voucher);
        expect(result.valid).toBe(true);
    });

    it('accepts voucher without expiration date', () => {
        const voucher = { status: 'active', expiration_date: null };
        const result = validateVoucher(voucher);
        expect(result.valid).toBe(true);
    });

});
