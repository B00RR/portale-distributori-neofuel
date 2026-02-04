import { describe, it, expect } from 'vitest';

import { formatDashboardData, calculateKPIs, aggregateMetrics, filterByDateRange } from '../../js/admin/dashboard-helpers.js';

describe('Dashboard Helpers Module', () => {
    it('should format dashboard data', () => {
        const raw = [{ amount: 100, date: '2024-01-01' }];
        const formatted = formatDashboardData(raw);

        expect(formatted).toBeDefined();
    });

    it('should calculate KPIs', () => {
        const data = { revenue: 10000, volume: 5000 };
        const kpis = calculateKPIs(data);

        expect(kpis).toBeDefined();
    });

    it('should aggregate metrics', () => {
        const metrics = [{ value: 10 }, { value: 20 }, { value: 30 }];
        const aggregated = aggregateMetrics(metrics);

        expect(aggregated).toBeDefined();
    });

    it('should filter by date range', () => {
        const data = [
            { date: '2024-01-01', value: 100 },
            { date: '2024-01-15', value: 200 },
            { date: '2024-02-01', value: 300 }
        ];

        const filtered = filterByDateRange(data, '2024-01-01', '2024-01-31');

        expect(filtered).toBeDefined();
    });
});
