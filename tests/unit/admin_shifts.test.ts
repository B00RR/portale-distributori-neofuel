import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    showChiusureTab,
    showClosureDetails,
    openBulkExportModal,
    handleBulkExport,
    deleteClosure
} from '../../js/admin/shifts.js';
import { handleError } from '../../js/shared/error-handler.js';

// Mock dependencies
// Mock dependencies
vi.mock('../../js/core/api.js', () => {
    const query: any = {};
    const methods = ['select', 'eq', 'order', 'range', 'limit', 'gte', 'lte', 'in', 'single', 'maybeSingle', 'rpc'];
    methods.forEach(m => {
        query[m] = vi.fn(() => query);
    });
    // Ensure then is available for await
    query.then = (resolve: any) => resolve({ data: [{ id: 123, station_id: 'ST1' }], error: null, count: 1 });

    return {
        supabase: {
            from: vi.fn(() => query),
            rpc: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }
    };
});

vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn(),
        confirm: vi.fn(() => Promise.resolve(true))
    }
}));

vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn(),
    openModal: vi.fn((title) => {
        const body = document.createElement('div');
        body.id = 'modal-body';
        document.body.appendChild(body);
    }),
    closeModal: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../js/shared/state.js', () => ({
    store: {
        getState: vi.fn(() => ({ stationId: 'ST1' })),
        getFilters: vi.fn(() => ({ dateFrom: '', dateTo: '' })),
        getPagination: vi.fn(() => ({ page: 0, pageSize: 10, totalCount: 0 })),
        getFilter: vi.fn(() => 'ST1'),
        setPagination: vi.fn(),
        subscribe: vi.fn(() => () => { })
    }
}));

vi.mock('../../js/core/business-logic-manager.js', () => ({
    BusinessLogicManager: {
        loadRules: vi.fn(() => Promise.resolve({ force_close_hours_threshold: 24 })),
        saveRules: vi.fn(() => Promise.resolve())
    }
}));

vi.mock('../../js/admin/components/FilterBar.js', () => ({
    FilterBar: class {
        render = vi.fn();
        onFilter = vi.fn();
    }
}));

vi.mock('../../js/admin/components/Pagination.js', () => ({
    Pagination: class {
        render = vi.fn();
        onPageChange = vi.fn();
    }
}));

vi.mock('../../js/shared/error-handler.js', () => ({
    handleError: vi.fn()
}));

