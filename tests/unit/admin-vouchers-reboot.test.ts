import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
            delete: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null })
            }))
        }))
    },
    mockToast: { show: vi.fn() },
    mockUI: {
        showLoadingMessage: vi.fn(),
        showInfoModal: vi.fn(),
        openModal: vi.fn(),
        closeModal: vi.fn(),
        openConfirmModal: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str),
        formatEuro: vi.fn((val) => `€${val}`),
        formatDate: vi.fn((d) => d)
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showVoucherAdminTab } from '../../js/admin/vouchers_reboot.js';

describe('Admin Vouchers Reboot Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="voucher-container"></div>';
    });

    it('should render voucher admin tab', async () => {
        const container = document.getElementById('voucher-container')!;

        await showVoucherAdminTab(container);

        expect(container.innerHTML).toContain('voucher');
    });

    it('should load vouchers from database', async () => {
        const container = document.getElementById('voucher-container')!;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
                data: [{ id: '1', description: 'Batch 1', customer_name: 'Customer A' }],
                error: null
            })
        });

        await showVoucherAdminTab(container);

        expect(mockSupabase.from).toHaveBeenCalled();
    });
});
