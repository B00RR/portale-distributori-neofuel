import { describe, it, expect, vi } from 'vitest';

// Mock config dependency to control KPI_CATALOG
vi.mock('../../js/admin/dashboard-config.js', () => ({
    KPI_CATALOG: {
        'kpi1': { title: 'Test KPI 1', icon: 'fa-test', defaultSize: '1x1' },
        'kpi2': { title: 'Test KPI 2', icon: 'fa-test', defaultSize: '1x1' },
        'venduto': { title: 'Venduto', icon: 'fa-euro-sign' }
    },
    DashboardConfig: {}
}));

import { renderKpiCards } from '../../js/admin/dashboard-helpers.js';

describe('Dashboard Helpers Module', () => {
    it('should render visible KPIs', () => {
        const config: any = {
            kpiLayout: [{ id: 'kpi1', visible: true }],
            gridColumns: 4
        };
        const data: any = {
            kpi1: { value: '100', subtitle: 'test' }
        };

        const html = renderKpiCards(config, data);
        expect(html).toContain('kpi1');
        expect(html).toContain('100');
    });

    it('should not render hidden KPIs', () => {
        const config: any = {
            kpiLayout: [{ id: 'kpi2', visible: false }],
            gridColumns: 4
        };
        const data: any = {
            kpi2: { value: '200', subtitle: 'test' }
        };

        const html = renderKpiCards(config, data);
        expect(html).not.toContain('kpi2');
    });
});
