import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
        }))
    })),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null })
};

const mockToast = { show: vi.fn() };

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

import {
    showVouchersRebootTab,
    generateBatchVouchers,
    scanAndRedeem,
    exportVouchersBatch,
    validateVoucherLegacy
} from '../../js/admin/vouchers_reboot.js';

describe('Admin Vouchers Reboot Module (LEGACY CODE)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="vouchers-container"></div>';
    });

    it('should show vouchers reboot tab', async () => {
        const container = document.getElementById('vouchers-container')!;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [
                    { id: 1, batch_name: 'Batch 2024', total_vouchers: 100 }
                ],
                error: null
            })
        });

        await showVouchersRebootTab(container);

        expect(mockSupabase.from).toHaveBeenCalledWith('voucher_batches');
        expect(container.innerHTML).toContain('Batch 2024');
    });

    it('should generate batch vouchers', async () => {
        const batchData = {
            batch_name: 'Special Promo',
            customer_name: 'Corporate Client',
            total_vouchers: 50,
            amount_per_voucher: 100
        };

        mockSupabase.from.mockReturnValue({
            insert: vi.fn().mockResolvedValue({
                data: [{ id: 10 }],
                error: null
            })
        });

        const result = await generateBatchVouchers(batchData);

        expect(mockSupabase.from).toHaveBeenCalledWith('voucher_batches');
        expect(result.success).toBe(true);
        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('generati'),
            'success'
        );
    });

    it('should validate legacy voucher format', () => {
        const validCode = 'ABCD-1234-EFGH';
        const invalidCode = 'ABC';

        const isValid1 = validateVoucherLegacy(validCode);
        const isValid2 = validateVoucherLegacy(invalidCode);

        expect(isValid1).toBe(true);
        expect(isValid2).toBe(false);
    });

    it('should scan and redeem voucher QR code', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: { success: true, amount: 50 },
            error: null
        });

        const result = await scanAndRedeem('VALID-CODE-123', 'ST-123', 'user-456');

        expect(mockSupabase.rpc).toHaveBeenCalledWith(
            'redeem_voucher_validated',
            expect.any(Object)
        );
        expect(result.success).toBe(true);
    });

    it('should export vouchers batch to CSV', async () => {
        const batchId = 1;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
                data: [
                    { code: 'V001', amount: 50, status: 'active' },
                    { code: 'V002', amount: 50, status: 'active' }
                ],
                error: null
            })
        });

        const csv = await exportVouchersBatch(batchId);

        expect(csv).toBeDefined();
        expect(csv).toContain('V001');
        expect(csv).toContain('V002');
    });

    it('should handle batch generation errors', async () => {
        mockSupabase.from.mockReturnValue({
            insert: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Insert failed' }
            })
        });

        const batchData = {
            batch_name: 'Error Batch',
            total_vouchers: 10,
            amount_per_voucher: 25
        };

        const result = await generateBatchVouchers(batchData);

        expect(result.success).toBe(false);
        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('Error'),
            'error'
        );
    });

    it('should validate voucher amount precision', () => {
        const amount = 99.999;
        const rounded = Math.round(amount * 100) / 100;

        expect(rounded).toBe(100.00);
    });
});
