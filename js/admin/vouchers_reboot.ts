/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, showInfoModal, openModal, closeModal, openConfirmModal } from '../ui/ui.js';
import { escapeHtml, formatEuro, formatDate } from '../utils/utils.js';

// --- INTERFACES ---

interface VoucherBatch {
    id: string;
    description: string;
    customer_name: string | null;
    expiration_date: string | null;
    created_at: string;
}

interface Voucher {
    id: number | string;
    batch_id: string;
    code: string;
    amount: number;
    status: 'active' | 'redeemed' | 'expired' | 'void';
    expiration_date: string | null;
    created_at: string;
    redeemed_at: string | null;
    serial_number: number;
}

interface Customer {
    id: number;
    cliente: string;
}

interface VoucherFilters {
    status: string;
    dateFrom: string;
    dateTo: string;
    clientSearch: string;
}

interface VoucherState {
    batches: VoucherBatch[];
    customers: Customer[];
    activeTab: 'generator' | 'dashboard';
    dashboardView: 'batches' | 'vouchers';
    currentPage: number;
    pageSize: number;
    totalCount: number;
    filters: VoucherFilters;
}

interface BatchStats {
    totalCount: number;
    redeemedCount: number;
    activeCount: number;
    voidCount: number;
    totalAmount: number;
    redeemedAmount: number;
}

interface CustomWindow extends Window {
    voucherActions?: {
        openPrintView: (batchId: string) => void;
        showBatchDetails: (batchId: string) => void;
        handleDeleteBatch: (batchId: string) => void;
    };
}

declare const window: CustomWindow;

// --- STATE ---
const voucherState: VoucherState = {
  batches: [],
  customers: [],
  activeTab: 'generator',
  dashboardView: 'batches',
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
export async function showVoucherAdminTab(container: HTMLElement, _headerActions?: HTMLElement | null): Promise<void> {
  console.log('[APP] showVoucherAdminTab called. activeTab:', voucherState.activeTab);

  // Initial structure rendering (Shell)
  // We only re-render the full container if it's the first time or if forced
  const isAlreadyRendered = container.querySelector('[data-testid="voucher-admin-panel"]');

  if (!isAlreadyRendered) {
    container.innerHTML = `
            <div class="app-container" data-testid="voucher-admin-panel" style="max-width: 100%; overflow-x: hidden; box-sizing: border-box;">
                <div class="top-bar-title">
                    <h2><i class="fas fa-ticket-alt"></i> Gestione Voucher V3</h2>
                </div>
                
                <!-- TABS -->
                <div class="tabs-container" id="voucher-tabs" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; max-width: 100%;">
                    <!-- Buttons injected dynamically to handle active state -->
                </div>
                
                <div id="voucher-content" class="tab-content" style="background: #fff; padding: 1.5rem; border-radius: 16px; border: 1px solid #e2e8f0; max-width: 100%; overflow-x: hidden; box-sizing: border-box;">
                    <!-- Content injected here -->
                </div>
            </div>
        `;

    // Bind Tabs ONCE using Delegation on the permanent tabs container
    const tabsContainer = document.getElementById('voucher-tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.menu-button[data-tab]');
        if (!btn) {return;}

        const tabId = (btn as HTMLElement).dataset.tab as 'generator' | 'dashboard';
        if (!tabId || tabId === voucherState.activeTab) {return;}

        voucherState.activeTab = tabId;
        updateTabButtons();
        renderActiveTab();
      });
    }

    // Single Listener for offline sync
    window.removeEventListener('offline-sync-complete', syncHandler);
    window.addEventListener('offline-sync-complete', syncHandler);
  }

  // Always update buttons to reflect active state
  updateTabButtons();

  // Load dependencies and render content
  await loadCustomers();
  renderActiveTab();
}

