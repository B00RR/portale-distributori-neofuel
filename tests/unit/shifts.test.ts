import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    showChiusureTab,
    showClosureDetails,
    openExportModal,
    deleteClosure
} from '../../js/admin/shifts.js';

// --- MOCKS ---

vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn((table) => {
            const mockChain = {
                select: vi.fn(() => mockChain),
                eq: vi.fn(() => mockChain),
                gt: vi.fn(() => mockChain),
                gte: vi.fn(() => mockChain),
                lte: vi.fn(() => mockChain),
                range: vi.fn(() => mockChain),
                order: vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 })),
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                single: vi.fn(() => Promise.resolve({ data: {}, error: null }))
            };
            return mockChain;
        }),
        rpc: vi.fn(() => Promise.resolve({ error: null }))
    }
}));

vi.mock('../../js/shared/error-handler.js', () => ({
    handleError: vi.fn()
}));

vi.mock('../../js/shared/state.js', () => ({
    store: {
        getFilters: vi.fn(() => ({ dateFrom: null, dateTo: null })),
        getPagination: vi.fn(() => ({ page: 0, pageSize: 20, totalCount: 0 })),
        getFilter: vi.fn(() => null),
        setPagination: vi.fn(),
        subscribe: vi.fn((key, cb) => () => { })
    }
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

vi.mock('../../js/core/business-logic-manager.js', () => ({
    BusinessLogicManager: {
        loadRules: vi.fn(() => Promise.resolve({ force_close_hours_threshold: 24 }))
    }
}));

vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../js/utils/export_utils.js', () => ({
    fetchClosureExportData: vi.fn(() => Promise.resolve({ station_id: 1 })),
    generateClosureExcel: vi.fn(() => Promise.resolve()),
    generateMultiClosureExcel: vi.fn(() => Promise.resolve()),
    computeExportSummaryMetrics: vi.fn(() => Promise.resolve({}))
}));

vi.mock('../../js/utils/utils.js', () => ({
    escapeHtml: vi.fn((text) => String(text || '')),
    formatEuro: vi.fn((val) => `€ ${val}`)
}));

vi.mock('../../js/admin/components/FilterBar.js', () => ({
    FilterBar: class MockFilterBar {
        render() { }
    }
}));

vi.mock('../../js/admin/components/Pagination.js', () => ({
    Pagination: class MockPagination {
        render() { }
    }
}));

