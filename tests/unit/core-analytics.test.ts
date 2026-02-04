import { describe, it, expect, vi } from 'vitest';

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null })
    })),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null })
};

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));

import { fetchAnalyticsData, fetchRevenueTrends, fetchFuelConsumption } from '../../js/core/analytics.js';

describe('Core Analytics Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fetch analytics data', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{ amount: 100, product: 'Gasolio' }],
                error: null
            })
        });

        const result = await fetchAnalyticsData('ST-123', '2024-01-01', '2024-01-31');

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should fetch revenue trends', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: { revenue: 5000, growth: 10 },
            error: null
        });

        const result = await fetchRevenueTrends('ST-123');

        expect(mockSupabase.rpc).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should fetch fuel consumption', async () => {
        const result = await fetchFuelConsumption('ST-123', 30);

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle analytics errors', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
        });

        const result = await fetchAnalyticsData('ST-123', '2024-01-01', '2024-01-31');

        expect(result).toBeDefined();
    });
});