function updateTabButtons(): void {
  const tabsContainer = document.getElementById('voucher-tabs');
  if (!tabsContainer) {return;}

  tabsContainer.innerHTML = `
        <button class="menu-button ${voucherState.activeTab === 'generator' ? 'primary' : 'outline'}" data-tab="generator" style="flex: 1 1 200px; padding: 20px; border-radius: 12px; height: auto; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-plus-circle"></i> Genera
            </div>
            <div style="font-size: 0.85rem; opacity: 0.8;">Crea nuovi buoni</div>
        </button>
        
        <button class="menu-button ${voucherState.activeTab === 'dashboard' ? 'primary' : 'outline'}" data-tab="dashboard" style="flex: 1 1 200px; padding: 20px; border-radius: 12px; height: auto; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-chart-line"></i> Dashboard
            </div>
            <div style="font-size: 0.85rem; opacity: 0.8;">Statistiche e liste</div>
        </button>
    `;
}

// Global reference for the sync handler to allow removal
const syncHandler = () => {
  if (voucherState.activeTab === 'dashboard') {
    Toast.show('Dati aggiornati dopo sincronizzazione', 'info');
    renderActiveTab();
  }
};

async function loadCustomers(): Promise<void> {
  try {
    // Fetch active customers for the dropdown
    const { data, error } = await supabase
      .from('crediti_clienti')
      .select('id, cliente')
      .order('cliente');

    if (error) { throw error; }
    voucherState.customers = (data as Customer[]) || [];
  } catch (err) {
    console.error('Error loading customers:', err);
    Toast.show('Errore caricamento clienti', 'error');
  }
}

