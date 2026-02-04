import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for variables used in mocks
const { mockSupabase, mockUI, mockCharts, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
    },
    mockUI: {
        showLoadingMessage: vi.fn(),
        showErrorMessage: vi.fn()
    },
    mockCharts: {
        fetchAnalyticsData: vi.fn().mockResolvedValue({ daily: [] }),
        renderRevenueChart: vi.fn(),
        renderVolumeChart: vi.fn(),
        renderPaymentChart: vi.fn(),
        renderFuelMixChart: vi.fn()
    },
    mockUtils: {
        formatEuro: vi.fn(v => `€${v}`),
        formatLitri: vi.fn(v => `${v}L`),
        getISODate: vi.fn(() => '2024-01-01')
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/admin/dashboard-charts.js', () => mockCharts);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showAnalyticsTab } from '../../js/admin/analytics.js';

describe('Admin Analytics Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="analytics-container"></div>';
    });

    it('should display analytics structure', async () => {
        const container = document.getElementById('analytics-container')!;
        await showAnalyticsTab(container);

        expect(container.innerHTML).toContain('analytics-filters');
    });

    it('should fetch analytics data', async () => {
        const container = document.getElementById('analytics-container')!;
        await showAnalyticsTab(container);

        // Wait for async
        await new Promise(r => setTimeout(r, 0));

        // Either supabase directly or via dashboard-charts fetchAnalyticsData
        // analytics.ts usually calls fetchAnalyticsData or manual query
        // Let's assume manual query based on previous read
        expect(mockSupabase.from).toHaveBeenCalled();
    });
});
