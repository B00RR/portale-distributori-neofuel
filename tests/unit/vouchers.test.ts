import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    showVoucherAdminTab
} from '../../js/admin/vouchers_reboot.js';

// --- MOCKS ---

vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(function () { return this; }),
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            eq: vi.fn(function () { return this; }),
            insert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: { id: 'batch-123' }, error: null }))
                })),
                then: vi.fn((cb) => Promise.resolve({ error: null }).then(cb)) // Handle direct await on insert if needed
            }))
        }))
    }
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: { show: vi.fn() }
}));

vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn(),
    showInfoModal: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../js/utils/utils.js', () => ({
    escapeHtml: vi.fn((s) => s || ''),
    formatEuro: vi.fn((n) => `€ ${n}`),
    formatDate: vi.fn((d) => d)
}));

describe('Vouchers Reboot Module', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        vi.clearAllMocks();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('showVoucherAdminTab', () => {
        it('should render the tab buttons', async () => {
            const { supabase } = await import('../../js/core/api.js');
            // Mock customer load
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: [{ id: 1, cliente: 'Test Customer' }], error: null }))
                })),
                eq: vi.fn(function () { return this; })
            } as any);

            await showVoucherAdminTab(container);

            expect(container.innerHTML).toContain('Genera');
            expect(container.innerHTML).toContain('Dashboard');
        });

        it('should load customers on init', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const selectMock = vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null }))
            }));

            vi.mocked(supabase.from).mockReturnValue({
                select: selectMock
            } as any);

            await showVoucherAdminTab(container);

            expect(supabase.from).toHaveBeenCalledWith('crediti_clienti');
        });
    });

    describe('Generator Tab Interaction', () => {
        it('should render generator form by default', async () => {
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
            } as any);

            await showVoucherAdminTab(container);

            // Wait for render
            await new Promise(process.nextTick);

            const content = document.getElementById('voucher-content');
            expect(content?.innerHTML).toContain('Crea Nuovi Voucher');
            expect(content?.innerHTML).toContain('Valore (€)');
        });

        it('should handle voucher generation submission', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { Toast } = await import('../../js/ui/toast.js');

            // Setup mocks
            const insertBatchMock = vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: { id: 'batch-1' }, error: null }))
                }))
            }));
            const insertVouchersMock = vi.fn(() => Promise.resolve({ error: null }));

            vi.mocked(supabase.from).mockImplementation((table) => {
                if (table === 'crediti_clienti') return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) } as any;
                if (table === 'voucher_batches') return { insert: insertBatchMock } as any;
                if (table === 'vouchers') return { insert: insertVouchersMock } as any;
                return {} as any;
            });

            await showVoucherAdminTab(container);
            await new Promise(process.nextTick);

            const form = document.getElementById('voucher-generator-form') as HTMLFormElement;
            if (!form) throw new Error("Form not found");

            // Fill form data mocking
            // Since we digest FormData in handler, we can mock the values by creating inputs?
            // Easier: just let the handler run. The test inputs have defaults?
            // User inputs:
            const inputAmount = form.querySelector('input[name="amount"]') as HTMLInputElement;
            inputAmount.value = '10';
            const inputQty = form.querySelector('input[name="quantity"]') as HTMLInputElement;
            inputQty.value = '5';

            form.dispatchEvent(new Event('submit'));

            // Wait for async handler
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(insertBatchMock).toHaveBeenCalled(); // Batch creation
            expect(insertVouchersMock).toHaveBeenCalled(); // Voucher generation
            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('Voucher generati'), 'success');
        });
    });

    describe('Dashboard Tab', () => {
        it('should render dashboard stats and table', async () => {
            const { supabase } = await import('../../js/core/api.js');

            // Mock Stats calls
            // 1. Total Gen, 2. Redeemed, 3. Active
            // 4. Batches List, 5. All Vouchers (for stats)

            const mockBatches = [{ id: 'b1', created_at: '2024-01-01', customer_name: 'Client' }];
            const mockVouchers = [
                { batch_id: 'b1', amount: 10, status: 'active' },
                { batch_id: 'b1', amount: 10, status: 'redeemed' }
            ];

            let callCount = 0;
            vi.mocked(supabase.from).mockImplementation((table) => {
                if (table === 'crediti_clienti') return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) } as any;

                if (table === 'vouchers') {
                    // Hacky count simulation based on strict ordering of calls in code?
                    // Or check for .eq logic?
                    // The code chains .select(..., {count.., head..}).eq(...)
                    // Let's return a generic mock that handles all
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => Promise.resolve({ count: 10, data: null })), // for counts
                            // For "all vouchers" query:
                            then: undefined
                        })),
                        // If it's the "all vouchers" data query:
                        // It uses .select('batch_id...'). No .eq
                    } as any;
                }

                if (table === 'voucher_batches') {
                    return {
                        select: () => ({
                            order: () => Promise.resolve({ data: mockBatches, error: null })
                        })
                    } as any;
                }
                return {} as any;
            });

            // We need a more robust mock for the specific sequence in renderDashboard
            // It calls: 
            // 1. vouchers.select(*, count). 2. .eq(redeemed). 3. .eq(active)
            // 4. batches.select.order
            // 5. vouchers.select(fields)

            const fromMock = vi.fn((table) => {
                if (table === 'crediti_clienti') return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };

                if (table === 'voucher_batches') {
                    return { select: () => ({ order: () => Promise.resolve({ data: mockBatches, error: null }) }) };
                }

                if (table === 'vouchers') {
                    return {
                        select: (cols: any, opts: any) => {
                            if (opts?.count) {
                                // This is a count query
                                return {
                                    eq: () => Promise.resolve({ count: 5 }),
                                    then: (cb: any) => Promise.resolve({ count: 10 }).then(cb) // Default for total
                                };
                            }
                            // This is the data query
                            return Promise.resolve({ data: mockVouchers, error: null });
                        }
                    };
                }
                return {};
            });
            vi.mocked(supabase.from).mockImplementation(fromMock as any);

            await showVoucherAdminTab(container);

            // Click Dashboard tab
            const dashboardBtn = container.querySelector('[data-tab="dashboard"]');
            dashboardBtn?.dispatchEvent(new Event('click', { bubbles: true }));

            await new Promise(resolve => setTimeout(resolve, 50));

            const content = document.getElementById('voucher-content');
            expect(content?.innerHTML).toContain('Client'); // Data from batch
            expect(content?.innerHTML).toContain('Gestione Voucher');
        });
    });
});
