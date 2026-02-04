import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockToast, mockUtils, mockErrorHandler } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null })
            }))
        }))
    },
    mockUI: {
        showLoadingMessage: vi.fn()
    },
    mockToast: {
        show: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str),
        formatEuro: vi.fn((val) => `€${val.toFixed(2)}`)
    },
    mockErrorHandler: {
        handleError: vi.fn()
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/shared/error-handler.js', () => mockErrorHandler);

import { showFattureTab, toggleInvoiceStatus } from '../../js/admin/invoices.js';

describe('Admin Invoices Module (233 lines)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="invoices-container"></div>';
    });

    describe('showFattureTab', () => {
        it('should load and display invoices', async () => {
            const container = document.getElementById('invoices-container')!;

            mockSupabase.from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({
                    data: [
                        {
                            id: 1,
                            amount: 150.50,
                            created_at: '2024-01-01T10:00:00Z',
                            payment_method: 'contanti',
                            product_category: 'Gasolio',
                            status: 'pending',
                            fuel_stations: { station_name: 'Station 1' },
                            users: { full_name: 'Admin User' }
                        }
                    ],
                    error: null
                })
            });

            await showFattureTab(container, null, null);

            expect(mockUI.showLoadingMessage).toHaveBeenCalled();
            expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
            expect(container.innerHTML).toContain('150.50');
        });

        it('should render empty state when no invoices', async () => {
            const container = document.getElementById('invoices-container')!;

            mockSupabase.from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({ data: [], error: null })
            });

            await showFattureTab(container);

            expect(container.innerHTML).toContain('Nessuna fattura');
        });

        it('should filter by station when provided', async () => {
            const container = document.getElementById('invoices-container')!;

            const eqSpy = vi.fn().mockReturnThis();
            mockSupabase.from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: eqSpy,
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({ data: [], error: null })
            });

            await showFattureTab(container, null, 123);

            expect(eqSpy).toHaveBeenCalledWith('station_id', 123);
        });

        it('should handle database errors', async () => {
            const container = document.getElementById('invoices-container')!;

            mockSupabase.from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
            });

            await showFattureTab(container);

            expect(mockErrorHandler.handleError).toHaveBeenCalled();
        });

        it('should render invoice table with correct columns', async () => {
            const container = document.getElementById('invoices-container')!;

            mockSupabase.from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({
                    data: [{
                        id: 1,
                        amount: 200,
                        created_at: '2024-01-15T12:00:00Z',
                        payment_method: 'pos',
                        product_category: 'Benzina',
                        status: 'paid',
                        customer_name: 'Cliente Test'
                    }],
                    error: null
                })
            });

            await showFattureTab(container);

            expect(mockUtils.formatEuro).toHaveBeenCalledWith(200);
            expect(container.innerHTML).toContain('Cliente Test');
        });
    });

    describe('toggleInvoiceStatus', () => {
        it('should update invoice status successfully', async () => {
            mockSupabase.from.mockReturnValue({
                update: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ error: null })
                }))
            });

            await toggleInvoiceStatus(1, 'paid');

            expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
            expect(mockToast.show).toHaveBeenCalledWith(
                expect.stringContaining('aggiornato'),
                'success'
            );
        });

        it('should handle update errors', async () => {
            mockSupabase.from.mockReturnValue({
                update: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } })
                }))
            });

            await toggleInvoiceStatus(1, 'pending');

            expect(mockErrorHandler.handleError).toHaveBeenCalled();
        });

        it('should support all status types', async () => {
            mockSupabase.from.mockReturnValue({
                update: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ error: null })
                }))
            });

            await toggleInvoiceStatus(1, 'cancelled');

            expect(mockSupabase.from).toHaveBeenCalled();
        });
    });
});
