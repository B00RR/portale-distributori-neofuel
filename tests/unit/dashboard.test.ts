import { describe, it, expect, vi, beforeEach } from 'vitest';

// Advanced Mock Setup for Dashboard
// Use vi.hoisted to hoisting variables
const { mockSupabase, mockCharts, mockUI } = vi.hoisted(() => {
    const queryBuilder = {
        select: vi.fn(() => queryBuilder),
        eq: vi.fn(() => queryBuilder),
        gte: vi.fn(() => queryBuilder),
        lte: vi.fn(() => queryBuilder),
        order: vi.fn(() => queryBuilder),
        in: vi.fn(() => queryBuilder),
        then: (resolve: any) => resolve({ data: [], count: 5, error: null })
    };

    return {
        mockSupabase: {
            from: vi.fn(() => ({
                // Must mock select and other chain methods
                select: vi.fn(() => ({
                    eq: vi.fn(() => queryBuilder),
                    gte: vi.fn(() => queryBuilder),
                    lte: vi.fn(() => queryBuilder),
                    order: vi.fn(() => queryBuilder),
                    in: vi.fn(() => queryBuilder),
                    then: (resolve: any) => resolve({ data: [], count: 5, error: null }) // Important for await
                }))
            }))
        },
        mockCharts: {
            fetchAnalyticsData: vi.fn().mockResolvedValue({ daily: [], totals: {} }),
            renderRevenueChart: vi.fn(),
            renderVolumeChart: vi.fn(),
            renderPaymentChart: vi.fn(),
            renderFuelMixChart: vi.fn()
        },
        mockUI: {
            showLoadingMessage: vi.fn(),
            showErrorMessage: vi.fn()
        }
    };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/admin/dashboard-charts.js', () => mockCharts);
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/core/business-logic-manager.js', () => ({
    BusinessLogicManager: { loadRules: vi.fn().mockResolvedValue({}) }
}));
vi.mock('../../js/utils/calculation-engine.js', () => ({
    calculationEngine: { run: vi.fn().mockResolvedValue(1000) },
    CALCULATION_SCOPES: { KPI_VENDUTO: 'KPI_VENDUTO', KPI_EROGATO: 'KPI_EROGATO' }
}));

// ADDING MISSING MOCK FOR CONFIG
vi.mock('../../js/admin/dashboard-config.js', () => ({
    loadDashboardConfig: vi.fn().mockResolvedValue({
        kpiLayout: [{ id: 'venduto', visible: true, size: '1x1' }],
        gridColumns: 4
    }),
    saveDashboardConfig: vi.fn(),
    KPI_CATALOG: {
        venduto: { title: 'Venduto', icon: 'fa-euro' }
    }
}));


// Mock Chart.js
global.window = global.window || ({} as any);
(global.window as any).Chart = vi.fn();
(global.window as any).Sortable = vi.fn();

import { showDashboard } from '../../js/admin/dashboard.js';

describe('Admin Dashboard Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="dashboard-container"></div>';
    });

    it('should render dashboard structure', async () => {
        const container = document.getElementById('dashboard-container')!;
        await showDashboard(container);

        await new Promise(r => setTimeout(r, 0)); // Wait for rendering

        expect(container.innerHTML).toContain('dashboard-kpi-grid');
    });

    it('should fetch data for KPIs', async () => {
        const container = document.getElementById('dashboard-container')!;
        await showDashboard(container);

        expect(mockSupabase.from).toHaveBeenCalled();
    });
});
