// ============================================================
// UI SETTINGS & LAYOUT PANEL (self-contained module)
// ------------------------------------------------------------
// - Non modifica i file esistenti: basta includere questo script
// - Applica la palette della UI da Supabase (tabella ui_settings)
// - Integra il tab "Impostazioni" già esistente aggiungendo:
//   - Sezione "Aspetto": colori, font, testi
//   - Sezione "Layout": configurazione layout Admin e Operatore
// ============================================================

import { supabase, safeSupabaseQuery } from "./api.js";

const UI_FIELDS = [
  {
    key: "primary_color",
    label: "Colore primario",
    type: "color",
    cssVar: "--primary-color",
    defaultValue: "#0A2342",
    description: "Colore di pulsanti e link principali"
  },
  {
    key: "accent_color",
    label: "Colore accento",
    type: "color",
    cssVar: "--accent-color",
    defaultValue: "#8DC63F",
    description: "Colori di evidenza e stati positivi"
  },
  {
    key: "bg_body",
    label: "Sfondo pagina",
    type: "color",
    cssVar: "--bg-body",
    defaultValue: "#F4F6F8",
    description: "Background generale dell'app"
  },
  {
    key: "bg_sidebar",
    label: "Sfondo sidebar",
    type: "color",
    cssVar: "--bg-sidebar",
    defaultValue: "#0A2342",
    description: "Colonna di navigazione area admin"
  },
  {
    key: "sidebar_hover",
    label: "Hover sidebar",
    type: "color",
    cssVar: "--bg-sidebar-hover",
    defaultValue: "#123561",
    description: "Colore della voce attiva/hover"
  },
  {
    key: "text_main",
    label: "Colore testo",
    type: "color",
    cssVar: "--text-main",
    defaultValue: "#333333",
    description: "Testi principali in tutta l'app"
  },
  {
    key: "button_radius",
    label: "Raggio bordi pulsanti",
    type: "text",
    cssVar: "--radius-sm",
    defaultValue: "6px",
    description: "Esempio: 6px, 999px per pill, ecc."
  },
  {
    key: "font_family",
    label: "Font principale",
    type: "text",
    defaultValue: "'Inter', 'Segoe UI', Roboto, sans-serif",
    description: "Stack di caratteri per tutta l'app"
  },
  {
    key: "login_tagline",
    label: "Sottotitolo login",
    type: "text",
    defaultValue: "Portale Distributori",
    description: "Testo sotto il logo in schermata di login"
  },
  // Icone Admin
  {
    key: "admin_icon_dashboard",
    label: "Dashboard",
    type: "text",
    defaultValue: "fas fa-chart-line",
    description: "Icona menu Dashboard (es: fas fa-chart-line o codice SVG)",
    category: "icon_admin"
  },
  {
    key: "admin_icon_stations",
    label: "Distributori",
    type: "text",
    defaultValue: "fas fa-gas-pump",
    description: "Icona menu Distributori",
    category: "icon_admin"
  },
  {
    key: "admin_icon_operators",
    label: "Operatori",
    type: "text",
    defaultValue: "fas fa-users",
    description: "Icona menu Operatori",
    category: "icon_admin"
  },
  {
    key: "admin_icon_chiusure",
    label: "Chiusure",
    type: "text",
    defaultValue: "fas fa-file-invoice-dollar",
    description: "Icona menu Chiusure",
    category: "icon_admin"
  },
  {
    key: "admin_icon_crediti",
    label: "Crediti",
    type: "text",
    defaultValue: "fas fa-credit-card",
    description: "Icona menu Crediti",
    category: "icon_admin"
  },
  {
    key: "admin_icon_fatture",
    label: "Fatture",
    type: "text",
    defaultValue: "fas fa-file-invoice",
    description: "Icona menu Fatture",
    category: "icon_admin"
  },
  {
    key: "admin_icon_vouchers",
    label: "Voucher",
    type: "text",
    defaultValue: "fas fa-ticket-alt",
    description: "Icona menu Voucher",
    category: "icon_admin"
  },
  {
    key: "admin_icon_notifiche",
    label: "Notifiche",
    type: "text",
    defaultValue: "fas fa-bell",
    description: "Icona menu Notifiche",
    category: "icon_admin"
  },
  {
    key: "admin_icon_settings",
    label: "Impostazioni",
    type: "text",
    defaultValue: "fas fa-cog",
    description: "Icona menu Impostazioni",
    category: "icon_admin"
  },
  {
    key: "admin_icon_logout",
    label: "Esci",
    type: "text",
    defaultValue: "fas fa-sign-out-alt",
    description: "Icona bottone Esci",
    category: "icon_admin"
  },
  // Icone Operatore
  {
    key: "operator_icon_turno",
    label: "Apertura/Chiusura",
    type: "text",
    defaultValue: "fas fa-door-open",
    description: "Icona bottone Apertura/Chiusura",
    category: "icon_operator"
  },
  {
    key: "operator_icon_movimenti",
    label: "Movimenti",
    type: "text",
    defaultValue: "fas fa-exchange-alt",
    description: "Icona menu Movimenti",
    category: "icon_operator"
  },
  {
    key: "operator_icon_crediti",
    label: "Crediti",
    type: "text",
    defaultValue: "fas fa-credit-card",
    description: "Icona sottomenu Crediti",
    category: "icon_operator"
  },
  {
    key: "operator_icon_voucher",
    label: "Voucher",
    type: "text",
    defaultValue: "fas fa-ticket-alt",
    description: "Icona sottomenu Voucher",
    category: "icon_operator"
  },
  {
    key: "operator_icon_uscite",
    label: "Uscite",
    type: "text",
    defaultValue: "fas fa-hand-holding-usd",
    description: "Icona sottomenu Uscite",
    category: "icon_operator"
  },
  {
    key: "operator_icon_incassi",
    label: "Incassi",
    type: "text",
    defaultValue: "fas fa-cash-register",
    description: "Icona sottomenu Incassi",
    category: "icon_operator"
  },
  {
    key: "operator_icon_fatture",
    label: "Fatture",
    type: "text",
    defaultValue: "fas fa-file-invoice",
    description: "Icona menu Fatture",
    category: "icon_operator"
  },
  {
    key: "operator_icon_prezzi",
    label: "Prezzi",
    type: "text",
    defaultValue: "fas fa-tags",
    description: "Icona menu Prezzi",
    category: "icon_operator"
  },
  {
    key: "operator_icon_logout",
    label: "Esci",
    type: "text",
    defaultValue: "fas fa-sign-out-alt",
    description: "Icona bottone Esci",
    category: "icon_operator"
  },
  // Icone Azioni Distributori (Admin)
  {
    key: "station_action_icon_edit",
    label: "Modifica",
    type: "text",
    defaultValue: "fas fa-edit",
    description: "Icona azione Modifica distributore",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_prices",
    label: "Prezzi",
    type: "text",
    defaultValue: "fas fa-tag",
    description: "Icona azione Prezzi distributore",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_islands",
    label: "Isole e Pistole",
    type: "text",
    defaultValue: "fas fa-gas-pump",
    description: "Icona azione Isole e Pistole",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_tanks",
    label: "Cisterne",
    type: "text",
    defaultValue: "fas fa-oil-can",
    description: "Icona azione Cisterne distributore",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_delete",
    label: "Elimina",
    type: "text",
    defaultValue: "fas fa-trash",
    description: "Icona azione Elimina distributore",
    category: "icon_station_actions"
  }
];

const DEFAULT_SETTINGS = UI_FIELDS.reduce((acc, field) => {
  acc[field.key] = field.defaultValue;
  return acc;
}, {});

let cachedSettings = null;
let settingsLoaded = false;

// -------------------------------------
// Helpers
// -------------------------------------
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Rimuovi il prefisso "data:image/...;base64," per salvare solo il base64
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupIconImageHandlers(form) {
  // Gestione caricamento immagini per icone
  form.querySelectorAll("input[data-icon-image-input]").forEach((fileInput) => {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Verifica che sia un'immagine
      if (!file.type.startsWith("image/")) {
        alert("Per favore seleziona un file immagine (PNG, JPG, SVG, ecc.)");
        e.target.value = "";
        return;
      }

      // Limita dimensione a 500KB
      if (file.size > 500 * 1024) {
        alert("L'immagine è troppo grande. Massimo 500KB.");
        e.target.value = "";
        return;
      }

      try {
        // Converti in base64
        const base64 = await fileToBase64(file);
        const fieldKey = fileInput.dataset.iconImageInput;
        const iconValue = `IMAGE_BASE64:${base64}`;

        // Aggiorna campo nascosto
        const textInput = form.querySelector(`input[name="${fieldKey}"]`);
        if (textInput) {
          textInput.value = ""; // Pulisci campo testo quando carichi immagine
        }

        // Salva temporaneamente e applica
        const tempSettings = await fetchUiSettings();
        tempSettings[fieldKey] = iconValue;
        await applyIconsSettings(tempSettings);

        // Ricarica il pannello per mostrare l'anteprima
        const panel = form.closest(".ui-appearance-panel");
        if (panel) {
          const currentSettings = await fetchUiSettings();
          const iconsSection = panel.querySelector('[data-appearance-section-content="icons"]');
          if (iconsSection) {
            iconsSection.innerHTML = renderIconsSection(currentSettings);
            setupIconImageHandlers(form);
          }
        }
      } catch (err) {
        console.error("Errore nel caricamento immagine:", err);
        alert("Errore nel caricamento dell'immagine: " + err.message);
        e.target.value = "";
      }
    });
  });

  // Gestione rimozione immagini
  form.querySelectorAll("button[data-icon-remove-image]").forEach((removeBtn) => {
    removeBtn.addEventListener("click", async (e) => {
      const fieldKey = removeBtn.dataset.iconRemoveImage;
      const field = UI_FIELDS.find(f => f.key === fieldKey);
      const defaultValue = field?.defaultValue || "";

      // Ripristina valore di default
      const textInput = form.querySelector(`input[name="${fieldKey}"]`);
      if (textInput) {
        textInput.value = defaultValue;
      }

      // Salva e applica
      const tempSettings = await fetchUiSettings();
      tempSettings[fieldKey] = defaultValue;
      await applyIconsSettings(tempSettings);

      // Ricarica il pannello
      const panel = form.closest(".ui-appearance-panel");
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

// -------------------------------------
// Helpers Supabase (safe fallback)
// -------------------------------------
// Preload delle impostazioni (inizia subito, non aspetta DOMContentLoaded)
let settingsLoadPromise = null;

function preloadSettings() {
  if (settingsLoadPromise) return settingsLoadPromise;
  settingsLoadPromise = (async () => {
    if (cachedSettings) return cachedSettings;
    try {
      // Applica defaults immediatamente per non bloccare il rendering
      if (!cachedSettings) {
        cachedSettings = { ...DEFAULT_SETTINGS };
        // Applica defaults subito
        applyDefaultsImmediately();
      }

      // Carica da Supabase in background
      const { data, error } = await supabase.from("ui_settings").select("key,value");
      if (error) throw error;

      if (Array.isArray(data)) {
        data.forEach((row) => {
          if (row?.key && typeof row.value === "string") {
            cachedSettings[row.key] = row.value;
          }
        });
      }
      return cachedSettings;
    } catch (err) {
      console.warn("[UI Settings] Tabella mancante o non accessibile, uso defaults:", err.message);
      if (!cachedSettings) {
        cachedSettings = { ...DEFAULT_SETTINGS };
      }
      return cachedSettings;
    }
  })();
  return settingsLoadPromise;
}

// Applica i default immediatamente senza attendere Supabase
function applyDefaultsImmediately() {
  const root = document.documentElement;
  UI_FIELDS.forEach((field) => {
    if (field.cssVar) {
      root.style.setProperty(field.cssVar, field.defaultValue);
    }
    if (field.key === "font_family") {
      document.body.style.fontFamily = field.defaultValue;
      root.style.setProperty("--app-font-family", field.defaultValue);
    }
  });
}

async function fetchUiSettings() {
  if (cachedSettings) return cachedSettings;
  return await preloadSettings();
}

async function saveUiSettings(values) {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString()
  }));
  await safeSupabaseQuery(() =>
    supabase.from("ui_settings").upsert(rows, { onConflict: "key" })
  );

  // Aggiorna cache con i nuovi valori invece di invalidarla
  if (!cachedSettings) cachedSettings = { ...DEFAULT_SETTINGS };
  Object.assign(cachedSettings, values);

  // Applica tutte le impostazioni in parallelo usando la cache aggiornata
  await Promise.all([
    applyUiSettings(cachedSettings),
    applyLayoutSettings(cachedSettings),
    applyComponentsSettings(cachedSettings),
    applyFormsSettings(cachedSettings),
    applyIconsSettings(cachedSettings)
  ]);
}

// -------------------------------------
// Applicazione tema globale
// -------------------------------------
async function applyUiSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;

  UI_FIELDS.forEach((field) => {
    const value = settings[field.key] ?? field.defaultValue;
    if (field.cssVar) {
      root.style.setProperty(field.cssVar, value);
    }
    if (field.key === "font_family") {
      document.body.style.fontFamily = value;
      root.style.setProperty("--app-font-family", value);
    }
  });

  document.querySelectorAll(".login-tagline").forEach((el) => {
    el.textContent = settings.login_tagline || DEFAULT_SETTINGS.login_tagline;
  });

  settingsLoaded = true;
}

