/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { loggedUser } from '../core/auth.js';
import { Toast } from '../ui/toast.js';
import {
    showLoadingMessage,
    showErrorMessage,
    openModal,
    closeModal,
    showInfoModal,
    openConfirmModal
} from '../ui/ui.js';
// @ts-ignore
import { calculationEngine, CALCULATION_SCOPES } from '../utils/calculation-engine.js';
import { ensureCalculationPresetsSynced } from '../utils/calculation-presets.js';
import { escapeHtml } from '../utils/utils.js';

const MODULE_TABLE = 'calculation_modules';
const VERSION_TABLE = 'calculation_versions';

interface LogicViewContext {
    container: HTMLElement | null;
    actions: HTMLElement | null;
}

const logicViewContext: LogicViewContext = { container: null, actions: null };

export interface CalculationVersion {
    id: number;
    module_id: number;
    version: number;
    status: 'draft' | 'testing' | 'published';
    dsl: Record<string, any>;
    notes: string | null;
    created_at: string;
    created_by: string | null;
    published_at: string | null;
}

export interface CalculationModule {
    id: number;
    name: string;
    scope: string;
    description: string | null;
    active_version_id: number | null;
    calculation_versions?: CalculationVersion[];
}

/**
 * Refreshes the administrator Settings tab if a settings container has been initialized.
 */
async function refreshSettingsTab(): Promise<void> {
    if (logicViewContext.container) {
        await showSettingsTab(logicViewContext.container, logicViewContext.actions);
    }
}

/**
 * Render and initialize the administrator Settings UI for managing calculation modules and their versions.
 *
 * This function populates the provided container with the Settings tab UI, ensures calculation presets are synced,
 * and (when an actions container is provided) injects module-related actions. It loads modules and their versions
 * from the database, renders the modules layout, and binds interaction handlers. If required database tables are
 * missing, it renders a dedicated missing-tables state; other loading errors are surfaced inside the panel.
 *
 * @param container - The HTMLElement where the Settings UI will be rendered. If falsy, the function no-ops.
 * @param actionsContainer - Optional HTMLElement where action buttons (e.g., "New Module", "Refresh Cache") will be injected.
 */
export async function showSettingsTab(container: HTMLElement, actionsContainer: HTMLElement | null): Promise<void> {
    if (!container) { return; }
    logicViewContext.container = container;
    logicViewContext.actions = actionsContainer || null;
    await ensureCalculationPresetsSynced();

    container.innerHTML = `
    <section class="settings-shell">
      <div class="content-box settings-header">
        <div>
          <p class="settings-kicker">Centro di controllo</p>
          <h2>Impostazioni Amministratore</h2>
          <p class="settings-subtitle">Gestisci logiche di calcolo e, in futuro, tutte le altre configurazioni centrali.</p>
        </div>
        <div class="settings-tabs">
          <button class="settings-tab active" data-settings-tab="logic">
            <i class="fas fa-brain"></i> Calcoli e funzioni
          </button>

        </div>
      </div>
      <div class="content-box settings-panel active" data-settings-panel="logic"></div>
    </section>
  `;

    const logicPanel = container.querySelector('[data-settings-panel="logic"]') as HTMLElement;
    showLoadingMessage(logicPanel);

    if (actionsContainer) {
        actionsContainer.innerHTML = `
      <button class="action-btn primary" id="logic-create-module-btn">
        <i class="fas fa-plus"></i> Nuovo Modulo
      </button>
      <button class="action-btn secondary" id="logic-refresh-cache-btn">
        <i class="fas fa-sync"></i> Ricarica Cache Motore
      </button>
    `;

        const createBtn = document.getElementById('logic-create-module-btn');
        const refreshBtn = document.getElementById('logic-refresh-cache-btn');

        createBtn?.addEventListener('click', () => openNewModuleModal());
        refreshBtn?.addEventListener('click', () => {
            calculationEngine.invalidate();
            showInfoModal(
                'Cache del motore svuotata. Le logiche attive verranno ricaricate al prossimo calcolo.',
                'Cache ripulita'
            );
        });
    }

    try {
        const { data: modules, error } = await supabase
            .from(MODULE_TABLE)
            .select(`
        id,
        name,
        scope,
        description,
        active_version_id,
        calculation_versions:calculation_versions!calculation_versions_module_id_fkey (
          id,
          version,
          status,
          created_at,
          created_by,
          dsl,
          notes
        )
      `)
            .order('scope', { ascending: true });

        if (error) {
            // @ts-ignore
            if (error.code === '42P01') {
                renderMissingTablesState(container);
                return;
            }
            throw error;
        }

        renderModulesLayout(logicPanel, (modules as unknown as CalculationModule[]) || []);
        bindModuleDetails(logicPanel, (modules as unknown as CalculationModule[]) || []);
    } catch (err) {
        showErrorMessage(logicPanel, err, 'Impossibile caricare i moduli di calcolo');
    }
}