describe('Shifts Module', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'container';
        document.body.appendChild(container);

        const actions = document.createElement('div');
        actions.id = 'actions';
        document.body.appendChild(actions);

        const modalBody = document.createElement('div');
        modalBody.id = 'modal-body';
        document.body.appendChild(modalBody);

        vi.clearAllMocks();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('showChiusureTab - Data Rendering', () => {
        it('should render shifts table container', async () => {
            const actions = document.getElementById('actions')!;
            await showChiusureTab(container, actions);

            expect(container.querySelector('#filters-container')).toBeTruthy();
            expect(container.querySelector('#data-container')).toBeTruthy();
            expect(container.querySelector('#pagination-container')).toBeTruthy();
        });

        it('should add bulk export button to actions', async () => {
            const actions = document.getElementById('actions')!;
            await showChiusureTab(container, actions);

            const btn = document.getElementById('btn-bulk-export');
            expect(btn).toBeTruthy();
            expect(btn?.textContent).toContain('Export Multiplo');
        });

        it('should display "Nessuna chiusura trovata" when data is empty', async () => {
            const { supabase } = await import('../../js/core/api.js');

            // Create a recursive mock chain that handles any combination of calls
            const mockChain = {
                select: vi.fn(() => mockChain),
                eq: vi.fn(() => mockChain),
                gte: vi.fn(() => mockChain),
                lte: vi.fn(() => mockChain),
                range: vi.fn(() => mockChain),
                order: vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 })),
                limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
            };

            vi.mocked(supabase.from).mockReturnValue(mockChain as any);

            await showChiusureTab(container, null);

            expect(container.innerHTML).toContain('Nessuna chiusura trovata');
        });
    });

    describe('Stale Indicator Logic', () => {
        it('should show STALE badge for open shifts exceeding threshold', async () => {
            const { supabase } = await import('../../js/core/api.js');
            // Mock shift created 25 hours ago (threshold is 24)
            const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    // Simplified chain for default checks
                    range: vi.fn(() => ({
                        order: vi.fn(() => Promise.resolve({
                            data: [{
                                id: 101,
                                station_id: 1,
                                operator_id: 'op1',
                                status: 'open',
                                created_at: staleDate,
                                closed_at: null,
                                closing_data: { is_final: false }
                            }],
                            error: null,
                            count: 1
                        }))
                    }))
                }))
            } as any);

            await showChiusureTab(container, null);

            // Wait for async rendering
            await new Promise(r => setTimeout(r, 0));

            const badge = container.querySelector('.badge-danger');
            expect(badge).toBeTruthy();
            expect(badge?.textContent).toBe('STALE');
        });

        it('should NOT show STALE badge for recent open shifts', async () => {
            const { supabase } = await import('../../js/core/api.js');
            // Mock shift created 10 hours ago
            const recentDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    range: vi.fn(() => ({
                        order: vi.fn(() => Promise.resolve({
                            data: [{
                                id: 102,
                                status: 'open',
                                created_at: recentDate,
                                closing_data: { is_final: false }
                            }],
                            error: null,
                            count: 1
                        }))
                    }))
                }))
            } as any);

            await showChiusureTab(container, null);
            await new Promise(r => setTimeout(r, 0));

            expect(container.innerHTML).not.toContain('STALE');
        });
    });

    describe('showClosureDetails - Self Service Logic', () => {
        it('should display simple match when cash matches', async () => {
            const { formatEuro } = await import('../../js/utils/utils.js');
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({
                            data: {
                                id: 1,
                                created_at: '2024-01-01',
                                closing_data: {
                                    scontrino_self: {
                                        banconote_erogate: 100,
                                        banconote_incassate: 100
                                    }
                                }
                            },
                            error: null
                        }))
                    }))
                }))
            } as any);

            await showClosureDetails(1);

            const modalBody = document.getElementById('modal-body');
            // Expect simple format: "Contanti: € 100"
            expect(modalBody?.innerHTML).toContain('Contanti:');
            expect(formatEuro).toHaveBeenCalledWith(100);
            expect(modalBody?.innerHTML).not.toContain('Incassati:'); // Detail hidden when matching
        });

        it('should display detail view when cash mismatches', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({
                            data: {
                                id: 1,
                                created_at: '2024-01-01',
                                closing_data: {
                                    scontrino_self: {
                                        banconote_erogate: 100,
                                        banconote_incassate: 80 // Mismatch
                                    }
                                }
                            },
                            error: null
                        }))
                    }))
                }))
            } as any);

            await showClosureDetails(1);

            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Erogati:');
            expect(modalBody?.innerHTML).toContain('Incassati:');
        });
    });

    describe('Bulk Export Modal', () => {
        it('should open modal and populate station dropdown', async () => {
            const { openModal } = await import('../../js/ui/ui.js');
            const { supabase } = await import('../../js/core/api.js');
            const actions = document.getElementById('actions')!;

            // Mock Stations fetch
            const mockStations = [
                { station_id: 1, station_name: 'Stazione A' },
                { station_id: 2, station_name: 'Stazione B' }
            ];

            // Setup supabase mock specifically for this flow
            // Note: Shifts module calls showChiusureTab -> renders btn -> user clicks -> openBulkExportModal -> fetch stations

            // We need to mock the stations query which is: .from('fuel_stations').select(...)
            const fromMock = vi.mocked(supabase.from);
            fromMock.mockImplementation((table) => {
                if (table === 'fuel_stations') {
                    return {
                        select: vi.fn(() => Promise.resolve({ data: mockStations, error: null }))
                    } as any;
                }
                // Default shift query fallback
                return {
                    select: vi.fn(() => ({ range: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], count: 0 })) })) }))
                } as any;
            });

            await showChiusureTab(container, actions);

            const btn = document.getElementById('btn-bulk-export');
            btn?.click();

            // Wait for async fetch
            await new Promise(r => setTimeout(r, 0));

            expect(openModal).toHaveBeenCalledWith('Export Multiplo Chiusure');

            const modalBody = document.getElementById('modal-body');
            const select = modalBody?.querySelector('#bulk-station');
            expect(select).toBeTruthy();
            expect(select?.innerHTML).toContain('Stazione A');
            expect(select?.innerHTML).toContain('Stazione B');
        });
    });

    describe('deleteClosure', () => {
        it('should call RPC for deletion', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const callback = vi.fn();

            await deleteClosure(1, callback);

            expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_closure', {
                closure_id: 1
            });
        });
    });
});
