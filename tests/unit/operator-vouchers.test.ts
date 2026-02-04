import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    })),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null })
};

const mockToast = { show: vi.fn() };
const mockRules = { validateVoucher: vi.fn(() => true) };

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/core/rules.js', () => mockRules);

import { validateVoucherCode, redeemVoucher, checkVoucherExpiration } from '../../js/operator/vouchers.js';

describe('Operator Vouchers Module (LEGACY)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should validate active voucher code', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    id: 1,
                    code: 'VOUCHER2024',
                    amount: 50,
                    status: 'active',
                    expires_at: '2025-12-31'
                },
                error: null
            })
        });

        const result = await validateVoucherCode('VOUCHER2024');

        expect(result.valid).toBe(true);
        expect(result.voucher?.amount).toBe(50);
    });

    it('should reject expired voucher', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    id: 2,
                    code: 'EXPIRED2020',
                    amount: 100,
                    status: 'active',
                    expires_at: '2020-01-01'
                },
                error: null
            })
        });

        const result = await validateVoucherCode('EXPIRED2020');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('scaduto');
    });

    it('should reject already redeemed voucher', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    id: 3,
                    code: 'USED123',
                    amount: 75,
                    status: 'redeemed',
                    expires_at: '2025-12-31',
                    redeemed_at: '2024-01-15'
                },
                error: null
            })
        });

        const result = await validateVoucherCode('USED123');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('già utilizzato');
    });

    it('should reject invalid voucher code', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null
            })
        });

        const result = await validateVoucherCode('INVALID999');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non trovato');
    });

    it('should redeem valid voucher successfully', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: { success: true },
            error: null
        });

        const result = await redeemVoucher('VOUCHER2024', 'ST-123', 'user-456');

        expect(mockSupabase.rpc).toHaveBeenCalledWith(
            'redeem_voucher_validated',
            expect.any(Object)
        );
        expect(result.success).toBe(true);
    });

    it('should check voucher expiration date', () => {
        const today = new Date();
        const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const pastDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        const futureDateStr = futureDate.toISOString().split('T')[0];
        const pastDateStr = pastDate.toISOString().split('T')[0];

        expect(checkVoucherExpiration(futureDateStr)).toBe(false); // Not expired
        expect(checkVoucherExpiration(pastDateStr)).toBe(true); // Expired
    });

    it('should handle redemption errors', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: null,
            error: { message: 'Redemption failed' }
        });

        const result = await redeemVoucher('VOUCHER2024', 'ST-123', 'user-456');

        expect(result.success).toBe(false);
        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('Error'),
            'error'
        );
    });
});