/**
 * Render the modules management layout into the given container, showing either an empty-state guide or a grid of module cards with KPIs.
 *
 * @param container - The DOM element where the layout will be injected.
 * @param modules - The list of modules to display; when empty, an instructional empty state is rendered.
 */
function renderModulesLayout(container: HTMLElement, modules: CalculationModule[]): void {
    if (!modules.length) {
        container.innerHTML = `
      <section class="logic-empty-state">
        <div class="logic-empty-icon">
          <i class="fas fa-cogs"></i>
        </div>
        <h3>Configura il motore di calcolo</h3>
        <p>
          Ancora nessun modulo: crea la prima logica per gestire KPI, chiusure o export in modo dinamico.
        </p>
        <ul class="logic-empty-steps">
          <li><span>1</span> Premi "Nuovo Modulo" per definire scope e descrizione.</li>
          <li><span>2</span> Inserisci il DSL JSON per descrivere la pipeline.</li>
          <li><span>3</span> Aggiungi casi di test e pubblica la versione.</li>
        </ul>
        <p class="logic-empty-tip">Suggerimento: crea subito gli scope principali come
          <code>${escapeHtml(CALCULATION_SCOPES.CHIUSURE_TOTALE)}</code> o
          <code>${escapeHtml(CALCULATION_SCOPES.KPI_VENDUTO)}</code>.
        </p>
      </section>
    `;
        return;
    }

    const cards = modules.map((module, idx) => renderModuleCard(module, idx)).join('');

    container.innerHTML = `
    <section class="logic-hero">
      <div>
        <h2>Motore dinamico di calcolo</h2>
        <p>
          Personalizza formule e pipeline senza rilasciare nuovo codice. Ogni modulo rappresenta uno scope
          logico e può contenere versioni multiple.
        </p>
      </div>
      <div class="logic-hero-stats">
        <div class="logic-hero-kpi">
          <span>${modules.length}</span>
          <small>Moduli configurati</small>
        </div>
        <div class="logic-hero-kpi">
          <span>${modules.filter(m => findActiveVersion(m)).length}</span>
          <small>Scope attivi</small>
        </div>
      </div>
    </section>

    <section class="logic-grid">
      ${cards}
    </section>
  `;
}

/**
 * Renders an HTML card representing a calculation module and its summary metadata.
 *
 * @param module - The calculation module record to render (may include its versions).
 * @param idx - Zero-based index of the module in the current list; used for `data-module-index` attributes.
 * @returns An HTML string for the module card including scope, name, description, version counts, draft count, and actions.
 */
function renderModuleCard(module: CalculationModule, idx: number): string {
    const active = findActiveVersion(module);
    const drafts = countDrafts(module);
    const publishedBadge = active
        ? `<span class="logic-badge success">v${escapeHtml(String(active.version || '1'))}</span>`
        : '<span class="logic-badge muted">Nessuna versione attiva</span>';

    return `
    <article class="logic-card" data-module-index="${idx}">
      <div class="logic-card-top">
        <div>
          <p class="logic-card-scope">${escapeHtml(module.scope || 'scope non definito')}</p>
          <h3>${escapeHtml(module.name || 'Modulo senza nome')}</h3>
        </div>
        ${publishedBadge}
      </div>
      <p class="logic-card-description">${escapeHtml(module.description || 'Descrizione mancante')}</p>
      <div class="logic-card-meta">
        <div>
          <span class="meta-label">Versioni</span>
          <span class="meta-value">${module.calculation_versions?.length || 0}</span>
        </div>
        <div>
          <span class="meta-label">Draft</span>
          <span class="meta-value">${drafts}</span>
        </div>
      </div>
      <button class="action-btn tertiary logic-details-btn" data-module-index="${idx}">
        Dettagli & Versioni
      </button>
    </article>
  `;
}

