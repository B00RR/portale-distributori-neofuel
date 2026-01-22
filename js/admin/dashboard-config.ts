/**
 * ============================================================================
 * ADMIN DASHBOARD CONFIGURATION MODULE
 * ============================================================================
 * 
 * Provides visual configuration interface for customizing dashboard KPI layout
 * 
 * @module admin-dashboard-config
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../core/api.js';
import { loggedUser } from '../core/auth.js';
import { Toast } from '../ui/toast.js';
import { openModal, openConfirmModal } from '../ui/ui.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type CardSize = '1x1' | '1x2' | '2x1' | '2x2';

export interface KPIMetadata {
    id: string;
    title: string;
    icon: string;
    description: string;
    defaultSize: CardSize;
    defaultVisible: boolean;
}

export interface KPIConfigItem {
    id: string;
    visible: boolean;
    order: number;
    size: CardSize;
    position: {
        row: number;
        col: number;
    };
}

export interface DashboardConfig {
    kpiLayout: KPIConfigItem[];
    gridColumns: number;
}

export interface CardSizeDefinition {
    value: CardSize;
    label: string;
    cols: number;
    rows: number;
}

// ============================================================================
// KPI CATALOG
// ============================================================================

export const KPI_CATALOG: Record<string, KPIMetadata> = {
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
};

// Available card sizes
export const CARD_SIZES: CardSizeDefinition[] = [
    { value: '1x1', label: 'Piccola (1x1)', cols: 1, rows: 1 },
    { value: '1x2', label: 'Larga (1x2)', cols: 2, rows: 1 },
    { value: '2x1', label: 'Alta (2x1)', cols: 1, rows: 2 },
    { value: '2x2', label: 'Grande (2x2)', cols: 2, rows: 2 }
];

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Retrieve the current user's identifier, preferring the Supabase auth UUID.
 *
 * @returns The Supabase auth user's UUID string if available; otherwise the internal numeric user id; `null` if no user id can be determined.
 */
async function getCurrentUserId(): Promise<string | number | null> {
    // Priority: Supabase Auth UUID (required for user_dashboard_config table which uses uuid type)
    const { data: { session } } = await (supabase as any).auth.getSession();
    if (session?.user?.id) { return session.user.id; }

    // Fallback to internal ID (though this might cause type errors if table expects uuid)
    if (loggedUser?.user_id) { return loggedUser.user_id; }

    return null;
}

/**
 * Load the current user's dashboard configuration, creating and persisting a default when none exists.
 *
 * If no user is logged in or the user identifier is not a UUID, this returns the default configuration.
 * When a stored configuration is not found the default configuration will be ensured/persisted for the user.
 * On unexpected errors the function shows an error toast and returns the default configuration.
 *
 * @returns The user's DashboardConfig (kpiLayout and gridColumns); when missing or on error a default configuration is returned.
 */
export async function loadDashboardConfig(): Promise<DashboardConfig> {
    const userId = await getCurrentUserId();

    if (!userId) {
        console.warn('[Dashboard Config] No logged user');
        return getDefaultConfig();
    }

    // Validate if userId is a valid UUID (simple regex check)
    // The table user_dashboard_config requires a UUID type for user_id.
    // If the legacy admin user has an integer ID (e.g. 1 or 11), the query will fail with 400.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId));

    if (!isUUID) {
        console.warn('[Dashboard Config] User ID is not a UUID (User:', userId, '). Using default config.');
        return getDefaultConfig();
    }

    try {
        // Try to fetch existing config
        const { data, error } = await (supabase as any)
            .from('user_dashboard_config')
            .select('kpi_layout, grid_columns')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== '406' && error.code !== 'PGRST116') {
            // Error other than "not found" or "not acceptable"
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
    } catch (err: any) {
        console.error('[Dashboard Config] Error loading:', err);
        Toast.show('Errore caricamento configurazione dashboard', 'error');
        return getDefaultConfig();
    }
}

/**
 * Persist the given dashboard configuration for the current user.
 *
 * If there is no authenticated user the function shows an error toast and returns `false`.
 *
 * @param config - Dashboard layout and grid settings to save for the current user
 * @returns `true` if the configuration was persisted successfully, `false` otherwise
 */
