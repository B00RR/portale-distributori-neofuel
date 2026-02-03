import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    loadDashboardConfig,
    saveDashboardConfig,
    resetDashboardConfig,
    showDashboardConfigPanel,
    renderConfigPanel,
    KPI_CATALOG
} from '../../js/admin/dashboard-config.js';

// --- MOCKS ---

// Mock Supabase
const mockSelect = vi.fn();
const mockUpsert = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: (table: string) => mockFrom(table),
        auth: {
            getSession: () => mockGetSession()
        }
    }
}));

// Mock Auth
vi.mock('../../js/core/auth.js', () => ({
    loggedUser: { user_id: null }
}));

// Mock UI/Toast
vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

vi.mock('../../js/ui/ui.js', () => ({
    openModal: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

// Mock Sortable (global)
(global as any).Sortable = class MockSortable {
    constructor(el: any, options: any) {
        if (options && options.onEnd) {
            // Expose for testing if needed
        }
    }
};

describe('Dashboard Config Module', () => {

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default mock chain
        mockFrom.mockReturnValue({
            select: mockSelect,
            upsert: mockUpsert,
            insert: mockInsert
        });
        mockSelect.mockReturnValue({
            eq: mockEq
        });
        mockEq.mockReturnValue({
            single: mockSingle
        });

        // Default Session (Valid UUID)
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: '00000000-0000-0000-0000-000000000001' }
                }
            }
        });

        // Default DOM
        document.body.innerHTML = `
            <div id="modal-content"></div>
            <div id="test-container"></div>
        `;
    });

    describe('getCurrentUserId Logic', () => {
        it('should use session ID if available (UUID)', async () => {
            // Logic is internal to functions, so we test via loadDashboardConfig
            mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } }); // Not found -> default

            await loadDashboardConfig();

            expect(mockEq).toHaveBeenCalledWith('user_id', '00000000-0000-0000-0000-000000000001');
        });

        it('should fallback to loggedUser if no session', async () => {
            mockGetSession.mockResolvedValue({ data: { session: null } });
            const { loggedUser } = await import('../../js/core/auth.js');
            (loggedUser as any).user_id = '00000000-0000-0000-0000-000000000002'; // Valid UUID fallback

            mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            await loadDashboardConfig();
            expect(mockEq).toHaveBeenCalledWith('user_id', '00000000-0000-0000-0000-000000000002');
        });

        it('should return null if no user found', async () => {
            mockGetSession.mockResolvedValue({ data: { session: null } });
            const { loggedUser } = await import('../../js/core/auth.js');
            (loggedUser as any).user_id = null;

            const config = await loadDashboardConfig();

            // Should return default config immediately without querying DB
            expect(mockFrom).not.toHaveBeenCalled();
            expect(config.gridColumns).toBe(4);
        });
    });

    describe('UUID Validation', () => {
        it('should reject non-UUID user IDs and use default config', async () => {
            // Case: Legacy integer ID
            mockGetSession.mockResolvedValue({ data: { session: { user: { id: '12345' } } } }); // Not UUID

            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const config = await loadDashboardConfig();

            expect(consoleSpy).toHaveBeenCalled();
            if (consoleSpy.mock.calls.length > 0) {
                const firstCallArgs = consoleSpy.mock.calls[0];
                const fullMsg = firstCallArgs.join(' ');
                expect(fullMsg).toContain('User ID is not a UUID');
            }
            expect(mockFrom).not.toHaveBeenCalled(); // Should assume default
            expect(config.kpiLayout.length).toBeGreaterThan(0);

            consoleSpy.mockRestore();
        });
    });

    describe('loadDashboardConfig', () => {
        it('should return existing config from DB', async () => {
            const mockConfig = {
                kpi_layout: [{ id: 'venduto', visible: true, order: 0, size: '1x1' }],
                grid_columns: 3
            };
            mockSingle.mockResolvedValue({ data: mockConfig, error: null });

            const config = await loadDashboardConfig();

            expect(config.gridColumns).toBe(3);
            // Logic syncs missing items, so length will be full catalog
            expect(config.kpiLayout.length).toBeGreaterThan(1);
            expect(config.kpiLayout.find(k => k.id === 'venduto')?.size).toBe('1x1');
        });

        it('should ensure default config if not found (406/PGRST116)', async () => {
            mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
            mockInsert.mockResolvedValue({ error: null });

            const config = await loadDashboardConfig();

            // Should verify insert was called to "ensure" default
            expect(mockInsert).toHaveBeenCalled();
            expect(config.gridColumns).toBe(4);
        });

        it('should handle general database error', async () => {
            mockSingle.mockResolvedValue({ data: null, error: { message: 'DB Failure', code: '500' } });
            const { Toast } = await import('../../js/ui/toast.js');

            const config = await loadDashboardConfig();

            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('Errore caricamento'), 'error');
            expect(config).toBeDefined(); // Returns default fallback
        });

        it('should sync missing catalog items to layout', async () => {
            // Mock config with only 'venduto'
            // Catalog has 'erogato', 'stazioni', etc.
            const partialLayout = [{ id: 'venduto', visible: true, order: 0, size: '2x2' }];
            mockSingle.mockResolvedValue({
                data: { kpi_layout: partialLayout, grid_columns: 4 },
                error: null
            });

            const config = await loadDashboardConfig();

            const venduto = config.kpiLayout.find(k => k.id === 'venduto');
            const erogato = config.kpiLayout.find(k => k.id === 'erogato');

            expect(venduto?.size).toBe('2x2'); // Preserves existing
            expect(erogato).toBeDefined(); // Adds missing
            expect(erogato?.order).toBeGreaterThan(0); // Appended
        });
    });

    describe('saveDashboardConfig', () => {
        it('should upsert config to DB', async () => {
            mockUpsert.mockResolvedValue({ error: null });
            const { Toast } = await import('../../js/ui/toast.js');

            const dummyConfig = { kpiLayout: [], gridColumns: 5 };
            const result = await saveDashboardConfig(dummyConfig as any);

            expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
                grid_columns: 5,
                user_id: expect.stringContaining('00000000-0000-0000-0000-000000000001')
            }), expect.any(Object));
            expect(result).toBe(true);
            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('salvata'), 'success');
        });

        it('should handle invalid user on save', async () => {
            mockGetSession.mockResolvedValue({ data: { session: null } });
            const { loggedUser } = await import('../../js/core/auth.js');
            (loggedUser as any).user_id = null;

            const result = await saveDashboardConfig({} as any);
            expect(result).toBe(false);
        });

        it('should handle DB error on save', async () => {
            mockUpsert.mockResolvedValue({ error: { message: 'Write Failed' } });

            const result = await saveDashboardConfig({} as any);
            expect(result).toBe(false);
        });
    });

    describe('resetDashboardConfig', () => {
        it('should upsert default config', async () => {
            mockUpsert.mockResolvedValue({ error: null });

            await resetDashboardConfig();

            expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
                grid_columns: 4 // Default
            }), expect.any(Object));
        });
    });

    describe('Config UI Panel', () => {
        it('should show modal and render panel', async () => {
            const { openModal } = await import('../../js/ui/ui.js');

            // Simulate modal container existing
            document.body.innerHTML = '<div id="modal-content"></div>';

            showDashboardConfigPanel();

            expect(openModal).toHaveBeenCalledWith('Configura Dashboard');

            // Robust Polling for async render
            const modalContent = document.getElementById('modal-content');
            for (let i = 0; i < 20; i++) {
                if (modalContent?.innerHTML.includes('Layout Griglia')) break;
                await new Promise(r => setTimeout(r, 10));
            }

            expect(modalContent?.innerHTML).toContain('Layout Griglia');
            expect(modalContent?.innerHTML).toContain('KPI Disponibili');
        });

        it('should handle grid size changes', async () => {
            const container = document.getElementById('test-container')!;
            // Render panel directly
            mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } }); // Defaults
            await renderConfigPanel(container);

            // Find 6-col button
            const btn6 = container.querySelector('button[data-columns="6"]') as HTMLButtonElement;
            expect(btn6).toBeTruthy();

            // Click it
            btn6.click();
            expect(btn6.classList.contains('active')).toBe(true);
        });

        it('should toggle visibility (eye icon)', async () => {
            const container = document.getElementById('test-container')!;
            await renderConfigPanel(container);

            // Find visibility button for first item
            const eyeBtn = container.querySelector('.kpi-visibility-btn') as HTMLElement;
            expect(eyeBtn).toBeTruthy();

            // Initial state (default visible) -> click -> hide
            eyeBtn.click();
            expect(eyeBtn.classList.contains('active')).toBe(false); // active means visible usually, check logic
            // Logic: classList.toggle('active'). defaultVisible=true -> btn has active class initially?
            // Let's check render logic: `class="... ${kpi.visible ? 'active' : ''}"`
            // So if visible, it is active. Click toggles.

            // Re-check expectations after click
            expect(eyeBtn.querySelector('i')?.className).toContain('fa-eye-slash');
        });

        it('should change size via dropdown', async () => {
            const container = document.getElementById('test-container')!;
            await renderConfigPanel(container);

            // Find resize button
            const resizeBtn = container.querySelector('[data-action="resize"]') as HTMLElement;
            resizeBtn.click(); // Opens dropdown

            const dropMenu = resizeBtn.nextElementSibling;
            expect(dropMenu?.classList.contains('show')).toBe(true);

            // Select '2x2'
            const sizeOption = dropMenu?.querySelector('[data-size="2x2"]') as HTMLElement;
            sizeOption.click();

            // Check if label updated
            const label = resizeBtn.querySelector('.size-label');
            expect(label?.textContent).toBe('2x2');
        });
    });

    describe('Sortable Integration', () => {
        it('should initialize Sortable if available', async () => {
            const container = document.getElementById('test-container')!;

            // Spy on global Sortable constructor
            const sortableSpy = vi.spyOn(global as any, 'Sortable');

            await renderConfigPanel(container);

            expect(sortableSpy).toHaveBeenCalled();
        });

        it('should handle Sortable missing gracefully', async () => {
            // Remove global Sortable
            const originalSortable = (global as any).Sortable;
            (global as any).Sortable = undefined;
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const container = document.getElementById('test-container')!;
            await renderConfigPanel(container);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SortableJS library not loaded'));

            // Restore
            (global as any).Sortable = originalSortable;
        });
    });
});