/**
 * Attach click handlers to ".logic-details-btn" elements inside the container to open the corresponding module details modal.
 *
 * @param container - DOM element that contains elements with the `.logic-details-btn` class and a `data-module-index` attribute
 * @param modules - Array of CalculationModule objects where each button's `data-module-index` maps to the module at that index
 */
function bindModuleDetails(container: HTMLElement, modules: CalculationModule[]): void {
    container.querySelectorAll('.logic-details-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt((btn as HTMLElement).dataset.moduleIndex || '0', 10);
            const module = modules[index];
            if (module) { openModuleDetailsModal(module); }
        });
    });
}

/**
 * Attaches click handlers inside a versions table or container to view and publish specific module versions.
 *
 * Searches `target` for elements with classes `logic-version-view` and `logic-version-publish`. For elements that include a `data-version-index` attribute, the view handler opens the DSL editor for the referenced version, and the publish handler prompts the user for confirmation and, if confirmed, publishes the referenced version.
 *
 * @param target - Container element that holds the version rows/buttons
 * @param module - The module to which the versions belong (used when performing publish/view actions)
 * @param versions - Array of versions indexed by each element's `data-version-index` attribute
 */
function bindVersionRowActions(target: HTMLElement, module: CalculationModule, versions: CalculationVersion[]): void {
    target.querySelectorAll('.logic-version-view').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt((btn as HTMLElement).dataset.versionIndex || '0', 10);
            const version = versions[index];
            if (version) { openDslEditorModal(module, version); }
        });
    });

    target.querySelectorAll('.logic-version-publish').forEach(btn => {
        btn.addEventListener('click', async () => {
            const index = parseInt((btn as HTMLElement).dataset.versionIndex || '0', 10);
            const version = versions[index];
            if (!version) { return; }
            const confirmed = await openConfirmModal(`Pubblicare la versione v${version.version}?`);
            if (!confirmed) { return; }
            await handlePublishVersion(module, version);
        });
    });
}

/**
 * Open a modal displaying a module's details, its version history, and actions for managing versions.
 *
 * Renders the module summary (scope, description, active version), a table of versions with action buttons
 * (open editor, publish), and action controls to create a new version, open the active version editor, or close the modal.
 * Binds event handlers for closing the modal, creating a new version, opening the DSL editor for a version,
 * publishing versions, and other row-level actions.
 *
 * @param module - The CalculationModule whose details and versions will be shown and managed
 */
function openModuleDetailsModal(module: CalculationModule): void {
    openModal(`Modulo: ${module.name || module.scope}`);
    const target = document.getElementById('modal-body');
    if (!target) return;

    const active = findActiveVersion(module);
    const versions = module.calculation_versions || [];

    const versionRows = versions.length
        ? versions.map((v, idx) => `
        <tr>
          <td>${escapeHtml(String(v.version || '-'))}</td>
          <td>${escapeHtml(v.status || '-')}</td>
          <td>${v.created_at ? new Date(v.created_at).toLocaleString('it-IT') : '-'}</td>
          <td>${escapeHtml(v.created_by || '-')}</td>
          <td>
            <div class="table-actions">
              <button
                class="icon-btn logic-version-view"
                data-version-index="${idx}"
                title="Apri editor"
              >
                <i class="fas fa-code"></i>
              </button>
              ${v.status !== 'published'
                ? `<button
                    class="icon-btn logic-version-publish"
                    data-version-index="${idx}"
                    title="Pubblica versione"
                  >
                    <i class="fas fa-check"></i>
                  </button>`
                : ''}
            </div>
          </td>
        </tr>
      `).join('')
        : '<tr><td colspan="5">Nessuna versione creata.</td></tr>';

    target.innerHTML = `
    <div class="logic-details">
      <section class="logic-details-summary">
        <p><strong>Scope:</strong> ${escapeHtml(module.scope || '-')}</p>
        <p><strong>Descrizione:</strong> ${escapeHtml(module.description || 'Non impostata')}</p>
        <p><strong>Versione attiva:</strong> ${active ? `v${escapeHtml(String(active.version || '1'))} (${escapeHtml(active.status)})` : 'Nessuna'}</p>
      </section>

      <section class="logic-details-versions">
        <div class="table-responsive">
          <table class="admin-table compact-table">
            <thead>
              <tr>
                <th>Versione</th>
                <th>Stato</th>
                <th>Creato il</th>
                <th>Creato da</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              ${versionRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="logic-details-actions">
        <button class="menu-button primary" id="logic-new-version">
          Nuova Versione
        </button>
        <button class="menu-button" id="logic-open-editor" ${active ? '' : 'disabled'}>
          Editor Versione Attiva
        </button>
        <button class="menu-button secondary" id="logic-close-modal">Chiudi</button>
      </section>
    </div>
  `;

    document.getElementById('logic-close-modal')?.addEventListener('click', () => closeModal());
    const editorBtn = document.getElementById('logic-open-editor');
    if (editorBtn && active) {
        editorBtn.addEventListener('click', () => openDslEditorModal(module, active));
    }
    document.getElementById('logic-new-version')?.addEventListener('click', () => openNewVersionModal(module));
    bindVersionRowActions(target, module, versions);
}

