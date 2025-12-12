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
export async function loadVoucherManagement(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
        <div class="voucher-management-container">
            <div class="tabs-header">
                <button class="tab-btn active" data-tab="generator"><i class="fas fa-plus-circle"></i> Genera</button>
                <button class="tab-btn" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
                <button class="tab-btn" data-tab="print"><i class="fas fa-print"></i> Stampa</button>
            </div>
            
            <div id="voucher-content" class="tab-content">
                <!-- Content injected here -->
            </div>
        </div>
    `;

  // Bind Tabs
  const tabs = container.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      voucherState.activeTab = btn.dataset.tab;
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
        <div class="content-box">
            <h3><i class="fas fa-ticket-alt"></i> Crea Nuovi Voucher</h3>
            <p class="section-subtitle">Genera un lotto di codici univoci pronti per la stampa.</p>
            
            <form id="voucher-generator-form" style="max-width: 600px; margin: 0 auto;">
                <div class="form-group">
                    <label>Importo Singolo Voucher (€)</label>
                    <input type="number" name="amount" class="big-input" step="0.50" min="0.50" required placeholder="Es. 10.00">
                </div>

                <div class="form-group">
                    <label>Cliente (Opzionale)</label>
                    <select name="customer_id" class="big-input">
                        <option value="">-- Nessun Cliente Specifico --</option>
                        ${voucherState.customers.map(c => `<option value="${c.cliente}">${escapeHtml(c.cliente)}</option>`).join('')}
                    </select>
                    <small style="color: #64748b;">Se selezioni un cliente, il lotto verrà associato a lui.</small>
                </div>

                <div class="form-group">
                    <label>Data di Scadenza</label>
                    <input type="date" name="expiration_date" class="big-input" value="${nextYearStr}" min="${today}">
                </div>

                <div class="form-group">
                    <label>Quantità da Generare</label>
                    <input type="number" name="quantity" class="big-input" min="1" max="100" value="10" required>
                </div>

                <div class="form-actions">
                    <button type="submit" class="menu-button btn-success">
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
  const customer = formData.get('customer_id'); // Using name as string for simplicity in DB connection or ID if needed
  const expiration = formData.get('expiration_date');
  const quantity = parseInt(formData.get('quantity'));

  if (!amount || quantity < 1) return;

  if (!confirm(`Confermi la generazione di ${quantity} voucher da ${formatEuro(amount)} ciascuno?\nTotale Valore Nominale: ${formatEuro(amount * quantity)}`)) {
    return;
  }

  showLoadingMessage(document.getElementById('voucher-content'));

  try {
    // 1. Create Batch
    const batchDesc = `${quantity}x ${formatEuro(amount)} ${customer ? '- ' + customer : ''}`;
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
      // Format: V-{BATCH_PREFIX}-{RANDOM_HEX}-{AMOUNT_INT}
      // Realistically, a simple UUID or strong random string is enough.
      // Let's use a 12-char alphanumeric string for readability/QR density.
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

    /* 
       Ideally we would allow "sum" aggregation via RPC, but for now filtering is fine if dataset isn't huge.
       Or we can just show counts.
    */

    // Fetch recent activity
    const { data: recent, error } = await supabase
      .from('vouchers')
      .select('*, voucher_batches(description)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    container.innerHTML = `
            <div class="dashboard-kpi-grid">
                <div class="kpi-card blue">
                    <div class="kpi-icon"><i class="fas fa-ticket-alt"></i></div>
                    <div class="kpi-value">${totalGen || 0}</div>
                    <div class="kpi-label">Totale Emessi</div>
                </div>
                <div class="kpi-card green">
                    <div class="kpi-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="kpi-value">${totalRedeemed || 0}</div>
                    <div class="kpi-label">Riscattati</div>
                </div>
                <div class="kpi-card orange">
                    <div class="kpi-icon"><i class="fas fa-clock"></i></div>
                    <div class="kpi-value">${totalActive || 0}</div>
                    <div class="kpi-label">Attivi (Da Incassare)</div>
                </div>
            </div>

            <div class="content-box" style="margin-top: 20px;">
                <h4>Ultimi Voucher Generati</h4>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Codice</th>
                                <th>Importo</th>
                                <th>Stato</th>
                                <th>Lotto / Cliente</th>
                                <th>Scadenza</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recent.map(v => `
                                <tr>
                                    <td class="font-mono">${escapeHtml(v.code)}</td>
                                    <td><strong>${formatEuro(v.amount)}</strong></td>
                                    <td>${getStatusBadge(v.status)}</td>
                                    <td>${escapeHtml(v.voucher_batches?.description || '-')}</td>
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
            <div class="content-box">
                <h3>Stampa Voucher</h3>
                <p class="section-subtitle">Seleziona un lotto per generare il PDF di stampa.</p>
                
                <div class="batches-list">
                    ${batches.length === 0 ? '<p>Nessun lotto trovato.</p>' : ''}
                    ${batches.map(b => `
                        <div class="batch-card" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee;">
                            <div>
                                <div style="font-weight: bold; font-size: 1.1rem;">${escapeHtml(b.description)}</div>
                                <div style="font-size: 0.9rem; color: #64748b;">Del: ${formatDate(b.created_at)}</div>
                                ${b.customer_name ? `<div class="badge badge-outline"><i class="fas fa-user"></i> ${escapeHtml(b.customer_name)}</div>` : ''}
                            </div>
                            <button class="menu-button primary btn-print-batch" data-id="${b.id}">
                                <i class="fas fa-print"></i> Stampa PDF
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

    container.querySelectorAll('.btn-print-batch').forEach(btn => {
      btn.addEventListener('click', () => openPrintView(btn.dataset.id));
    });

  } catch (err) {
    container.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
  }
}

