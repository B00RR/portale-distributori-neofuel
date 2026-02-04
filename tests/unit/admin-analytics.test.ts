import { describe, it, expect, vi } from 'vitest';

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

import { fetchAdminAnalytics, generateReport, exportAnalytics } from '../../js/admin/analytics.js';

describe('Admin Analytics Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fetch admin analytics', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{ metric: 'revenue', value: 10000 }],
                error: null
            })
        });

        const result = await fetchAdminAnalytics({ stationId: 'ST-123' });

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should generate report', async () => {
        const report = await generateReport('ST-123', '2024-01-01', '2024-01-31');

        expect(report).toBeDefined();
    });

    it('should export analytics', () => {
        const data = [{ date: '2024-01-01', revenue: 500 }];
        const exported = exportAnalytics(data, 'csv');

        expect(exported).toBeDefined();
    });

    it('should handle analytics errors', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } })
        });

        const result = await fetchAdminAnalytics({ stationId: 'ST-123' });

        expect(result).toBeDefined();
    });
});