/**
 * Open a modal with a form to create a new calculation module.
 *
 * The form collects module name, scope (technical key), description, DSL (JSON), initial status, and notes.
 * The module name, scope, and DSL fields are required. The modal includes actions to submit the form or cancel;
 * event handlers are attached for form submission and for closing the modal.
 */
function openNewModuleModal(): void {
    openModal('Nuovo Modulo di Calcolo');
    const target = document.getElementById('modal-body');
    if (!target) return;

    target.innerHTML = `
    <form id="logic-module-form" class="logic-form">
      <div class="form-group">
        <label>Nome Modulo</label>
        <input type="text" name="module_name" placeholder="Es. Chiusure - Totale Teorico" required>
      </div>
      <div class="form-group">
        <label>Scope (chiave tecnica)</label>
        <input type="text" name="scope" placeholder="chiusure.totale_teorico" required>
      </div>
      <div class="form-group">
        <label>Descrizione</label>
        <textarea rows="3" name="description" placeholder="Breve descrizione"></textarea>
      </div>
      <div class="form-group">
        <label>DSL (JSON)</label>
        <textarea rows="8" name="dsl" placeholder='{ "op": "pipeline", "steps": [] }' required></textarea>
      </div>
      <div class="form-group">
        <label>Stato iniziale</label>
        <select name="status">
          <option value="draft" selected>Draft</option>
          <option value="testing">Testing</option>
          <option value="published">Published (attiva subito)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Note</label>
        <input type="text" name="notes" placeholder="Note interne (facoltative)">
      </div>
      <div class="logic-form-actions">
        <button type="submit" class="menu-button btn-success">Crea Modulo</button>
        <button type="button" class="menu-button btn-danger" id="logic-module-close">Annulla</button>
      </div>
    </form>
  `;

    document.getElementById('logic-module-close')?.addEventListener('click', () => closeModal());
    const form = document.getElementById('logic-module-form');
    if (form) {
        form.addEventListener('submit', (e) => handleModuleCreation(e));
    }
}

/**
 * Open a modal to create a new version for the given calculation module.
 *
 * The modal pre-fills the DSL with the module's active version DSL or the most recent version's DSL (or a minimal pipeline if none exist),
 * displays the next suggested version number, and provides fields for DSL JSON, status, and internal notes. Submitting the form triggers version creation.
 *
 * @param module - The calculation module for which a new version will be created; must include optional `calculation_versions` for prefill and version numbering
 */
