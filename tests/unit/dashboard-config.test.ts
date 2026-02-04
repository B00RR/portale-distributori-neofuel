import { describe, it, expect } from 'vitest';

import { KPI_CATALOG } from '../../js/admin/dashboard-config.js';

describe('Dashboard Config Module', () => {
    it('should export KPI_CATALOG', () => {
        expect(KPI_CATALOG).toBeDefined();
        expect(typeof KPI_CATALOG).toBe('object');
    });

    it('should have venduto KPI', () => {
        expect(KPI_CATALOG.venduto).toBeDefined();
        expect(KPI_CATALOG.venduto.title).toBeDefined();
    });
});
