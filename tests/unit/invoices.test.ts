import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{ id: 1, created_at: '2024-01-01', amount: 100, product_category: 'Gasolio', status: 'paid' }],
                error: null
            }),
            update: vi.fn().mockResolvedValue({ data: { status: 'paid' }, error: null })
        }))
    },
    mockUI: {
        showLoadingMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        openConfirmModal: vi.fn().mockResolvedValue(true)
    },
    mockUtils: {
        formatEuro: vi.fn(v => `€${v}`),
        formatLitri: vi.fn(v => `${v}L`),
        getISODate: vi.fn(() => '2024-01-01'),
        escapeHtml: vi.fn(v => v)
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showFattureTab, toggleInvoiceStatus, deleteInvoice } from '../../js/admin/invoices.js';

describe('Admin Invoices Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="invoices-container"></div>';
    });

    it('should load and display invoices', async () => {
        const container = document.getElementById('invoices-container')!;
        await showFattureTab(container);

        expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
        expect(container.innerHTML).toContain('table');
    });

    it('should update invoice status successfully', async () => {
        await toggleInvoiceStatus('1', 'pending', 'paid');
        expect(mockSupabase.from).toHaveBeenCalled();
        expect(mockUI.openConfirmModal).toHaveBeenCalled();
    });
});