async function renderActiveTab(): Promise<void> {
  const content = document.getElementById('voucher-content');
  if (!content) { return; }

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
function renderGenerator(container: HTMLElement): void {
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

                <div class="form-actions" style="grid-column: 1 / -1; margin-top: 30px;">
                    <button type="submit" class="menu-button primary" style="width: 100%; padding: 20px; font-size: 1.25rem; font-weight: 600; border-radius: 14px; display: flex; justify-content: center; align-items: center; gap: 12px;">
                        <i class="fas fa-magic"></i> Genera Voucher ORA
                    </button>
                </div>
            </form>
        </div>
    `;

  document.getElementById('voucher-generator-form')?.addEventListener('submit', handleGeneration);
}

async function handleGeneration(e: Event): Promise<void> {
  e.preventDefault();
  const target = e.target as HTMLFormElement;
  const formData = new FormData(target);
  const amount = parseFloat(formData.get('amount')?.toString() || '0');
  const customer = formData.get('customer_name')?.toString() || '';
  const expiration = formData.get('expiration_date')?.toString() || '';
  const quantity = parseInt(formData.get('quantity')?.toString() || '0');

  if (!amount || quantity < 1) { return; }

  const confirmed = await openConfirmModal(`Confermi la generazione di ${quantity} voucher da ${formatEuro(amount)} ciascuno?\nTotale Valore Nominale: ${formatEuro(amount * quantity)}`);
  if (!confirmed) {
    return;
  }

  const content = document.getElementById('voucher-content');
  if (content) {showLoadingMessage(content);}

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

    if (batchError || !batch) { throw batchError || new Error('Failed to create batch'); }

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

    if (vouchersError) { throw vouchersError; }

    Toast.show('Voucher generati con successo!', 'success');

    // Redirect to Print Tab
    voucherState.activeTab = 'dashboard';
    voucherState.dashboardView = 'batches';
    updateTabButtons();
    renderActiveTab();

  } catch (err: any) {
    console.error(err);
    const content = document.getElementById('voucher-content');
    if (content) {renderGenerator(content);} // Reset UI
    Toast.show('Errore Generazione: ' + (err.message || ''), 'error');
  }
}

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let result = '';
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) { result += '-'; }
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result; // e.g. A4K9-XP3M-9L2N
}

// --- DASHBOARD TAB ---
async function renderDashboard(container: HTMLElement): Promise<void> {
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

    if (batchError) { throw batchError; }

    // Fetch aggregation data (all vouchers) needed for stats
    const { data: allVouchers, error: vouchersError } = await supabase
      .from('vouchers')
      .select('batch_id, status, amount');

    if (vouchersError) { throw vouchersError; }

    // Calculate stats per batch AND global monetary stats
    const batchStats: Record<string, BatchStats> = {};
    let globalRedeemedValue = 0;
    let globalCirculatingValue = 0;

    (allVouchers as Voucher[]).forEach(v => {
      let stats = batchStats[v.batch_id];
      if (!stats) {
        stats = { totalAmount: 0, redeemedAmount: 0, totalCount: 0, redeemedCount: 0, activeCount: 0, voidCount: 0 };
        batchStats[v.batch_id] = stats;
      }
      stats.totalAmount += v.amount;
      stats.totalCount++;

      if (v.status === 'redeemed') {
        stats.redeemedCount++;
        stats.redeemedAmount += v.amount;
        globalRedeemedValue += v.amount;
      } else if (v.status === 'active') {
        stats.activeCount++;
        globalCirculatingValue += v.amount;
      } else if (v.status === 'void') {
        stats.voidCount++;
      }
    });

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
                        ${(batches as VoucherBatch[]).map(b => {
    const stats = batchStats[b.id] || { totalCount: 0, redeemedCount: 0, activeCount: 0, voidCount: 0, totalAmount: 0, redeemedAmount: 0 };
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
      statusLabel = 'Riscattato';
      statusClass = 'badge-secondary';
    }

    const singleAmount = stats.totalCount > 0 ? (stats.totalAmount / stats.totalCount) : 0;
    const lottoStr = `${stats.totalCount} / ${formatEuro(singleAmount)}`;

    return `
                            <div class="voucher-grid-row">
                                <div class="voucher-cell">
                                    <div style="color: #334155; font-weight: 500;">${escapeHtml(b.customer_name || '-')}</div>
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
                                        <button class="menu-button primary action-btn-primary-${b.id}" data-action="print" data-batch-id="${b.id}" title="Stampa" 
                                            style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; min-width: auto; margin: 0;">
                                            <i class="fas fa-print" style="font-size: 14px;"></i>
                                        </button>
                                        <button class="menu-button success action-btn-info-${b.id}" data-action="details" data-batch-id="${b.id}" title="Dettaglio" 
                                            style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; min-width: auto; margin: 0;">
                                            <i class="fas fa-list" style="font-size: 14px;"></i>
                                        </button>
                                        <button class="menu-button danger action-btn-danger-${b.id}" data-action="delete" data-batch-id="${b.id}" title="Elimina" 
                                            style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; min-width: auto; margin: 0;">
                                            <i class="fas fa-trash" style="font-size: 14px;"></i>
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
                <button id="refresh-dashboard-btn" class="menu-button primary" style="display: flex; align-items: center; gap: 8px; padding: 10px 20px; font-size: 0.95rem;">
                    <i class="fas fa-sync-alt"></i> Aggiorna
                </button>
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
      const btn = (e.target as HTMLElement).closest('[data-action]');
      if (!btn) { return; }

      const action = (btn as HTMLElement).dataset.action;
      const batchId = (btn as HTMLElement).dataset.batchId;

      if (!batchId) { return; }

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

    // Global Actions Exposed
    if (!window.voucherActions) {
      window.voucherActions = {
        openPrintView,
        showBatchDetails,
        handleDeleteBatch
      };
    }

    // Initialize Column Resizing
    setupColumnResizing(container.querySelector('.voucher-list-container') as HTMLElement);

    // Bind Refresh Button
    const refreshBtn = document.getElementById('refresh-dashboard-btn') as HTMLButtonElement | null;
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        const icon = refreshBtn.querySelector('i');
        if (icon) {icon.classList.add('fa-spin');}
        refreshBtn.disabled = true;

        try {
          await renderDashboard(container);
          Toast.show('Dashboard aggiornata', 'success');
        } catch (error) {
          Toast.show('Errore durante l\'aggiornamento', 'error');
          console.error(error);
        } finally {
          if (icon) {icon.classList.remove('fa-spin');}
          refreshBtn.disabled = false;
        }
      });
    }

  } catch (err: any) {
    container.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
    console.error(err);
  }
}

