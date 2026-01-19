/**
 * Render KPI cards based on user configuration
 */

import { DashboardConfig, KPI_CATALOG } from './dashboard-config.js';

export interface KPIDataValue {
    value: string | number;
    subtitle: string;
}

export type KPIData = Record<string, KPIDataValue>;

/**
 * Render KPI cards based on user configuration
 * @param config - Dashboard configuration {kpiLayout, gridColumns}
 * @param kpiData - KPI data values {venduto: {value, subtitle}, erogato:  {...}, ...}
 * @returns HTML for KPI cards
 */
export function renderKpiCards(config: DashboardConfig, kpiData: KPIData): string {
    if (!config || !config.kpiLayout || !Array.isArray(config.kpiLayout)) {
        return '';
    }

    return config.kpiLayout
        .filter(kpi => kpi.visible !== false) // Only show visible KPIs
        .sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by order
        .map(kpi => {
            const kpiMeta = KPI_CATALOG[kpi.id];
            const kpiValue = kpiData[kpi.id];

            if (!kpiMeta || !kpiValue) { return ''; }

            const sizeClass = `kpi-size-${kpi.size || '1x1'}`;

            return `
        <article class="kpi-card ${sizeClass}" data-kpi-id="${kpi.id}">
          <div class="kpi-row">
            <div class="kpi-icon"><i class="fas ${kpiMeta.icon}"></i></div>
          </div>
          <p class="kpi-title">${kpiMeta.title}</p>
          <p class="kpi-value">${kpiValue.value}</p>
          <p class="kpi-sub">${kpiValue.subtitle}</p>
        </article>
      `;
        })
        .join('');
}
