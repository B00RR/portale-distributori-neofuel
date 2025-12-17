import { supabase } from "../core/api.js";
import { showLoadingMessage, showInfoModal, showErrorMessage, openModal, closeModal } from "../ui/ui.js";
import { escapeHtml, formatEuro, formatDate } from "../utils/utils.js";
import { Toast } from "../ui/toast.js";

// --- STATE ---
let voucherState = {
    batches: [],
    customers: [],
    activeTab: 'generator', // 'generator', 'dashboard'
    dashboardView: 'batches', // 'batches' (default), 'vouchers'
    // Pagination and filters for Dashboard
    currentPage: 1,
    pageSize: 25,
    totalCount: 0,
    filters: {
        status: '',
        dateFrom: '',
        dateTo: '',
        clientSearch: ''
    }
};

// --- INITIALIZATION ---
export async function showVoucherAdminTab(container, headerActions) {
    // V3 REBOOT: Clean Flexbox Structure
    container.innerHTML = `
        <div class="app-container" style="max-width: 100%; overflow-x: hidden; box-sizing: border-box;">
            <div class="top-bar-title">
                <h2><i class="fas fa-ticket-alt"></i> Gestione Voucher V3</h2>
            </div>
            
            <!-- TABS: Flex Wrap for responsiveness -->
            <div class="tabs-container" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; max-width: 100%;">
                <button class="tab-btn-large ${voucherState.activeTab === 'generator' ? 'active' : ''}" data-tab="generator" style="
                    flex: 1 1 200px;
                    background: ${voucherState.activeTab === 'generator' ? 'linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%)' : 'white'};
                    color: ${voucherState.activeTab === 'generator' ? 'white' : '#64748b'};
                    border: 1px solid ${voucherState.activeTab === 'generator' ? 'transparent' : '#e2e8f0'};
                    padding: 1rem;
                    border-radius: 12px;
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 0.75rem;
                    transition: all 0.2s ease;
                    box-shadow: ${voucherState.activeTab === 'generator' ? '0 4px 12px rgba(10, 35, 66, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)'};
                ">
                    <div style="font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-plus-circle"></i> Genera
                    </div>
                    <div style="font-size: 0.85rem; opacity: 0.9;">Crea nuovi buoni</div>
                </button>
                
                <button class="tab-btn-large ${voucherState.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" style="
                    flex: 1 1 200px;
                    background: ${voucherState.activeTab === 'dashboard' ? 'linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%)' : 'white'};
                    color: ${voucherState.activeTab === 'dashboard' ? 'white' : '#64748b'};
                    border: 1px solid ${voucherState.activeTab === 'dashboard' ? 'transparent' : '#e2e8f0'};
                    padding: 1rem;
                    border-radius: 12px;
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 0.75rem;
                    transition: all 0.2s ease;
                    box-shadow: ${voucherState.activeTab === 'dashboard' ? '0 4px 12px rgba(10, 35, 66, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)'};
                ">
                    <div style="font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-chart-line"></i> Dashboard
                    </div>
                    <div style="font-size: 0.85rem; opacity: 0.9;">Statistiche e liste</div>
                </button>
            </div>
            
            <div id="voucher-content" class="tab-content" style="background: #fff; padding: 1.5rem; border-radius: 16px; border: 1px solid #e2e8f0; max-width: 100%; overflow-x: hidden; box-sizing: border-box;">
                <!-- Content injected here -->
            </div>
        </div>
    `;

    // Bind Tabs
    const tabButtons = container.querySelectorAll('.tab-btn-large');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            voucherState.activeTab = tabId;
            // Re-render the tab structure to update styles
            showVoucherAdminTab(container);
        });
    });

    // Load dependencies
    await loadCustomers();
    renderActiveTab();
}

async function loadCustomers() {
    try {
        // Fetch active customers for the dropdown
        const { data, error } = await supabase
            .from('crediti_clienti')
            .select('id, cliente')
            .order('cliente');

        if (error) throw error;
        voucherState.customers = data || [];
    } catch (err) {
        console.error("Error loading customers:", err);
        Toast.show("Errore caricamento clienti", 'error');
    }
}

async function renderActiveTab() {
    const content = document.getElementById('voucher-content');
    if (!content) return;

    switch (voucherState.activeTab) {
        case 'generator':
            renderGenerator(content);
            break;
        case 'dashboard':
            renderDashboard(content);
            break;
    }
}

