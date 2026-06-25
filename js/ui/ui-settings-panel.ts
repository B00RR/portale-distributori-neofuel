/**
 * UI SETTINGS PANEL
 * Renders the Business Logic settings in a card layout.
 */

import { loadDashboardConfig, saveDashboardConfig, KPI_CATALOG, DashboardConfig, KPIConfigItem } from '../admin/dashboard-config.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { logger } from '../core/logger.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml } from '../utils/utils.js';

import { BUSINESS_LOGIC_FIELDS } from './ui-settings-constants.js';



export async function renderSettingsPanel(container: HTMLElement): Promise<void> {
  if (!container) {return;}

  // Render Skeleton Structure
  setSafeHTML(container, `
    <div class="settings-header mb-4">
      <h2>Impostazioni Applicazione</h2>
      <p class="text-secondary">Configura le regole operative e i KPI della dashboard.</p>
    </div>

    <!-- BUSINESS RULES SECTION -->
    <h3 class="mb-3" style="font-size: 1.1rem; color: var(--primary-color);">Regole Operative</h3>
    <div id="business-rules-grid" class="d-flex gap-3 mb-5" style="flex-wrap: wrap; display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));">
        <p class="ui-loading-hint"><i class="fas fa-spinner fa-spin"></i> Caricamento impostazioni...</p>
    </div>

    <!-- DASHBOARD CONFIG SECTION -->
    <h3 class="mb-3" style="font-size: 1.1rem; color: var(--primary-color);">Personalizzazione Dashboard</h3>
    <div id="dashboard-config-grid" class="d-flex gap-3 mb-5" style="flex-wrap: wrap; display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));">
        <p class="ui-loading-hint"><i class="fas fa-spinner fa-spin"></i> Caricamento configurazione dashboard...</p>
    </div>

    <div class="mt-4 text-right" style="position: sticky; bottom: 20px; background: var(--bg-body); padding: 15px; border-top: 1px solid var(--border-color); z-index: 10;">
        <button type="button" class="menu-button primary" id="save-settings-btn">
            <i class="fas fa-save"></i> Salva Tutto
        </button>
    </div>
  `);

  const rulesGrid = container.querySelector('#business-rules-grid') as HTMLElement;
  const dashGrid = container.querySelector('#dashboard-config-grid') as HTMLElement;

  try {
    // Parallel Fetch
    const rules = await BusinessLogicManager.loadRules();
    const dashConfig: DashboardConfig = await loadDashboardConfig();

    // 1. RENDER BUSINESS RULES
    let rulesHtml = '';
    BUSINESS_LOGIC_FIELDS.forEach(field => {
      const value = (rules as unknown as Record<string, unknown>)[field.key] ?? field.defaultValue;

      let inputHtml = '';
      if (field.type === 'number') {
        inputHtml = `
            <div class="input-group" style="display: flex; align-items: center; gap: 10px;">
                <input type="number" step="any" name="br_${field.key}" value="${value}" class="form-input" style="width: 100%;" />
                ${field.unit ? `<span class="text-secondary font-weight-bold">${field.unit}</span>` : ''}
            </div>
        `;
      } else if (field.type === 'boolean') {
        inputHtml = `
            <label class="ui-toggle" style="cursor: pointer; display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" name="br_${field.key}" ${value ? 'checked' : ''} style="width: 20px; height: 20px;" />
                <span style="font-size: 0.9em; color: var(--text-secondary);">Abilitato</span>
            </label>
        `;
      }

      rulesHtml += `
        <div class="card" style="display: flex; flex-direction: column; height: 100%;">
            <div class="card-header" style="border-bottom: none; padding-bottom: 0;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <div style="background: var(--bg-body); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--primary-color);">
                        <i class="${field.icon || 'fas fa-cog'}"></i>
                    </div>
                    <h4 class="card-title">${field.label}</h4>
                </div>
            </div>
            <div class="card-body" style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <p class="text-secondary mb-3" style="font-size: 0.9em; min-height: 40px;">${field.description}</p>
                <div class="form-group mb-0">
                    ${inputHtml}
                </div>
            </div>
        </div>
      `;
    });
    setSafeHTML(rulesGrid, rulesHtml || '<p>Nessuna impostazione disponibile.</p>');


    // 2. RENDER DASHBOARD KPI SELECTOR
    // Sort items by current order to keep logic consistent
    const sortedKpis = dashConfig.kpiLayout.sort((a: KPIConfigItem, b: KPIConfigItem) => a.order - b.order);

    let kpiListHtml = '';
    sortedKpis.forEach((item: KPIConfigItem) => {
      const meta = KPI_CATALOG[item.id];
      if (!meta) {return;}

      kpiListHtml += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--bg-body); border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas ${meta.icon} text-secondary"></i>
                    <div>
                        <strong>${meta.title}</strong>
                        <p style="font-size: 0.8em; margin: 0; color: var(--text-secondary);">${meta.description}</p>
                    </div>
                </div>
                <label class="ui-toggle" style="cursor: pointer;">
                    <input type="checkbox" name="kpi_${item.id}" ${item.visible ? 'checked' : ''} style="width: 18px; height: 18px;" />
                </label>
            </div>
        `;
    });

    setSafeHTML(dashGrid, `
        <div class="card" style="grid-column: 1 / -1;">
            <div class="card-header">
                <h4 class="card-title"><i class="fas fa-eye"></i> Visibilità KPI Dashboard</h4>
                <p class="text-secondary" style="font-size: 0.9em;">Seleziona quali metriche mostrare nella schermata principale.</p>
            </div>
            <div class="card-body">
                ${kpiListHtml}
            </div>
        </div>
    `);

    // 3. HANDLE SAVE
    const saveBtn = container.querySelector('#save-settings-btn');
    saveBtn?.addEventListener('click', async () => {
      const btn = saveBtn as HTMLButtonElement;
      const originalText = btn.innerHTML;

      try {
        btn.disabled = true;
        setSafeHTML(btn, '<i class="fas fa-spinner fa-spin"></i> Salvataggio...');

        // A. Collect Business Rules
        const rulesPayload: Record<string, number | boolean> = {};
        BUSINESS_LOGIC_FIELDS.forEach(field => {
          const el = container.querySelector(`[name="br_${field.key}"]`) as HTMLInputElement;
          if (el) {
            if (field.type === 'number') {
              rulesPayload[field.key] = parseFloat(el.value);
            } else if (field.type === 'boolean') {
              rulesPayload[field.key] = el.checked;
            }
          }
        });

        // B. Collect Dashboard Config (update visibility in existing layout)
        const newLayout = dashConfig.kpiLayout.map(item => {
          const el = container.querySelector(`[name="kpi_${item.id}"]`) as HTMLInputElement;
          if (el) {
            return { ...item, visible: el.checked };
          }
          return item;
        });
        dashConfig.kpiLayout = newLayout;

        // C. Save All
        await Promise.all([
          BusinessLogicManager.saveRules(rulesPayload),
          saveDashboardConfig(dashConfig)
        ]);

        setSafeHTML(btn, '<i class="fas fa-check"></i> Salvato!');
        setTimeout(() => {
          setSafeHTML(btn, originalText);
          btn.disabled = false;
        }, 2000);

      } catch (err) {
        setSafeHTML(btn, '<i class="fas fa-exclamation-triangle"></i> Errore');
        setTimeout(() => {
          setSafeHTML(btn, originalText);
          btn.disabled = false;
        }, 3000);
        logger.error('settingsPanel', err);
      }
    });

  } catch (err) {
    setSafeHTML(rulesGrid, `<div class="error-box"><p>Errore nel caricamento delle impostazioni: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p></div>`);
  }
}
