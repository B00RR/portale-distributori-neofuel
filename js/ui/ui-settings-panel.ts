/**
 * UI SETTINGS PANEL
 * Renders the Business Logic settings in a card layout.
 */

import { BUSINESS_LOGIC_FIELDS } from './ui-settings-constants.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';

export async function renderSettingsPanel(container: HTMLElement): Promise<void> {
  if (!container) return;

  // Render Header
  container.innerHTML = `
    <div class="settings-header mb-4">
      <h2>Impostazioni Applicazione</h2>
      <p class="text-secondary">Configura le regole operative e le soglie di sicurezza.</p>
    </div>
    <div id="business-rules-grid" class="d-flex gap-3" style="flex-wrap: wrap; display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));">
        <!-- Cards will be injected here -->
        <p class="ui-loading-hint"><i class="fas fa-spinner fa-spin"></i> Caricamento impostazioni...</p>
    </div>
    <div class="mt-4 text-right">
        <button type="button" class="menu-button primary" id="save-business-rules-btn">
            <i class="fas fa-save"></i> Salva Modifiche
        </button>
    </div>
  `;

  const grid = container.querySelector('#business-rules-grid') as HTMLElement;
  if (!grid) return;

  try {
    const rules = await BusinessLogicManager.loadRules();
    let cardsHtml = '';

    BUSINESS_LOGIC_FIELDS.forEach(field => {
      const value = (rules as any)[field.key] ?? field.defaultValue;

      // Determine input HTML based on type
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

      cardsHtml += `
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

    grid.innerHTML = cardsHtml || '<p>Nessuna impostazione disponibile.</p>';

    // Setup Submit Handler
    const saveBtn = container.querySelector('#save-business-rules-btn');
    saveBtn?.addEventListener('click', async () => {
      const payload: any = {};
      BUSINESS_LOGIC_FIELDS.forEach(field => {
        const el = container.querySelector(`[name="br_${field.key}"]`) as HTMLInputElement;
        if (el) {
          if (field.type === 'number') {
            payload[field.key] = parseFloat(el.value);
          } else if (field.type === 'boolean') {
            payload[field.key] = el.checked;
          }
        }
      });

      try {
        const btn = saveBtn as HTMLButtonElement;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';

        await BusinessLogicManager.saveRules(payload);

        btn.innerHTML = '<i class="fas fa-check"></i> Salvato!';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }, 2000);
      } catch (err) {
        // Toast shown by manager
        (saveBtn as HTMLButtonElement).disabled = false;
      }
    });

  } catch (err) {
    grid.innerHTML = `<div class="error-box"><p>Errore nel caricamento delle regole: ${err}</p></div>`;
  }
}
