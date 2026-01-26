/**
 * UI SETTINGS & LAYOUT PANEL
 * - Applica la palette della UI da Supabase (tabella ui_settings)
 * - Integra il tab "Impostazioni"
 */

import { renderConfigPanel } from '../admin/dashboard-config.js';
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { Toast } from './toast.js';
import { openConfirmModal } from './ui.js';
import {
  UI_FIELDS,
  ADMIN_LAYOUT_FIELDS,
  COMPONENTS_FIELDS,
  FORMS_FIELDS,
  OPERATOR_LAYOUT_FIELDS,
  PREDEFINED_THEMES,
  DEFAULT_SETTINGS,
  UiField,
  BUSINESS_LOGIC_FIELDS
} from './ui-settings-constants.js';
import { UI_SETTINGS_STYLES } from './ui-settings-styles.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';

let cachedSettings: Record<string, string> | null = null;

// -------------------------------------
// Helpers
// -------------------------------------
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const parts = result.split(',');
        const content = parts[1];
        if (content) {
          resolve(content);
        } else {
          reject(new Error('Invalid base64 string'));
        }
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupIconImageHandlers(form: HTMLFormElement): void {
  form.querySelectorAll('input[data-icon-image-input]').forEach((el) => {
    const fileInput = el as HTMLInputElement;
    fileInput.addEventListener('change', async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) { return; }

      if (!file.type.startsWith('image/')) {
        Toast.show('Per favore seleziona un file immagine (PNG, JPG, SVG, ecc.).', 'warning');
        target.value = '';
        return;
      }

      if (file.size > 500 * 1024) {
        Toast.show("L'immagine è troppo grande. Massimo 500KB.", 'warning');
        target.value = '';
        return;
      }

      try {
        const base64 = await fileToBase64(file);
        const fieldKey = fileInput.dataset.iconImageInput!;
        const iconValue = `IMAGE_BASE64:${base64}`;

        const textInput = form.querySelector(`input[name="${fieldKey}"]`) as HTMLInputElement;
        if (textInput) {
          textInput.value = '';
        }

        const tempSettings = await fetchUiSettings();
        tempSettings[fieldKey] = iconValue;
        await applyIconsSettings(tempSettings);

        const panel = form.closest('.ui-appearance-panel');
        if (panel) {
          const currentSettings = await fetchUiSettings();
          const iconsSection = panel.querySelector('[data-appearance-section-content="icons"]');
          if (iconsSection) {
            iconsSection.innerHTML = renderIconsSection(currentSettings);
            setupIconImageHandlers(form);
          }
        }
      } catch (err: any) {
        console.error('Errore nel caricamento immagine:', err);
        Toast.show("Errore nel caricamento dell'immagine: " + err.message, 'error');
        target.value = '';
      }
    });
  });

  form.querySelectorAll('button[data-icon-remove-image]').forEach((el) => {
    const removeBtn = el as HTMLButtonElement;
    removeBtn.addEventListener('click', async () => {
      const fieldKey = removeBtn.dataset.iconRemoveImage!;
      const field = UI_FIELDS.find(f => f.key === fieldKey);
      const defaultValue = field?.defaultValue || '';

      const textInput = form.querySelector(`input[name="${fieldKey}"]`) as HTMLInputElement;
      if (textInput) {
        textInput.value = defaultValue;
      }

      const tempSettings = await fetchUiSettings();
      tempSettings[fieldKey] = defaultValue;
      await applyIconsSettings(tempSettings);

      const panel = form.closest('.ui-appearance-panel');
      if (panel) {
        const currentSettings = await fetchUiSettings();
        const iconsSection = panel.querySelector('[data-appearance-section-content="icons"]');
        if (iconsSection) {
          iconsSection.innerHTML = renderIconsSection(currentSettings);
          setupIconImageHandlers(form);
        }
      }
    });
  });
}

let settingsLoadPromise: Promise<Record<string, string>> | null = null;

function preloadSettings(): Promise<Record<string, string>> {
  if (settingsLoadPromise) { return settingsLoadPromise; }
  settingsLoadPromise = (async () => {
    if (cachedSettings) { return cachedSettings; }
    try {
      if (!cachedSettings) {
        cachedSettings = { ...DEFAULT_SETTINGS };
        applyDefaultsImmediately();
      }

      const { data, error } = await supabase.from('ui_settings').select('key,value');
      if (error) { throw error; }

      if (Array.isArray(data)) {
        data.forEach((row) => {
          if (row?.key && typeof row.value === 'string') {
            cachedSettings![row.key] = row.value;
          }
        });
      }
      return cachedSettings!;
    } catch (err: any) {
      console.warn('[UI Settings] Tabella mancante o non accessibile, uso defaults:', err.message);
      if (!cachedSettings) {
        cachedSettings = { ...DEFAULT_SETTINGS };
      }
      return cachedSettings!;
    }
  })();
  return settingsLoadPromise;
}

function applyDefaultsImmediately(): void {
  const root = document.documentElement;
  UI_FIELDS.forEach((field) => {
    if (field.cssVar) {
      root.style.setProperty(field.cssVar, field.defaultValue);
    }
    if (field.key === 'font_family') {
      document.body.style.fontFamily = field.defaultValue;
      root.style.setProperty('--app-font-family', field.defaultValue);
    }
  });
}

