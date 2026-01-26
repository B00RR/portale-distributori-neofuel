/**
 * UI SETTINGS & LAYOUT PANEL (SIMPLIFIED)
 * - Mostra SOLO le regole di business
 * - Rimosso tutto il resto (Aspetto, Temi, Dashboard Config)
 */

import { BUSINESS_LOGIC_FIELDS } from './ui-settings-constants.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';

// -------------------------------------
// Helpers (Minimized)
// -------------------------------------

function watchSettingsTab(): void {
  const observer = new MutationObserver(() => {
    const shell = document.querySelector('.settings-shell') as HTMLElement;
    const tabs = document.querySelector('.settings-tabs') as HTMLElement;
    // We reuse the existing structure but only inject ONE tab (or just repurpose the container)
    // Actually, if the shell expects tabs, we should probably just inject our content directly or use a single tab.
    if (shell && tabs && !shell.dataset.uiAppearanceReady) {
      shell.dataset.uiAppearanceReady = 'true';
      injectSettingsContent(shell, tabs);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectSettingsContent(shell: HTMLElement, tabs: HTMLElement): void {
  const panelsWrapper = shell.querySelector('.content-box[data-settings-panel]');
  if (!tabs || !panelsWrapper) { return; }

  // 1. Create Tab Button
  const tabBtn = document.createElement('button');
  tabBtn.className = 'settings-tab';
  tabBtn.dataset.settingsTab = 'business-rules';
  // Use a generic icon or the briefcase
  tabBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Impostazioni';

  // 2. Create Panel Content
  const panel = document.createElement('div');
  panel.className = 'content-box settings-panel';
  panel.dataset.settingsPanel = 'business-rules';
  panel.innerHTML = `
    <div class="ui-appearance-panel">
        <div class="ui-header-box">
            <div class="ui-header-titles">
                <h3 class="ui-header-title">Impostazioni Applicazione</h3>
                <p class="ui-header-desc">Configura le regole operative e le soglie di sicurezza.</p>
            </div>
        </div>
        <div id="business-rules-container">
            <p class="ui-loading-hint">Caricamento impostazioni...</p>
        </div>
    </div>
  `;

  tabs.appendChild(tabBtn);
  shell.appendChild(panel);

  // Tab Switching Logic (in case there are other tabs elsewhere, though we removed most)
  tabBtn.addEventListener('click', () => {
    // Deactivate others
    shell.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
    shell.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));

    // Activate this
    tabBtn.classList.add('active');
    panel.classList.add('active');
  });

  // Render logic immediately
  renderBusinessLogicFields(panel.querySelector('#business-rules-container') as HTMLElement);

  // Activate by default if it's the first one
  if (!shell.querySelector('.settings-tab.active')) {
    tabBtn.click();
  }

  ensureTabSwitching(shell);
}

function ensureTabSwitching(shell: HTMLElement): void {
  shell.querySelectorAll('.settings-tab').forEach((el) => {
    const btn = el as HTMLElement;
    btn.addEventListener('click', () => {
      const target = btn.dataset.settingsTab!;
      activateSettingsTab(target, shell);
    });
  });
}

function activateSettingsTab(targetKey: string, shell: HTMLElement): void {
  shell.querySelectorAll('.settings-tab').forEach((el) => {
    const btn = el as HTMLElement;
    btn.classList.toggle('active', btn.dataset.settingsTab === targetKey);
  });
  shell.querySelectorAll('.settings-panel').forEach((el) => {
    const panel = el as HTMLElement;
    panel.classList.toggle('active', panel.dataset.settingsPanel === targetKey);
  });
}

/**
 * Render Business Logic Section
 */
async function renderBusinessLogicFields(container: HTMLElement): Promise<void> {
  if (!container) return;

  try {
    container.innerHTML = '<p class="ui-loading-hint"><i class="fas fa-spinner fa-spin"></i> Sincronizzazione con il vault...</p>';

    const rules = await BusinessLogicManager.loadRules();

    let html = '<div class="ui-business-rules-grid">';

    BUSINESS_LOGIC_FIELDS.forEach(field => {
      const value = (rules as any)[field.key] ?? field.defaultValue;

      html += `
                <div class="ui-business-rule-card">
                    <div class="ui-rule-icon">
                        <i class="${field.icon || 'fas fa-cog'}"></i>
                    </div>
                    <div class="ui-rule-content">
                        <label class="ui-rule-label">${field.label}</label>
                        <p class="ui-rule-desc">${field.description}</p>
                        <div class="ui-rule-control">
                            ${field.type === 'number' ? `
                                <div class="ui-number-input-wrapper">
                                    <input type="number" step="any" name="br_${field.key}" value="${value}" class="ui-rule-input" />
                                    ${field.unit ? `<span class="ui-input-unit">${field.unit}</span>` : ''}
                                </div>
                            ` : field.type === 'boolean' ? `
                                <label class="ui-toggle">
                                    <input type="checkbox" name="br_${field.key}" ${value ? 'checked' : ''} />
                                    <span class="ui-toggle-slider"></span>
                                </label>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
    });

    html += '</div>';
    html += `
            <div class="ui-rule-actions">
                <button type="button" class="menu-button primary" id="save-business-rules-btn">
                    <i class="fas fa-save"></i> Salva Regole Operative
                </button>
            </div>
        `;

    container.innerHTML = html;

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
        saveBtn.classList.add('pending');
        await BusinessLogicManager.saveRules(payload);
      } catch (err) {
        // Toast shown by manager
      } finally {
        saveBtn.classList.remove('pending');
      }
    });

  } catch (err) {
    container.innerHTML = `<p class="ui-error-hint">Errore nel caricamento delle regole: ${err}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Simplified initialization: just watch for the settings tab container to appear
  watchSettingsTab();
});

// Esposizione per compatibilità (anche se vuota)
(window as any).refreshUiIcons = () => {
  // No-op since we removed dynamic icons
};