// -------------------------------------
// Integrazione con tab "Impostazioni"
// -------------------------------------
function watchSettingsTab() {
  const observer = new MutationObserver(() => {
    const shell = document.querySelector(".settings-shell");
    const tabs = document.querySelector(".settings-tabs");
    if (shell && tabs && !shell.dataset.uiAppearanceReady) {
      shell.dataset.uiAppearanceReady = "true";
      injectAppearanceTab(shell, tabs);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectAppearanceTab(shell, tabs) {
  const panelsWrapper = shell.querySelector(".content-box[data-settings-panel]");
  if (!tabs || !panelsWrapper) return;

  const tabBtn = document.createElement("button");
  tabBtn.className = "settings-tab";
  tabBtn.dataset.settingsTab = "appearance";
  tabBtn.innerHTML = `<i class="fas fa-palette"></i> Aspetto`;

  const panel = document.createElement("div");
  panel.className = "content-box settings-panel";
  panel.dataset.settingsPanel = "appearance";
  panel.innerHTML = `<div class="ui-appearance-panel"><p>Caricamento impostazioni...</p></div>`;

  tabs.appendChild(tabBtn);
  shell.appendChild(panel);

  tabBtn.addEventListener("click", () => activateSettingsTab("appearance", shell));

  renderAppearancePanel(panel);
  ensureTabSwitching(shell);
}


function ensureTabSwitching(shell) {
  shell.querySelectorAll(".settings-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.settingsTab;
      activateSettingsTab(target, shell);
    });
  });
}

function activateSettingsTab(targetKey, shell) {
  shell.querySelectorAll(".settings-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.settingsTab === targetKey);
  });
  shell.querySelectorAll(".settings-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsPanel === targetKey);
  });
}