export async function saveDashboardConfig(config: DashboardConfig): Promise<boolean> {
    const userId = await getCurrentUserId();

    if (!userId) {
        Toast.show('Utente non autenticato', 'error');
        return false;
    }

    try {
        const { error } = await (supabase as any)
            .from('user_dashboard_config')
            .upsert({
                user_id: userId,
                kpi_layout: config.kpiLayout,
                grid_columns: config.gridColumns,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) { throw error; }

        Toast.show('Configurazione dashboard salvata!', 'success');
        return true;
    } catch (err: any) {
        console.error('[Dashboard Config] Error saving:', err);
        Toast.show('Errore salvataggio configurazione: ' + err.message, 'error');
        return false;
    }
}

/**
 * Restore the current user's dashboard configuration to the default layout and settings.
 *
 * Attempts to persist the default configuration for the authenticated user.
 *
 * @returns `true` if the default configuration was saved successfully, `false` otherwise (including when no authenticated user is available).
 */
export async function resetDashboardConfig(): Promise<boolean> {
    const userId = await getCurrentUserId();

    if (!userId) {
        Toast.show('Utente non autenticato', 'error');
        return false;
    }

    try {
        const defaultConfig = getDefaultConfig();
        const { error } = await (supabase as any)
            .from('user_dashboard_config')
            .upsert({
                user_id: userId,
                kpi_layout: defaultConfig.kpiLayout,
                grid_columns: defaultConfig.gridColumns,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) { throw error; }

        Toast.show('Configurazione ripristinata ai valori predefiniti', 'success');
        return true;
    } catch (err: any) {
        console.error('[Dashboard Config] Error resetting:', err);
        Toast.show('Errore ripristino configurazione: ' + err.message, 'error');
        return false;
    }
}

/**
 * Ensure the current user has a default dashboard configuration.
 *
 * If a user is available, inserts the default DashboardConfig into the
 * `user_dashboard_config` table. Duplicate-key conflicts are ignored;
 * other errors are written to the console.
 */
async function ensureDefaultConfig(): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) { return; }

    try {
        const defaultConfig = getDefaultConfig();
        await (supabase as any)
            .from('user_dashboard_config')
            .insert({
                user_id: userId,
                kpi_layout: defaultConfig.kpiLayout,
                grid_columns: defaultConfig.gridColumns
            });
    } catch (err: any) {
        // Ignore duplicate key errors
        if (!err.message?.includes('duplicate') && !err.code?.includes('23505')) {
            console.error('[Dashboard Config] Error creating default:', err);
        }
    }
}

/**
 * Build the default dashboard configuration based on the KPI catalog.
 *
 * @returns A DashboardConfig where `kpiLayout` contains one entry per KPI from `KPI_CATALOG` using each KPI's `defaultVisible`, `defaultSize`, and sequential `order` with positions starting at row 0; `gridColumns` is set to 4.
 */