function openNewVersionModal(module: CalculationModule): void {
    const versions = module.calculation_versions || [];
    const nextVersion = (Math.max(0, ...versions.map(v => Number(v.version) || 0)) || 0) + 1;
    const templateDsl = findActiveVersion(module)?.dsl || versions[versions.length - 1]?.dsl || { op: 'pipeline', steps: [] };

    openModal(`Nuova Versione · ${module.name || module.scope}`);
    const target = document.getElementById('modal-body');
    if (!target) return;

    target.innerHTML = `
    <form id="logic-version-form" class="logic-form">
      <p>Versione proposta: <strong>v${nextVersion}</strong></p>
      <div class="form-group">
        <label>DSL (JSON)</label>
        <textarea id="logic-version-dsl" rows="10" required>${escapeHtml(JSON.stringify(templateDsl, null, 2))}</textarea>
      </div>
      <div class="form-group">
        <label>Stato</label>
        <select name="status">
          <option value="draft" selected>Draft</option>
          <option value="testing">Testing</option>
          <option value="published">Published (attiva subito)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Note interne</label>
        <input type="text" name="notes" placeholder="Es. fix calcolo contanti">
      </div>
      <div class="logic-form-actions">
        <button type="submit" class="menu-button btn-success">Salva Versione</button>
        <button type="button" class="menu-button btn-danger" id="logic-version-close">Annulla</button>
      </div>
    </form>
  `;

    document.getElementById('logic-version-close')?.addEventListener('click', () => closeModal());
    const form = document.getElementById('logic-version-form');
    form?.addEventListener('submit', (event) => handleVersionCreation(event, module, nextVersion));
}

/**
 * Renders a warning UI into the provided container informing the administrator that required database tables are missing.
 *
 * The rendered content explains that the MODULE_TABLE and VERSION_TABLE are not present in the Supabase project and advises running the SQL migration or importing the scripts from the supabase/ folder before refreshing the page.
 *
 * @param container - The DOM element where the missing-tables notice will be injected
 */
function renderMissingTablesState(container: HTMLElement): void {
    container.innerHTML = `
    <section class="content-box warning-box">
      <h3>Tabelle mancanti</h3>
      <p>
        Il progetto Supabase non contiene ancora le tabelle
        <code>${MODULE_TABLE}</code> e <code>${VERSION_TABLE}</code>.
        Esegui la migrazione SQL dedicata prima di continuare.
      </p>
      <p>
        Consulta la cartella <code>supabase/</code> o chiedi al supporto per importare gli script
        di creazione. Dopo aver creato le tabelle, torna qui e aggiorna la pagina.
      </p>
    </section>
  `;
}

/**
 * Retrieve the active CalculationVersion for a module, or null if the module has no active version.
 *
 * @param module - The CalculationModule whose active version should be returned
 * @returns The `CalculationVersion` whose `id` matches `module.active_version_id`, or `null` if no match exists
 */
function findActiveVersion(module: CalculationModule): CalculationVersion | null {
    const versions = module.calculation_versions || [];
    if (!versions.length || !module.active_version_id) { return null; }
    return versions.find(v => v.id === module.active_version_id) || null;
}

/**
 * Counts how many versions of a module are in the 'draft' status.
 *
 * @param module - The module whose versions to inspect; if `calculation_versions` is absent, it is treated as empty.
 * @returns The number of versions with status `'draft'`.
 */
function countDrafts(module: CalculationModule): number {
    return (module.calculation_versions || []).filter(v => v.status === 'draft').length;
}

/**
 * Handles submission of the "new module" form, creating a module and its initial version.
 *
 * Creates a module row and a first version in the database, optionally publishes the version
 * (updating the module's active_version_id and invalidating the calculation engine cache for the module's scope),
 * closes the modal, shows a success modal, and refreshes the settings UI. Validates required fields and that the DSL is a JSON object; on validation or runtime errors it shows a toast and logs the error.
 *
 * @param event - The form submit event from the new-module form
 */