async function renderAppearancePanel(panel) {
  const settings = await fetchUiSettings();

  // Raggruppa i campi per categoria
  const colorFields = UI_FIELDS.filter(f => f.type === "color");
  const typographyFields = UI_FIELDS.filter(f => f.key === "font_family" || f.key === "button_radius");
  const textFields = UI_FIELDS.filter(f => f.key === "login_tagline");

  const renderColorField = (field) => {
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

  const renderTextField = (field) => {
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
        <h3 class="ui-header-title">Personalizza aspetto grafico</h3>
        <p class="ui-header-desc">
          Configura colori, tipografia, layout e struttura dell'interfaccia. Le modifiche hanno effetto immediato.
        </p>
      </div>

      <!-- Tab interni per organizzare le sezioni -->
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
        <button class="ui-appearance-tab" data-appearance-section="advanced">
          <i class="fas fa-cog"></i>
          <span>Avanzate</span>
        </button>
      </div>

      <form id="ui-appearance-form" class="ui-appearance-form">
        <!-- Sezione Colori -->
        <div class="ui-appearance-section active" data-appearance-section-content="colors">
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-palette"></i>
              <span>Palette Colori</span>
            </h4>
            <p class="ui-section-hint">Personalizza i colori principali dell'applicazione</p>
            <div class="ui-colors-grid">
              ${colorFields.map(renderColorField).join("")}
            </div>
          </div>
        </div>

        <!-- Sezione Tipografia -->
        <div class="ui-appearance-section" data-appearance-section-content="typography">
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-font"></i>
              <span>Tipografia e Stile</span>
            </h4>
            <div class="ui-typography-grid">
              ${typographyFields.map(renderTextField).join("")}
            </div>
          </div>
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-text-height"></i>
              <span>Testi Interfaccia</span>
            </h4>
            <div class="ui-text-fields-wrapper">
              ${textFields.map(renderTextField).join("")}
            </div>
          </div>
        </div>

        <!-- Sezione Componenti -->
        <div class="ui-appearance-section" data-appearance-section-content="components">
          ${renderComponentsSection(settings)}
        </div>

        <!-- Sezione Layout Admin -->
        <div class="ui-appearance-section" data-appearance-section-content="layout-admin">
          ${renderAdminLayoutSection(settings)}
        </div>

        <!-- Sezione Layout Operatore -->
        <div class="ui-appearance-section" data-appearance-section-content="layout-operator">
          ${renderOperatorLayoutSection(settings)}
        </div>

        <!-- Sezione Form -->
        <div class="ui-appearance-section" data-appearance-section-content="forms">
          ${renderFormsSection(settings)}
        </div>

        <!-- Sezione Temi -->
        <div class="ui-appearance-section" data-appearance-section-content="themes">
          ${renderThemesSection(settings)}
        </div>

        <!-- Sezione Icone -->
        <div class="ui-appearance-section" data-appearance-section-content="icons">
          ${renderIconsSection(settings)}
        </div>

        <!-- Sezione Avanzate -->
        <div class="ui-appearance-section" data-appearance-section-content="advanced">
          ${renderAdvancedSection(settings)}
        </div>

        <!-- Azioni -->
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

  const form = panel.querySelector("#ui-appearance-form");
  const resetBtn = panel.querySelector("[data-ui-reset]");

  // Tab switching interno
  panel.querySelectorAll(".ui-appearance-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const section = tab.dataset.appearanceSection;
      panel.querySelectorAll(".ui-appearance-tab").forEach((t) => t.classList.remove("active"));
      panel.querySelectorAll(".ui-appearance-section").forEach((s) => s.classList.remove("active"));
      tab.classList.add("active");
      panel.querySelector(`[data-appearance-section-content="${section}"]`)?.classList.add("active");
    });
  });

  // Sincronizza color picker con hex
  form.querySelectorAll(".ui-color-picker").forEach((picker) => {
    const fieldKey = picker.name;
    const hexInput = form.querySelector(`input[name="${fieldKey}_hex"]`);

    picker.addEventListener("input", (e) => {
      const value = e.target.value.toUpperCase();
      if (hexInput) hexInput.value = value;

      const field = UI_FIELDS.find((f) => f.key === fieldKey);
      if (field?.cssVar) {
        document.documentElement.style.setProperty(field.cssVar, value);
      }
    });
  });

  // Aggiorna picker quando cambia hex (se modificato manualmente)
  form.querySelectorAll(".ui-color-hex").forEach((hexInput) => {
    const fieldKey = hexInput.name.replace("_hex", "");
    const picker = form.querySelector(`input[name="${fieldKey}"]`);

    hexInput.addEventListener("input", (e) => {
      let value = e.target.value.trim().replace("#", "").toUpperCase();
      if (/^[0-9A-F]{6}$/i.test(value)) {
        value = "#" + value;
        if (picker) picker.value = value;

        const field = UI_FIELDS.find((f) => f.key === fieldKey);
        if (field?.cssVar) {
          document.documentElement.style.setProperty(field.cssVar, value);
        }
      }
    });

    hexInput.addEventListener("blur", (e) => {
      let value = e.target.value.trim().replace("#", "").toUpperCase();
      if (!/^[0-9A-F]{6}$/i.test(value)) {
        // Ripristina valore valido se non è valido
        const pickerValue = picker?.value || "#000000";
        e.target.value = pickerValue.toUpperCase();
      }
    });
  });

  // Gestione altri campi (testi, font, componenti, ecc.)
  form.addEventListener("input", (event) => {
    const { name, value } = event.target;
    if (name.endsWith("_hex")) return; // Skip hex fields, già gestiti sopra

    // Campi UI base
    const field = UI_FIELDS.find((f) => f.key === name);
    if (field?.cssVar) {
      document.documentElement.style.setProperty(field.cssVar, value);
    }
    if (name === "font_family") {
      document.body.style.fontFamily = value;
    }
    if (name === "login_tagline") {
      document.querySelectorAll(".login-tagline").forEach((el) => {
        el.textContent = value;
      });
    }

    // Campi Componenti
    applyComponentsSettings({ [name]: value });

    // Campi Form
    applyFormsSettings({ [name]: value });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {};

    // Salva campi UI (colori, font, testi)
    UI_FIELDS.forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });

    // Salva campi Componenti
    [...COMPONENTS_FIELDS.buttons, ...COMPONENTS_FIELDS.tables,
    ...COMPONENTS_FIELDS.cards, ...COMPONENTS_FIELDS.modals].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });

    // Salva campi Form
    [...FORMS_FIELDS.inputs, ...FORMS_FIELDS.layout].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });

    // Salva campi Responsive
    const responsiveBreakpoint = formData.get("responsive_mobile_breakpoint");
    const responsiveCollapse = formData.get("responsive_sidebar_collapse");
    if (responsiveBreakpoint) payload.responsive_mobile_breakpoint = responsiveBreakpoint;
    if (responsiveCollapse) payload.responsive_sidebar_collapse = responsiveCollapse;

    // Salva campi Layout Admin
    [...ADMIN_LAYOUT_FIELDS.sidebar, ...ADMIN_LAYOUT_FIELDS.header, ...ADMIN_LAYOUT_FIELDS.menu,
    ...ADMIN_LAYOUT_FIELDS.dashboard, ...ADMIN_LAYOUT_FIELDS.spacing].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });

    // Salva campi Layout Operatore
    [...OPERATOR_LAYOUT_FIELDS.header, ...OPERATOR_LAYOUT_FIELDS.menu].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });

    try {
      form.classList.add("pending");
      await saveUiSettings(payload);
      // Le impostazioni vengono già applicate da saveUiSettings
      const successMsg = document.createElement("div");
      successMsg.className = "ui-success-message";
      successMsg.innerHTML = '<i class="fas fa-check-circle"></i> Impostazioni salvate con successo!';
      form.parentElement.insertBefore(successMsg, form);
      setTimeout(() => successMsg.remove(), 3000);
    } catch (err) {
      console.error("[UI Settings] Errore salvataggio:", err);
      alert("Errore nel salvataggio delle impostazioni: " + err.message);
    } finally {
      form.classList.remove("pending");
    }
  });

  resetBtn.addEventListener("click", async () => {
    if (!confirm("Ripristinare tutti i valori di default (colori, layout, ecc.)?")) return;
    try {
      form.classList.add("pending");
      const defaults = { ...DEFAULT_SETTINGS };
      [...COMPONENTS_FIELDS.buttons, ...COMPONENTS_FIELDS.tables,
      ...COMPONENTS_FIELDS.cards, ...COMPONENTS_FIELDS.modals].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...FORMS_FIELDS.inputs, ...FORMS_FIELDS.layout].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...ADMIN_LAYOUT_FIELDS.sidebar, ...ADMIN_LAYOUT_FIELDS.header, ...ADMIN_LAYOUT_FIELDS.menu,
      ...ADMIN_LAYOUT_FIELDS.dashboard, ...ADMIN_LAYOUT_FIELDS.spacing].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...OPERATOR_LAYOUT_FIELDS.header, ...OPERATOR_LAYOUT_FIELDS.menu].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      await saveUiSettings(defaults);
      // Le impostazioni vengono già applicate da saveUiSettings
      renderAppearancePanel(panel);
      alert("Impostazioni ripristinate.");
    } catch (err) {
      console.error(err);
      alert("Impossibile ripristinare: " + err.message);
    } finally {
      form.classList.remove("pending");
    }
  });

  // Sincronizza color picker componenti con hex
  form.querySelectorAll(".ui-color-picker").forEach((picker) => {
    const fieldKey = picker.name;
    if (fieldKey.includes("component_")) {
      const hexInput = form.querySelector(`input[name="${fieldKey}_hex"]`);

      picker.addEventListener("input", (e) => {
        const value = e.target.value.toUpperCase();
        if (hexInput) hexInput.value = value;
        applyComponentsSettings({ [fieldKey]: value });
      });
    }
  });

  form.querySelectorAll(".ui-color-hex").forEach((hexInput) => {
    const fieldKey = hexInput.name.replace("_hex", "");
    if (fieldKey.includes("component_")) {
      const picker = form.querySelector(`input[name="${fieldKey}"]`);

      hexInput.addEventListener("input", (e) => {
        let value = e.target.value.trim().replace("#", "").toUpperCase();
        if (/^[0-9A-F]{6}$/i.test(value)) {
          value = "#" + value;
          if (picker) picker.value = value;
          applyComponentsSettings({ [fieldKey]: value });
        }
      });

      hexInput.addEventListener("blur", (e) => {
        let value = e.target.value.trim().replace("#", "").toUpperCase();
        if (!/^[0-9A-F]{6}$/i.test(value)) {
          const pickerValue = picker?.value || "#000000";
          e.target.value = pickerValue.toUpperCase();
        }
      });
    }
  });

  // Applica modifiche layout, componenti, form e icone in tempo reale
  form.addEventListener("change", () => {
    applyLayoutSettings();
    applyComponentsSettings();
    applyFormsSettings();
    applyIconsSettings();
  });

  // Gestione caricamento immagini per icone
  form.querySelectorAll("input[data-icon-image-input]").forEach((fileInput) => {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Verifica che sia un'immagine
      if (!file.type.startsWith("image/")) {
        alert("Per favore seleziona un file immagine (PNG, JPG, SVG, ecc.)");
        e.target.value = "";
        return;
      }

      // Limita dimensione a 500KB
      if (file.size > 500 * 1024) {
        alert("L'immagine è troppo grande. Massimo 500KB.");
        e.target.value = "";
        return;
      }

      try {
        // Converti in base64
        const base64 = await fileToBase64(file);
        const fieldKey = fileInput.dataset.iconImageInput;
        const iconValue = `IMAGE_BASE64:${base64}`;

        // Aggiorna campo nascosto
        const textInput = form.querySelector(`input[name="${fieldKey}"]`);
        if (textInput) {
          textInput.value = ""; // Pulisci campo testo quando carichi immagine
        }

        // Salva temporaneamente e applica
        const tempSettings = await fetchUiSettings();
        tempSettings[fieldKey] = iconValue;
        await applyIconsSettings(tempSettings);

        // Ricarica il pannello per mostrare l'anteprima
        const panel = form.closest(".ui-appearance-panel");
        if (panel) {
          const currentSettings = await fetchUiSettings();
          const iconsSection = panel.querySelector('[data-appearance-section-content="icons"]');
          if (iconsSection) {
            iconsSection.innerHTML = renderIconsSection(currentSettings);
            setupIconImageHandlers(form);
          }
        }
      } catch (err) {
        console.error("Errore nel caricamento immagine:", err);
        alert("Errore nel caricamento dell'immagine: " + err.message);
        e.target.value = "";
      }
    });
  });

  // Gestione rimozione immagini
  form.querySelectorAll("button[data-icon-remove-image]").forEach((removeBtn) => {
    removeBtn.addEventListener("click", async (e) => {
      const fieldKey = removeBtn.dataset.iconRemoveImage;
      const field = UI_FIELDS.find(f => f.key === fieldKey);
      const defaultValue = field?.defaultValue || "";

      // Ripristina valore di default
      const textInput = form.querySelector(`input[name="${fieldKey}"]`);
      if (textInput) {
        textInput.value = defaultValue;
      }

      // Salva e applica
      const tempSettings = await fetchUiSettings();
      tempSettings[fieldKey] = defaultValue;
      await applyIconsSettings(tempSettings);

      // Ricarica il pannello
      const panel = form.closest(".ui-appearance-panel");
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

  // Aggiorna anteprima icone in tempo reale
  form.querySelectorAll("input[data-icon-field]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value.trim();
      const field = e.target.closest(".ui-layout-field");
      if (!field) return;

      // Se c'è un'immagine caricata, non sovrascrivere
      const fieldKey = field.dataset.iconFieldKey;
      const currentSettings = cachedSettings || {};
      if (currentSettings[fieldKey] && currentSettings[fieldKey].startsWith("IMAGE_BASE64:")) {
        return; // Non modificare se c'è un'immagine
      }

      // Rimuovi anteprima esistente
      const existingPreview = field.querySelector(".ui-icon-preview");
      if (existingPreview) existingPreview.remove();

      // Aggiungi nuova anteprima se c'è un valore
      if (value) {
        const isSvg = value.startsWith("<svg") || value.startsWith("<?xml");
        const preview = document.createElement("div");
        preview.className = "ui-icon-preview";
        preview.style.cssText = "margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);";

        if (isSvg) {
          preview.innerHTML = `
            <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
            <div style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">
              ${value}
            </div>
          `;
        } else {
          preview.innerHTML = `
            <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
            <i class="${value}" style="font-size: 20px; color: var(--primary-color);"></i>
          `;
        }
        field.appendChild(preview);
      }

      // Applica icona in tempo reale
      applyIconsSettings({ [e.target.name]: value });
    });
  });

  // Gestione temi predefiniti
  panel.querySelectorAll(".ui-theme-apply").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const themeKey = btn.dataset.themeKey;
      const theme = PREDEFINED_THEMES[themeKey];
      if (!theme) return;

      if (!confirm(`Applicare il tema "${theme.name}"? I colori attuali verranno sostituiti.`)) return;

      try {
        form.classList.add("pending");
        const themePayload = {};
        Object.entries(theme).forEach(([key, value]) => {
          if (key !== "name") {
            themePayload[key] = value;
          }
        });
        await saveUiSettings(themePayload);
        renderAppearancePanel(panel);
        alert(`Tema "${theme.name}" applicato con successo!`);
      } catch (err) {
        alert("Errore nell'applicazione del tema: " + err.message);
      } finally {
        form.classList.remove("pending");
      }
    });
  });

  // Export configurazione
  const exportBtn = panel.querySelector("#export-config-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      try {
        const allSettings = await fetchUiSettings();
        const config = {
          version: "1.0",
          exported_at: new Date().toISOString(),
          settings: allSettings
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `neofuel-ui-config-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("Configurazione esportata con successo!");
      } catch (err) {
        alert("Errore nell'export: " + err.message);
      }
    });
  }

  // Import configurazione
  const importInput = panel.querySelector("#import-config-input");
  if (importInput) {
    importInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const config = JSON.parse(text);

        if (!config.settings || typeof config.settings !== "object") {
          throw new Error("Formato file non valido");
        }

        if (!confirm(`Importare la configurazione? Tutte le impostazioni attuali verranno sostituite.`)) {
          e.target.value = "";
          return;
        }

        form.classList.add("pending");
        await saveUiSettings(config.settings);
        renderAppearancePanel(panel);
        alert("Configurazione importata con successo!");
      } catch (err) {
        alert("Errore nell'import: " + err.message);
      } finally {
        form.classList.remove("pending");
        e.target.value = "";
      }
    });
  }

  // Configura handler per caricamento immagini icone
  const appearanceForm = panel.querySelector("#ui-appearance-form");
  if (appearanceForm) {
    setupIconImageHandlers(appearanceForm);
  }
}

// -------------------------------------
// Layout Panel (Fase 2)
// -------------------------------------

// Configurazione layout Admin
const ADMIN_LAYOUT_FIELDS = {
  sidebar: [
    {
      key: "admin_sidebar_width",
      label: "Larghezza Sidebar",
      type: "text",
      defaultValue: "280px",
      description: "Larghezza della sidebar (es. 280px, 20rem)"
    },
    {
      key: "admin_sidebar_show_header",
      label: "Mostra Header Sidebar",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi l'header della sidebar"
    },
    {
      key: "admin_sidebar_show_footer",
      label: "Mostra Footer Sidebar",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il footer con info utente"
    }
  ],
  header: [
    {
      key: "admin_header_show_logo",
      label: "Mostra Logo Header",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il logo nell'header"
    },
    {
      key: "admin_header_logo_height",
      label: "Altezza Logo",
      type: "text",
      defaultValue: "50px",
      description: "Altezza del logo (es. 50px, 3rem)"
    }
  ],
  menu: [
    {
      key: "admin_menu_show_dashboard",
      label: "Mostra Dashboard",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Dashboard"
    },
    {
      key: "admin_menu_show_stations",
      label: "Mostra Distributori",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Distributori"
    },
    {
      key: "admin_menu_show_operators",
      label: "Mostra Operatori",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Operatori"
    },
    {
      key: "admin_menu_show_chiusure",
      label: "Mostra Chiusure",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Chiusure"
    },
    {
      key: "admin_menu_show_crediti",
      label: "Mostra Crediti",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Crediti"
    },
    {
      key: "admin_menu_show_fatture",
      label: "Mostra Fatture",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Fatture"
    },
    {
      key: "admin_menu_show_vouchers",
      label: "Mostra Voucher",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Voucher"
    },
    {
      key: "admin_menu_show_notifiche",
      label: "Mostra Notifiche",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Notifiche"
    }
  ],
  dashboard: [
    {
      key: "admin_dashboard_kpi_layout",
      label: "Layout Griglia KPI",
      type: "select",
      defaultValue: "4",
      options: [
        { value: "1", label: "1 colonna" },
        { value: "2", label: "2 colonne" },
        { value: "3", label: "3 colonne" },
        { value: "4", label: "4 colonne (default)" }
      ],
      description: "Numero di colonne per le card KPI nella dashboard"
    },
    {
      key: "admin_dashboard_show_kpi_venduto",
      label: "Mostra KPI Venduto Oggi",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la card Venduto Oggi"
    },
    {
      key: "admin_dashboard_show_kpi_erogato",
      label: "Mostra KPI Erogato Oggi",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la card Erogato Oggi"
    },
    {
      key: "admin_dashboard_show_kpi_stazioni",
      label: "Mostra KPI Stazioni Attive",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la card Stazioni Attive"
    },
    {
      key: "admin_dashboard_show_kpi_alert",
      label: "Mostra KPI Alert Cisterne",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la card Alert Cisterne"
    },
    {
      key: "admin_dashboard_show_tanks",
      label: "Mostra Tabella Cisterne",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la sezione Stato Cisterne"
    }
  ],
  spacing: [
    {
      key: "admin_content_padding",
      label: "Padding Contenuto",
      type: "text",
      defaultValue: "24px",
      description: "Spaziatura interna del contenuto principale (es. 24px, 1.5rem)"
    },
    {
      key: "admin_section_gap",
      label: "Spaziatura Sezioni",
      type: "text",
      defaultValue: "24px",
      description: "Spazio tra le sezioni (es. 24px, 1.5rem)"
    }
  ]
};

// Configurazione Componenti UI
const COMPONENTS_FIELDS = {
  buttons: [
    {
      key: "component_button_padding",
      label: "Padding Bottoni",
      type: "text",
      defaultValue: "12px 24px",
      description: "Spaziatura interna bottoni (es. 12px 24px, 10px 20px)"
    },
    {
      key: "component_button_radius",
      label: "Raggio Bordi Bottoni",
      type: "text",
      defaultValue: "6px",
      description: "Bordi arrotondati bottoni (es. 6px, 999px per pill)"
    },
    {
      key: "component_button_font_size",
      label: "Dimensione Font Bottoni",
      type: "text",
      defaultValue: "1rem",
      description: "Dimensione testo bottoni (es. 1rem, 0.95rem)"
    },
    {
      key: "component_button_font_weight",
      label: "Spessore Font Bottoni",
      type: "select",
      defaultValue: "600",
      options: [
        { value: "400", label: "Normale (400)" },
        { value: "500", label: "Medio (500)" },
        { value: "600", label: "Semi-bold (600)" },
        { value: "700", label: "Bold (700)" }
      ],
      description: "Spessore del testo nei bottoni"
    }
  ],
  tables: [
    {
      key: "component_table_header_bg",
      label: "Sfondo Header Tabelle",
      type: "color",
      cssVar: "--table-header-bg",
      defaultValue: "#F4F6F8",
      description: "Colore di sfondo dell'header delle tabelle"
    },
    {
      key: "component_table_header_color",
      label: "Colore Testo Header",
      type: "color",
      cssVar: "--table-header-color",
      defaultValue: "#333333",
      description: "Colore del testo nell'header delle tabelle"
    },
    {
      key: "component_table_hover_bg",
      label: "Sfondo Hover Righe",
      type: "color",
      cssVar: "--table-hover-bg",
      defaultValue: "#F8FAFC",
      description: "Colore di sfondo al passaggio del mouse sulle righe"
    },
    {
      key: "component_table_padding",
      label: "Padding Celle",
      type: "text",
      defaultValue: "16px 24px",
      description: "Spaziatura interna celle (es. 16px 24px)"
    }
  ],
  cards: [
    {
      key: "component_card_padding",
      label: "Padding Card",
      type: "text",
      defaultValue: "24px",
      description: "Spaziatura interna card/box (es. 24px, 20px)"
    },
    {
      key: "component_card_radius",
      label: "Raggio Bordi Card",
      type: "text",
      defaultValue: "16px",
      description: "Bordi arrotondati card (es. 16px, 12px)"
    },
    {
      key: "component_card_shadow",
      label: "Intensità Ombra",
      type: "select",
      defaultValue: "md",
      options: [
        { value: "none", label: "Nessuna" },
        { value: "sm", label: "Piccola" },
        { value: "md", label: "Media (default)" },
        { value: "lg", label: "Grande" }
      ],
      description: "Intensità dell'ombra delle card"
    }
  ],
  modals: [
    {
      key: "component_modal_max_width",
      label: "Larghezza Massima Modali",
      type: "text",
      defaultValue: "1100px",
      description: "Larghezza massima modali (es. 1100px, 90vw)"
    },
    {
      key: "component_modal_padding",
      label: "Padding Modali",
      type: "text",
      defaultValue: "24px",
      description: "Spaziatura interna modali (es. 24px, 20px)"
    },
    {
      key: "component_modal_radius",
      label: "Raggio Bordi Modali",
      type: "text",
      defaultValue: "16px",
      description: "Bordi arrotondati modali (es. 16px, 12px)"
    },
    {
      key: "component_modal_overlay_opacity",
      label: "Opacità Sfondo Modale",
      type: "text",
      defaultValue: "0.6",
      description: "Opacità dello sfondo scuro (0-1, es. 0.6)"
    }
  ]
};

// Configurazione Form
const FORMS_FIELDS = {
  inputs: [
    {
      key: "form_input_padding",
      label: "Padding Input",
      type: "text",
      defaultValue: "12px 16px",
      description: "Spaziatura interna campi input (es. 12px 16px)"
    },
    {
      key: "form_input_radius",
      label: "Raggio Bordi Input",
      type: "text",
      defaultValue: "6px",
      description: "Bordi arrotondati campi input"
    },
    {
      key: "form_input_border_width",
      label: "Spessore Bordo Input",
      type: "text",
      defaultValue: "2px",
      description: "Spessore del bordo (es. 2px, 1px)"
    },
    {
      key: "form_input_font_size",
      label: "Dimensione Font Input",
      type: "text",
      defaultValue: "1rem",
      description: "Dimensione testo campi input"
    },
    {
      key: "form_label_font_size",
      label: "Dimensione Font Label",
      type: "text",
      defaultValue: "0.95rem",
      description: "Dimensione testo etichette"
    },
    {
      key: "form_label_font_weight",
      label: "Spessore Font Label",
      type: "select",
      defaultValue: "600",
      options: [
        { value: "400", label: "Normale (400)" },
        { value: "500", label: "Medio (500)" },
        { value: "600", label: "Semi-bold (600)" },
        { value: "700", label: "Bold (700)" }
      ],
      description: "Spessore del testo delle etichette"
    }
  ],
  layout: [
    {
      key: "form_group_gap",
      label: "Spaziatura Gruppi Form",
      type: "text",
      defaultValue: "20px",
      description: "Spazio tra i gruppi di campi (es. 20px)"
    },
    {
      key: "form_row_gap",
      label: "Spaziatura Righe Form",
      type: "text",
      defaultValue: "16px",
      description: "Spazio tra le righe nei form a griglia"
    }
  ]
};

// Temi predefiniti
const PREDEFINED_THEMES = {
  light: {
    name: "Chiaro (Default)",
    primary_color: "#0A2342",
    accent_color: "#8DC63F",
    bg_body: "#F4F6F8",
    bg_sidebar: "#0A2342",
    sidebar_hover: "#123561",
    text_main: "#333333"
  },
  dark: {
    name: "Scuro",
    primary_color: "#8DC63F",
    accent_color: "#8DC63F",
    bg_body: "#1a1a1a",
    bg_sidebar: "#0d1117",
    sidebar_hover: "#161b22",
    text_main: "#e6edf3"
  },
  blue: {
    name: "Blu Professionale",
    primary_color: "#1e40af",
    accent_color: "#3b82f6",
    bg_body: "#f0f9ff",
    bg_sidebar: "#1e40af",
    sidebar_hover: "#2563eb",
    text_main: "#1e293b"
  },
  green: {
    name: "Verde Naturale",
    primary_color: "#059669",
    accent_color: "#10b981",
    bg_body: "#f0fdf4",
    bg_sidebar: "#059669",
    sidebar_hover: "#047857",
    text_main: "#064e3b"
  }
};

// Configurazione layout Operatore
const OPERATOR_LAYOUT_FIELDS = {
  header: [
    {
      key: "operator_header_show_logo",
      label: "Mostra Logo Header",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il logo nell'header operatore"
    },
    {
      key: "operator_header_logo_height",
      label: "Altezza Logo",
      type: "text",
      defaultValue: "40px",
      description: "Altezza del logo (es. 40px, 2.5rem)"
    },
    {
      key: "operator_header_show_station_badge",
      label: "Mostra Badge Stazione",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il badge con il nome della stazione"
    },
    {
      key: "operator_header_show_logout",
      label: "Mostra Bottone Logout",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il bottone di logout nell'header"
    }
  ],
  menu: [
    {
      key: "operator_menu_show_turno",
      label: "Mostra Apertura/Chiusura",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il bottone principale Apertura/Chiusura turno"
    },
    {
      key: "operator_menu_show_movimenti",
      label: "Mostra Movimenti",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la sezione Movimenti (accordion)"
    },
    {
      key: "operator_menu_show_crediti",
      label: "Mostra Crediti",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Crediti nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_voucher",
      label: "Mostra Voucher",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Voucher nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_uscite",
      label: "Mostra Uscite",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Uscite nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_incassi",
      label: "Mostra Incassi",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Incassi nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_fatture",
      label: "Mostra Fatture",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Fatture"
    },
    {
      key: "operator_menu_show_prezzi",
      label: "Mostra Prezzi",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Prezzi"
    }
  ]
};


function renderAdminLayoutSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-bars"></i>
          <span>Sidebar</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.sidebar.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-heading"></i>
          <span>Header</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.header.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list"></i>
          <span>Menu di Navigazione</span>
        </h4>
        <p class="ui-section-hint">Seleziona quali voci del menu mostrare nella sidebar admin</p>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.menu.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-chart-line"></i>
          <span>Dashboard</span>
        </h4>
        <p class="ui-section-hint">Configura layout e visibilità degli elementi della dashboard</p>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.dashboard.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-arrows-alt"></i>
          <span>Spaziature</span>
        </h4>
        <p class="ui-section-hint">Personalizza padding e margini dell'area admin</p>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.spacing.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderComponentsSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-mouse-pointer"></i>
          <span>Bottoni</span>
        </h4>
        <p class="ui-section-hint">Personalizza stile e dimensioni dei bottoni</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.buttons.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-table"></i>
          <span>Tabelle</span>
        </h4>
        <p class="ui-section-hint">Configura colori e stile delle tabelle</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.tables.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-square"></i>
          <span>Card e Box</span>
        </h4>
        <p class="ui-section-hint">Personalizza card, box e contenitori</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.cards.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-window-maximize"></i>
          <span>Modali</span>
        </h4>
        <p class="ui-section-hint">Configura dimensioni e stile delle finestre modali</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.modals.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderFormsSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-keyboard"></i>
          <span>Campi Input</span>
        </h4>
        <p class="ui-section-hint">Personalizza stile e dimensioni dei campi di input</p>
        <div class="ui-layout-fields">
          ${FORMS_FIELDS.inputs.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-th"></i>
          <span>Layout Form</span>
        </h4>
        <p class="ui-section-hint">Configura spaziature e layout dei form</p>
        <div class="ui-layout-fields">
          ${FORMS_FIELDS.layout.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderThemesSection(settings) {
  const themesList = Object.entries(PREDEFINED_THEMES).map(([key, theme]) => `
    <div class="ui-theme-card" data-theme-key="${key}">
      <div class="ui-theme-preview">
        <div class="ui-theme-preview-sidebar" style="background: ${theme.bg_sidebar};"></div>
        <div class="ui-theme-preview-main" style="background: ${theme.bg_body};">
          <div class="ui-theme-preview-header" style="background: ${theme.primary_color};"></div>
          <div class="ui-theme-preview-card" style="background: white; border-left: 4px solid ${theme.accent_color};"></div>
        </div>
      </div>
      <h5 class="ui-theme-name">${theme.name}</h5>
      <button type="button" class="menu-button secondary ui-theme-apply" data-theme-key="${key}">
        <i class="fas fa-check"></i> Applica Tema
      </button>
    </div>
  `).join("");

  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-paint-brush"></i>
          <span>Temi Predefiniti</span>
        </h4>
        <p class="ui-section-hint">Scegli un tema predefinito per applicare rapidamente una combinazione di colori</p>
        <div class="ui-themes-grid">
          ${themesList}
        </div>
      </div>

      <div class="ui-section-box" style="background: var(--bg-body); border: 1px dashed var(--border-color);">
        <p style="margin: 0; color: var(--text-secondary); text-align: center; font-style: italic;">
          <i class="fas fa-info-circle"></i>
          I temi applicano solo i colori. Layout e componenti rimangono invariati.
        </p>
      </div>
    </div>
  `;
}

function renderIconsSection(settings) {
  const adminIconFields = UI_FIELDS.filter(f => f.category === "icon_admin");
  const operatorIconFields = UI_FIELDS.filter(f => f.category === "icon_operator");
  const stationActionIconFields = UI_FIELDS.filter(f => f.category === "icon_station_actions");

  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-shield-alt"></i>
          <span>Icone Menu Admin</span>
        </h4>
        <p class="ui-section-hint">Personalizza le icone dei menu nella sidebar admin. Inserisci una classe Font Awesome (es: "fas fa-chart-line") o codice SVG inline.</p>
        <div class="ui-layout-fields">
          ${adminIconFields.map(f => renderIconField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-user"></i>
          <span>Icone Menu Operatore</span>
        </h4>
        <p class="ui-section-hint">Personalizza le icone dei menu nell'area operatore. Inserisci una classe Font Awesome (es: "fas fa-door-open") o codice SVG inline.</p>
        <div class="ui-layout-fields">
          ${operatorIconFields.map(f => renderIconField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-gas-pump"></i>
          <span>Icone Azioni Distributori</span>
        </h4>
        <p class="ui-section-hint">Personalizza le icone delle azioni nella sezione Distributori (Modifica, Prezzi, Isole e Pistole, Cisterne, Elimina).</p>
        <div class="ui-layout-fields">
          ${stationActionIconFields.map(f => renderIconField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderIconField(field, settings) {
  const value = settings[field.key] || field.defaultValue || "";
  const isSvg = value.trim().startsWith("<svg") || value.trim().startsWith("<?xml");
  const isImage = value.trim().startsWith("IMAGE_BASE64:");
  const imageBase64 = isImage ? value.replace("IMAGE_BASE64:", "") : "";
  const displayValue = isImage ? "" : value; // Non mostrare base64 nel campo testo

  return `
    <div class="ui-layout-field" data-icon-field-key="${field.key}">
      <label class="ui-text-label">
        <span>${field.label}</span>
        <small>${field.description}</small>
      </label>
      <div style="display: flex; gap: 8px; align-items: flex-start;">
        <input 
          type="text" 
          name="${field.key}" 
          value="${escapeHtml(displayValue)}" 
          class="ui-text-input" 
          style="flex: 1;"
          placeholder="${field.defaultValue || ""}"
          data-icon-field="true"
        />
        <label class="menu-button secondary" style="cursor: pointer; margin: 0; white-space: nowrap; padding: 8px 16px;">
          <i class="fas fa-image"></i> Carica Immagine
          <input 
            type="file" 
            accept="image/*" 
            style="display: none;" 
            data-icon-image-input="${field.key}"
          />
        </label>
        ${isImage ? `
          <button type="button" class="menu-button secondary" style="margin: 0; padding: 8px 16px;" data-icon-remove-image="${field.key}">
            <i class="fas fa-times"></i> Rimuovi
          </button>
        ` : ""}
      </div>
      ${isImage ? `
        <div class="ui-icon-preview" style="margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima Immagine:</small>
          <img src="data:image/png;base64,${imageBase64}" style="max-width: 40px; max-height: 40px; object-fit: contain;" alt="Icona" />
        </div>
      ` : isSvg ? `
        <div class="ui-icon-preview" style="margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
          <div style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">
            ${value}
          </div>
        </div>
      ` : value ? `
        <div class="ui-icon-preview" style="margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
          <i class="${value}" style="font-size: 20px; color: var(--primary-color);"></i>
        </div>
      ` : ""}
    </div>
  `;
}

function renderAdvancedSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-download"></i>
          <span>Export / Import Configurazione</span>
        </h4>
        <p class="ui-section-hint">Salva o carica la configurazione completa dell'interfaccia</p>
        <div class="ui-advanced-actions">
          <button type="button" class="menu-button primary" id="export-config-btn">
            <i class="fas fa-download"></i> Esporta Configurazione
          </button>
          <label class="menu-button secondary" style="cursor: pointer; margin: 0;">
            <i class="fas fa-upload"></i> Importa Configurazione
            <input type="file" id="import-config-input" accept=".json" style="display: none;" />
          </label>
        </div>
        <p style="margin-top: 16px; color: var(--text-secondary); font-size: 0.9rem;">
          <i class="fas fa-info-circle"></i>
          Il file JSON contiene tutte le impostazioni (colori, layout, componenti, ecc.)
        </p>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-mobile-alt"></i>
          <span>Responsive e Mobile</span>
        </h4>
        <p class="ui-section-hint">Configura breakpoint e comportamento su dispositivi mobili</p>
        <div class="ui-layout-fields">
          <div class="ui-layout-field">
            <label class="ui-text-label">
              <span>Breakpoint Mobile</span>
              <small>Larghezza massima per considerare un dispositivo "mobile" (es. 768px)</small>
            </label>
            <input 
              type="text" 
              name="responsive_mobile_breakpoint" 
              value="${settings.responsive_mobile_breakpoint || "768px"}" 
              class="ui-text-input" 
            />
          </div>
          <div class="ui-layout-field">
            <label class="ui-checkbox-label">
              <input 
                type="checkbox" 
                name="responsive_sidebar_collapse" 
                ${settings.responsive_sidebar_collapse === "true" ? "checked" : ""}
                value="true"
              />
              <span class="ui-checkbox-label-text">Sidebar collassabile su mobile</span>
            </label>
            <small class="ui-field-desc">La sidebar si nasconde automaticamente su schermi piccoli</small>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderOperatorLayoutSection(settings) {
  const menuMainItems = OPERATOR_LAYOUT_FIELDS.menu.filter(f =>
    f.key === "operator_menu_show_turno" || f.key === "operator_menu_show_movimenti" ||
    f.key === "operator_menu_show_fatture" || f.key === "operator_menu_show_prezzi"
  );
  const menuSubItems = OPERATOR_LAYOUT_FIELDS.menu.filter(f =>
    f.key === "operator_menu_show_crediti" || f.key === "operator_menu_show_voucher" ||
    f.key === "operator_menu_show_uscite" || f.key === "operator_menu_show_incassi"
  );

  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-heading"></i>
          <span>Header</span>
        </h4>
        <p class="ui-section-hint">Configura gli elementi dell'header dell'area operatore</p>
        <div class="ui-layout-fields">
          ${OPERATOR_LAYOUT_FIELDS.header.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list"></i>
          <span>Menu Principale</span>
        </h4>
        <p class="ui-section-hint">Seleziona quali voci principali del menu mostrare</p>
        <div class="ui-layout-fields">
          ${menuMainItems.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list-ul"></i>
          <span>Sottomenu Movimenti</span>
        </h4>
        <p class="ui-section-hint">Configura le voci del sottomenu Movimenti (visibili solo se Movimenti è attivo)</p>
        <div class="ui-layout-fields">
          ${menuSubItems.map(f => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderLayoutField(field, settings) {
  const value = settings[field.key] ?? field.defaultValue;

  if (field.type === "checkbox") {
    const checked = value === "true" || value === true;
    return `
      <div class="ui-layout-field">
        <label class="ui-checkbox-label">
          <input 
            type="checkbox" 
            name="${field.key}" 
            ${checked ? "checked" : ""}
            value="true"
          />
          <span class="ui-checkbox-label-text">${field.label}</span>
        </label>
        <small class="ui-field-desc">${field.description}</small>
      </div>
    `;
  } else if (field.type === "select") {
    return `
      <div class="ui-layout-field">
        <label class="ui-text-label">
          <span>${field.label}</span>
          <small>${field.description}</small>
        </label>
        <select name="${field.key}" class="ui-text-input">
          ${field.options.map(opt =>
      `<option value="${opt.value}" ${value === opt.value ? "selected" : ""}>${opt.label}</option>`
    ).join("")}
        </select>
      </div>
    `;
  } else if (field.type === "color") {
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

async function applyFormsSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();

  // Input styles
  const inputPadding = settings.form_input_padding || "12px 16px";
  const inputRadius = settings.form_input_radius || "6px";
  const inputBorderWidth = settings.form_input_border_width || "2px";
  const inputFontSize = settings.form_input_font_size || "1rem";
  const labelFontSize = settings.form_label_font_size || "0.95rem";
  const labelFontWeight = settings.form_label_font_weight || "600";

  const formInputs = document.querySelectorAll(".form-group input, .form-group select, .form-group textarea, .big-input, .form-input");
  formInputs.forEach((input) => {
    input.style.padding = inputPadding;
    input.style.borderRadius = inputRadius;
    input.style.borderWidth = inputBorderWidth;
    input.style.fontSize = inputFontSize;
  });

  const formLabels = document.querySelectorAll(".form-group label, .form-field label");
  formLabels.forEach((label) => {
    label.style.fontSize = labelFontSize;
    label.style.fontWeight = labelFontWeight;
  });

  // Form layout
  const formGroupGap = settings.form_group_gap || "20px";
  const formRowGap = settings.form_row_gap || "16px";

  const formGroups = document.querySelectorAll(".form-group");
  formGroups.forEach((group) => {
    group.style.marginBottom = formGroupGap;
  });

  const formRows = document.querySelectorAll(".form-row");
  formRows.forEach((row) => {
    row.style.gap = formRowGap;
  });
}

async function applyIconsSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();

  // Mappa icone Admin
  const adminIconMap = {
    dashboard: settings.admin_icon_dashboard || "fas fa-chart-line",
    stations: settings.admin_icon_stations || "fas fa-gas-pump",
    operators: settings.admin_icon_operators || "fas fa-users",
    chiusure: settings.admin_icon_chiusure || "fas fa-file-invoice-dollar",
    crediti: settings.admin_icon_crediti || "fas fa-credit-card",
    fatture: settings.admin_icon_fatture || "fas fa-file-invoice",
    vouchers: settings.admin_icon_vouchers || "fas fa-ticket-alt",
    notifiche: settings.admin_icon_notifiche || "fas fa-bell",
    settings: settings.admin_icon_settings || "fas fa-cog"
  };

  // Applica icone menu admin
  Object.entries(adminIconMap).forEach(([tab, iconValue]) => {
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) {
      const iconEl = btn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
      if (iconEl) {
        if (iconValue.trim().startsWith("IMAGE_BASE64:")) {
          // Immagine base64
          const base64 = iconValue.replace("IMAGE_BASE64:", "");
          iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 16px; height: 16px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
        } else if (iconValue.trim().startsWith("<svg") || iconValue.trim().startsWith("<?xml")) {
          // SVG inline
          iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 16px; height: 16px; vertical-align: middle;">${iconValue}</span>`;
        } else {
          // Font Awesome - assicurati che ci sia un elemento <i>
          if (iconEl.tagName === "I") {
            iconEl.className = iconValue;
          } else {
            iconEl.outerHTML = `<i class="${iconValue}"></i>`;
          }
        }
      }
    }
  });

  // Icona logout admin
  const adminLogoutIcon = settings.admin_icon_logout || "fas fa-sign-out-alt";
  const adminLogoutBtn = document.querySelector("#admin-logout");
  if (adminLogoutBtn) {
    const iconEl = adminLogoutBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (adminLogoutIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = adminLogoutIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 16px; height: 16px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (adminLogoutIcon.trim().startsWith("<svg") || adminLogoutIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 16px; height: 16px; vertical-align: middle;">${adminLogoutIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = adminLogoutIcon;
        } else {
          iconEl.outerHTML = `<i class="${adminLogoutIcon}"></i>`;
        }
      }
    }
  }

  // Mappa icone Operatore
  const operatorIconMap = {
    turno: settings.operator_icon_turno || "fas fa-door-open",
    movimenti: settings.operator_icon_movimenti || "fas fa-exchange-alt",
    crediti: settings.operator_icon_crediti || "fas fa-credit-card",
    voucher: settings.operator_icon_voucher || "fas fa-ticket-alt",
    uscite: settings.operator_icon_uscite || "fas fa-hand-holding-usd",
    incassi: settings.operator_icon_incassi || "fas fa-cash-register",
    fatture: settings.operator_icon_fatture || "fas fa-file-invoice",
    prezzi: settings.operator_icon_prezzi || "fas fa-tags"
  };

  // Applica icona turno
  const turnoIcon = operatorIconMap.turno;
  const turnoIconEl = document.querySelector("#turno-icon");
  if (turnoIconEl) {
    if (turnoIcon.trim().startsWith("IMAGE_BASE64:")) {
      const base64 = turnoIcon.replace("IMAGE_BASE64:", "");
      turnoIconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
    } else if (turnoIcon.trim().startsWith("<svg") || turnoIcon.trim().startsWith("<?xml")) {
      turnoIconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${turnoIcon}</span>`;
    } else {
      if (turnoIconEl.tagName === "I") {
        turnoIconEl.className = turnoIcon;
      } else {
        turnoIconEl.outerHTML = `<i class="${turnoIcon}"></i>`;
      }
    }
  }

  // Applica icona movimenti
  const movimentiIcon = operatorIconMap.movimenti;
  const movimentiBtn = document.querySelector("#btn-movimenti");
  if (movimentiBtn) {
    const iconEl = movimentiBtn.querySelector("i:not(.accordion-icon), img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (movimentiIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = movimentiIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (movimentiIcon.trim().startsWith("<svg") || movimentiIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${movimentiIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = movimentiIcon;
        } else {
          iconEl.outerHTML = `<i class="${movimentiIcon}"></i>`;
        }
      }
    }
  }

  // Applica icone sottomenu movimenti
  const submenuIcons = {
    "#btn-crediti": operatorIconMap.crediti,
    "#btn-voucher": operatorIconMap.voucher,
    "#btn-uscite": operatorIconMap.uscite,
    "#btn-incassi": operatorIconMap.incassi
  };

  Object.entries(submenuIcons).forEach(([selector, iconValue]) => {
    const btn = document.querySelector(selector);
    if (btn) {
      const iconEl = btn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
      if (iconEl) {
        if (iconValue.trim().startsWith("IMAGE_BASE64:")) {
          const base64 = iconValue.replace("IMAGE_BASE64:", "");
          iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 18px; height: 18px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
        } else if (iconValue.trim().startsWith("<svg") || iconValue.trim().startsWith("<?xml")) {
          iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 18px; height: 18px; vertical-align: middle;">${iconValue}</span>`;
        } else {
          if (iconEl.tagName === "I") {
            iconEl.className = iconValue;
          } else {
            iconEl.outerHTML = `<i class="${iconValue}"></i>`;
          }
        }
      }
    }
  });

  // Applica icona fatture operatore
  const fattureIcon = operatorIconMap.fatture;
  const fattureBtn = document.querySelector("#btn-fatture");
  if (fattureBtn) {
    const iconEl = fattureBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (fattureIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = fattureIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (fattureIcon.trim().startsWith("<svg") || fattureIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${fattureIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = fattureIcon;
        } else {
          iconEl.outerHTML = `<i class="${fattureIcon}"></i>`;
        }
      }
    }
  }

  // Applica icona prezzi
  const prezziIcon = operatorIconMap.prezzi;
  const prezziBtn = document.querySelector("#btn-prezzi");
  if (prezziBtn) {
    const iconEl = prezziBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (prezziIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = prezziIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (prezziIcon.trim().startsWith("<svg") || prezziIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${prezziIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = prezziIcon;
        } else {
          iconEl.outerHTML = `<i class="${prezziIcon}"></i>`;
        }
      }
    }
  }

  // Icona logout operatore
  const operatorLogoutIcon = settings.operator_icon_logout || "fas fa-sign-out-alt";
  const operatorLogoutBtn = document.querySelector("#op-logout-btn");
  if (operatorLogoutBtn) {
    const iconEl = operatorLogoutBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (operatorLogoutIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = operatorLogoutIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 18px; height: 18px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (operatorLogoutIcon.trim().startsWith("<svg") || operatorLogoutIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 18px; height: 18px; vertical-align: middle;">${operatorLogoutIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = operatorLogoutIcon;
        } else {
          iconEl.outerHTML = `<i class="${operatorLogoutIcon}"></i>`;
        }
      }
    }
  }

  // Applica icone azioni distributori
  const stationActionIcons = {
    edit: settings.station_action_icon_edit || "fas fa-edit",
    prices: settings.station_action_icon_prices || "fas fa-tag",
    islands: settings.station_action_icon_islands || "fas fa-gas-pump",
    tanks: settings.station_action_icon_tanks || "fas fa-oil-can",
    delete: settings.station_action_icon_delete || "fas fa-trash"
  };

  // Funzione helper per applicare icona
  const applyStationActionIcon = (button, iconValue) => {
    if (!button) return;
    const iconEl = button.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (!iconEl) return;

    if (iconValue.trim().startsWith("IMAGE_BASE64:")) {
      const base64 = iconValue.replace("IMAGE_BASE64:", "");
      iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 16px; height: 16px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
    } else if (iconValue.trim().startsWith("<svg") || iconValue.trim().startsWith("<?xml")) {
      iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 16px; height: 16px; vertical-align: middle;">${iconValue}</span>`;
    } else {
      if (iconEl.tagName === "I") {
        iconEl.className = iconValue;
      } else {
        iconEl.outerHTML = `<i class="${iconValue}"></i>`;
      }
    }
  };

  // Applica icone a tutti i bottoni delle azioni distributori
  document.querySelectorAll(".edit-station").forEach(btn => applyStationActionIcon(btn, stationActionIcons.edit));
  document.querySelectorAll(".prices-station").forEach(btn => applyStationActionIcon(btn, stationActionIcons.prices));
  document.querySelectorAll(".islands-station").forEach(btn => applyStationActionIcon(btn, stationActionIcons.islands));
  document.querySelectorAll(".tanks-station").forEach(btn => applyStationActionIcon(btn, stationActionIcons.tanks));
  document.querySelectorAll(".delete-station").forEach(btn => applyStationActionIcon(btn, stationActionIcons.delete));
}

// Esponi funzione globale per aggiornare le icone (utile quando il DOM viene aggiornato dinamicamente)
window.refreshUiIcons = () => {
  if (cachedSettings) {
    applyIconsSettings(cachedSettings);
  } else {
    fetchUiSettings().then(settings => applyIconsSettings(settings));
  }
};

async function applyComponentsSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;

  // Bottoni
  const buttonPadding = settings.component_button_padding || "12px 24px";
  const buttonRadius = settings.component_button_radius || "6px";
  const buttonFontSize = settings.component_button_font_size || "1rem";
  const buttonFontWeight = settings.component_button_font_weight || "600";

  document.querySelectorAll(".menu-button").forEach((btn) => {
    btn.style.padding = buttonPadding;
    btn.style.borderRadius = buttonRadius;
    btn.style.fontSize = buttonFontSize;
    btn.style.fontWeight = buttonFontWeight;
  });

  // Tabelle
  const tableHeaderBg = settings.component_table_header_bg || "#F4F6F8";
  const tableHeaderColor = settings.component_table_header_color || "#333333";
  const tableHoverBg = settings.component_table_hover_bg || "#F8FAFC";
  const tablePadding = settings.component_table_padding || "16px 24px";

  root.style.setProperty("--table-header-bg", tableHeaderBg);
  root.style.setProperty("--table-header-color", tableHeaderColor);
  root.style.setProperty("--table-hover-bg", tableHoverBg);

  document.querySelectorAll(".admin-table th").forEach((th) => {
    th.style.backgroundColor = tableHeaderBg;
    th.style.color = tableHeaderColor;
    th.style.padding = tablePadding;
  });

  document.querySelectorAll(".admin-table td").forEach((td) => {
    td.style.padding = tablePadding;
  });

  // Aggiungi hover style via CSS variable
  const styleId = "component-table-hover-style";
  let hoverStyle = document.getElementById(styleId);
  if (!hoverStyle) {
    hoverStyle = document.createElement("style");
    hoverStyle.id = styleId;
    document.head.appendChild(hoverStyle);
  }
  hoverStyle.textContent = `
    .admin-table tr:hover td {
      background-color: ${tableHoverBg} !important;
    }
  `;

  // Card
  const cardPadding = settings.component_card_padding || "24px";
  const cardRadius = settings.component_card_radius || "16px";
  const cardShadow = settings.component_card_shadow || "md";

  const shadowMap = {
    none: "none",
    sm: "0 1px 3px rgba(15, 23, 42, 0.08)",
    md: "0 4px 10px rgba(15, 23, 42, 0.12)",
    lg: "0 12px 30px rgba(15, 23, 42, 0.18)"
  };

  document.querySelectorAll(".content-box, .kpi-card, .panel-card").forEach((card) => {
    card.style.padding = cardPadding;
    card.style.borderRadius = cardRadius;
    if (cardShadow !== "none") {
      card.style.boxShadow = shadowMap[cardShadow] || shadowMap.md;
    } else {
      card.style.boxShadow = "none";
    }
  });

  // Modali
  const modalMaxWidth = settings.component_modal_max_width || "1100px";
  const modalPadding = settings.component_modal_padding || "24px";
  const modalRadius = settings.component_modal_radius || "16px";
  const modalOverlayOpacity = settings.component_modal_overlay_opacity || "0.6";

  document.querySelectorAll(".modal-content").forEach((modal) => {
    modal.style.maxWidth = modalMaxWidth;
    modal.style.borderRadius = modalRadius;
  });

  document.querySelectorAll(".modal-body").forEach((body) => {
    body.style.padding = modalPadding;
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.style.backgroundColor = `rgba(15, 23, 42, ${modalOverlayOpacity})`;
  });
}

async function applyLayoutSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;

  // Sidebar width
  if (settings.admin_sidebar_width) {
    root.style.setProperty("--admin-sidebar-width", settings.admin_sidebar_width);
    const sidebar = document.querySelector(".admin-sidebar");
    if (sidebar) sidebar.style.width = settings.admin_sidebar_width;
  }

  // Sidebar header/footer visibility
  const sidebarHeader = document.querySelector(".admin-sidebar .sidebar-header");
  const sidebarFooter = document.querySelector(".admin-sidebar .sidebar-footer");
  if (sidebarHeader) {
    sidebarHeader.style.display = settings.admin_sidebar_show_header === "false" ? "none" : "";
  }
  if (sidebarFooter) {
    sidebarFooter.style.display = settings.admin_sidebar_show_footer === "false" ? "none" : "";
  }

  // Header logo
  const headerLogo = document.querySelector(".admin-header-logo");
  if (headerLogo) {
    headerLogo.style.display = settings.admin_header_show_logo === "false" ? "none" : "";
    if (settings.admin_header_logo_height) {
      headerLogo.style.height = settings.admin_header_logo_height;
    }
  }

  // Menu items visibility
  const menuItems = {
    dashboard: settings.admin_menu_show_dashboard,
    stations: settings.admin_menu_show_stations,
    operators: settings.admin_menu_show_operators,
    chiusure: settings.admin_menu_show_chiusure,
    crediti: settings.admin_menu_show_crediti,
    fatture: settings.admin_menu_show_fatture,
    vouchers: settings.admin_menu_show_vouchers,
    notifiche: settings.admin_menu_show_notifiche
  };

  Object.entries(menuItems).forEach(([tab, visible]) => {
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) {
      btn.style.display = visible === "false" ? "none" : "";
    }
  });

  // Dashboard KPI layout
  const kpiLayout = settings.admin_dashboard_kpi_layout || "4";
  const dashboardGrid = document.querySelector(".dashboard-grid");
  if (dashboardGrid) {
    const cols = parseInt(kpiLayout) || 4;
    dashboardGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  }

  // Dashboard KPI visibility
  const kpiItems = {
    venduto: settings.admin_dashboard_show_kpi_venduto,
    erogato: settings.admin_dashboard_show_kpi_erogato,
    stazioni: settings.admin_dashboard_show_kpi_stazioni,
    alert: settings.admin_dashboard_show_kpi_alert
  };

  // I KPI cards hanno classi specifiche, cerchiamo per contenuto o posizione
  const kpiCards = document.querySelectorAll(".kpi-card");
  if (kpiCards.length >= 4) {
    const kpiOrder = ["venduto", "erogato", "stazioni", "alert"];
    kpiOrder.forEach((kpi, idx) => {
      if (kpiCards[idx]) {
        kpiCards[idx].style.display = kpiItems[kpi] === "false" ? "none" : "";
      }
    });
  }

  // Dashboard tanks table visibility
  const tanksPanel = document.querySelector(".dashboard-panels .panel-card");
  if (tanksPanel) {
    tanksPanel.style.display = settings.admin_dashboard_show_tanks === "false" ? "none" : "";
  }

  // Spacing
  const contentArea = document.querySelector(".admin-content-area");
  if (contentArea && settings.admin_content_padding) {
    contentArea.style.padding = settings.admin_content_padding;
  }

  const sections = document.querySelectorAll(".dashboard-grid, .dashboard-panels");
  if (settings.admin_section_gap) {
    sections.forEach((section) => {
      section.style.marginBottom = settings.admin_section_gap;
    });
  }

  // Operator header
  const opHeaderLogo = document.querySelector(".operator-header img");
  if (opHeaderLogo) {
    opHeaderLogo.style.display = settings.operator_header_show_logo === "false" ? "none" : "";
    if (settings.operator_header_logo_height) {
      opHeaderLogo.style.height = settings.operator_header_logo_height;
    }
  }

  const opStationBadge = document.getElementById("station-badge");
  if (opStationBadge) {
    opStationBadge.style.display = settings.operator_header_show_station_badge === "false" ? "none" : "";
  }

  const opLogoutBtn = document.getElementById("op-logout-btn");
  if (opLogoutBtn) {
    opLogoutBtn.style.display = settings.operator_header_show_logout === "false" ? "none" : "";
  }

  // Operator menu items principali
  const opMainMenuItems = {
    turno: settings.operator_menu_show_turno,
    movimenti: settings.operator_menu_show_movimenti,
    fatture: settings.operator_menu_show_fatture,
    prezzi: settings.operator_menu_show_prezzi
  };

  Object.entries(opMainMenuItems).forEach(([id, visible]) => {
    if (id === "movimenti") {
      const accordion = document.querySelector(".op-menu-accordion");
      if (accordion) {
        accordion.style.display = visible === "false" ? "none" : "";
      }
    } else {
      const btn = document.getElementById(`btn-${id}`);
      if (btn) {
        btn.style.display = visible === "false" ? "none" : "";
      }
    }
  });

  // Operator submenu items (solo se movimenti è visibile)
  if (settings.operator_menu_show_movimenti !== "false") {
    const opSubMenuItems = {
      crediti: settings.operator_menu_show_crediti,
      voucher: settings.operator_menu_show_voucher,
      uscite: settings.operator_menu_show_uscite,
      incassi: settings.operator_menu_show_incassi
    };

    Object.entries(opSubMenuItems).forEach(([id, visible]) => {
      const btn = document.getElementById(`btn-${id}`);
      if (btn) {
        btn.style.display = visible === "false" ? "none" : "";
      }
    });
  } else {
    // Se movimenti è nascosto, nascondi anche tutti i submenu
    ["crediti", "voucher", "uscite", "incassi"].forEach((id) => {
      const btn = document.getElementById(`btn-${id}`);
      if (btn) {
        btn.style.display = "none";
      }
    });
  }
}

// -------------------------------------
// Inline styles (isolati)
// -------------------------------------
function injectStyles() {
  if (document.getElementById("ui-appearance-style")) return;
  const style = document.createElement("style");
  style.id = "ui-appearance-style";
  style.textContent = `
    /* Container principale - Layout a Griglia */
    .ui-appearance-panel {
      display: grid;
      grid-template-columns: 260px 1fr; /* Sidebar fissa + Contenuto fluido */
      grid-template-rows: auto 1fr;
      gap: 24px;
      align-items: start;
    }

    /* Header - Full Width */
    .ui-header-box {
      grid-column: 1 / -1;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      padding: 24px 28px;
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ui-header-title {
      margin: 0 0 4px 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-color);
    }
    .ui-header-desc {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
      line-height: 1.5;
    }

    /* Sezioni Contenuto */
    .ui-section-box {
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      padding: 32px;
      border: 1px solid var(--border-color);
      margin-bottom: 24px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ui-section-title {
      margin: 0 0 24px 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--primary-color);
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }
    .ui-section-title i {
      color: var(--accent-color);
      background: rgba(var(--accent-rgb, 141, 198, 63), 0.1);
      padding: 8px;
      border-radius: 8px;
      font-size: 1.1rem;
    }

    /* Griglia colori */
    .ui-colors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    /* Campo colore */
    .ui-color-field {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-body);
      transition: border-color 0.2s;
    }
    .ui-color-field:hover {
      border-color: var(--accent-color);
    }
    .ui-color-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ui-color-label-text {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
    }
    .ui-color-label-desc {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .ui-color-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .ui-color-picker {
      width: 48px;
      height: 48px;
      border: 2px solid var(--border-color);
      border-radius: 50%; /* Circolare */
      cursor: pointer;
      flex-shrink: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .ui-color-picker:hover {
      transform: scale(1.1);
      box-shadow: var(--shadow-sm);
      border-color: var(--accent-color);
    }
    .ui-color-picker::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    .ui-color-picker::-webkit-color-swatch {
      border: none;
      border-radius: 50%;
    }
    .ui-color-hex {
      flex: 1;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      font-weight: 600;
      text-transform: uppercase;
      background: var(--bg-surface);
      color: var(--text-main);
      transition: all 0.2s ease;
    }
    .ui-color-hex:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }

    /* Griglia tipografia */
    .ui-typography-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    /* Campi testo */
    .ui-text-fields-wrapper {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .ui-text-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ui-text-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ui-text-label span {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
    }
    .ui-text-label small {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .ui-text-input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.95rem;
      transition: all 0.2s ease;
      background: var(--bg-surface);
      color: var(--text-main);
      font-family: inherit;
    }
    .ui-text-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }

    /* Box azioni */
    .ui-actions-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      box-shadow: var(--shadow-md);
      position: sticky;
      bottom: 20px;
      z-index: 10;
    }
    .ui-actions-info {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 200px;
    }
    .ui-actions-info i {
      color: var(--accent-color);
      font-size: 1.1rem;
    }
    .ui-actions-buttons {
      display: flex;
      gap: 12px;
    }

    /* Form pending */
    .ui-appearance-form.pending {
      opacity: 0.6;
      pointer-events: none;
      filter: grayscale(0.5);
    }

    /* Messaggio successo */
    .ui-success-message {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
      padding: 16px 20px;
      border-radius: var(--radius-md);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      box-shadow: var(--shadow-sm);
      animation: slideIn 0.3s ease;
    }
    .ui-success-message i {
      font-size: 1.2rem;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ============================================
       SIDEBAR TABS (Nuovo Layout)
       ============================================ */
    .ui-appearance-tabs {
      grid-column: 1;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--bg-surface);
      padding: 16px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      position: sticky;
      top: 20px;
      max-height: calc(100vh - 40px);
      overflow-y: auto;
    }

    .ui-appearance-tab {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 0.95rem;
      cursor: pointer;
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
      text-align: left;
      width: 100%;
    }

    .ui-appearance-tab:hover {
      color: var(--primary-color);
      background: var(--bg-body);
    }

    .ui-appearance-tab.active {
      color: var(--primary-color);
      background: var(--bg-body);
      border-color: var(--border-color);
      border-left: 4px solid var(--accent-color);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }

    .ui-appearance-tab i {
      font-size: 1.1rem;
      width: 20px;
      text-align: center;
    }

    /* Form Content Area */
    .ui-appearance-form {
      grid-column: 2;
      grid-row: 2;
      min-width: 0;
    }

    .ui-appearance-section {
      display: none;
    }

    .ui-appearance-section.active {
      display: block;
    }

    /* Layout fields styles */
    .ui-layout-fields {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .ui-layout-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      background: var(--bg-body);
      border-radius: var(--radius-md);
      border: 1px solid transparent;
    }
    .ui-layout-field:hover {
      border-color: var(--border-color);
    }

    .ui-checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: pointer;
      padding: 12px;
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      transition: all 0.2s ease;
    }

    .ui-checkbox-label:hover {
      border-color: var(--primary-color);
    }

    .ui-checkbox-label input[type="checkbox"] {
      width: 20px;
      height: 20px;
      margin-top: 2px;
      cursor: pointer;
      accent-color: var(--primary-color);
      flex-shrink: 0;
    }

    .ui-checkbox-label-text {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
      flex: 1;
    }

    .ui-field-desc {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
      margin-left: 32px;
    }

    .ui-section-hint {
      margin: -12px 0 24px 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
      background: var(--bg-body);
      padding: 12px 16px;
      border-radius: var(--radius-md);
      border-left: 3px solid var(--accent-color);
    }

    /* Temi predefiniti */
    .ui-themes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 24px;
      margin-top: 20px;
    }

    .ui-theme-card {
      background: var(--bg-body);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      text-align: center;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .ui-theme-card:hover {
      border-color: var(--primary-color);
      box-shadow: var(--shadow-md);
      transform: translateY(-4px);
    }
    
    .ui-theme-card.active {
      border-color: var(--accent-color);
      background: var(--bg-surface);
      box-shadow: 0 0 0 2px var(--accent-color);
    }

    .ui-theme-preview {
      display: flex;
      height: 120px;
      border-radius: var(--radius-md);
      overflow: hidden;
      margin-bottom: 16px;
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border-color);
    }

    .ui-theme-preview-sidebar {
      width: 30%;
      background: var(--bg-sidebar);
    }

    .ui-theme-preview-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--bg-body);
    }

    .ui-theme-preview-header {
      height: 12px;
      background: var(--primary-color);
      border-radius: 4px;
      opacity: 0.2;
    }

    .ui-theme-preview-content {
      flex: 1;
      background: var(--bg-surface);
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .ui-theme-name {
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 4px;
    }

    .ui-theme-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    /* Sezione avanzate */
    .ui-advanced-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }

    .ui-advanced-actions .menu-button {
      flex: 1;
      min-width: 200px;
    }

    /* Responsive Mobile */
    @media (max-width: 992px) {
      .ui-appearance-panel {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .ui-header-box {
        grid-column: 1;
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }
      .ui-appearance-tabs {
        grid-column: 1;
        grid-row: auto;
        flex-direction: row;
        overflow-x: auto;
        padding: 8px;
        position: static;
        white-space: nowrap;
        border-radius: var(--radius-md);
        max-height: none;
        box-shadow: none;
        background: transparent;
        border: none;
      }
      .ui-appearance-tab {
        width: auto;
        border-radius: 20px;
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
        padding: 8px 16px;
        flex-shrink: 0;
      }
      .ui-appearance-tab.active {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
        border-left: 1px solid var(--primary-color);
      }
      .ui-appearance-tab.active i {
        color: white;
      }
      .ui-appearance-form {
        grid-column: 1;
        grid-row: auto;
      }
      .ui-colors-grid,
      .ui-typography-grid {
        grid-template-columns: 1fr;
      }
      .ui-actions-box {
        position: static;
        flex-direction: column;
        align-items: stretch;
      }
      .ui-actions-buttons {
        flex-direction: column;
      }
      .ui-actions-buttons .menu-button {
        width: 100%;
      }
    }

  `;
  document.head.appendChild(style);
}

// -------------------------------------
// Inizializzazione
// -------------------------------------
let isInitializing = false;
let observerDebounceTimer = null;

// Inizia a pre-caricare le impostazioni subito (prima del DOMContentLoaded)
if (document.readyState === "loading") {
  preloadSettings();
}

document.addEventListener("DOMContentLoaded", async () => {
  injectStyles();
  isInitializing = true;

  // Carica impostazioni (probabilmente già in cache dal preload)
  const settings = await fetchUiSettings();

  // Applica tutte le impostazioni in parallelo
  await Promise.all([
    applyUiSettings(settings),
    applyLayoutSettings(settings),
    applyComponentsSettings(settings),
    applyFormsSettings(settings),
    applyIconsSettings(settings)
  ]);

  isInitializing = false;
  watchSettingsTab();

  // Applica settings quando cambia area (admin/operator) o vengono aggiunti elementi
  // Con debouncing per evitare troppe chiamate
  const observer = new MutationObserver(() => {
    if (isInitializing) return; // Evita durante l'inizializzazione

    // Debounce: aspetta 100ms prima di applicare
    if (observerDebounceTimer) clearTimeout(observerDebounceTimer);

    observerDebounceTimer = setTimeout(async () => {
      const currentSettings = await fetchUiSettings();
      applyLayoutSettings(currentSettings);
      applyComponentsSettings(currentSettings);
      applyFormsSettings(currentSettings);
      applyIconsSettings(currentSettings);
    }, 100);
  });

  // Osserva solo cambiamenti significativi (non attributi)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
});