function getDefaultConfig(): DashboardConfig {
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
 * Open the dashboard configuration modal and render the configuration panel.
 *
 * If the modal container exists in the DOM, the function injects the configuration UI into it.
 */
export function showDashboardConfigPanel(): void {
    openModal('Configura Dashboard');
    const modalContent = document.getElementById('modal-content');
    if (modalContent) {
        renderConfigPanel(modalContent);
    }
}

/**
 * Renders the dashboard configuration panel into the provided container.
 *
 * Loads the current dashboard configuration, injects the configuration UI (grid column selector, KPI list, and action buttons) into the container, and initializes interaction handlers.
 *
 * @param container - Target DOM element to render the configuration panel into
 */
export async function renderConfigPanel(container: HTMLElement): Promise<void> {
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

        initializeConfigHandlers(config, container);

    } catch (err: any) {
        container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Errore caricamento configurazione: ${err.message}</p>
      </div>
    `;
    }
}

/**
 * Generate the HTML markup for the list of KPI configuration items used in the dashboard config panel.
 *
 * The produced markup contains one entry per KPI config (sorted by `order`), omitting any KPI whose metadata is not found in the catalog.
 *
 * @param kpiLayout - Array of KPI configuration items to render
 * @returns A concatenated HTML string representing the KPI configuration entries, with visibility and current size reflected and size options sourced from the available card sizes
 */
function renderKpiConfigItems(kpiLayout: KPIConfigItem[]): string {
    return kpiLayout
        .sort((a, b) => a.order - b.order)
        .map(kpi => {
            const kpiMeta = KPI_CATALOG[kpi.id];
            if (!kpiMeta) { return ''; }

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
 * Attach interactive handlers to the dashboard configuration panel elements.
 *
 * Sets up UI behavior for grid-column selection, KPI visibility toggles, card size dropdowns and selection,
 * drag-and-drop reordering, and Save/Reset actions so the provided configuration can be edited in-place.
 *
 * @param initialConfig - The current dashboard configuration used to initialize the panel (a working clone will be created).
 * @param container - The DOM element that contains the rendered configuration panel UI.
 */
function initializeConfigHandlers(initialConfig: DashboardConfig, container: HTMLElement): void {
    const currentConfig: DashboardConfig = JSON.parse(JSON.stringify(initialConfig)); // Deep clone

    const $$ = (selector: string) => container ? container.querySelectorAll(selector) : document.querySelectorAll(selector);

    // Grid columns selector
    $$('.grid-col-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.grid-col-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentConfig.gridColumns = parseInt((btn as HTMLElement).dataset.columns || '4', 10);
        });
    });

    // KPI visibility toggle
    $$('[data-action="toggle-visibility"]').forEach(btn => {
        btn.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;
            const item = target.closest('.kpi-config-item') as HTMLElement;
            const kpiId = item.dataset.kpiId;
            const kpiIndex = currentConfig.kpiLayout.findIndex(k => k.id === kpiId);

            if (kpiIndex !== -1 && currentConfig.kpiLayout[kpiIndex]) {
                currentConfig.kpiLayout[kpiIndex]!.visible = !currentConfig.kpiLayout[kpiIndex]!.visible;
                item.classList.toggle('hidden');
                btn.classList.toggle('active');
                const i = btn.querySelector('i');
                if (i) {
                    i.className = currentConfig.kpiLayout[kpiIndex]!.visible ? 'fas fa-eye' : 'fas fa-eye-slash';
                }
                (btn as HTMLElement).title = currentConfig.kpiLayout[kpiIndex]!.visible ? 'Nascondi' : 'Mostra';
            }
        });
    });

    // KPI resize dropdown
    $$('[data-action="resize"]').forEach(btn => {
        btn.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            const dropdown = btn.nextElementSibling;
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        });
    });

    // Size selection
    $$('.size-option').forEach(btn => {
        btn.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            const target = e.target as HTMLElement;
            const item = target.closest('.kpi-config-item') as HTMLElement;
            const kpiId = item.dataset.kpiId;
            const newSize = (btn as HTMLElement).dataset.size as CardSize;
            const kpiIndex = currentConfig.kpiLayout.findIndex(k => k.id === kpiId);

            if (kpiIndex !== -1 && currentConfig.kpiLayout[kpiIndex]) {
                currentConfig.kpiLayout[kpiIndex]!.size = newSize;

                // Update UI
                const sizeLabel = item.querySelector('.size-label');
                if (sizeLabel) sizeLabel.textContent = newSize;

                // Update active state
                item.querySelectorAll('.size-option').forEach(o => o.classList.remove('active'));
                btn.classList.add('active');
            }

            // Close dropdown
            const menu = btn.closest('.size-dropdown-menu');
            if (menu) menu.classList.remove('show');
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        $$('.size-dropdown-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    });

    // Initialize Sortable for drag-and-drop
    initializeSortable(currentConfig, container);

    // Action buttons
    const saveBtn = container.querySelector('#btn-config-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            // Update order based on DOM
            updateKpiOrder(currentConfig, container);

            const success = await saveDashboardConfig(currentConfig);
            if (success) {
                const event = new CustomEvent('dashboard-config-changed');
                document.dispatchEvent(event);
            }
        });
    }

    const resetBtn = container.querySelector('#btn-config-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const confirmed = await openConfirmModal('Sei sicuro di voler ripristinare la configurazione predefinita? Tutte le personalizzazioni andranno perse.');
            if (confirmed) {
                const success = await resetDashboardConfig();
                if (success) {
                    const event = new CustomEvent('dashboard-config-changed');
                    document.dispatchEvent(event);
                    renderConfigPanel(container);
                }
            }
        });
    }
}

/**
 * Enables drag-and-drop reordering of KPI items and updates the provided dashboard config to reflect changes.
 *
 * @param config - The DashboardConfig object whose `kpiLayout` order will be updated after items are reordered.
 * @param container - The container element that contains the `#kpi-config-list` element to make sortable.
 *
 * Note: If the KPI list element is not found or the SortableJS library is not loaded, the function does nothing.
 */
function initializeSortable(config: DashboardConfig, container: HTMLElement): void {
    const list = container ? container.querySelector('#kpi-config-list') : document.getElementById('kpi-config-list');
    if (!list) { return; }

    // Check if Sortable library is available
    if (typeof (window as any).Sortable === 'undefined') {
        console.warn('[Dashboard Config] SortableJS library not loaded. Drag-and-drop disabled.');
        return;
    }

    new (window as any).Sortable(list, {
        animation: 150,
        ghostClass: 'kpi-item-ghost',
        chosenClass: 'kpi-item-chosen',
        dragClass: 'kpi-item-drag',
        handle: '.kpi-drag-handle',
        onEnd: function () {
            updateKpiOrder(config, container);
        }
    });
}

/**
 * Synchronizes KPI configuration order with the DOM order of the configuration list.
 *
 * Updates each matching entry in `config.kpiLayout` with its index based on the children of the
 * `#kpi-config-list` element, then sorts `config.kpiLayout` by the new `order` values.
 *
 * @param config - The dashboard configuration whose `kpiLayout` will be updated
 * @param container - The container element that hosts the `#kpi-config-list`; if that element
 * is not found within `container`, the document root is queried. If the list cannot be found,
 * the function returns without modifying `config`.
 */
function updateKpiOrder(config: DashboardConfig, container: HTMLElement): void {
    const list = container ? container.querySelector('#kpi-config-list') : document.getElementById('kpi-config-list');
    if (!list) { return; }

    const items = Array.from(list.children) as HTMLElement[];

    items.forEach((item, index) => {
        const kpiId = item.dataset.kpiId;
        const configItem = config.kpiLayout.find(k => k.id === kpiId);
        if (configItem) {
            configItem.order = index;
        }
    });

    // Sort original config array to match new order
    config.kpiLayout.sort((a, b) => a.order - b.order);
}