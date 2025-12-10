/**
 * ============================================================================
 * ADMIN DASHBOARD CONFIGURATION MODULE
 * ============================================================================
 * 
 * Provides visual configuration interface for customizing dashboard KPI layout
 * 
 * Features:
 * - Drag-and-drop KPI reordering
 * - Toggle KPI visibility
 * - Resize KPI cards (1x1, 1x2, 2x1, 2x2)
 * - Save/load per-user configuration
 * - Reset to default layout
 * 
 * @module admin-dashboard-config
 */

import { supabase } from './api.js';
import { openModal, closeModal } from './ui.js';
import { loggedUser } from './auth.js';
import { Toast } from './shared/toast.js';

// ============================================================================
// KPI CATALOG
// ============================================================================
// Define all available KPIs with their metadata
// To add a new KPI: Add entry here and implement data fetching in admin.js

export const KPI_CATALOG = {
    venduto: {
        id: 'venduto',
        title: 'Venduto Oggi',
        icon: 'fa-euro-sign',
        description: 'Totale vendite giornaliere in euro',
        defaultSize: '1x1',
        defaultVisible: true
    },
    erogato: {
        id: 'erogato',
        title: 'Erogato Oggi',
        icon: 'fa-gas-pump',
        description: 'Litri totali erogati oggi',
        defaultSize: '1x1',
        defaultVisible: true
    },
    stazioni: {
        id: 'stazioni',
        title: 'Stazioni Attive',
        icon: 'fa-map-marker-alt',
        description: 'Numero di stazioni attive',
        defaultSize: '1x1',
        defaultVisible: true
    },
    alert: {
        id: 'alert',
        title: 'Alert Cisterne',
        icon: 'fa-exclamation-triangle',
        description: 'Numero di chiusure registrate',
        defaultSize: '1x1',
        defaultVisible: true
    }
    // Future KPIs can be added here:
    // operatori: { ... },
    // fatture: { ... },
    // crediti: { ... }
};

// Available card sizes
export const CARD_SIZES = [
    { value: '1x1', label: 'Piccola (1x1)', cols: 1, rows: 1 },
    { value: '1x2', label: 'Larga (1x2)', cols: 2, rows: 1 },
    { value: '2x1', label: 'Alta (2x1)', cols: 1, rows: 2 },
    { value: '2x2', label: 'Grande (2x2)', cols: 2, rows: 2 }
];

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Load dashboard configuration for current user
 * Creates default config if none exists
 */
export async function loadDashboardConfig() {
    if (!loggedUser?.id) {
        console.warn('[Dashboard Config] No logged user');
        return getDefaultConfig();
    }

    try {
        // Try to fetch existing config
        const { data, error } = await supabase
            .from('user_dashboard_config')
            .select('kpi_layout, grid_columns')
            .eq('user_id', loggedUser.id)
            .single();

        if (error && error.code !== '406' && error.code !== 'PGRST116') {
            // Error other than "not found"
            throw error;
        }

        if (!data) {
            // No config found, create default
            await ensureDefaultConfig();
            return getDefaultConfig();
        }

        return {
            kpiLayout: data.kpi_layout || [],
            gridColumns: data.grid_columns || 4
        };
    } catch (err) {
        console.error('[Dashboard Config] Error loading:', err);
        Toast.show('Errore caricamento configurazione dashboard', 'error');
        return getDefaultConfig();
    }
}

/**
 * Save dashboard configuration for current user
 */