async function handleModuleCreation(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) { submitBtn.disabled = true; }

    try {
        const formData = new FormData(form);
        const name = formData.get('module_name')?.toString().trim();
        const scope = formData.get('scope')?.toString().trim();
        const description = formData.get('description')?.toString().trim() || null;
        const notes = formData.get('notes')?.toString().trim() || null;
        const status = formData.get('status')?.toString() || 'draft';
        const dslRaw = formData.get('dsl')?.toString();

        if (!name || !scope || !dslRaw) {
            throw new Error('Compila tutti i campi obbligatori.');
        }

        let parsedDsl = null;
        try {
            parsedDsl = JSON.parse(dslRaw);
            if (typeof parsedDsl !== 'object' || Array.isArray(parsedDsl)) {
                throw new Error('Il DSL deve essere un oggetto JSON valido.');
            }
        } catch (err: any) {
            throw new Error('DSL non valido: ' + err.message);
        }

        // created_by deve essere UUID, non integer - se user_id è un numero, passiamo null
        const userId = loggedUser?.user_id;
        const isValidUuid = userId && typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

        const modulePayload = {
            name,
            scope,
            description,
            created_by: isValidUuid ? userId : null
        };

        const { data: moduleRecord } = await safeSupabaseQuery(
            () =>
                supabase
                    .from(MODULE_TABLE)
                    .insert([modulePayload])
                    .select('*')
                    .single(),
            'Errore creazione modulo'
        );

        const versionPayload = {
            module_id: moduleRecord.id,
            version: 1,
            status,
            dsl: parsedDsl,
            notes,
            created_by: isValidUuid ? userId : null,
            published_at: status === 'published' ? new Date().toISOString() : null
        };

        const { data: versionRecord } = await safeSupabaseQuery(
            () =>
                supabase
                    .from(VERSION_TABLE)
                    .insert([versionPayload])
                    .select('*')
                    .single(),
            'Errore creazione versione'
        );

        if (versionRecord.status === 'published') {
            await safeSupabaseQuery(() =>
                supabase
                    .from(MODULE_TABLE)
                    .update({ active_version_id: versionRecord.id })
                    .eq('id', moduleRecord.id)
            );
            calculationEngine.invalidate(scope || undefined);
        }

        closeModal();
        showInfoModal('Modulo creato con successo!', 'Calcoli e funzioni');
        await refreshSettingsTab();
    } catch (err: any) {
        Toast.show(err.message || 'Errore durante la creazione del modulo.', 'error');
        console.error('Errore creazione modulo:', err);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; }
    }
}

/**
 * Open a modal containing a DSL editor and a live preview for a specific module version.
 *
 * The modal shows the module scope and version metadata, lets the user validate the DSL JSON,
 * run a preview of the DSL against a JSON test input, and view the output; edits are local previews only
 * (saving requires creating a new version).
 *
 * @param module - The calculation module to which the DSL belongs
 * @param version - The specific calculation version whose DSL will be loaded into the editor
 */
function openDslEditorModal(module: CalculationModule, version: CalculationVersion): void {
    openModal(`Editor DSL · ${module.name || module.scope}`);
    const target = document.getElementById('modal-body');
    if (!target) return;

    const prettyDsl = JSON.stringify(version.dsl || {}, null, 2);

    target.innerHTML = `
    <div class="logic-editor">
      <section class="logic-editor-meta">
        <p><strong>Scope:</strong> ${escapeHtml(module.scope || '-')}</p>
        <p><strong>Versione:</strong> v${escapeHtml(String(version.version || '1'))} (${escapeHtml(version.status)})</p>
      </section>
      <div class="logic-editor-grid">
        <div class="form-group">
          <label>DSL (JSON)</label>
          <textarea id="logic-dsl-textarea" rows="12">${escapeHtml(prettyDsl)}</textarea>
        </div>
        <div class="form-group">
          <label>Input di test (JSON)</label>
          <textarea id="logic-test-input" rows="6" placeholder='{"example":42}'></textarea>
        </div>
        <div class="form-group">
          <label>Output</label>
          <pre id="logic-test-output" class="logic-output">// Esegui una preview per vedere il risultato</pre>
        </div>
      </div>
      <div class="logic-editor-actions">
        <button class="menu-button secondary" id="logic-validate-dsl">Valida DSL</button>
        <button class="menu-button primary" id="logic-run-preview">Esegui preview</button>
        <button class="menu-button" id="logic-editor-close">Chiudi</button>
      </div>
      <p class="logic-form-note">
        Nota: l'editor attuale consente solo anteprime locali. Per salvare modifiche dovrai creare una nuova versione tramite Supabase.
      </p>
    </div>
  `;

    document.getElementById('logic-editor-close')?.addEventListener('click', () => closeModal());
    document.getElementById('logic-validate-dsl')?.addEventListener('click', () => {
        try {
            const value = (document.getElementById('logic-dsl-textarea') as HTMLTextAreaElement).value;
            JSON.parse(value);
            showInfoModal('DSL valido.', 'Validazione');
        } catch (err: any) {
            Toast.show('DSL non valido: ' + err.message, 'error');
        }
    });

    document.getElementById('logic-run-preview')?.addEventListener('click', () => {
        const output = document.getElementById('logic-test-output');
        if (!output) return;
        try {
            const dslValue = (document.getElementById('logic-dsl-textarea') as HTMLTextAreaElement).value;
            const testInputValue = (document.getElementById('logic-test-input') as HTMLTextAreaElement).value || '{}';
            const parsedDsl = JSON.parse(dslValue);
            const parsedInput = JSON.parse(testInputValue);
            const evaluator = calculationEngine.compile(parsedDsl);
            const result = evaluator(parsedInput);
            output.textContent = JSON.stringify(result, null, 2);
        } catch (err: any) {
            output.textContent = `Errore: ${err.message}`;
        }
    });
}

