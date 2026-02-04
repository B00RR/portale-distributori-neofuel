import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Chart.js
global.window = global.window || ({} as any);
(global.window as any).Chart = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    update: vi.fn(),
    data: { datasets: [] }
}));

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 }))
})) as any;

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null })
    }))
};

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));

import { fetchAnalyticsData, renderRevenueChart, renderVolumeChart, renderPaymentChart, renderFuelMixChart } from '../../js/admin/dashboard-charts.js';

describe('Dashboard Charts Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<canvas id="chart"></canvas>';
    });

    it('should fetch analytics data for charts', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{ date: '2024-01-01', amount: 100 }],
                error: null
            })
        });

        const result = await fetchAnalyticsData('ST-123', 30);

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should render revenue chart', async () => {
        const canvas = document.getElementById('chart') as HTMLCanvasElement;

        await renderRevenueChart(canvas, 'ST-123');

        expect((global.window as any).Chart).toHaveBeenCalled();
    });

    it('should render volume chart', async () => {
        const canvas = document.getElementById('chart') as HTMLCanvasElement;

        await renderVolumeChart(canvas, 'ST-123');

        expect((global.window as any).Chart).toHaveBeenCalled();
    });

    it('should render payment chart', async () => {
        const canvas = document.getElementById('chart') as HTMLCanvasElement;

        await renderPaymentChart(canvas, 'ST-123');

        expect((global.window as any).Chart).toHaveBeenCalled();
    });

    it('should render fuel mix chart', async () => {
        const canvas = document.getElementById('chart') as HTMLCanvasElement;

        await renderFuelMixChart(canvas, 'ST-123');

        expect((global.window as any).Chart).toHaveBeenCalled();
    });

    it('should handle chart rendering errors', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } })
        });

        const canvas = document.getElementById('chart') as HTMLCanvasElement;

        await renderRevenueChart(canvas, 'ST-123');

        // Should handle error gracefully
        expect(mockSupabase.from).toHaveBeenCalled();
    });
});
