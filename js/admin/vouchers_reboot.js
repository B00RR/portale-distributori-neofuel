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
        <div class="menu-card" style="max-width: 900px; margin: 40px auto; padding: 50px; border-radius: 20px; box-shadow: var(--shadow-md);">
            <div style="text-align: center; margin-bottom: 50px;">
                <h3 style="font-size: 2rem; margin-bottom: 12px; color: var(--primary-color);">Crea Nuovi Voucher</h3>
                <p class="section-subtitle" style="font-size: 1.2rem; color: var(--text-secondary);">Compila i dati per generare e stampare un nuovo lotto.</p>
            </div>
            
            <form id="voucher-generator-form" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px;">
                
                <!-- Row 1: Metrics -->
                <div class="form-field">
                    <label style="font-weight: 600; margin-bottom: 10px; display: block; color: var(--text-main); font-size: 1.05rem;">Valore (€)</label>
                    <div class="input-with-prefix" style="display: flex; align-items: center; border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; background: #f8fafc; transition: border 0.2s;">
                        <span class="input-prefix" style="padding: 16px 20px; background: #e2e8f0; color: #64748b; font-weight: 600; font-size: 1.1rem;">€</span>
                        <input type="number" name="amount" step="0.50" min="0.50" required placeholder="0.00" style="border: none; padding: 16px; width: 100%; outline: none; font-size: 1.2rem; background: transparent;">
                    </div>
                </div>

                <div class="form-field">
                    <label style="font-weight: 600; margin-bottom: 10px; display: block; color: var(--text-main); font-size: 1.05rem;">Quantità</label>
                    <input type="number" name="quantity" class="form-input" min="1" max="100" value="10" required style="width: 100%; padding: 16px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1.2rem;">
                </div>

                <div class="form-field">
                    <label style="font-weight: 600; margin-bottom: 10px; display: block; color: var(--text-main); font-size: 1.05rem;">Scadenza</label>
                    <input type="date" name="expiration_date" class="form-input" value="${nextYearStr}" min="${today}" style="width: 100%; padding: 18px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1.3rem; color: #334155;">
                </div>

                <!-- Row 2: Customer (Full Width) -->
                <div class="form-field" style="grid-column: 1 / -1;">
                    <label style="font-weight: 600; margin-bottom: 10px; display: block; color: var(--text-main); font-size: 1.05rem;">Assegna a Cliente (Opzionale)</label>
                    <input type="text" name="customer_name" class="form-input" list="customer-list" placeholder="Cerca o inserisci nuovo cliente..." style="width: 100%; padding: 16px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1.1rem;">
                    <datalist id="customer-list">
                        ${voucherState.customers.map(c => `<option value="${escapeHtml(c.cliente)}">`).join('')}
                    </datalist>
                </div>

                <!-- Row 3: Action Button -->
                <div class="form-actions" style="grid-column: 1 / -1; margin-top: 30px;">
                    <button type="submit" class="menu-button primary" style="width: 100%; padding: 20px; font-size: 1.25rem; font-weight: 600; border-radius: 14px; display: flex; justify-content: center; align-items: center; gap: 12px; background: var(--primary-color); color: white; border: none; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-md);">
                        <i class="fas fa-magic"></i> Genera Voucher ORA
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

        // Calculate stats per batch AND global monetary stats
        const batchStats = {};
        let globalRedeemedValue = 0;
        let globalCirculatingValue = 0;

        allVouchers.forEach(v => {
            if (!batchStats[v.batch_id]) {
                batchStats[v.batch_id] = { totalAmount: 0, redeemedAmount: 0, totalCount: 0, redeemedCount: 0, activeCount: 0, voidCount: 0 };
            }
            batchStats[v.batch_id].totalAmount += v.amount;
            batchStats[v.batch_id].totalCount++;

            if (v.status === 'redeemed') {
                batchStats[v.batch_id].redeemedCount++;
                batchStats[v.batch_id].redeemedAmount += v.amount;
                globalRedeemedValue += v.amount;
            } else if (v.status === 'active') {
                batchStats[v.batch_id].activeCount++;
                globalCirculatingValue += v.amount;
            } else if (v.status === 'void') {
                batchStats[v.batch_id].voidCount++;
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
                    /* CSS VARIABLES FOR COLUMN WIDTHS */
                    --col-1: 150px;
                    --col-2: minmax(200px, 1fr);
                    --col-3: 160px; /* Wider to fix overlap */
                    --col-4: 90px;
                    --col-5: 90px;
                    --col-6: 110px;
                    --col-7: 160px;
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
                    /* Revised Columns: Use variables */
                    grid-template-columns: var(--col-1) var(--col-2) var(--col-3) var(--col-4) var(--col-5) var(--col-6) var(--col-7);
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
                    position: relative; /* For resizer */
                }
                .resizer {
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 4px;
                    height: 100%;
                    cursor: col-resize;
                    user-select: none;
                    background: transparent;
                    z-index: 10;
                }
                .resizer:hover, .resizing {
                    background: #3b82f6; /* Blue highlight on hover/drag */
                }
                .voucher-header-cell:last-child {
                    border-right: none;
                }
                .voucher-grid-row {
                    display: grid;
                     grid-template-columns: var(--col-1) var(--col-2) var(--col-3) var(--col-4) var(--col-5) var(--col-6) var(--col-7);
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
                        grid-template-columns: minmax(130px, 1fr) minmax(180px, 1fr) 120px 80px 80px 100px 150px;
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
                            <div class="voucher-header-cell">Cliente</div>
                            <div class="voucher-header-cell">Lotto</div>
                            <div class="voucher-header-cell">Importo Tot. / Res.</div>
                            <div class="voucher-header-cell center">Disp. / Risc.</div>
                            <div class="voucher-header-cell center">Stato</div>
                            <div class="voucher-header-cell">Scadenza</div>
                            <div class="voucher-header-cell center">Opzioni</div>
                        </div>

                        <!-- ROWS -->
                        ${batches.map(b => {
            const stats = batchStats[b.id] || { totalVouchers: 0, redeemedCount: 0, activeCount: 0, voidCount: 0, totalAmount: 0, redeemedAmount: 0 };
            const residualAmount = stats.totalAmount - stats.redeemedAmount;
            const isExpired = b.expiration_date && new Date(b.expiration_date) < new Date();

            let statusLabel = 'Attivo';
            let statusClass = 'badge-success';

            if (stats.voidCount === stats.totalCount && stats.totalCount > 0) {
                statusLabel = 'Bloccato';
                statusClass = 'badge-danger';
            } else if (stats.redeemedCount === stats.totalCount && stats.totalCount > 0) {
                statusLabel = 'Riscattato';
                statusClass = 'badge-secondary';
            } else if (isExpired) {
                statusLabel = 'Scaduto';
                statusClass = 'badge-danger';
            } else if (stats.activeCount === 0 && stats.totalCount > 0) {
                // Fallback likely not needed if logic is correct, but effectively exhausted/redeemed
                statusLabel = 'Riscattato';
                statusClass = 'badge-secondary';
            }

            // Lotto Column Content: e.g. "10 / 50€"
            // We need to infer single voucher amount. 
            // Assumption: All vouchers in batch have same amount.
            // stats.totalAmount / stats.totalCount = single amount
            const singleAmount = stats.totalCount > 0 ? (stats.totalAmount / stats.totalCount) : 0;
            const lottoStr = `${stats.totalCount} / ${formatEuro(singleAmount)}`;

            return `
                            <div class="voucher-grid-row">
                                <div class="voucher-cell">
                                    <div style="color: #334155; font-weight: 500;">${b.customer_name || '-'}</div>
                                </div>
                                <div class="voucher-cell">
                                    <div style="width:100%">
                                        <div style="font-weight: 500;">${lottoStr}</div>
                                        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">ID: ${b.id.substring(0, 8)}...</div>
                                    </div>
                                </div>
                                <div class="voucher-cell">
                                    <div style="width:100%">
                                        <div style="font-weight: 600;">${formatEuro(stats.totalAmount)}</div>
                                        <div style="font-size: 0.8em; color: ${residualAmount > 0 ? '#10b981' : '#94a3b8'};">Res: ${formatEuro(residualAmount)}</div>
                                    </div>
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
                                <div class="voucher-cell center" style="flex-shrink: 0; min-width: 150px;">
                                    <div style="display: flex; gap: 6px; flex-wrap: nowrap; justify-content: center;">
                                        <button class="action-btn-primary-${b.id}" data-action="print" data-batch-id="${b.id}" title="Stampa" 
                                            style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; background: #3b82f6; color: white; cursor: pointer; transition: all 0.2s; flex-shrink: 0;">
                                            <i class="fas fa-print" style="font-size: 12px;"></i>
                                        </button>
                                        <button class="action-btn-info-${b.id}" data-action="details" data-batch-id="${b.id}" title="Dettaglio" 
                                            style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; background: #0ea5e9; color: white; cursor: pointer; transition: all 0.2s; flex-shrink: 0;">
                                            <i class="fas fa-list" style="font-size: 12px;"></i>
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
            </div>

            <section class="dashboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 30px; width: 100%; max-width: 100%;">
                
                <!-- PRIMARY: Total Issued -->
                <article class="kpi-card" style="border-top-color: var(--primary-color);">
                    <div class="kpi-row">
                        <div class="kpi-icon" style="color: var(--primary-color); background: rgba(10, 35, 66, 0.08);"><i class="fas fa-ticket-alt"></i></div>
                    </div>
                    <p class="kpi-title">Totale Emessi</p>
                    <p class="kpi-value">${totalGen || 0}</p>
                    <p class="kpi-sub">Voucher generati</p>
                </article>
                
                <!-- SUCCESS: Redeemed -->
                <article class="kpi-card" style="border-top-color: var(--success-color);">
                    <div class="kpi-row">
                        <div class="kpi-icon" style="color: var(--success-color); background: rgba(16, 185, 129, 0.1);"><i class="fas fa-check-circle"></i></div>
                    </div>
                    <p class="kpi-title">Riscattati</p>
                    <p class="kpi-value">${totalRedeemed || 0}</p>
                    <p class="kpi-sub">Utilizzati con successo</p>
                </article>

                <!-- WARNING: Active -->
                <article class="kpi-card" style="border-top-color: var(--warning-color);">
                    <div class="kpi-row">
                        <div class="kpi-icon" style="color: var(--warning-color); background: rgba(245, 158, 11, 0.1);"><i class="fas fa-clock"></i></div>
                    </div>
                    <p class="kpi-title">Attivi</p>
                    <p class="kpi-value">${totalActive || 0}</p>
                    <p class="kpi-sub">In circolazione</p>
                </article>

                <!-- VALUE: Monetary Stats -->
                <article class="kpi-card" style="border-top-color: var(--text-secondary);">
                    <div class="kpi-row">
                        <div class="kpi-icon" style="color: var(--text-main); background: rgba(0, 0, 0, 0.05);"><i class="fas fa-euro-sign"></i></div>
                    </div>
                    <p class="kpi-title">Valore Totale</p>
                    <div class="kpi-value" style="font-size: 1.25rem; display: flex; flex-direction: column; gap: 2px; font-weight: 600;">
                        <span style="color: var(--success-color); font-size: 0.9em;">Riscattato: ${formatEuro(globalRedeemedValue)}</span>
                        <span style="color: var(--warning-color); font-size: 0.9em;">Attivo: ${formatEuro(globalCirculatingValue)}</span>
                    </div>
                    <p class="kpi-sub">Controvalore Economico</p>
                </article>
            </section>

            <div class="menu-card" style="padding: 0; background: transparent; box-shadow: none; max-width: 100%; overflow: hidden;">
                ${tableHtml}
            </div>
        `;



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
                case 'details':
                    showBatchDetails(batchId);
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
                showBatchDetails,
                handleDeleteBatch
            };
        }

        // Initialize Column Resizing
        setupColumnResizing(container.querySelector('.voucher-list-container'));

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

// --- COLUMN RESIZING UTILS ---
function setupColumnResizing(table) {
    if (!table) return;

    // LOAD SAVED WIDTHS
    try {
        const saved = localStorage.getItem('voucher_table_widths');
        if (saved) {
            const widths = JSON.parse(saved);
            Object.keys(widths).forEach(key => {
                table.style.setProperty(`--col-${key}`, widths[key]);
            });
        }
    } catch (e) {
        console.error("Failed to load column widths", e);
    }

    const headers = table.querySelectorAll('.voucher-grid-header .voucher-header-cell');

    // We only attach resizers to columns 1 through N-1.
    // Index is 0-based.
    headers.forEach((header, index) => {
        if (index === headers.length - 1) return; // No resizer on last col

        const resizer = document.createElement('div');
        resizer.classList.add('resizer');
        header.appendChild(resizer);
        createResizableColumn(header, resizer, index + 1, table);
    });
}

function createResizableColumn(col, resizer, colIndex, table) {
    let x = 0;
    let w = 0;

    const mouseDownHandler = function (e) {
        x = e.clientX;

        // Get current computed width
        // Careful: minmax(200px, 1fr) computes to pixel value in getComputedStyle, but we need to set explicit px to override it effectively during resize.
        const styles = window.getComputedStyle(table);
        // Try getting variable directly first? No, get variable string.
        // We need computed pixel width of the *grid cell*? 
        // No, we are setting property on container.

        // Better approach: Get current width of the HEADER CELL itself.
        w = col.getBoundingClientRect().width;

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = function (e) {
        const dx = e.clientX - x;
        const newWidth = w + dx;
        if (newWidth > 50) { // Minimum width constraint
            table.style.setProperty(`--col-${colIndex}`, `${newWidth}px`);
        }
    };

    const mouseUpHandler = function () {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        resizer.classList.remove('resizing');

        // SAVE WIDTHS
        try {
            const widths = {};
            // Iterate cols 1 to 7 (or however many we have resizable)
            // Just scan inline styles.
            // Or better: Iterate known columns 1 to 6.
            for (let i = 1; i <= 6; i++) {
                const val = table.style.getPropertyValue(`--col-${i}`);
                if (val) widths[i] = val;
            }
            localStorage.setItem('voucher_table_widths', JSON.stringify(widths));
        } catch (e) {
            console.error("Failed to save column widths", e);
        }
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
}

async function showBatchDetails(batchId) {
    openModal('Dettaglio Lotto Voucher');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento dettagli...</div>';

    try {
        const { data: vouchers, error } = await supabase
            .from('vouchers')
            .select('*')
            .eq('batch_id', batchId)
            .order('serial_number');

        if (error) throw error;

        const { data: batch } = await supabase
            .from('voucher_batches')
            .select('description')
            .eq('id', batchId)
            .single();

        modalBody.innerHTML = `
            <div style="padding: 10px;">
                <h3 style="margin-bottom: 20px;">${escapeHtml(batch?.description || 'Dettaglio Lotto')}</h3>
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <table class="admin-table" style="width: 100%; border-collapse: collapse;">
                        <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 1;">
                            <tr>
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: left;">S/N</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: left;">Codice</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: center;">Stato</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: left;">Data Riscatto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vouchers.map(v => {
            const isRedeemed = v.status === 'redeemed';
            return `
                                    <tr style="background: ${isRedeemed ? '#f1f5f9' : 'white'}; border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 12px; font-weight: 500;">#${v.serial_number}</td>
                                        <td style="padding: 12px; font-family: monospace; font-size: 1.1em;">${v.code}</td>
                                        <td style="padding: 12px; text-align: center;">
                                            ${isRedeemed
                    ? '<span class="badge badge-secondary"><i class="fas fa-check"></i> Riscattato</span>'
                    : '<span class="badge badge-success">Attivo</span>'}
                                        </td>
                                        <td style="padding: 12px; color: #64748b; font-size: 0.9rem;">
                                            ${v.redeemed_at ? formatDate(v.redeemed_at) : '-'}
                                        </td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 20px; text-align: right;">
                    <button class="menu-button primary" id="btn-close-details">Chiudi</button>
                </div>
            </div>
        `;

        document.getElementById('btn-close-details').addEventListener('click', () => closeModal());

    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<div class="alert alert-danger">Errore caricamento: ${err.message}</div>`;
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
    // Paths to user templates
    const frontBg = 'assets/templates/template_voucher_pagina 1.jpg';
    const backBg = 'assets/templates/template_voucher_pagina 2.jpg';

    // Create the HTML content
    const html = `<!DOCTYPE html>
            <html>
                <head>
                    <title>Stampa Voucher Neofuel</title>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500&family=Oswald:wght@700&display=swap');

                        @media print {
                            @page { margin: 0; size: A4; }
                            body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .no-print { display: none !important; }
                        }

                        body {
                            font-family: 'Inter', sans-serif;
                            background: #f3f4f6;
                            margin: 0;
                            padding: 20px;
                        }

                        /* Page Container - A4 */
                        .page {
                            width: 210mm;
                            height: 297mm;
                            background: white;
                            margin: 0 auto 20px;
                            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                            padding: 0; 
                            box-sizing: border-box;
                            display: block; /* Block layout for single item */
                            page-break-after: always;
                            position: relative;
                            background-size: 100% 100%;
                            background-repeat: no-repeat;
                        }

                        .page-front {
                            background-image: url('${frontBg}');
                        }

                        .page-back {
                            background-image: url('${backBg}');
                        }

                        /* FRONT Styles */
                        .voucher-front {
                            width: 100%;
                            height: 100%;
                            background: transparent; 
                            position: relative;
                        }

                        /* DATA POSITIONS (Relative to full A4 Page) */
                        .voucher-amount {
                            position: absolute;
                            top: 30.6%; /* Centered precisely */
                            left: 0;
                            width: 100%;
                            text-align: center;
                            font-family: 'Oswald', sans-serif; 
                            font-size: 56px; 
                            font-weight: 700;
                            color: #000000; 
                            z-index: 10;
                            letter-spacing: 2px;
                            text-transform: uppercase; 
                            /* STICKER EFFECT: 1px White Border + 5px Blue Shadow */
                            text-shadow: 
                                -1px -1px 0 #fff,  
                                 1px -1px 0 #fff,
                                -1px  1px 0 #fff,
                                 1px  1px 0 #fff,
                                 5px  5px 0 #6CADDF;
                        }

                        .qr-code {
                            position: absolute;
                            top: 38%; /* Moved UP slightly */
                            left: 0; 
                            right: 0;
                            margin: auto;
                            width: 160px;
                            height: 160px;
                            z-index: 10;
                        }
                        
                        .qr-code img {
                            width: 100%;
                            height: 100%;
                        }

                        .voucher-code {
                            position: absolute;
                            top: 54.2%;
                            left: 43.5%; /* Moved Left slightly */
                            font-family: 'JetBrains Mono', monospace;
                            font-size: 22px; 
                            font-weight: bold;
                            color: #333;
                            letter-spacing: 2px;
                        }

                        .voucher-expiry {
                            position: absolute;
                            top: 58%; 
                            left: 0;
                            width: 100%;
                            text-align: center; 
                            font-size: 26px; 
                            font-weight: bold;
                            color: #333;
                        }

                    </style>
                </head>
                <body>
                    <div id="print-container"></div>
                    <script>
                        const vouchers = ${JSON.stringify(vouchers)};
                        const container = document.getElementById('print-container');
                        
                        // 1 Voucher per Page (Full A4)
                        const chunkSize = 1;
                        for (let i = 0; i < vouchers.length; i += chunkSize) {
                            const chunk = vouchers.slice(i, i + chunkSize);
                            
                            // --- FRONT PAGE ---
                            const pageFront = document.createElement('div');
                            pageFront.className = 'page page-front'; 
                            
                            chunk.forEach(v => {
                                const date = v.expiration_date ? new Date(v.expiration_date).toLocaleDateString('it-IT') : 'Illimitata';
                                // Format amount: No decimals, "euro" suffix
                                const amount = Math.floor(v.amount) + ' euro';
                                const visibleCode = v.code.substring(0, 4); 

                                const content = document.createElement('div');
                                content.className = 'voucher-front';
                                content.innerHTML = \`
                                    <div class="voucher-amount">\${amount}</div>
                                    <div class="voucher-code">\${visibleCode}</div>
                                    <div class="voucher-expiry">\${date}</div>
                                    <div id="qr-\${v.code}" class="qr-code"></div>
                                \`;
                                pageFront.appendChild(content);
                            });
                            
                            container.appendChild(pageFront);

                            // --- BACK PAGE --- 
                            const pageBack = document.createElement('div');
                            pageBack.className = 'page page-back'; 
                            // Empty back page
                            container.appendChild(pageBack);

                            // QR Gen
                            chunk.forEach(v => {
                                new QRCode(document.getElementById('qr-' + v.code), {
                                    text: v.code,
                                    width: 128,
                                    height: 128,
                                    colorDark : "#000000",
                                    colorLight : "#ffffff",
                                    correctLevel : QRCode.CorrectLevel.H
                                });
                            });
                        }
                    </script>
                </body>
            </html>`;

    win.document.write(html);
    win.document.close();
}