export async function saveDashboardConfig(config) {
    if (!loggedUser?.id) {
        Toast.show('Utente non autenticato', 'error');
        return false;
    }

    try {
        const { error } = await supabase
            .from('user_dashboard_config')
            .upsert({
                user_id: loggedUser.id,
                kpi_layout: config.kpiLayout,
                grid_columns: config.gridColumns,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) throw error;

        Toast.show('Configurazione dashboard salvata!', 'success');
        return true;
    } catch (err) {
        console.error('[Dashboard Config] Error saving:', err);
        Toast.show('Errore salvataggio configurazione: ' + err.message, 'error');
        return false;
    }
}

/**
 * Reset dashboard configuration to default
 */
export async function resetDashboardConfig() {
    if (!loggedUser?.id) {
        Toast.show('Utente non autenticato', 'error');
        return false;
    }

    try {
        const defaultConfig = getDefaultConfig();
        const { error } = await supabase
            .from('user_dashboard_config')
            .upsert({
                user_id: loggedUser.id,
                kpi_layout: defaultConfig.kpiLayout,
                grid_columns: defaultConfig.gridColumns,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) throw error;

        Toast.show('Configurazione ripristinata ai valori predefiniti', 'success');
        return true;
    } catch (err) {
        console.error('[Dashboard Config] Error resetting:', err);
        Toast.show('Errore ripristino configurazione: ' + err.message, 'error');
        return false;
    }
}

/**
 * Ensure default config exists for user (called on first load)
 */
async function ensureDefaultConfig() {
    if (!loggedUser?.id) return;

    try {
        const defaultConfig = getDefaultConfig();
        await supabase
            .from('user_dashboard_config')
            .insert({
                user_id: loggedUser.id,
                kpi_layout: defaultConfig.kpiLayout,
                grid_columns: defaultConfig.gridColumns
            });
    } catch (err) {
        // Ignore duplicate key errors
        if (!err.message?.includes('duplicate') && !err.code?.includes('23505')) {
            console.error('[Dashboard Config] Error creating default:', err);
        }
    }
}

/**
 * Get default dashboard configuration
 */
function getDefaultConfig() {
    return {
        kpiLayout: Object.values(KPI_CATALOG).map((kpi, index) => ({
            id: kpi.id,
            visible: kpi.defaultVisible,
            order: index,
            size: kpi.defaultSize,
            position: { row: 0, col: index }
        })),
        gridColumns: 4
    };
}

// ============================================================================
// CONFIGURATION MODAL UI
// ============================================================================

/**
 * Open dashboard configuration modal
 * Allows visual customization of KPI layout
 */
export function showDashboardConfigPanel() {
    openModal('Configura Dashboard');
    renderConfigPanel();
}

/**
 * Render configuration panel content
 * @param {HTMLElement} container - Target container to render into
 */
export async function renderConfigPanel(container) {
    if (!container) {
        console.error('No container provided for renderConfigPanel');
        return;
    }

    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento configurazione...</div>';

    try {
        const config = await loadDashboardConfig();

        container.innerHTML = `
      <div class="dashboard-config-panel">
        <div class="config-section">
          <h4><i class="fas fa-th"></i> Layout Griglia</h4>
          <p class="section-hint">Seleziona il numero di colonne per la griglia delle KPI</p>
          <div class="grid-columns-selector">
            ${[2, 3, 4, 5, 6].map(cols => `
              <button 
                class="grid-col-btn ${config.gridColumns === cols ? 'active' : ''}" 
                data-columns="${cols}"
              >
                <i class="fas fa-th"></i>
                <span>${cols} ${cols === 1 ? 'colonna' : 'colonne'}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="config-section">
          <h4><i class="fas fa-layer-group"></i> KPI Disponibili</h4>
          <p class="section-hint">Trascina per riordinare, clicca l'occhio per nascondere, usa i pulsanti per ridimensionare</p>
          
          <div id="kpi-config-list" class="kpi-config-list">
            ${renderKpiConfigItems(config.kpiLayout)}
          </div>
        </div>

        <div class="config-actions">
          <button id="btn-config-reset" class="menu-button secondary">
            <i class="fas fa-undo"></i> Ripristina Default
          </button>
          
          <button id="btn-config-save" class="menu-button primary">
            <i class="fas fa-save"></i> Salva Configurazione
          </button>
        </div>
      </div>
    `;

        // Initialize event handlers - we need to pass the container context if possible, 
        // or ensure handlers search within container or document (ids are unique so document is fine)
        initializeConfigHandlers(config, container);

    } catch (err) {
        container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Errore caricamento configurazione: ${err.message}</p>
      </div>
    `;
    }
}

/**
 * Render individual KPI configuration items
 */
function renderKpiConfigItems(kpiLayout) {
    return kpiLayout
        .sort((a, b) => a.order - b.order)
        .map(kpi => {
            const kpiMeta = KPI_CATALOG[kpi.id];
            if (!kpiMeta) return '';

            return `
        <div class="kpi-config-item ${!kpi.visible ? 'hidden' : ''}" data-kpi-id="${kpi.id}">
          <div class="kpi-drag-handle">
            <i class="fas fa-grip-vertical"></i>
          </div>
          
          <div class="kpi-info">
            <div class="kpi-icon-preview">
              <i class="fas ${kpiMeta.icon}"></i>
            </div>
            <div class="kpi-details">
              <strong>${kpiMeta.title}</strong>
              <small>${kpiMeta.description}</small>
            </div>
          </div>

          <div class="kpi-controls">
            <button 
              class="kpi-control-btn kpi-visibility-btn ${kpi.visible ? 'active' : ''}" 
              data-action="toggle-visibility"
              title="${kpi.visible ? 'Nascondi' : 'Mostra'}"
            >
              <i class="fas ${kpi.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
            </button>

            <div class="kpi-size-dropdown">
              <button class="kpi-control-btn" data-action="resize" title="Ridimensiona">
                <i class="fas fa-expand-arrows-alt"></i>
                <span class="size-label">${kpi.size}</span>
              </button>
              <div class="size-dropdown-menu">
                ${CARD_SIZES.map(size => `
                  <button 
                    class="size-option ${size.value === kpi.size ? 'active' : ''}" 
                    data-size="${size.value}"
                  >
                    <span>${size.label}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
        }).join('');
}

/**
 * Initialize all event handlers for configuration panel
 */
function initializeConfigHandlers(initialConfig, container) {
    let currentConfig = JSON.parse(JSON.stringify(initialConfig)); // Deep clone

    // Helper to find within container
    const $ = (selector) => container ? container.querySelector(selector) : document.querySelector(selector);
    const $$ = (selector) => container ? container.querySelectorAll(selector) : document.querySelectorAll(selector);

    // Grid columns selector
    $$('.grid-col-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.grid-col-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentConfig.gridColumns = parseInt(btn.dataset.columns);
        });
    });

    // KPI visibility toggle
    $$('[data-action="toggle-visibility"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.kpi-config-item');
            const kpiId = item.dataset.kpiId;
            const kpiIndex = currentConfig.kpiLayout.findIndex(k => k.id === kpiId);

            if (kpiIndex !== -1) {
                currentConfig.kpiLayout[kpiIndex].visible = !currentConfig.kpiLayout[kpiIndex].visible;
                item.classList.toggle('hidden');
                btn.classList.toggle('active');
                btn.querySelector('i').className = currentConfig.kpiLayout[kpiIndex].visible ? 'fas fa-eye' : 'fas fa-eye-slash';
                btn.title = currentConfig.kpiLayout[kpiIndex].visible ? 'Nascondi' : 'Mostra';
            }
        });
    });

    // KPI resize dropdown
    $$('[data-action="resize"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = btn.nextElementSibling;
            dropdown.classList.toggle('show');
        });
    });

    // Size selection
    $$('.size-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = e.target.closest('.kpi-config-item');
            const kpiId = item.dataset.kpiId;
            const newSize = btn.dataset.size;
            const kpiIndex = currentConfig.kpiLayout.findIndex(k => k.id === kpiId);

            if (kpiIndex !== -1) {
                currentConfig.kpiLayout[kpiIndex].size = newSize;

                // Update UI
                const sizeLabel = item.querySelector('.size-label');
                sizeLabel.textContent = newSize;

                // Update active state
                item.querySelectorAll('.size-option').forEach(o => o.classList.remove('active'));
                btn.classList.add('active');
            }

            // Close dropdown
            btn.closest('.size-dropdown-menu').classList.remove('show');
        });
    });

    // Close dropdowns when clicking outside - attach to container or document?
    // Document is safer for "outside", but we can keep it global or scoped.
    document.addEventListener('click', () => {
        $$('.size-dropdown-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    });

    // Initialize Sortable for drag-and-drop
    // Pass container to find the list inside it
    initializeSortable(currentConfig, container);

    // Action buttons
    const saveBtn = $('#btn-config-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            // Update order based on DOM
            updateKpiOrder(currentConfig, container);

            const success = await saveDashboardConfig(currentConfig);
            if (success) {
                // Do NOT close modal, just notify
                // closeModal(); 
                // Reload dashboard to show new config
                const event = new CustomEvent('dashboard-config-changed');
                document.dispatchEvent(event);
            }
        });
    }

    const resetBtn = $('#btn-config-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (confirm('Sei sicuro di voler ripristinare la configurazione predefinita? Tutte le personalizzazioni andranno perse.')) {
                const success = await resetDashboardConfig();
                if (success) {
                    // Do NOT close modal
                    // closeModal();
                    const event = new CustomEvent('dashboard-config-changed');
                    document.dispatchEvent(event);
                    // Re-render panel to show reset state
                    renderConfigPanel(container);
                }
            }
        });
    }
}