async function fetchUiSettings(): Promise<Record<string, string>> {
  if (cachedSettings) { return cachedSettings; }
  return await preloadSettings();
}

async function saveUiSettings(values: Record<string, string>): Promise<void> {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString()
  }));
  await safeSupabaseQuery(() =>
    supabase.from('ui_settings').upsert(rows, { onConflict: 'key' })
  );

  if (!cachedSettings) { cachedSettings = { ...DEFAULT_SETTINGS }; }
  if (cachedSettings) {
    Object.assign(cachedSettings, values);
  }

  await Promise.all([
    applyUiSettings(cachedSettings),
    applyLayoutSettings(cachedSettings),
    applyComponentsSettings(cachedSettings),
    applyFormsSettings(cachedSettings),
    applyIconsSettings(cachedSettings)
  ]);
}

async function applyUiSettings(overrideSettings: Record<string, string> | null = null): Promise<void> {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;

  UI_FIELDS.forEach((field) => {
    const value = settings[field.key] ?? field.defaultValue;
    if (field.cssVar) {
      root.style.setProperty(field.cssVar, value);
    }
    if (field.key === 'font_family') {
      document.body.style.fontFamily = value;
      root.style.setProperty('--app-font-family', value);
    }
  });

  document.querySelectorAll('.login-tagline').forEach((el) => {
    el.textContent = settings.login_tagline || DEFAULT_SETTINGS.login_tagline;
  });
}

