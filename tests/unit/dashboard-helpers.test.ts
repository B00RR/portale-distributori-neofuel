import { describe, it, expect } from 'vitest';

import { renderKpiCards, KPIData } from '../../js/admin/dashboard-helpers.js';

describe('Dashboard Helpers Module', () => {
    it('should render KPI cards', () => {
        const config: any = {
            kpiLayout: [
                { id: 'venduto', visible: true, order: 1, size: '1x1' }
            ],
            gridColumns: 4
        };

        const kpiData: KPIData = {
            venduto: { value: '€1000', subtitle: 'Today' }
        };

        const html = renderKpiCards(config, kpiData);

        expect(html).toContain('venduto');
        expect(html).toContain('€1000');
    });

    it('should filter invisible KPIs', () => {
        const config: any = {
            kpiLayout: [
                { id: 'visible', visible: true },
                { id: 'hidden', visible: false }
            ]
        };

        const kpiData: KPIData = {
            visible: { value: '100', subtitle: 'test' },
            hidden: { value: '200', subtitle: 'test' }
        };

        const html = renderKpiCards(config, kpiData);

        expect(html).toContain('visible');
        expect(html).not.toContain('hidden');
    });
});