// --- GENERATOR TAB ---
function renderGenerator(container) {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const nextYearStr = nextYear.toISOString().split('T')[0];

    container.innerHTML = `
        <div class="menu-card">
            <h3><i class="fas fa-ticket-alt"></i> Crea Nuovi Voucher</h3>
            <p class="section-subtitle">Genera un lotto di codici univoci pronti per la stampa.</p>
            
            <form id="voucher-generator-form" class="form-styled">
                <div class="form-field">
                    <label>Importo Singolo Voucher</label>
                    <div class="input-with-prefix">
                        <span class="input-prefix">€</span>
                        <input type="number" name="amount" step="0.50" min="0.50" required placeholder="0.00">
                    </div>
                </div>

                <div class="form-field">
                    <label>Cliente (Opzionale)</label>
                    <input type="text" name="customer_name" class="form-input" list="customer-list" placeholder="Cerca o inserisci nuovo cliente">
                    <datalist id="customer-list">
                        ${voucherState.customers.map(c => `<option value="${escapeHtml(c.cliente)}">`).join('')}
                    </datalist>
                    <small style="color: #64748b; font-size: 0.9em; margin-top: 4px;">Inserisci un nuovo nome o selezionane uno esistente.</small>
                </div>

                <div class="form-field">
                    <label>Data di Scadenza</label>
                    <input type="date" name="expiration_date" class="form-input" value="${nextYearStr}" min="${today}">
                </div>

                <div class="form-field">
                    <label>Quantità da Generare</label>
                    <input type="number" name="quantity" class="form-input" min="1" max="100" value="10" required>
                </div>

                <div class="form-actions" style="margin-top: 20px;">
                    <button type="submit" class="menu-button primary">
                        <i class="fas fa-cogs"></i> Genera Ora
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('voucher-generator-form').addEventListener('submit', handleGeneration);
}

async function handleGeneration(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const amount = parseFloat(formData.get('amount'));
    const customer = formData.get('customer_name'); // Changed from customer_id to customer_name
    const expiration = formData.get('expiration_date');
    const quantity = parseInt(formData.get('quantity'));

    if (!amount || quantity < 1) return;

    if (!confirm(`Confermi la generazione di ${quantity} voucher da ${formatEuro(amount)} ciascuno?\nTotale Valore Nominale: ${formatEuro(amount * quantity)}`)) {
        return;
    }

    showLoadingMessage(document.getElementById('voucher-content'));

    try {
        // 1. Create Batch
        const batchDesc = `${quantity}x ${formatEuro(amount)}`;
        const { data: batch, error: batchError } = await supabase
            .from('voucher_batches')
            .insert([{
                description: batchDesc,
                customer_name: customer || null,
                expiration_date: expiration || null
            }])
            .select()
            .single();

        if (batchError) throw batchError;

        // 2. Generate Vouchers
        const vouchersPayload = [];
        for (let i = 0; i < quantity; i++) {
            // Generate unique unpredictable code
            const uniqueCode = generateVoucherCode();

            vouchersPayload.push({
                batch_id: batch.id,
                code: uniqueCode,
                amount: amount,
                status: 'active',
                expiration_date: expiration || null,
                // serial_number could be auto-incremented by DB or calculated here relative to batch
                serial_number: i + 1
            });
        }

        const { error: vouchersError } = await supabase
            .from('vouchers')
            .insert(vouchersPayload);

        if (vouchersError) throw vouchersError;

        Toast.show("Voucher generati con successo!", 'success');

        // Redirect to Print Tab
        voucherState.activeTab = 'dashboard'; // Changed to dashboard
        voucherState.dashboardView = 'batches'; // Show batches view
        renderActiveTab();

    } catch (err) {
        console.error(err);
        renderGenerator(document.getElementById('voucher-content')); // Reset UI
        showErrorMessage("Errore Generazione", err.message);
    }
}

function generateVoucherCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let result = '';
    for (let i = 0; i < 12; i++) {
        if (i === 4 || i === 8) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result; // e.g. A4K9-XP3M-9L2N
}

// --- DASHBOARD TAB ---
async function renderDashboard(container) {
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento Dashboard...</div>';

    try {
        // Fetch stats
        const { count: totalGen } = await supabase.from('vouchers').select('*', { count: 'exact', head: true });
        const { count: totalRedeemed } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('status', 'redeemed');
        const { count: totalActive } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('status', 'active');

        // PREPARE DATA - BATCHES VIEW ONLY
        const { data: batches, error: batchError } = await supabase
            .from('voucher_batches')
            .select('*')
            .order('created_at', { ascending: false });

        if (batchError) throw batchError;

        // Fetch aggregation data (all vouchers) needed for stats
        const { data: allVouchers, error: vouchersError } = await supabase
            .from('vouchers')
            .select('batch_id, status, amount');

        if (vouchersError) throw vouchersError;

        // Calculate stats per batch
        const batchStats = {};
        allVouchers.forEach(v => {
            if (!batchStats[v.batch_id]) {
                batchStats[v.batch_id] = { totalAmount: 0, redeemedAmount: 0, totalCount: 0, redeemedCount: 0, activeCount: 0 };
            }
            batchStats[v.batch_id].totalAmount += v.amount;
            batchStats[v.batch_id].totalCount++;
            if (v.status === 'redeemed') {
                batchStats[v.batch_id].redeemedCount++;
                batchStats[v.batch_id].redeemedAmount += v.amount;
            } else if (v.status === 'active') {
                batchStats[v.batch_id].activeCount++;
            }
        });

        // V3 REBOOT: CSS ISOLATION STRATEGY
        // We inject local styles to override ANY global table settings that might be breaking the layout.
        // NUCLEAR OPTION V2: CSS GRID LAYOUT
        // Bypassing table mechanics entirely
        const styleId = 'voucher-grid-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                /* Custom Scrollbar to make it OBVIOUS */
                .voucher-scroll-wrapper::-webkit-scrollbar {
                    height: 12px;
                }
                .voucher-scroll-wrapper::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-radius: 6px;
                }
                .voucher-scroll-wrapper::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 6px;
                    border: 3px solid #f1f5f9;
                }
                .voucher-scroll-wrapper::-webkit-scrollbar-thumb:hover {
                    background-color: #94a3b8;
                }

                .voucher-list-container {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                    margin-top: 20px;
                    border: 1px solid #e2e8f0;
                    max-width: 100%;
                    width: 100%;
                }
                .voucher-scroll-wrapper {
                    overflow-x: auto;
                    overflow-y: visible;
                    width: 100%;
                    max-width: 100%;
                    padding-bottom: 5px; /* Space for scrollbar */
                    -webkit-overflow-scrolling: touch;
                }
                .voucher-grid-inner {
                    min-width: 900px; /* Reduced from 1100px for better fit */
                    width: 100%;
                }
                .voucher-grid-header {
                    display: grid;
                    /* Revised Columns: Description(Auto), Amount(140), Client(160), Disp(100), Status(100), Expires(120), Actions(160) */
                    grid-template-columns: minmax(200px, 1fr) 130px minmax(140px, 1fr) 90px 90px 110px 160px;
                    background: #f8fafc;
                    border-bottom: 2px solid #e2e8f0;
                    font-weight: 600;
                    color: #475569;
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .voucher-header-cell {
                    padding: 12px 16px; /* Tighter padding */
                    display: flex;
                    align-items: center;
                    border-right: 1px solid #e2e8f0; /* Simulate vertical borders */
                    white-space: nowrap;
                }
                .voucher-header-cell:last-child {
                    border-right: none;
                }
                .voucher-grid-row {
                    display: grid;
                    grid-template-columns: minmax(200px, 1fr) 130px minmax(140px, 1fr) 90px 90px 110px 160px;
                    border-bottom: 1px solid #f1f5f9;
                    transition: background-color 0.15s;
                    align-items: center; /* Vertically center by default */
                }
                .voucher-grid-row:hover {
                    background-color: #f1f5f9;
                }
                .voucher-cell {
                    padding: 12px 12px; /* Reduced padding */
                    display: flex;
                    align-items: center;
                    color: #334155;
                    font-size: 0.9rem; /* Slightly smaller font */
                    border-right: 1px dashed #f1f5f9; /* Subtle vertical guide */
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    min-width: 0; /* Allow flex shrinking */
                }
                .voucher-cell:last-child {
                    border-right: none;
                    overflow: visible; /* Allow dropups if needed */
                    flex-shrink: 0; /* Prevent action buttons from shrinking */
                }
                .voucher-cell.center {
                    justify-content: center;
                }
                .voucher-header-cell.center {
                    justify-content: center;
                }
                .voucher-cell strong {
                    font-weight: 600;
                    color: #0f172a;
                }
                
                /* Action buttons hover effects */
                [data-action] {
                    transition: all 0.2s ease;
                }
                [data-action]:hover {
                    transform: scale(1.1);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                }
                [data-action]:active {
                    transform: scale(0.95);
                }
                
                /* Responsive adjustments */
                @media (max-width: 1200px) {
                    .voucher-grid-inner {
                        min-width: 800px;
                    }
                    .voucher-grid-header,
                    .voucher-grid-row {
                        grid-template-columns: minmax(180px, 1fr) 120px minmax(120px, 1fr) 80px 80px 100px 150px;
                    }
                }
                
                @media (max-width: 768px) {
                    .voucher-grid-inner {
                        min-width: 700px;
                    }
                    .voucher-header-cell,
                    .voucher-cell {
                        padding: 10px 8px;
                        font-size: 0.85rem;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        const tableHtml = `
            <div class="voucher-list-container">
                <div class="voucher-scroll-wrapper">
                    <div class="voucher-grid-inner">
                        <!-- HEADER -->
                        <div class="voucher-grid-header">
                            <div class="voucher-header-cell">Descrizione Lotto</div>
                            <div class="voucher-header-cell">Importo Tot. / Res.</div>
                            <div class="voucher-header-cell">Cliente</div>
                            <div class="voucher-header-cell center">Disp. / Risc.</div>
                            <div class="voucher-header-cell center">Stato</div>
                            <div class="voucher-header-cell">Scadenza</div>
                            <div class="voucher-header-cell center">Opzioni</div>
                        </div>

                        <!-- ROWS -->
                        ${batches.map(b => {
            const stats = batchStats[b.id] || { totalVouchers: 0, redeemed: 0, active: 0, totalAmount: 0, redeemedAmount: 0 };
            const residualAmount = stats.totalAmount - stats.redeemedAmount;
            const isExpired = b.expiration_date && new Date(b.expiration_date) < new Date();
            const statusLabel = isExpired ? 'Scaduto' : (stats.activeCount === 0 && stats.totalCount > 0 ? 'Esaurito' : 'Attivo');
            const statusClass = isExpired ? 'badge-danger' : (stats.activeCount === 0 && stats.totalCount > 0 ? 'badge-secondary' : 'badge-success');

            return `
                            <div class="voucher-grid-row">
                                <div class="voucher-cell">
                                    <div style="width:100%">
                                        <div style="font-weight: 500;">${b.description || 'Lotto ' + b.id}</div>
                                        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">ID: ${b.id.substring(0, 8)}...</div>
                                    </div>
                                </div>
                                <div class="voucher-cell">
                                    <div style="width:100%">
                                        <div style="font-weight: 600;">${formatEuro(stats.totalAmount)}</div>
                                        <div style="font-size: 0.8em; color: ${residualAmount > 0 ? '#10b981' : '#94a3b8'};">Res: ${formatEuro(residualAmount)}</div>
                                    </div>
                                </div>
                                <div class="voucher-cell">
                                    <div style="color: #334155; font-weight: 500;">${b.customer_name || '-'}</div>
                                </div>
                                <div class="voucher-cell center">
                                    <span style="color: #3b82f6; font-weight: 600; font-size: 1.1em;">${stats.activeCount}</span>
                                    <span style="color: #cbd5e1; margin: 0 4px;">/</span>
                                    <span style="color: #64748b;">${stats.redeemedCount}</span>
                                </div>
                                <div class="voucher-cell center">
                                    <span class="badge ${statusClass}">${statusLabel}</span>
                                </div>
                                <div class="voucher-cell">
                                    <div style="color: #475569;">${b.expiration_date ? new Date(b.expiration_date).toLocaleDateString() : 'Illimitata'}</div>
                                </div>
                                <div class="voucher-cell center" style="flex-shrink: 0; min-width: 140px;">
                                    <div style="display: flex; gap: 6px; flex-wrap: nowrap; justify-content: center;">
                                        <button class="action-btn-primary-${b.id}" data-action="print" data-batch-id="${b.id}" title="Stampa" 
                                            style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; background: #3b82f6; color: white; cursor: pointer; transition: all 0.2s; flex-shrink: 0;">
                                            <i class="fas fa-print" style="font-size: 12px;"></i>
                                        </button>
                                        <button class="action-btn-warning-${b.id}" data-action="void" data-batch-id="${b.id}" title="Annulla" 
                                            style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; background: #f59e0b; color: white; cursor: pointer; transition: all 0.2s; flex-shrink: 0;">
                                            <i class="fas fa-ban" style="font-size: 12px;"></i>
                                        </button>
                                        <button class="action-btn-danger-${b.id}" data-action="delete" data-batch-id="${b.id}" title="Elimina" 
                                            style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; background: #ef4444; color: white; cursor: pointer; transition: all 0.2s; flex-shrink: 0;">
                                            <i class="fas fa-trash" style="font-size: 12px;"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                    </div>
                </div>
            </div>`;
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 1rem;">
                <h3 style="margin: 0; font-size: 1.25rem; color: #0f172a;">Gestione Voucher</h3>
                <button id="btn-generate-voucher" class="menu-button primary" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; border-radius: 8px; border: none; background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%); color: white; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    <i class="fas fa-plus-circle"></i>
                    <span>Genera Crea nuovi buoni</span>
                </button>
            </div>

            <section class="dashboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; width: 100%; max-width: 100%;">
                <article class="kpi-card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                    <div class="kpi-row">
                        <div class="kpi-icon" style="color: rgba(255,255,255,0.8);"><i class="fas fa-ticket-alt"></i></div>
                    </div>
                    <p class="kpi-title" style="color: rgba(255,255,255,0.9);">Totale Emessi</p>
                    <p class="kpi-value" style="color: white;">${totalGen || 0}</p>
                    <p class="kpi-sub" style="color: rgba(255,255,255,0.8);">Voucher generati</p>
                </article>
                
                <article class="kpi-card" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;">
                    <div class="kpi-row">
                        <div class="kpi-icon" style="color: rgba(255,255,255,0.8);"><i class="fas fa-check-circle"></i></div>
                    </div>
                    <p class="kpi-title" style="color: rgba(255,255,255,0.9);">Riscattati</p>
                    <p class="kpi-value" style="color: white;">${totalRedeemed || 0}</p>
                    <p class="kpi-sub" style="color: rgba(255,255,255,0.8);">Utilizzati con successo</p>
                </article>

                <article class="kpi-card" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white;">
                    <div class="kpi-row">
                        <div class="kpi-icon" style="color: rgba(255,255,255,0.8);"><i class="fas fa-clock"></i></div>
                    </div>
                    <p class="kpi-title" style="color: rgba(255,255,255,0.9);">Attivi</p>
                    <p class="kpi-value" style="color: white;">${totalActive || 0}</p>
                    <p class="kpi-sub" style="color: rgba(255,255,255,0.8);">In circolazione</p>
                </article>
            </section>

            <div class="menu-card" style="padding: 0; background: transparent; box-shadow: none; max-width: 100%; overflow: hidden;">
                ${tableHtml}
            </div>
        `;

        // Bind generate button
        const generateBtn = container.querySelector('#btn-generate-voucher');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                voucherState.activeTab = 'generator';
                renderActiveTab();
            });
        }

        // Bind action buttons with event delegation
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            
            const action = btn.dataset.action;
            const batchId = btn.dataset.batchId;
            
            if (!batchId) return;
            
            switch (action) {
                case 'print':
                    openPrintView(batchId);
                    break;
                case 'void':
                    handleVoidBatch(batchId);
                    break;
                case 'delete':
                    handleDeleteBatch(batchId);
                    break;
            }
        });

        // Global Actions Exposed (for backwards compatibility)
        if (!window.voucherActions) {
            window.voucherActions = {
                openPrintView,
                handleVoidBatch,
                handleDeleteBatch
            };
        }

    } catch (err) {
        container.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
        console.error(err);
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'active': return '<span class="badge badge-success">Attivo</span>';
        case 'redeemed': return '<span class="badge badge-secondary">Riscattato</span>';
        case 'expired': return '<span class="badge badge-danger">Scaduto</span>';
        case 'void': return '<span class="badge badge-danger">Annullato</span>';
        default: return status;
    }
}

// --- HELPER FUNCTIONS FOR PAGINATION AND FILTERS ---
function generatePageNumbers(currentPage, totalPages) {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        if (currentPage <= 3) {
            for (let i = 1; i <= 4; i++) pages.push(i);
            pages.push('...');
            pages.push(totalPages);
        } else if (currentPage >= totalPages - 2) {
            pages.push(1);
            pages.push('...');
            for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            pages.push('...');
            pages.push(currentPage - 1);
            pages.push(currentPage);
            pages.push(currentPage + 1);
            pages.push('...');
            pages.push(totalPages);
        }
    }

    return pages.map(page => {
        if (page === '...') {
            return '<span style="padding: 6px 10px;">...</span>';
        }
        const isActive = page === currentPage;
        return `<button class="page-number ${isActive ? 'active' : ''}" data-page="${page}" style="padding: 6px 10px; border: 1px solid #e2e8f0; background: ${isActive ? '#3b82f6' : 'white'}; color: ${isActive ? 'white' : '#333'}; border-radius: 6px; cursor: pointer; min-width: 36px;">${page}</button>`;
    }).join('');
}

function handleFilterChange() {
    voucherState.filters.status = document.getElementById('filter-status')?.value || '';
    voucherState.filters.dateFrom = document.getElementById('filter-date-from')?.value || '';
    voucherState.filters.dateTo = document.getElementById('filter-date-to')?.value || '';
    voucherState.filters.clientSearch = document.getElementById('filter-client')?.value || '';
    voucherState.currentPage = 1; // Reset to first page when filters change
    renderActiveTab();
}

function handleFilterReset() {
    voucherState.filters = {
        status: '',
        dateFrom: '',
        dateTo: '',
        clientSearch: ''
    };
    voucherState.currentPage = 1;
    renderActiveTab();
}

function handlePageChange(newPage) {
    voucherState.currentPage = newPage;
    renderActiveTab();
}

function handlePageSizeChange(e) {
    voucherState.pageSize = parseInt(e.target.value);
    voucherState.currentPage = 1; // Reset to first page
    renderActiveTab();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- PRINT TAB ---
async function renderPrintList(container) {
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento Lotti...</div>';

    try {
        const { data: batches, error } = await supabase
            .from('voucher_batches')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = `
            <div class="app-container">
                <div class="page-header" style="text-align: center; margin-bottom: 30px;">
                    <h2 class="page-title" style="font-size: 1.8rem; color: #0f172a; margin-bottom: 10px;">
                        <i class="fas fa-ticket-alt" style="color: #3b82f6; margin-right: 10px;"></i>
                        Gestione Voucher V4 [DEBUG]
                    </h2>
                </div>
                
                <div class="table-responsive" style="overflow-x: auto; width: 100%;">
                    <table class="admin-table" style="width: 100%; min-width: 1000px; table-layout: fixed !important;">
                        <thead>
                            <tr>
                                <th style="width: 25%">Descrizione Lotto</th>
                                <th style="width: 20%">Data Creazione</th>
                                <th style="width: 20%">Scadenza</th>
                                <th style="width: 20%">Cliente</th>
                                <th style="width: 15%; text-align: right;">Comandi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${batches.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Nessun lotto trovato.</td></tr>' : ''}
                            ${batches.map(b => `
                                <tr>
                                    <td><strong>${escapeHtml(b.description)}</strong></td>
                                    <td>${formatDate(b.created_at)}</td>
                                    <td>${b.expiration_date ? formatDate(b.expiration_date) : '<span style="color:#9ca3af;">Illimitata</span>'}</td>
                                    <td>${b.customer_name ? `<span class="status-badge" style="background:#eff6ff; color:#1d4ed8; border:none;">${escapeHtml(b.customer_name)}</span>` : '-'}</td>
                                    <td style="text-align: right;">
                                        <div style="display: flex; justify-content: flex-end; gap: 8px; align-items: center;">
                                            <button class="action-btn primary btn-print-batch" data-id="${b.id}" title="Stampa Voucher" style="display: inline-flex; align-items: center; justify-content: center; width:32px; height:32px; padding:0; border:none; border-radius:8px; background:#3b82f6; color:white; cursor:pointer; transition:all 0.2s;">
                                                <i class="fas fa-print" style="font-size:14px;"></i>
                                            </button>
                                            <button class="action-btn warning btn-void-batch" data-id="${b.id}" title="Annulla/Blocca Lotto" style="display: inline-flex; align-items: center; justify-content: center; width:32px; height:32px; padding:0; border:none; border-radius:8px; background:#f59e0b; color:white; cursor:pointer; transition:all 0.2s;">
                                                <i class="fas fa-ban" style="font-size:14px;"></i>
                                            </button>
                                            <button class="action-btn danger btn-delete-batch" data-id="${b.id}" title="Elimina Lotto" style="display: inline-flex; align-items: center; justify-content: center; width:32px; height:32px; padding:0; border:none; border-radius:8px; background:#ef4444; color:white; cursor:pointer; transition:all 0.2s;">
                                                <i class="fas fa-trash" style="font-size:14px;"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div >
            `;

        // Bind Events
        container.querySelectorAll('.btn-print-batch').forEach(btn => {
            btn.addEventListener('click', () => openPrintView(btn.dataset.id));
        });

        container.querySelectorAll('.btn-void-batch').forEach(btn => {
            btn.addEventListener('click', () => handleVoidBatch(btn.dataset.id));
        });

        container.querySelectorAll('.btn-delete-batch').forEach(btn => {
            btn.addEventListener('click', () => handleDeleteBatch(btn.dataset.id));
        });

    } catch (err) {
        container.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
    }
}

async function handleVoidBatch(batchId) {
    if (!confirm("ATTENZIONE: Sei sicuro di voler annullare TUTTI i voucher di questo lotto? L'operazione renderà i buoni inutilizzabili.")) return;

    try {
        const { error } = await supabase
            .from('vouchers')
            .update({ status: 'void' })
            .eq('batch_id', batchId)
            .eq('status', 'active'); // Only void active ones

        if (error) throw error;
        Toast.show("Tutti i voucher del lotto sono stati annullati.", 'success');
        renderActiveTab();
    } catch (err) {
        console.error(err);
        Toast.show("Errore annullamento: " + err.message, 'error');
    }
}

async function handleDeleteBatch(batchId) {
    if (!confirm("PERICOLO: Sei sicuro di voler ELIMINARE definitivamente questo lotto e tutti i suoi voucher? I dati storici (se riscattati) andranno persi o corrotti. Procedi solo se sei sicuro.")) return;

    try {
        const { error } = await supabase
            .from('voucher_batches')
            .delete()
            .eq('id', batchId);

        if (error) throw error;
        Toast.show("Lotto eliminato correttamente.", 'success');
        renderActiveTab();
    } catch (err) {
        console.error(err);
        Toast.show("Errore eliminazione: " + err.message, 'error');
    }
}

async function openPrintView(batchId) {
    const container = document.getElementById('voucher-content');
    showLoadingMessage(container);

    try {
        const { data: vouchers, error } = await supabase
            .from('vouchers')
            .select('*')
            .eq('batch_id', batchId)
            .order('serial_number');

        if (error) throw error;

        // Restore list view
        renderActiveTab();

        // Open Print Window
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Attenzione: Il browser ha bloccato il popup. Autorizza i popup per stampare.');
            return;
        }

        // Call Pure CSS Generator
        generatePrintHtmlCSS(printWindow, vouchers);

    } catch (err) {
        console.error(err);
        alert("Errore recupero voucher: " + err.message);
        renderPrintList(container);
    }
}

async function generatePrintHtmlCSS(win, vouchers) {
    const logoUrl = 'assets/images/logo svg.svg';

    // Create the HTML content
    const html = `<!DOCTYPE html>
            <html>
                <head>
                    <title>Stampa Voucher Neofuel</title>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap');

                        @media print {
                            @page {margin: 0; size: A4; }
                        body {margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        .no-print {display: none !important; }
        }

                        body {
                            font-family: 'Inter', sans-serif;
                        background: #f3f4f6;
                        margin: 0;
                        padding: 20px;
        }

                        .page {
                            width: 210mm;
                        height: 297mm;
                        background: white;
                        margin: 0 auto 20px;
                        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                        padding: 15mm;
                        box-sizing: border-box;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        grid-template-rows: repeat(5, 1fr);
                        gap: 10mm;
                        page-break-after: always;
        }

                        .voucher-card {
                            border: 2px solid #e5e7eb;
                        border-radius: 16px;
                        position: relative;
                        background: white;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        break-inside: avoid;
        }

                        .voucher-header {
                            background: #0A2342;
                        color: white;
                        padding: 12px 16px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
        }

                        .brand-area {
                            display: flex;
                        align-items: center;
                        gap: 8px;
        }

                        .brand-logo {
                            height: 24px;
                        filter: brightness(0) invert(1);
        }

                        .brand-name {
                            font-weight: 700;
                        font-size: 14px;
                        letter-spacing: 0.5px;
        }

                        .voucher-body {
                            flex: 1;
                        padding: 16px;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        gap: 16px;
        }

                        .voucher-info {
                            flex: 1;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
        }

                        .amount-label {
                            font-size: 10px;
                        text-transform: uppercase;
                        color: #6b7280;
                        font-weight: 600;
                        letter-spacing: 1px;
        }

                        .amount-value {
                            font-size: 32px;
                        font-weight: 700;
                        color: #0A2342;
                        line-height: 1;
                        margin: 4px 0 12px;
        }

                        .code-box {
                            background: #f3f4f6;
                        padding: 6px 10px;
                        border-radius: 6px;
                        border: 1px dashed #d1d5db;
                        display: inline-block;
        }

                        .voucher-code {
                            font-family: 'JetBrains Mono', monospace;
                        font-size: 12px;
                        font-weight: 600;
                        color: #1f2937;
                        letter-spacing: 0.5px;
        }

                        .voucher-qr {
                            width: 80px;
                        height: 80px;
                        flex-shrink: 0;
                        background: white;
        }

                        .voucher-footer {
                            border-top: 1px solid #f3f4f6;
                        padding: 8px 16px;
                        font-size: 9px;
                        color: #6b7280;
                        display: flex;
                        justify-content: space-between;
                        background: #fafafa;
        }

                        .helper-text {
                            font-style: italic;
        }
                    </style>
                </head>
                <body>
                    <div class="no-print" style="position: fixed; top: 0; left: 0; right: 0; padding: 15px; background: #0A2342; color: white; text-align: center; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <button onclick="window.print()" style="padding: 10px 24px; font-size: 16px; font-weight: bold; cursor: pointer; background: #8DC63F; border: none; color: white; border-radius: 6px;">
                            <i class="fas fa-print"></i> Stampa Voucher
                        </button>
                        <span style="margin-left: 20px; font-size: 14px; opacity: 0.9;">Stampa su foglio A4 (10 voucher per pagina)</span>
                    </div>

                    <div id="pages-container" style="margin-top: 60px;"></div>

                    <script>
                        const vouchers = ${JSON.stringify(vouchers)};
                        const logoUrl = '${logoUrl}';

                        function renderVouchers() {
            const container = document.getElementById('pages-container');
                        const chunkSize = 10;
                        for (let i = 0; i < vouchers.length; i += chunkSize) {
                const chunk = vouchers.slice(i, i + chunkSize);
                        const page = document.createElement('div');
                        page.className = 'page';
                
                chunk.forEach(v => {
                    const card = document.createElement('div');
                        card.className = 'voucher-card';

                        card.innerHTML = \`
                        <div class="voucher-header">
                            <div class="brand-area">
                                <img src="\${logoUrl}" class="brand-logo" alt="Neofuel">
                                    <span class="brand-name">NEOFUEL</span>
                            </div>
                            <div style="font-size: 10px; opacity: 0.8; letter-spacing: 1px;">BUONO CARBURANTE</div>
                        </div>

                        <div class="voucher-body">
                            <div class="voucher-info">
                                <div class="amount-label">Valore Buono</div>
                                <div class="amount-value">€ \${parseFloat(v.amount).toFixed(2)}</div>

                                <div class="code-box">
                                    <div class="voucher-code">\${v.code}</div>
                                </div>
                            </div>

                            <div class="voucher-qr" id="qr-\${v.id}"></div>
                        </div>

                        <div class="voucher-footer">
                            <div class="expiry">Scadenza: <strong>\${v.expiration_date ? v.expiration_date.split('-').reverse().join('/') : 'Illimitata'}</strong></div>
                            <div class="helper-text">Presentare alla cassa</div>
                        </div>
                        \`;
                        page.appendChild(card);

                    // Generate QR
                    setTimeout(() => {
                            new QRCode(document.getElementById('qr-' + v.id), {
                                text: v.code,
                                width: 80,
                                height: 80,
                                colorDark: "#0A2342",
                                colorLight: "#ffffff",
                                correctLevel: QRCode.CorrectLevel.H
                            });
                    }, 50);
                });

                        container.appendChild(page);
            }
        }

                        // Wait for resources
                        window.onload = renderVouchers;
                    </script>
                </body>
            </html>
        `;

    win.document.write(html);
    win.document.close();
}