/**
 * Initialize SortableJS for drag-and-drop reordering
 * Requires SortableJS library to be loaded
 */
function initializeSortable(config, container) {
    const list = container ? container.querySelector('#kpi-config-list') : document.getElementById('kpi-config-list');
    if (!list) return;

    // Check if Sortable library is available
    if (typeof Sortable === 'undefined') {
        console.warn('[Dashboard Config] SortableJS library not loaded. Drag-and-drop disabled.');
        return;
    }

    new Sortable(list, {
        animation: 150,
        ghostClass: 'kpi-item-ghost',
        chosenClass: 'kpi-item-chosen',
        dragClass: 'kpi-item-drag',
        handle: '.kpi-drag-handle', // Keep original handle class
        onEnd: function (evt) {
            updateKpiOrder(config, container);
        }
    });
}

/**
 * Update configuration order based on DOM elements
 */
function updateKpiOrder(config, container) {
    const list = container ? container.querySelector('#kpi-config-list') : document.getElementById('kpi-config-list');
    if (!list) return;

    const items = Array.from(list.children);
    const newOrder = [];

    items.forEach((item, index) => {
        const kpiId = item.dataset.kpiId;
        const configItem = config.kpiLayout.find(k => k.id === kpiId);
        if (configItem) {
            configItem.order = index;
            // The original updateKpiOrder also updated position.col and position.row.
            // This new version does not. If that logic is still needed, it should be re-added.
            // For now, I'm following the provided snippet exactly.
            // configItem.position.col = index % config.gridColumns;
            // configItem.position.row = Math.floor(index / config.gridColumns);
            newOrder.push(configItem);
        }
    });

    // Sort original config array to match new order
    config.kpiLayout.sort((a, b) => a.order - b.order);
}
