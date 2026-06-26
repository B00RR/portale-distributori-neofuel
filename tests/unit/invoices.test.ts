import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils, mockToast, mockErrorHandler } = vi.hoisted(() => {
    const queryBuilder: any = {};
    const chain = vi.fn((...args) => queryBuilder);
    const updateResult = { data: { status: 'paid' }, error: null };

    Object.assign(queryBuilder, {
        select: chain, eq: chain, gte: chain, lte: chain, order: chain, in: chain,
        update: vi.fn(() => ({
            eq: vi.fn(() => ({
                then: (resolve: any) => resolve(updateResult)
            }))
        })),
        then: (resolve: any) => resolve({
            data: [
                {
                    id: 1,
                    created_at: '2024-01-01',
                    amount: 100,
                    product_category: 'Gasolio',
                    status: 'completed', // Emit status so toggle button appears
                    user: { full_name: 'Test' }
                }
            ],
            error: null
        })
    });

    return {
        mockSupabase: {
            from: vi.fn(() => queryBuilder)
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
        },
        mockToast: {
            show: vi.fn()
        },
        mockErrorHandler: {
            handleError: vi.fn()
        }
    };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/shared/error-handler.js', () => mockErrorHandler);

import { showFattureTab } from '../../js/admin/invoices.js'; // Only import exported function

describe('Admin Invoices Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        document.body.innerHTML = `
            <div id="invoices-container"></div>
            <button class="nav-btn active">Tab</button>
        `;
    });

    it('should load table and toggle invoice status via click', async () => {
        const container = document.getElementById('invoices-container')!;
        await showFattureTab(container);

        await new Promise(r => setTimeout(r, 10)); // Render

        expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
        expect(container.innerHTML).toContain('table');

        // Find toggle button
        const btn = container.querySelector('.toggle-status') as HTMLElement;
        expect(btn).toBeTruthy();

        // Click it
        btn.click();

        await new Promise(r => setTimeout(r, 10)); // Async action

        expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
        // Check log or second call for update
        expect(mockToast.show).toHaveBeenCalledWith('Stato fattura aggiornato', 'success');
    });
});