// --- COLUMN RESIZING UTILS ---
function setupColumnResizing(table: HTMLElement | null): void {
  if (!table) { return; }

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
    console.error('Failed to load column widths', e);
  }

  const headers = table.querySelectorAll('.voucher-grid-header .voucher-header-cell');

  headers.forEach((header, index) => {
    if (index === headers.length - 1) { return; }

    const resizer = document.createElement('div');
    resizer.classList.add('resizer');
    header.appendChild(resizer);
    createResizableColumn(header as HTMLElement, resizer, index + 1, table);
  });
}

function createResizableColumn(col: HTMLElement, resizer: HTMLElement, colIndex: number, table: HTMLElement): void {
  let x = 0;
  let w = 0;

  const mouseMoveHandler = function (e: MouseEvent): void {
    const dx = e.clientX - x;
    const newWidth = w + dx;
    if (newWidth > 50) {
      table.style.setProperty(`--col-${colIndex}`, `${newWidth}px`);
    }
  };

  const mouseUpHandler = function (): void {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    resizer.classList.remove('resizing');

    // SAVE WIDTHS
    try {
      const widths: Record<string, string> = {};
      for (let i = 1; i <= 6; i++) {
        const val = table.style.getPropertyValue(`--col-${i}`);
        if (val) { widths[i] = val; }
      }
      localStorage.setItem('voucher_table_widths', JSON.stringify(widths));
    } catch (e) {
      console.error('Failed to save column widths', e);
    }
  };

  const mouseDownHandler = function (e: MouseEvent): void {
    x = e.clientX;
    w = col.getBoundingClientRect().width;

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
    resizer.classList.add('resizing');
  };

  resizer.addEventListener('mousedown', mouseDownHandler);
}