/**
 * Create and persist a new version for a module using values submitted from the version-creation form.
 *
 * Validates the DSL JSON from the form, constructs the version payload (including `created_by` when the current user ID is a UUID and `published_at` when status is `published`), inserts the new version into the database, and—if the version is published—updates the module's active version and invalidates the calculation engine cache for the module's scope. On success the modal is closed, an informational modal is shown, and the settings tab is refreshed. Errors are surfaced via toast notifications and logged. The submit button is disabled while the request is in progress.
 *
 * @param event - The form submit event from the "new version" modal
 * @param module - The module for which the new version is being created
 * @param nextVersion - The numeric version number to assign to the new version
 */
async function handleVersionCreation(event: Event, module: CalculationModule, nextVersion: number): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) { submitBtn.disabled = true; }

    try {
        const formData = new FormData(form);
        const status = formData.get('status')?.toString() || 'draft';
        const notes = formData.get('notes')?.toString().trim() || null;
        const dslRaw = (document.getElementById('logic-version-dsl') as HTMLTextAreaElement)?.value;

        if (!dslRaw) { throw new Error('Inserisci il DSL della nuova versione.'); }

        let parsedDsl = null;
        try {
            parsedDsl = JSON.parse(dslRaw);
        } catch (err: any) {
            throw new Error('DSL non valido: ' + err.message);
        }

        // created_by deve essere UUID, non integer - se user_id è un numero, passiamo null
        const userId = loggedUser?.user_id;
        const isValidUuid = userId && typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

        const payload = {
            module_id: module.id,
            version: nextVersion,
            status,
            dsl: parsedDsl,
            notes,
            created_by: isValidUuid ? userId : null,
            published_at: status === 'published' ? new Date().toISOString() : null
        };

        const { data: versionRecord } = await safeSupabaseQuery(
            () =>
                supabase
                    .from(VERSION_TABLE)
                    .insert([payload])
                    .select('*')
                    .single(),
            'Errore creazione versione'
        );

        if (versionRecord.status === 'published') {
            await safeSupabaseQuery(() =>
                supabase
                    .from(MODULE_TABLE)
                    .update({ active_version_id: versionRecord.id })
                    .eq('id', module.id)
            );
            calculationEngine.invalidate(module.scope || undefined);
        }

        closeModal();
        showInfoModal(`Versione v${nextVersion} creata!`, 'Calcoli e funzioni');
        await refreshSettingsTab();
    } catch (err: any) {
        Toast.show(err.message || 'Errore durante la creazione della versione.', 'error');
        console.error('Errore creazione versione:', err);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; }
    }
}

/**
 * Publish a specific module version and set it as the module's active version.
 *
 * Updates the version's status to `published` and its `published_at` timestamp, sets the module's `active_version_id` to the published version, invalidates the calculation engine cache for the module's scope, shows a confirmation modal, and refreshes the settings UI.
 *
 * @param module - The module whose active version will be updated
 * @param version - The version to publish and set as active
 */
async function handlePublishVersion(module: CalculationModule, version: CalculationVersion): Promise<void> {
    try {
        await safeSupabaseQuery(() =>
            supabase
                .from(VERSION_TABLE)
                .update({ status: 'published', published_at: new Date().toISOString() })
                .eq('id', version.id)
        );

        await safeSupabaseQuery(() =>
            supabase
                .from(MODULE_TABLE)
                .update({ active_version_id: version.id })
                .eq('id', module.id)
        );

        calculationEngine.invalidate(module.scope || undefined);
        showInfoModal(`Versione v${version.version} pubblicata e impostata come attiva.`, 'Calcoli e funzioni');
        await refreshSettingsTab();
    } catch (err: any) {
        Toast.show(err.message || 'Errore durante la pubblicazione.', 'error');
        console.error('Errore publish versione:', err);
    }
}