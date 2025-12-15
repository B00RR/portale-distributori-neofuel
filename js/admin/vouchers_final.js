import { supabase } from "../core/api.js";
import { showLoadingMessage, showInfoModal, showErrorMessage, openModal, closeModal } from "../ui/ui.js";
import { escapeHtml, formatEuro, formatDate } from "../utils/utils.js";
import { Toast } from "../ui/toast.js";

// --- STATE ---
let voucherState = {
    batches: [],
    customers: [],
    activeTab: 'generator' // 'generator', 'dashboard', 'print'
};

// --- INITIALIZATION ---
export async function showVoucherAdminTab(container, headerActions) {
    // const container = document.getElementById(containerId); // Removed, container passed directly
    container.innerHTML = `
        <div class="app-container">
            <div class="top-bar-title">
                <h2><i class="fas fa-ticket-alt"></i> Gestione Voucher V3</h2>
            </div>

            <div class="segmented-control" style="margin: 24px 0;">
                <label class="segmented-option">
                    <input type="radio" name="voucher_tab" value="generator" checked>
                    <div class="segmented-label">
                        <div class="segmented-title"><i class="fas fa-plus-circle"></i> Genera</div>
                        <div class="segmented-subtitle">Crea nuovi buoni</div>
                    </div>
                </label>
                
                <label class="segmented-option">
                    <input type="radio" name="voucher_tab" value="dashboard">
                    <div class="segmented-label">
                        <div class="segmented-title"><i class="fas fa-chart-line"></i> Dashboard</div>
                        <div class="segmented-subtitle">Statistiche e liste</div>
                    </div>
                </label>

                <label class="segmented-option">
                    <input type="radio" name="voucher_tab" value="print">
                    <div class="segmented-label">
                        <div class="segmented-title"><i class="fas fa-print"></i> Stampa</div>
                        <div class="segmented-subtitle">PDF da stampare</div>
                    </div>
                </label>
            </div>
            
            <div id="voucher-content" class="tab-content" style="background: #fff; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0;">
                <!-- Content injected here -->
            </div>
        </div>
    `;

    // Bind Tabs
    const radios = container.querySelectorAll('input[name="voucher_tab"]');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            voucherState.activeTab = e.target.value;
            renderActiveTab();
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

function renderActiveTab() {
    const content = document.getElementById('voucher-content');
    switch (voucherState.activeTab) {
        case 'generator':
            renderGenerator(content);
            break;
        case 'dashboard':
            renderDashboard(content);
            break;
        case 'print':
            renderPrintList(content);
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
        voucherState.activeTab = 'print';
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

        // Fetch recent activity
        const { data: recent, error } = await supabase
            .from('vouchers')
            .select('*, voucher_batches(description)')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        container.innerHTML = `
            <section class="dashboard-grid" style="grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
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

            <div class="menu-card">
                <div class="top-bar-title" style="justify-content: flex-start; margin-bottom: 20px;">
                    <h3>Ultimi Voucher Generati</h3>
                </div>
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th style="width: 25%">Codice</th>
                                <th style="width: 15%">Importo</th>
                                <th style="width: 15%">Stato</th>
                                <th style="width: 15%">Lotto / Cliente</th>
                                <th style="width: 30%">Scadenza</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recent.map(v => `
                                <tr>
                                    <td style="font-family: monospace; font-weight: 600; color: #333;">${escapeHtml(v.code)}</td>
                                    <td><strong>${formatEuro(v.amount)}</strong></td>
                                    <td>${getStatusBadge(v.status)}</td>
                                    <td style="white-space: normal;">${escapeHtml(v.voucher_batches?.description || '-')}</td>
                                    <td>${v.expiration_date ? formatDate(v.expiration_date) : 'Nessuna'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

    } catch (err) {
        container.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
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
      <div class="menu-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <h3>Gestione Voucher e Stampa</h3>
                        <p class="section-subtitle">Gestisci i lotti generati, stampa i PDF o annulla i buoni non utilizzati.</p>
                    </div>
                </div>
                
                <div class="table-responsive">
                    <table class="admin-table">
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
                                        <div style="display: flex; justify-content: flex-end; gap: 8px;">
                                            <button class="action-btn primary btn-print-batch" data-id="${b.id}" title="Stampa" style="width:32px; height:32px; padding:0; justify-content:center; border-radius:8px;">
                                                <i class="fas fa-print" style="font-size:14px;"></i>
                                            </button>
                                            <button class="action-btn warning btn-void-batch" data-id="${b.id}" title="Annulla/Blocca Lotto" style="width:32px; height:32px; padding:0; justify-content:center; border-radius:8px;">
                                                <i class="fas fa-ban" style="font-size:14px;"></i>
                                            </button>
                                            <button class="action-btn danger btn-delete-batch" data-id="${b.id}" title="Elimina Lotto" style="width:32px; height:32px; padding:0; justify-content:center; border-radius:8px;">
                                                <i class="fas fa-trash" style="font-size:14px;"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
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
        renderPrintList(container);

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
                            colorDark : "#0A2342",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.H
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
