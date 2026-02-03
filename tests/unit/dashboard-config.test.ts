import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    loadDashboardConfig,
    saveDashboardConfig,
    resetDashboardConfig,
    renderConfigPanel,
    showDashboardConfigPanel,
    KPI_CATALOG,
    CARD_SIZES,
    type DashboardConfig,
    type KPIConfigItem
} from '../../js/admin/dashboard-config.js';

// Mock dependencies
vi.mock('../../js/core/api.js', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(() => Promise.resolve({
                data: { session: { user: { id: '123e4567-e89b-12d3-a456-426614174000' } } }
            }))
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                }))
            })),
            upsert: vi.fn(() => Promise.resolve({ error: null })),
            insert: vi.fn(() => Promise.resolve({ error: null }))
        }))
    }
}));

vi.mock('../../js/core/auth.js', () => ({
    loggedUser: {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        id: '123e4567-e89b-12d3-a456-426614174000'
    }
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

vi.mock('../../js/ui/ui.js', () => ({
    openModal: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

describe('Dashboard Config Module', () => {

    beforeEach(() => {
        document.body.innerHTML = '<div id="modal-content"></div>';
        vi.clearAllMocks();
    });

    describe('KPI_CATALOG', () => {
        it('should have all expected KPIs', () => {
            expect(KPI_CATALOG.venduto).toBeDefined();
            expect(KPI_CATALOG.erogato).toBeDefined();
            expect(KPI_CATALOG.stazioni).toBeDefined();
            expect(KPI_CATALOG.alert).toBeDefined();
        });

        it('should have correct structure for each KPI', () => {
            Object.values(KPI_CATALOG).forEach(kpi => {
                expect(kpi).toHaveProperty('id');
                expect(kpi).toHaveProperty('title');
                expect(kpi).toHaveProperty('icon');
                expect(kpi).toHaveProperty('description');
                expect(kpi).toHaveProperty('defaultSize');
                expect(kpi).toHaveProperty('defaultVisible');
            });
        });
    });

    describe('CARD_SIZES', () => {
        it('should have standard card sizes', () => {
            expect(CARD_SIZES).toHaveLength(4);
            expect(CARD_SIZES.find(s => s.value === '1x1')).toBeDefined();
            expect(CARD_SIZES.find(s => s.value === '2x2')).toBeDefined();
        });
    });

    describe('loadDashboardConfig', () => {
        it('should return default config when no user config exists', async () => {
            const config = await loadDashboardConfig();

            expect(config).toBeDefined();
            expect(config.kpiLayout).toBeDefined();
            expect(config.gridColumns).toBe(4);
        });

        it('should load saved configuration', async () => {
            const { supabase } = await import('../../js/core/api.js');

            const mockConfig = {
                kpi_layout: [
                    { id: 'venduto', visible: true, order: 0, size: '1x1', position: { row: 0, col: 0 } }
                ],
                grid_columns: 3
            };

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({ data: mockConfig, error: null }))
                    }))
                })),
                upsert: vi.fn(() => Promise.resolve({ error: null })),
                insert: vi.fn(() => Promise.resolve({ error: null }))
            } as any);

            const config = await loadDashboardConfig();

            expect(config.gridColumns).toBe(3);
            expect(config.kpiLayout.length).toBeGreaterThan(0);
        });

        it('should handle UUID validation', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.auth.getSession).mockResolvedValue({
                data: { session: { user: { id: 'invalid-uuid' } } }
            } as any);

            const config = await loadDashboardConfig();

            // Should fallback to default
            expect(config.gridColumns).toBe(4);
        });

        it('should sync missing KPIs from catalog', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({
                            data: {
                                kpi_layout: [{ id: 'venduto', visible: true, order: 0, size: '1x1', position: { row: 0, col: 0 } }],
                                grid_columns: 4
                            },
                            error: null
                        }))
                    }))
                })),
                upsert: vi.fn(() => Promise.resolve({ error: null })),
                insert: vi.fn(() => Promise.resolve({ error: null }))
            } as any);

            const config = await loadDashboardConfig();

            // Should have synced all KPIs from catalog
            const catalogSize = Object.keys(KPI_CATALOG).length;
            expect(config.kpiLayout.length).toBeGreaterThanOrEqual(catalogSize);
        });
    });

    describe('saveDashboardConfig', () => {
        it('should save configuration successfully', async () => {
            const mockConfig: DashboardConfig = {
                kpiLayout: [],
                gridColumns: 5
            };

            const result = await saveDashboardConfig(mockConfig);

            expect(result).toBe(true);
            const { Toast } = await import('../../js/ui/toast.js');
            expect(Toast.show).toHaveBeenCalledWith(
                expect.stringContaining('salvata'),
                'success'
            );
        });

        it('should handle save errors', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(),
                upsert: vi.fn(() => Promise.resolve({ error: new Error('DB error') })),
                insert: vi.fn()
            } as any);

            const mockConfig: DashboardConfig = {
                kpiLayout: [],
                gridColumns: 4
            };

            const result = await saveDashboardConfig(mockConfig);

            expect(result).toBe(false);
            const { Toast } = await import('../../js/ui/toast.js');
            expect(Toast.show).toHaveBeenCalledWith(
                expect.stringContaining('Errore'),
                'error'
            );
        });

        it('should handle missing user', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.auth.getSession).mockResolvedValue({
                data: { session: null }
            } as any);

            const mockConfig: DashboardConfig = {
                kpiLayout: [],
                gridColumns: 4
            };

            const result = await saveDashboardConfig(mockConfig);

            expect(result).toBe(false);
        });
    });

    describe('resetDashboardConfig', () => {
        it('should reset to default configuration', async () => {
            const result = await resetDashboardConfig();

            expect(result).toBe(true);
            const { Toast } = await import('../../js/ui/toast.js');
            expect(Toast.show).toHaveBeenCalledWith(
                expect.stringContaining('ripristinata'),
                'success'
            );
        });

        it('should handle reset errors', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(),
                upsert: vi.fn(() => Promise.resolve({ error: new Error('Reset failed') })),
                insert: vi.fn()
            } as any);

            const result = await resetDashboardConfig();

            expect(result).toBe(false);
        });
    });

    describe('renderConfigPanel', () => {
        it('should render configuration panel', async () => {
            const container = document.getElementById('modal-content')!;

            await renderConfigPanel(container);

            expect(container.innerHTML).toContain('Layout Griglia');
            expect(container.innerHTML).toContain('KPI Disponibili');
        });

        it('should render grid column options', async () => {
            const container = document.getElementById('modal-content')!;

            await renderConfigPanel(container);

            expect(container.innerHTML).toContain('2 colonne');
            expect(container.innerHTML).toContain('4 colonne');
        });

        it('should show loading state initially', async () => {
            const container = document.getElementById('modal-content')!;

            const promise = renderConfigPanel(container);

            // Content should show loading initially
            expect(container.innerHTML).toContain('Caricamento');

            await promise;
        });

        it('should handle render errors gracefully', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => {
                    throw new Error('Render error');
                })
            } as any);

            const container = document.getElementById('modal-content')!;

            await renderConfigPanel(container);

            expect(container.innerHTML).toContain('Errore');
        });

        it('should handle missing container', async () => {
            await expect(renderConfigPanel(null as any)).resolves.not.toThrow();
        });
    });

    describe('showDashboardConfigPanel', () => {
        it('should open modal with config panel', async () => {
            const { openModal } = await import('../../js/ui/ui.js');

            showDashboardConfigPanel();

            expect(openModal).toHaveBeenCalledWith('Configura Dashboard');
        });
    });
});