describe('Admin Shifts Module', () => {
    let container: HTMLElement;
    let actions: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
        actions = document.createElement('div');
        vi.clearAllMocks();
    });

    describe('showChiusureTab', () => {
        it('should render initial layout', async () => {
            await showChiusureTab(container, actions);
            expect(container.innerHTML).toContain('data-container');
            expect(actions.innerHTML).toContain('btn-bulk-export');
        });

        it('should show empty message when no closures', async () => {
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(supabase.from).mockReturnValueOnce({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockReturnThis(),
                then: (resolve: any) => resolve({ data: [], error: null, count: 0 })
            } as any);

            await showChiusureTab(container, actions);
            expect(container.innerHTML).toContain('Nessuna chiusura trovata');
        });

        it('should handle errors in renderTable', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { handleError } = await import('../../js/shared/error-handler.js');
            vi.mocked(supabase.from).mockReturnValueOnce({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockReturnThis(),
                then: (resolve: any) => resolve({ data: null, error: new Error('DB Error') })
            } as any);

            await showChiusureTab(container, actions);
            expect(handleError).toHaveBeenCalled();
        });

        it('should render table rows with full data and stale logic', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const sampleShift = {
                id: 1,
                created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48h ago (STALE)
                closed_at: null,
                status: 'open',
                station_id: 'ST1',
                operator_id: 'OP1',
                fuel_stations: { station_name: 'Test Station' },
                users: { full_name: 'Test User' },
                closing_data: {
                    ricavo_teorico: 100,
                    is_final: false
                }
            };

            vi.mocked(supabase.from).mockReturnValueOnce({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockReturnThis(),
                then: (resolve: any) => resolve({ data: [sampleShift], error: null, count: 1 })
            } as any);

            await showChiusureTab(container, actions);

            expect(container.innerHTML).toContain('Test Station');
            expect(container.innerHTML).toContain('Test User');
            expect(container.innerHTML).toContain('STALE');
            expect(container.innerHTML).toContain('100,00');
        });
    });

    describe('showClosureDetails', () => {
        it('should fetch and show details (empty case)', async () => {
            const { openModal } = await import('../../js/ui/ui.js');
            await showClosureDetails(123);
            expect(openModal).toHaveBeenCalledWith('Dettagli Chiusura');
        });

        it('should handle fetch error', async () => {
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(supabase.from).mockReturnValueOnce({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') })
            } as any);

            await showClosureDetails(999);
            expect(document.body.innerHTML).toContain('Errore: Chiusura non trovata');
        });

        it('should fetch and show details (success case)', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const sample = {
                id: 123,
                station_id: 'ST1',
                closed_at: '2024-01-01T10:00:00Z',
                closing_data: { ricavo_teorico: 500 },
                fuel_stations: { station_name: 'Test' },
                users: { full_name: 'Op' }
            };
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: sample, error: null })
            } as any);

            await showClosureDetails(123);
            expect(document.body.innerHTML).toContain('500,00');
        });
    });

    describe('Bulk Export', () => {
        it('openBulkExportModal should create modal', async () => {
            const { openModal } = await import('../../js/ui/ui.js');
            await openBulkExportModal();
            expect(openModal).toHaveBeenCalledWith('Export Multiplo Chiusure');
        });

        it('handleBulkExport should call export_utils (last_n)', async () => {
            const exportMod = await import('../../js/utils/export_utils.js');
            vi.spyOn(exportMod, 'generateMultiClosureExcel').mockResolvedValue(undefined);
            vi.spyOn(exportMod, 'computeExportSummaryMetrics').mockResolvedValue({} as any);

            await handleBulkExport({ stationId: 'ST1', type: 'last_n', limit: 10 });

            expect(exportMod.generateMultiClosureExcel).toHaveBeenCalled();
        });

        it('handleBulkExport should handle generation error', async () => {
            const exportMod = await import('../../js/utils/export_utils.js');
            const { handleError } = await import('../../js/shared/error-handler.js');
            vi.spyOn(exportMod, 'generateMultiClosureExcel').mockRejectedValue(new Error('Export failed'));

            await handleBulkExport({ stationId: 'ST1', type: 'last_n', limit: 10 });
            expect(handleError).toHaveBeenCalled();
        });
        it('handleBulkExport should call export_utils (date_range)', async () => {
            const exportMod = await import('../../js/utils/export_utils.js');
            vi.spyOn(exportMod, 'generateMultiClosureExcel').mockResolvedValue(undefined);

            await handleBulkExport({
                stationId: 'ST1',
                type: 'date_range',
                limit: 10,
                dateFrom: '2024-01-01',
                dateTo: '2024-01-31'
            });

            expect(exportMod.generateMultiClosureExcel).toHaveBeenCalled();
        });

        it('handleBulkExport should throw if no data', async () => {
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(supabase.from).mockReturnValueOnce({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                then: (resolve: any) => resolve({ data: [], error: null })
            } as any);

            await handleBulkExport({ stationId: 'ST1', type: 'last_n', limit: 10 });
            expect(handleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('Nessuna chiusura trovata') }),
                'handleBulkExport'
            );
        });
    });

    describe('deleteClosure', () => {
        it('should ask for confirmation and delete', async () => {
            const { openConfirmModal } = await import('../../js/ui/ui.js');
            const { supabase } = await import('../../js/core/api.js');
            const callback = vi.fn();

            await deleteClosure(123, callback);

            expect(openConfirmModal).toHaveBeenCalled();
            expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_closure', { closure_id: 123 });
            expect(callback).toHaveBeenCalled();
        });

        it('should do nothing if not confirmed', async () => {
            const { openConfirmModal } = await import('../../js/ui/ui.js');
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(openConfirmModal).mockResolvedValueOnce(false);

            await deleteClosure(123);

            expect(supabase.rpc).not.toHaveBeenCalled();
        });
    });
});