async function showBatchDetails(batchId: string): Promise<void> {
  openModal('Dettaglio Lotto Voucher');
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {return;}

  modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento dettagli...</div>';

  try {
    const { data: vouchers, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('batch_id', batchId)
      .order('serial_number');

    if (error) { throw error; }

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
                            ${(vouchers as Voucher[]).map(v => {
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

    document.getElementById('btn-close-details')?.addEventListener('click', () => closeModal());

  } catch (err: any) {
    console.error(err);
    modalBody.innerHTML = `<div class="alert alert-danger">Errore caricamento: ${err.message}</div>`;
  }
}

async function handleDeleteBatch(batchId: string): Promise<void> {
  const confirmed = await openConfirmModal('PERICOLO: Sei sicuro di voler ELIMINARE definitivamente questo lotto e tutti i suoi voucher? I dati storici (se riscattati) andranno persi o corrotti. Procedi solo se sei sicuro.');
  if (!confirmed) { return; }

  try {
    const { error } = await supabase
      .from('voucher_batches')
      .delete()
      .eq('id', batchId);

    if (error) { throw error; }
    Toast.show('Lotto eliminato correttamente.', 'success');
    renderActiveTab();
  } catch (err: any) {
    console.error(err);
    Toast.show('Errore eliminazione: ' + err.message, 'error');
  }
}



export async function openPrintView(batchId: string | undefined): Promise<void> {
  if (!batchId) {return;}

  // 1. OPEN WINDOW IMMEDIATELY (Synchronous) to bypass Popup Blocker
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showInfoModal('Attenzione: Il browser ha bloccato il popup. Autorizza i popup per stampare.', 'Stampa Bloccata');
    return;
  }

  // 2. Show Loading State in the new window
  printWindow.document.write('<html><head><title>Caricamento...</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Generazione Voucher in corso...</h2><p>Attendere prego...</p></body></html>');

  const container = document.getElementById('voucher-content');
  if (container) {showLoadingMessage(container);} // Loader in parent too

  try {
    // 3. Fetch Data (Async)
    const { data: vouchers, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('batch_id', batchId)
      .order('serial_number');

    if (error) { throw error; }

    renderActiveTab(); // Refresh list to update icons if needed

    // 4. Update Window Content
    await generatePrintHtmlCSS(printWindow, vouchers as Voucher[]);

  } catch (err: any) {
    console.error(err);
    Toast.show('Errore recupero voucher: ' + err.message, 'error');
    if (container) {renderDashboard(container);} // Reset UI

    // Show error in popup
    printWindow.document.body.innerHTML = `<h3 style="color:red">Errore: ${err.message}</h3>`;
  }
}

async function generatePrintHtmlCSS(win: Window, vouchers: Voucher[]): Promise<void> {
  const frontBg = 'assets/templates/template_voucher_pagina 1.jpg';
  const backBg = 'assets/templates/template_voucher_pagina 2.jpg';

  // Dynamic import to avoid startup crashes if bundling fails
  let QRCode: any;
  try {
    const module = await import('qrcode');
    QRCode = module.default || module;
  } catch (e) {
    console.error('Failed to load QRCode library', e);
  }

  // 1. Pre-build HTML content in the main thread (Safest)
  let pagesHtml = '';

  if (!vouchers || vouchers.length === 0) {
    pagesHtml = '<div style="text-align:center; padding: 50px;"><h3>Nessun voucher da stampare in questo lotto.</h3></div>';
  } else {
    const chunkSize = 1; // 1 Voucher per Page

    // Generate all QR Codes in parallel first
    const qrCodeMap: Record<string, string> = {};

    if (QRCode) {
      await Promise.all(vouchers.map(async (v) => {
        try {
          qrCodeMap[v.code] = await QRCode.toDataURL(v.code, {
            errorCorrectionLevel: 'H',
            margin: 0,
            width: 160,
            color: {
              dark: '#000000',
              light: '#ffffff00' // Transparent background
            }
          });
        } catch (err) {
          console.error('QR Generation failed for', v.code, err);
          qrCodeMap[v.code] = ''; // Handle gracefully
        }
      }));
    }

    for (let i = 0; i < vouchers.length; i += chunkSize) {
      const chunk = vouchers.slice(i, i + chunkSize);

      // --- FRONT PAGE ---
      let frontContent = '';
      chunk.forEach((v) => {
        const date = v.expiration_date ? new Date(v.expiration_date).toLocaleDateString('it-IT') : 'Illimitata';
        const amount = Math.floor(v.amount) + ' euro';
        const visibleCode = v.code.substring(0, 4);
        const qrSrc = qrCodeMap[v.code] || '';

        frontContent += `
                    <div class="voucher-front">
                        <div class="voucher-amount">${amount}</div>
                        <div class="voucher-code">${visibleCode}</div>
                        
                        <!-- QR Code Image directly embedded -->
                        <div class="qr-code">
                            ${qrSrc ? `<img src="${qrSrc}" alt="QR Code" style="width:100%;height:100%;">` : '<span style="color:red;font-size:10px">QR Error</span>'}
                        </div>
                        
                        <div class="voucher-expiry">${date}</div>
                    </div>
                `;
      });

      pagesHtml += `<div class="page page-front">${frontContent}</div>`;

      // --- BACK PAGE (Empty for duplex printing alignment) ---
      pagesHtml += '<div class="page page-back"></div>';
    }
  }

  // 2. Build the Full Document
  const html = `<!DOCTYPE html>
            <html>
                <head>
                    <base href="${window.location.origin}/">
                    <title>Stampa Voucher Neofuel</title>
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
                            display: block; 
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
                            top: 30.6%;
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
                            top: 38%;
                            left: 0; 
                            right: 0;
                            margin: auto;
                            width: 160px;
                            height: 160px;
                            z-index: 10;
                        }
                        
                        .voucher-code {
                            position: absolute;
                            top: 54.2%;
                            left: 43.5%;
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
                            /* text-align: center; REMOVED center if reusing left align from screenshot, but logic kept centered per previous CSS */
                            text-align: center;
                            font-size: 26px; 
                            font-weight: bold;
                            color: #333;
                        }
                    </style>
                </head>
                <body>
                    <div id="print-container">${pagesHtml}</div>
                </body>
            </html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();

  // Auto-trigger print after short delay to ensure images render
  setTimeout(() => {
    // win.print(); // Optional: User might prefer manual control
  }, 1000);
}