async function openPrintView(batchId) {
  // This will open a new window or modal with the print layout
  // We need to fetch the vouchers for this batch first
  showLoadingMessage(document.getElementById('voucher-content'));

  try {
    const { data: vouchers, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('batch_id', batchId)
      .order('serial_number');

    if (error) throw error;

    // We need the template image URL. For now, let's assume it's in assets/voucher_template.jpg
    // or prompt the user if we implement dynamic upload.
    // User is uploading "Voucher Template.pdf" -> assumed converted to image.

    // TODO: Implement actual Print Window opening with HTML content
    // For now, let's just restore the tab view and simulate the action
    renderPrintList(document.getElementById('voucher-content'));

    // Open Print Window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Il browser ha bloccato il popup. Autorizza i popup per stampare.');
      return;
    }

    generatePrintHtml(printWindow, vouchers);

  } catch (err) {
    console.error(err);
    Toast.show("Errore recupero voucher", 'error');
    renderPrintList(document.getElementById('voucher-content'));
  }
}

async function generatePrintHtml(win, vouchers) {
  // Basic A4 Grid Layout
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Stampa Voucher</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script>
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        </script>
        <style>
            @media print {
                @page { margin: 0; size: A4; }
                body { margin: 0; -webkit-print-color-adjust: exact; }
            }
            body { font-family: sans-serif; background: #eee; }
            .page { 
                width: 210mm; height: 297mm; background: white; margin: 20px auto; 
                display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(5, 1fr);
                page-break-after: always;
                position: relative;
            }
            @media print { .page { margin: 0; box-shadow: none; } }
            
            .voucher-card {
                border: 1px dashed #ccc; /* Cut lines */
                position: relative;
                overflow: hidden;
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
            }
            
            .overlay-qr {
                position: absolute;
                bottom: 20px;
                right: 20px;
                width: 80px;
                height: 80px;
                background: white;
                padding: 5px;
            }
            .overlay-amount {
                position: absolute;
                top: 20px;
                right: 20px;
                font-size: 24px;
                font-weight: bold;
                color: #000;
            }
            .overlay-code {
                position: absolute;
                bottom: 5px;
                right: 20px;
                font-size: 10px;
                font-family: monospace;
            }
            .overlay-expiry {
                position: absolute;
                bottom: 5px;
                left: 20px;
                font-size: 10px;
            }
        </style>
    </head>
    <body>
        <div id="loading" style="text-align: center; padding: 50px; font-size: 24px;">
            Elaborazione Template PDF in corso... <br>Attendere prego...
        </div>
        <div id="pages-container" style="display:none;"></div>
        <script>
            const vouchers = ${JSON.stringify(vouchers)};
            const pdfUrl = '../assets/templates/template_voucher.pdf';
            let templateDataUrl = '';

            async function init() {
                try {
                    // Render PDF to Image
                    const loadingTask = pdfjsLib.getDocument(pdfUrl);
                    const pdf = await loadingTask.promise;
                    const page = await pdf.getPage(1);
                    
                    const viewport = page.getViewport({ scale: 2 }); // High res
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    templateDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    
                    renderVouchers();
                } catch (err) {
                    alert("Errore nel caricamento del template PDF: " + err.message);
                    console.error(err);
                }
            }

            function renderVouchers() {
                const container = document.getElementById('pages-container');
                const loading = document.getElementById('loading');
                
                // Chunk into 10 per page (2x5)
                const chunkSize = 10;
                for (let i = 0; i < vouchers.length; i += chunkSize) {
                    const chunk = vouchers.slice(i, i + chunkSize);
                    const page = document.createElement('div');
                    page.className = 'page';
                    
                    chunk.forEach(v => {
                        const card = document.createElement('div');
                        card.className = 'voucher-card';
                        // Apply the rendered PDF image as background
                        card.style.backgroundImage = \`url(\${templateDataUrl})\`;
                        
                        card.innerHTML = \`
                            <div class=\"overlay-amount\">€ \${parseFloat(v.amount).toFixed(2)}</div>
                            <div class=\"overlay-expiry\">Scad: \${v.expiration_date ? v.expiration_date.split('-').reverse().join('/') : 'Illimitata'}</div>
                            <div class=\"overlay-code\">\${v.code}</div>
                            <div class=\"overlay-qr\" id=\"qr-\${v.id}\"></div>
                        \`;
                        page.appendChild(card);
                        
                        // Generate QR
                        setTimeout(() => {
                             new QRCode(document.getElementById('qr-' + v.id), {
                                text: v.code,
                                width: 70,
                                height: 70
                            });
                        }, 50);
                    });
                    
                    container.appendChild(page);
                }

                loading.style.display = 'none';
                container.style.display = 'block';
                
                // Auto print prompt
                setTimeout(() => window.print(), 1000);
            }

            init();
        </script>
    </body>
    </html>
    `;

  win.document.write(html);
  win.document.close();
}