function watchSettingsTab(): void {
  const observer = new MutationObserver(() => {
    const shell = document.querySelector('.settings-shell') as HTMLElement;
    const tabs = document.querySelector('.settings-tabs') as HTMLElement;
    if (shell && tabs && !shell.dataset.uiAppearanceReady) {
      shell.dataset.uiAppearanceReady = 'true';
      injectAppearanceTab(shell, tabs);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectAppearanceTab(shell: HTMLElement, tabs: HTMLElement): void {
  const panelsWrapper = shell.querySelector('.content-box[data-settings-panel]');
  if (!tabs || !panelsWrapper) { return; }

  const tabBtn = document.createElement('button');
  tabBtn.className = 'settings-tab';
  tabBtn.dataset.settingsTab = 'appearance';
  tabBtn.innerHTML = '<i class="fas fa-palette"></i> Aspetto';

  const panel = document.createElement('div');
  panel.className = 'content-box settings-panel';
  panel.dataset.settingsPanel = 'appearance';
  panel.innerHTML = '<div class="ui-appearance-panel"><p>Caricamento impostazioni...</p></div>';

  tabs.appendChild(tabBtn);
  shell.appendChild(panel);

  tabBtn.addEventListener('click', () => activateSettingsTab('appearance', shell));

  renderAppearancePanel(panel);
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

async function renderAppearancePanel(panel: HTMLElement): Promise<void> {
  const settings = await fetchUiSettings();

  const colorFields = UI_FIELDS.filter(f => f.type === 'color');
  const typographyFields = UI_FIELDS.filter(f => f.key === 'font_family' || f.key === 'button_radius');
  const textFields = UI_FIELDS.filter(f => f.key === 'login_tagline');

  const renderColorField = (field: UiField) => {
    const value = settings[field.key] ?? field.defaultValue;
    const hexValue = value.toUpperCase();
    return `
      <div class="ui-color-field">
        <label class="ui-color-label">
          <span class="ui-color-label-text">${field.label}</span>
          <small class="ui-color-label-desc">${field.description}</small>
        </label>
        <div class="ui-color-controls">
          <input 
            type="color" 
            name="${field.key}" 
            value="${value}" 
            class="ui-color-picker" 
            title="Clicca per selezionare un colore"
          />
          <input 
            type="text" 
            name="${field.key}_hex" 
            value="${hexValue}" 
            class="ui-color-hex" 
            placeholder="#000000"
            maxlength="7"
            pattern="#[0-9A-Fa-f]{6}"
            title="Inserisci un codice colore esadecimale (es. #0A2342)"
          />
        </div>
      </div>
    `;
  };

  const renderTextField = (field: UiField) => {
    const value = settings[field.key] ?? field.defaultValue;
    return `
      <div class="ui-text-field">
        <label class="ui-text-label">
          <span>${field.label}</span>
          <small>${field.description}</small>
        </label>
        <input 
          type="text" 
          name="${field.key}" 
          value="${value}" 
          class="ui-text-input" 
        />
      </div>
    `;
  };

  panel.innerHTML = `
    <div class="ui-appearance-panel">
      <div class="ui-header-box">
        <div class="ui-header-titles">
          <h3 class="ui-header-title">Personalizza aspetto grafico</h3>
          <p class="ui-header-desc">
            Configura colori, tipografia, layout e struttura dell'interfaccia. Le modifiche hanno effetto immediato.
          </p>
        </div>
      </div>

      <div class="ui-appearance-tabs">
        <button class="ui-appearance-tab active" data-appearance-section="colors">
          <i class="fas fa-palette"></i>
          <span>Colori</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="typography">
          <i class="fas fa-font"></i>
          <span>Tipografia</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="components">
          <i class="fas fa-cube"></i>
          <span>Componenti</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="layout-admin">
          <i class="fas fa-user-shield"></i>
          <span>Layout Admin</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="layout-operator">
          <i class="fas fa-user"></i>
          <span>Layout Operatore</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="forms">
          <i class="fas fa-edit"></i>
          <span>Form</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="themes">
          <i class="fas fa-paint-brush"></i>
          <span>Temi</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="icons">
          <i class="fas fa-icons"></i>
          <span>Icone</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="dashboard">
          <i class="fas fa-chart-line"></i>
          <span>Dashboard</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="business-logic">
          <i class="fas fa-briefcase"></i>
          <span>Logica Business</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="advanced">
          <i class="fas fa-cog"></i>
          <span>Avanzate</span>
        </button>
      </div>

      <form id="ui-appearance-form" class="ui-appearance-form">
        <div class="ui-appearance-section active" data-appearance-section-content="colors">
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-palette"></i>
              <span>Palette Colori</span>
            </h4>
            <p class="ui-section-hint">Personalizza i colori principali dell'applicazione</p>
            <div class="ui-colors-grid">
              ${colorFields.map(renderColorField).join('')}
            </div>
          </div>
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="typography">
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-font"></i>
              <span>Tipografia e Stile</span>
            </h4>
            <div class="ui-typography-grid">
              ${typographyFields.map(renderTextField).join('')}
            </div>
          </div>
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-text-height"></i>
              <span>Testi Interfaccia</span>
            </h4>
            <div class="ui-text-fields-wrapper">
              ${textFields.map(renderTextField).join('')}
            </div>
          </div>
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="components">
          ${renderComponentsSection(settings)}
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="layout-admin">
          ${renderAdminLayoutSection(settings)}
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="layout-operator">
          ${renderOperatorLayoutSection(settings)}
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="forms">
          ${renderFormsSection(settings)}
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="themes">
          ${renderThemesSection(settings)}
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="icons">
          ${renderIconsSection(settings)}
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="dashboard">
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="business-logic">
          <div class="ui-section-box">
             <h4 class="ui-section-title">
               <i class="fas fa-briefcase"></i>
               <span>Regole di Business</span>
             </h4>
             <p class="ui-section-hint">Configura le soglie di sicurezza e le policy operative della stazione.</p>
             <div class="ui-business-logic-wrapper" id="business-rules-container">
                <p class="ui-loading-hint">Caricamento regole dal vault...</p>
             </div>
          </div>
        </div>

        <div class="ui-appearance-section" data-appearance-section-content="advanced">
          ${renderAdvancedSection(settings)}
        </div>

        <div class="ui-actions-box">
          <p class="ui-actions-info">
            <i class="fas fa-info-circle"></i>
            Le modifiche sono visibili immediatamente. Salva per applicarle a tutti gli utenti.
          </p>
          <div class="ui-actions-buttons">
            <button type="button" class="menu-button secondary" data-ui-reset>
              <i class="fas fa-undo"></i> 
              <span>Ripristina default</span>
            </button>
            <button type="submit" class="menu-button primary">
              <i class="fas fa-save"></i> 
              <span>Salva impostazioni</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  `;

  const form = panel.querySelector('#ui-appearance-form') as HTMLFormElement;
  const resetBtn = panel.querySelector('[data-ui-reset]') as HTMLButtonElement;

  panel.querySelectorAll('.ui-appearance-tab').forEach((el) => {
    const tab = el as HTMLElement;
    tab.addEventListener('click', () => {
      const section = tab.dataset.appearanceSection;
      panel.querySelectorAll('.ui-appearance-tab').forEach((t) => t.classList.remove('active'));
      panel.querySelectorAll('.ui-appearance-section').forEach((s) => s.classList.remove('active'));
      tab.classList.add('active');
      const sectionContent = panel.querySelector(`[data-appearance-section-content="${section}"]`);
      sectionContent?.classList.add('active');

      if (section === 'business-logic') {
        renderBusinessLogicFields(panel.querySelector('#business-rules-container') as HTMLElement);
      }
    });
  });

  form.querySelectorAll('.ui-color-picker').forEach((el) => {
    const picker = el as HTMLInputElement;
    const fieldKey = picker.name;
    const hexInput = form.querySelector(`input[name="${fieldKey}_hex"]`) as HTMLInputElement;

    picker.addEventListener('input', (e: any) => {
      const value = e.target.value.toUpperCase();
      if (hexInput) { hexInput.value = value; }
      const field = UI_FIELDS.find((f) => f.key === fieldKey);
      if (field?.cssVar) {
        document.documentElement.style.setProperty(field.cssVar, value);
      }
    });
  });

  form.querySelectorAll('.ui-color-hex').forEach((el) => {
    const hexInput = el as HTMLInputElement;
    const fieldKey = hexInput.name.replace('_hex', '');
    const picker = form.querySelector(`input[name="${fieldKey}"]`) as HTMLInputElement;
    if (picker) {
      hexInput.addEventListener('input', (e: any) => {
        const hex = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          picker.value = hex;
          picker.dispatchEvent(new Event('input'));
        }
      });
    }
  });

  const dashboardContainer = panel.querySelector('[data-appearance-section-content="dashboard"]') as HTMLElement;
  if (dashboardContainer) {
    renderConfigPanel(dashboardContainer);
  }

  form.addEventListener('input', (event: any) => {
    const { name, value } = event.target;
    if (name.endsWith('_hex')) { return; }

    const field = UI_FIELDS.find((f) => f.key === name);
    if (field?.cssVar) {
      document.documentElement.style.setProperty(field.cssVar, value);
    }
    if (name === 'font_family') {
      document.body.style.fontFamily = value;
    }
    if (name === 'login_tagline') {
      document.querySelectorAll('.login-tagline').forEach((el) => {
        (el as HTMLElement).textContent = value;
      });
    }

    applyComponentsSettings({ [name]: value });
    applyFormsSettings({ [name]: value });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload: Record<string, string> = {};

    UI_FIELDS.forEach((field) => {
      const value = formData.get(field.key) as string;
      payload[field.key] = value || field.defaultValue;
    });

    [...COMPONENTS_FIELDS.buttons, ...COMPONENTS_FIELDS.tables,
    ...COMPONENTS_FIELDS.cards, ...COMPONENTS_FIELDS.modals].forEach((field) => {
      const value = formData.get(field.key) as string;
      payload[field.key] = value || field.defaultValue;
    });

    [...FORMS_FIELDS.inputs, ...FORMS_FIELDS.layout].forEach((field) => {
      const value = formData.get(field.key) as string;
      payload[field.key] = value || field.defaultValue;
    });

    const responsiveBreakpoint = formData.get('responsive_mobile_breakpoint') as string;
    const responsiveCollapse = formData.get('responsive_sidebar_collapse') as string;
    if (responsiveBreakpoint) { payload.responsive_mobile_breakpoint = responsiveBreakpoint; }
    if (responsiveCollapse) { payload.responsive_sidebar_collapse = responsiveCollapse; }

    [...ADMIN_LAYOUT_FIELDS.sidebar, ...ADMIN_LAYOUT_FIELDS.header, ...ADMIN_LAYOUT_FIELDS.menu,
    ...ADMIN_LAYOUT_FIELDS.spacing].forEach((field) => {
      const value = formData.get(field.key) as string;
      payload[field.key] = value || field.defaultValue;
    });

    [...OPERATOR_LAYOUT_FIELDS.header, ...OPERATOR_LAYOUT_FIELDS.menu].forEach((field) => {
      const value = formData.get(field.key) as string;
      payload[field.key] = value || field.defaultValue;
    });

    try {
      form.classList.add('pending');
      await saveUiSettings(payload);
      const successMsg = document.createElement('div');
      successMsg.className = 'ui-success-message';
      successMsg.innerHTML = '<i class="fas fa-check-circle"></i> Impostazioni salvate con successo!';
      form.parentElement!.insertBefore(successMsg, form);
      setTimeout(() => successMsg.remove(), 3000);
    } catch (err: any) {
      console.error('[UI Settings] Errore salvataggio:', err);
      Toast.show('Errore nel salvataggio delle impostazioni: ' + err.message, 'error');
    } finally {
      form.classList.remove('pending');
    }
  });

  resetBtn.addEventListener('click', async () => {
    const confirmed = await openConfirmModal('Ripristinare tutti i valori di default (colori, layout, ecc.)?');
    if (!confirmed) { return; }
    try {
      form.classList.add('pending');
      const defaults = { ...DEFAULT_SETTINGS };
      [...COMPONENTS_FIELDS.buttons, ...COMPONENTS_FIELDS.tables,
      ...COMPONENTS_FIELDS.cards, ...COMPONENTS_FIELDS.modals].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...FORMS_FIELDS.inputs, ...FORMS_FIELDS.layout].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...ADMIN_LAYOUT_FIELDS.sidebar, ...ADMIN_LAYOUT_FIELDS.header, ...ADMIN_LAYOUT_FIELDS.menu,
      ...ADMIN_LAYOUT_FIELDS.spacing].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...OPERATOR_LAYOUT_FIELDS.header, ...OPERATOR_LAYOUT_FIELDS.menu].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      await saveUiSettings(defaults);
      renderAppearancePanel(panel);
      Toast.show('Impostazioni ripristinate.', 'success');
    } catch (err: any) {
      console.error(err);
      Toast.show('Impossibile ripristinare: ' + err.message, 'error');
    } finally {
      form.classList.remove('pending');
    }
  });

  panel.querySelectorAll('.ui-theme-apply').forEach((el) => {
    const btn = el as HTMLElement;
    btn.addEventListener('click', async () => {
      const themeKey = btn.dataset.themeKey!;
      const theme = PREDEFINED_THEMES[themeKey];
      if (!theme) { return; }

      const confirmed = await openConfirmModal(`Applicare il tema "${theme.name}"? I colori attuali verranno sostituiti.`);
      if (!confirmed) { return; }

      try {
        form.classList.add('pending');
        const themePayload: Record<string, string> = {};
        Object.entries(theme).forEach(([key, value]) => {
          if (key !== 'name') {
            themePayload[key] = value as string;
          }
        });
        await saveUiSettings(themePayload);
        renderAppearancePanel(panel);
        Toast.show(`Tema "${theme.name}" applicato con successo!`, 'success');
      } catch (err: any) {
        Toast.show("Errore nell'applicazione del tema: " + err.message, 'error');
      } finally {
        form.classList.remove('pending');
      }
    });
  });

  const exportBtn = panel.querySelector('#export-config-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        const allSettings = await fetchUiSettings();
        const config = {
          version: '1.0',
          exported_at: new Date().toISOString(),
          settings: allSettings
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `neofuel-ui-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Toast.show('Configurazione esportata con successo!', 'success');
      } catch (err: any) {
        Toast.show("Errore nell'export: " + err.message, 'error');
      }
    });
  }

  const importInput = panel.querySelector('#import-config-input') as HTMLInputElement;
  if (importInput) {
    importInput.addEventListener('change', async (e: any) => {
      const file = e.target.files[0];
      if (!file) { return; }

      try {
        const text = await file.text();
        const config = JSON.parse(text);

        if (!config.settings || typeof config.settings !== 'object') {
          throw new Error('Formato file non valido');
        }

        const confirmed = await openConfirmModal('Importare la configurazione? Tutte le impostazioni attuali verranno sostituite.');
        if (!confirmed) {
          e.target.value = '';
          return;
        }

        form.classList.add('pending');
        await saveUiSettings(config.settings);
        renderAppearancePanel(panel);
        Toast.show('Configurazione importata con successo!', 'success');
      } catch (err: any) {
        Toast.show("Errore nell'import: " + err.message, 'error');
      } finally {
        form.classList.remove('pending');
        e.target.value = '';
      }
    });
  }

  setupIconImageHandlers(form);
}

function renderAdminLayoutSection(settings: Record<string, string>): string {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-bars"></i>
          <span>Sidebar</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.sidebar.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-heading"></i>
          <span>Header</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.header.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list"></i>
          <span>Menu di Navigazione</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.menu.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-arrows-alt"></i>
          <span>Spaziature</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.spacing.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderComponentsSection(settings: Record<string, string>): string {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-mouse-pointer"></i>
          <span>Bottoni</span>
        </h4>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.buttons.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-table"></i>
          <span>Tabelle</span>
        </h4>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.tables.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-square"></i>
          <span>Card e Box</span>
        </h4>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.cards.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-window-maximize"></i>
          <span>Modali</span>
        </h4>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.modals.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderFormsSection(settings: Record<string, string>): string {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-keyboard"></i>
          <span>Campi Input</span>
        </h4>
        <div class="ui-layout-fields">
          ${FORMS_FIELDS.inputs.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-th"></i>
          <span>Layout Form</span>
        </h4>
        <div class="ui-layout-fields">
          ${FORMS_FIELDS.layout.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
    </div>
  `;
}


function renderThemesSection(_settings: Record<string, string>): string {
  const themesList = Object.entries(PREDEFINED_THEMES).map(([key, theme]) => `
    <div class="ui-theme-card" data-theme-key="${key}">
      <div class="ui-theme-preview">
        <div class="ui-theme-preview-sidebar theme-${key}-sidebar"></div>
        <div class="ui-theme-preview-main theme-${key}-body">
          <div class="ui-theme-preview-header theme-${key}-primary"></div>
          <div class="ui-theme-preview-content theme-${key}-accent"></div>
        </div>
      </div>
      <h5 class="ui-theme-name">${theme.name}</h5>
      <button type="button" class="menu-button secondary ui-theme-apply" data-theme-key="${key}">
        <i class="fas fa-check"></i> Applica Tema
      </button>
    </div>
  `).join('');

  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-paint-brush"></i>
          <span>Temi Predefiniti</span>
        </h4>
        <div class="ui-themes-grid">
          ${themesList}
        </div>
      </div>
    </div>
  `;
}

function renderIconsSection(settings: Record<string, string>): string {
  const adminIconFields = UI_FIELDS.filter(f => f.category === 'icon_admin');
  const operatorIconFields = UI_FIELDS.filter(f => f.category === 'icon_operator');
  const stationActionIconFields = UI_FIELDS.filter(f => f.category === 'icon_station_actions');

  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-shield-alt"></i>
          <span>Icone Menu Admin</span>
        </h4>
        <div class="ui-layout-fields">
          ${adminIconFields.map(f => renderIconField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-user"></i>
          <span>Icone Menu Operatore</span>
        </h4>
        <div class="ui-layout-fields">
          ${operatorIconFields.map(f => renderIconField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-gas-pump"></i>
          <span>Icone Azioni Distributori</span>
        </h4>
        <div class="ui-layout-fields">
          ${stationActionIconFields.map(f => renderIconField(f, settings)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderIconField(field: UiField, settings: Record<string, string>): string {
  const value = settings[field.key] || field.defaultValue || '';
  const isSvg = value.trim().startsWith('<svg') || value.trim().startsWith('<?xml');
  const isImage = value.trim().startsWith('IMAGE_BASE64:');
  const imageBase64 = isImage ? value.replace('IMAGE_BASE64:', '') : '';
  const displayValue = isImage ? '' : value;

  return `
    <div class="ui-layout-field" data-icon-field-key="${field.key}">
      <label class="ui-text-label">
        <span>${field.label}</span>
        <small>${field.description}</small>
      </label>
      <div class="preview-icon-wrapper">
        <input 
          type="text" 
          name="${field.key}" 
          value="${escapeHtml(displayValue)}" 
          class="ui-text-input preview-icon-input" 
          placeholder="${field.defaultValue || ''}"
          data-icon-field="true"
        />
        <label class="menu-button secondary preview-file-label">
          <i class="fas fa-image"></i> Carica Immagine
          <input 
            type="file" 
            accept="image/*" 
            style="display: none;" 
            data-icon-image-input="${field.key}"
          />
        </label>
        ${isImage ? `
          <button type="button" class="menu-button secondary preview-file-label" data-icon-remove-image="${field.key}">
            <i class="fas fa-times"></i> Rimuovi
          </button>
        ` : ''}
      </div>
      ${isImage ? `
        <div class="preview-box">
          <small class="preview-label">Anteprima Immagine:</small>
          <img src="data:image/png;base64,${imageBase64}" class="preview-img-lg" alt="Icona" />
        </div>
      ` : isSvg ? `
        <div class="preview-box">
          <small class="preview-label">Anteprima:</small>
          <div class="preview-svg-box">
            ${value}
          </div>
        </div>
      ` : value ? `
        <div class="preview-box">
          <small class="preview-label">Anteprima:</small>
          <i class="${value} preview-font-icon"></i>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAdvancedSection(settings: Record<string, string>): string {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-download"></i>
          <span>Export / Import Configurazione</span>
        </h4>
        <div class="ui-advanced-actions">
          <button type="button" class="menu-button primary" id="export-config-btn">
            <i class="fas fa-download"></i> Esporta Configurazione
          </button>
          <label class="menu-button secondary" style="cursor: pointer; margin: 0;">
            <i class="fas fa-upload"></i> Importa Configurazione
            <input type="file" id="import-config-input" accept=".json" style="display: none;" />
          </label>
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-mobile-alt"></i>
          <span>Responsive e Mobile</span>
        </h4>
        <div class="ui-layout-fields">
          <div class="ui-layout-field">
            <label class="ui-text-label">
              <span>Breakpoint Mobile</span>
            </label>
            <input 
              type="text" 
              name="responsive_mobile_breakpoint" 
              value="${settings.responsive_mobile_breakpoint || '768px'}" 
              class="ui-text-input" 
            />
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderOperatorLayoutSection(settings: Record<string, string>): string {
  const menuMainItems = OPERATOR_LAYOUT_FIELDS.menu.filter(f =>
    f.key === 'operator_menu_show_turno' || f.key === 'operator_menu_show_movimenti' ||
    f.key === 'operator_menu_show_fatture' || f.key === 'operator_menu_show_prezzi'
  );
  const menuSubItems = OPERATOR_LAYOUT_FIELDS.menu.filter(f =>
    f.key === 'operator_menu_show_crediti' || f.key === 'operator_menu_show_voucher' ||
    f.key === 'operator_menu_show_uscite' || f.key === 'operator_menu_show_incassi'
  );

  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-heading"></i>
          <span>Header</span>
        </h4>
        <div class="ui-layout-fields">
          ${OPERATOR_LAYOUT_FIELDS.header.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list"></i>
          <span>Menu Principale</span>
        </h4>
        <div class="ui-layout-fields">
          ${menuMainItems.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list-ul"></i>
          <span>Sottomenu Movimenti</span>
        </h4>
        <div class="ui-layout-fields">
          ${menuSubItems.map(f => renderLayoutField(f, settings)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderLayoutField(field: UiField, settings: Record<string, string>): string {
  const value = settings[field.key] ?? field.defaultValue;

  if (field.type === 'checkbox') {
    const checked = String(value) === 'true';
    return `
      <div class="ui-layout-field">
        <label class="ui-checkbox-label">
          <input 
            type="checkbox" 
            name="${field.key}" 
            ${checked ? 'checked' : ''}
            value="true"
          />
          <span class="ui-checkbox-label-text">${field.label}</span>
        </label>
        <small class="ui-field-desc">${field.description}</small>
      </div>
    `;
  } else if (field.type === 'select') {
    return `
      <div class="ui-layout-field">
        <label class="ui-text-label">
          <span>${field.label}</span>
          <small>${field.description}</small>
        </label>
        <select name="${field.key}" class="ui-text-input">
          ${field.options?.map(opt =>
      `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
    ).join('')}
        </select>
      </div>
    `;
  } else if (field.type === 'color') {
    const hexValue = value.toUpperCase();
    return `
      <div class="ui-layout-field">
        <label class="ui-color-label">
          <span class="ui-color-label-text">${field.label}</span>
          <small class="ui-color-label-desc">${field.description}</small>
        </label>
        <div class="ui-color-controls">
          <input 
            type="color" 
            name="${field.key}" 
            value="${value}" 
            class="ui-color-picker" 
            title="Clicca per selezionare un colore"
          />
          <input 
            type="text" 
            name="${field.key}_hex" 
            value="${hexValue}" 
            class="ui-color-hex" 
            placeholder="#000000"
            maxlength="7"
            pattern="#[0-9A-Fa-f]{6}"
            title="Inserisci un codice colore esadecimale"
          />
        </div>
      </div>
    `;
  } else {
    return `
      <div class="ui-layout-field">
        <label class="ui-text-label">
          <span>${field.label}</span>
          <small>${field.description}</small>
        </label>
        <input 
          type="text" 
          name="${field.key}" 
          value="${value}" 
          class="ui-text-input" 
        />
      </div>
    `;
  }
}

async function applyFormsSettings(overrideSettings: Record<string, string> | null = null): Promise<void> {
  const settings = overrideSettings || await fetchUiSettings();

  const inputPadding = settings.form_input_padding || '12px 16px';
  const inputRadius = settings.form_input_radius || '6px';
  const inputBorderWidth = settings.form_input_border_width || '2px';
  const inputFontSize = settings.form_input_font_size || '1rem';
  const labelFontSize = settings.form_label_font_size || '0.95rem';
  const labelFontWeight = settings.form_label_font_weight || '600';

  const formInputs = document.querySelectorAll('.form-group input, .form-group select, .form-group textarea, .big-input, .form-input') as NodeListOf<HTMLElement>;
  formInputs.forEach((input) => {
    input.style.padding = inputPadding;
    input.style.borderRadius = inputRadius;
    input.style.borderWidth = inputBorderWidth;
    input.style.fontSize = inputFontSize;
  });

  const formLabels = document.querySelectorAll('.form-group label, .form-field label') as NodeListOf<HTMLElement>;
  formLabels.forEach((label) => {
    label.style.fontSize = labelFontSize;
    label.style.fontWeight = labelFontWeight;
  });

  const formGroupGap = settings.form_group_gap || '20px';
  const formRowGap = settings.form_row_gap || '16px';

  const formGroups = document.querySelectorAll('.form-group') as NodeListOf<HTMLElement>;
  formGroups.forEach((group) => {
    group.style.marginBottom = formGroupGap;
  });

  const formRows = document.querySelectorAll('.form-row') as NodeListOf<HTMLElement>;
  formRows.forEach((row) => {
    row.style.gap = formRowGap;
  });
}

async function applyIconsSettings(overrideSettings: Record<string, string> | null = null): Promise<void> {
  const settings = overrideSettings || await fetchUiSettings();

  const adminIconMap: Record<string, string> = {
    dashboard: settings.admin_icon_dashboard || 'fas fa-chart-line',
    stations: settings.admin_icon_stations || 'fas fa-gas-pump',
    operators: settings.admin_icon_operators || 'fas fa-users',
    chiusure: settings.admin_icon_chiusure || 'fas fa-file-invoice-dollar',
    crediti: settings.admin_icon_crediti || 'fas fa-credit-card',
    fatture: settings.admin_icon_fatture || 'fas fa-file-invoice',
    vouchers: settings.admin_icon_vouchers || 'fas fa-ticket-alt',
    notifiche: settings.admin_icon_notifiche || 'fas fa-bell',
    settings: settings.admin_icon_settings || 'fas fa-cog'
  };

  Object.entries(adminIconMap).forEach(([tab, iconValue]) => {
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) {
      const iconEl = btn.querySelector('i, img, span.icon-svg-wrapper, span.icon-img-wrapper') as HTMLElement;
      if (iconEl) {
        if (iconValue.trim().startsWith('IMAGE_BASE64:')) {
          const base64 = iconValue.replace('IMAGE_BASE64:', '');
          iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper icon-preview-sm" alt="Icona" />`;
        } else if (iconValue.trim().startsWith('<svg') || iconValue.trim().startsWith('<?xml')) {
          iconEl.outerHTML = `<span class="icon-svg-wrapper icon-preview-sm">${iconValue}</span>`;
        } else {
          if (iconEl.tagName === 'I') {
            iconEl.className = iconValue;
          } else {
            iconEl.outerHTML = `<i class="${iconValue}"></i>`;
          }
        }
      }
    }
  });

  // Logout
  const refreshIcon = (selector: string, iconValue: string) => {
    const el = document.querySelector(selector);
    if (el) {
      const iconEl = el.querySelector('i, img, span.icon-svg-wrapper, span.icon-img-wrapper') as HTMLElement;
      if (iconEl) {
        if (iconValue.trim().startsWith('IMAGE_BASE64:')) {
          const base64 = iconValue.replace('IMAGE_BASE64:', '');
          iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper icon-preview-md" alt="Icona" />`;
        } else if (iconValue.trim().startsWith('<svg') || iconValue.trim().startsWith('<?xml')) {
          iconEl.outerHTML = `<span class="icon-svg-wrapper icon-preview-md">${iconValue}</span>`;
        } else {
          if (iconEl.tagName === 'I') {
            iconEl.className = iconValue;
          } else {
            iconEl.outerHTML = `<i class="${iconValue}"></i>`;
          }
        }
      }
    }
  };

  refreshIcon('#admin-logout', settings.admin_icon_logout || 'fas fa-sign-out-alt');
  refreshIcon('#turno-icon', settings.operator_icon_turno || 'fas fa-door-open');
  refreshIcon('#op-logout-btn', settings.operator_icon_logout || 'fas fa-sign-out-alt');
  refreshIcon('#btn-movimenti', settings.operator_icon_movimenti || 'fas fa-exchange-alt');
  refreshIcon('#btn-crediti', settings.operator_icon_crediti || 'fas fa-credit-card');
  refreshIcon('#btn-voucher', settings.operator_icon_voucher || 'fas fa-ticket-alt');
  refreshIcon('#btn-uscite', settings.operator_icon_uscite || 'fas fa-hand-holding-usd');
  refreshIcon('#btn-incassi', settings.operator_icon_incassi || 'fas fa-cash-register');
  refreshIcon('#btn-fatture', settings.operator_icon_fatture || 'fas fa-file-invoice');
  refreshIcon('#btn-prezzi', settings.operator_icon_prezzi || 'fas fa-tags');
}

async function applyComponentsSettings(overrideSettings: Record<string, string> | null = null): Promise<void> {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;

  const buttonPadding = settings.component_button_padding || '12px 24px';
  const buttonRadius = settings.component_button_radius || '6px';
  const buttonFontSize = settings.component_button_font_size || '1rem';
  const buttonFontWeight = settings.component_button_font_weight || '600';

  document.querySelectorAll('.menu-button').forEach((el) => {
    const btn = el as HTMLElement;
    btn.style.padding = buttonPadding;
    btn.style.borderRadius = buttonRadius;
    btn.style.fontSize = buttonFontSize;
    btn.style.fontWeight = buttonFontWeight;
  });

  // Tables
  const tableHeaderBg = settings.component_table_header_bg || '#F4F6F8';
  const tableHoverBg = settings.component_table_hover_bg || '#F8FAFC';
  const tablePadding = settings.component_table_padding || '16px 24px';

  root.style.setProperty('--table-header-bg', tableHeaderBg);
  root.style.setProperty('--table-hover-bg', tableHoverBg);

  document.querySelectorAll('.admin-table th').forEach((el) => {
    const th = el as HTMLElement;
    th.style.backgroundColor = tableHeaderBg;
    th.style.padding = tablePadding;
  });

  document.querySelectorAll('.admin-table td').forEach((el) => {
    const td = el as HTMLElement;
    td.style.padding = tablePadding;
  });

  // Cards
  const cardPadding = settings.component_card_padding || '24px';
  const cardRadius = settings.component_card_radius || '16px';
  const cardShadow = settings.component_card_shadow || 'md';

  const shadowMap: Record<string, string> = {
    none: 'none',
    sm: '0 1px 3px rgba(15, 23, 42, 0.08)',
    md: '0 4px 10px rgba(15, 23, 42, 0.12)',
    lg: '0 12px 30px rgba(15, 23, 42, 0.18)'
  };

  document.querySelectorAll('.content-box, .kpi-card, .panel-card').forEach((el) => {
    const card = el as HTMLElement;
    card.style.padding = cardPadding;
    card.style.borderRadius = cardRadius;
    card.style.boxShadow = shadowMap[cardShadow] || shadowMap.md || 'none';
  });
}

async function applyLayoutSettings(overrideSettings: Record<string, string> | null = null): Promise<void> {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;

  if (settings.admin_sidebar_width) {
    root.style.setProperty('--admin-sidebar-width', settings.admin_sidebar_width);
  }

  const setVisible = (selector: string, visible: boolean) => {
    const el = document.querySelector(selector) as HTMLElement;
    if (el) { el.style.display = visible ? '' : 'none'; };
  };

  setVisible('.admin-sidebar .sidebar-header', settings.admin_sidebar_show_header !== 'false');
  setVisible('.admin-sidebar .sidebar-footer', settings.admin_sidebar_show_footer !== 'false');
  setVisible('.admin-header-logo', settings.admin_header_show_logo !== 'false');

  ['dashboard', 'stations', 'operators', 'chiusure', 'crediti', 'fatture', 'vouchers', 'notifiche'].forEach(tab => {
    setVisible(`.nav-btn[data-tab="${tab}"]`, settings[`admin_menu_show_${tab}`] !== 'false');
  });

  setVisible('#station-badge', settings.operator_header_show_station_badge !== 'false');
  setVisible('#op-logout-btn', settings.operator_header_show_logout !== 'false');
}

function injectStyles(): void {
  if (document.getElementById('ui-appearance-style')) { return; }
  const style = document.createElement('style');
  style.id = 'ui-appearance-style';
  style.textContent = UI_SETTINGS_STYLES;
  document.head.appendChild(style);
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

// Inizializzazione
if (document.readyState === 'loading') {
  preloadSettings();
}

document.addEventListener('DOMContentLoaded', async () => {
  injectStyles();
  const settings = await fetchUiSettings();

  await Promise.all([
    applyUiSettings(settings),
    applyLayoutSettings(settings),
    applyComponentsSettings(settings),
    applyFormsSettings(settings),
    applyIconsSettings(settings)
  ]);

  watchSettingsTab();

  const observer = new MutationObserver(() => {
    fetchUiSettings().then(currentSettings => {
      applyLayoutSettings(currentSettings);
      applyComponentsSettings(currentSettings);
      applyFormsSettings(currentSettings);
      applyIconsSettings(currentSettings);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
});

/**
 * Refresh UI icons globally
 */
(window as any).refreshUiIcons = () => {
  if (cachedSettings) {
    applyIconsSettings(cachedSettings);
  } else {
    fetchUiSettings().then(settings => applyIconsSettings(settings));
  }
};
