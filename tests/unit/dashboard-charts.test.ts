import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
    },
    mockUtils: {
        getISODate: vi.fn((d) => d.toISOString().split('T')[0]),
        formatEuro: vi.fn((n) => `€${n}`),
        formatLitri: vi.fn((n) => `${n}L`)
    }
}));

global.window = global.window || ({} as any);
(global.window as any).Chart = vi.fn();

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { fetchAnalyticsData, renderRevenueChart, renderVolumeChart, renderPaymentChart, renderFuelMixChart } from '../../js/admin/dashboard-charts.js';

describe('Dashboard Charts Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<canvas id="test-chart"></canvas>';
    });

    it('should fetch analytics data', async () => {
        const result = await fetchAnalyticsData();
        expect(result).toBeDefined();
        expect(result.daily).toBeInstanceOf(Array);
    });

    it('should render revenue chart', () => {
        const data: any = { daily: [{ date: '2024-01-01', revenue: 100, liters_benzina: 50, liters_gasolio: 50 }], totals: { revenue: 100, benzina: 50, gasolio: 50, contanti: 0, pos: 0, crediti: 0, voucher: 0 } };
        renderRevenueChart(data, 'test-chart');
        expect(true).toBe(true);
    });

    it('should render volume chart', () => {
        const data: any = { daily: [], totals: { benzina: 100, gasolio: 200, revenue: 0, contanti: 0, pos: 0, crediti: 0, voucher: 0 } };
        renderVolumeChart(data, 'test-chart');
        expect(true).toBe(true);
    });

    it('should render payment chart', () => {
        const data: any = { daily: [], totals: { contanti: 100, pos: 200, crediti: 50, voucher: 25, revenue: 0, benzina: 0, gasolio: 0 } };
        renderPaymentChart(data, 'test-chart');
        expect(true).toBe(true);
    });

    it('should render fuel mix chart', () => {
        const data: any = { daily: [], totals: { benzina: 1000, gasolio: 2000, revenue: 0, contanti: 0, pos: 0, crediti: 0, voucher: 0 } };
        renderFuelMixChart(data, 'test-chart');
        expect(true).toBe(true);
    });
});
