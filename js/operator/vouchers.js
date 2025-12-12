import { supabase } from "../core/api.js";
import { showInfoModal, showErrorMessage, showLoadingMessage } from "../ui/ui.js";
import { formatEuro, formatDate } from "../utils/utils.js";
import { Toast } from "../ui/toast.js";

// We assume Html5QrcodeScanner is loaded globally via script tag in index.html
// If not, we should dynamically load it, but for now let's assume existence or load it here.

let voucherState = {
  scanner: null,
  isScanning: false
};

// --- INITIALIZATION ---
export function loadOperatorVouchers(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
        <div class="content-box">
            <h3><i class="fas fa-qrcode"></i> Riscatto Voucher</h3>
            <p class="section-subtitle">Inquadra il QR code del cliente per riscuotere il buono.</p>

            <div id="scanner-container" style="display:none; margin: 20px auto; max-width: 500px;">
                <div id="reader"></div>
                <button class="menu-button secondary" id="stop-scan-btn" style="margin-top:10px; width:100%;">
                    Ferma Fotocamera
                </button>
            </div>

            <div id="scan-actions" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button class="menu-button primary big-btn" id="start-scan-btn">
                    <i class="fas fa-camera"></i> Avvia Scanner
                </button>
                <button class="menu-button secondary big-btn" id="manual-entry-btn">
                    <i class="fas fa-keyboard"></i> Inserimento Manuale
                </button>
            </div>

            <!-- Result Area -->
            <div id="voucher-result" style="margin-top: 20px;"></div>
        </div>
    `;

  document.getElementById('start-scan-btn').addEventListener('click', startScanner);
  document.getElementById('stop-scan-btn').addEventListener('click', stopScanner);
  document.getElementById('manual-entry-btn').addEventListener('click', showManualEntry);

  // Dynamically load library if not present
  if (!window.Html5Qrcode) {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/html5-qrcode";
    document.head.appendChild(script);
  }
}

function startScanner() {
  const readerDiv = document.getElementById('reader');
  const container = document.getElementById('scanner-container');
  const actions = document.getElementById('scan-actions');

  actions.style.display = 'none';
  container.style.display = 'block';

  if (!window.Html5Qrcode) {
    alert("Libreria Scanner in caricamento... riprova tra un secondo.");
    return;
  }

  // Initialize Scanner
  const html5QrCode = new Html5Qrcode("reader");
  voucherState.scanner = html5QrCode;
  voucherState.isScanning = true;

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" }, // Prefer back camera
    config,
    onScanSuccess,
    onScanFailure
  ).catch(err => {
    console.error("Error starting scanner", err);
    showErrorMessage("Errore Fotocamera", "Impossibile avviare la fotocamera. Assicurati di aver dato i permessi.");
    stopScanner();
  });
}

function stopScanner() {
  if (voucherState.scanner && voucherState.isScanning) {
    voucherState.scanner.stop().then(() => {
      voucherState.scanner.clear();
      voucherState.scanner = null;
      document.getElementById('scanner-container').style.display = 'none';
      document.getElementById('scan-actions').style.display = 'flex';
    }).catch(err => console.error("Failed to stop scanner", err));
  }
}

function onScanFailure(error) {
  // handle scan failure, usually better to ignore and keep scanning.
  // console.warn(`Code scan error = ${error}`);
}

function onScanSuccess(decodedText, decodedResult) {
  // Audit: Stop scanning immediately
  stopScanner();
  // Play explicit beep or vibration
  if (navigator.vibrate) navigator.vibrate(200);

  // Process Code
  processVoucherCode(decodedText);
}

function showManualEntry() {
  const code = prompt("Inserisci il codice del voucher (es. A4K9-XP3M...):");
  if (code) {
    processVoucherCode(code.trim().toUpperCase());
  }
}

async function processVoucherCode(code) {
  const resultContainer = document.getElementById('voucher-result');
  resultContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Verifica in corso...</div>';

  try {
    // 1. Verify Code
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('*, voucher_batches(customer_name)')
      .eq('code', code)
      .single();

    if (error || !voucher) {
      throw new Error("Codice non trovato o inesistente.");
    }

    // 2. Check Status
    if (voucher.status === 'redeemed') {
      resultContainer.innerHTML = `
                <div class="alert alert-warning" style="background:#fff3cd; color:#856404; padding:15px; border-radius:8px; border:1px solid #ffeeba;">
                    <h4><i class="fas fa-exclamation-triangle"></i> Voucher Già Riscattato</h4>
                    <p>Questo buono è stato usato il ${formatDate(voucher.redeemed_at)}.</p>
                </div>
            `;
      return;
    }

    if (voucher.status === 'expired' || (voucher.expiration_date && new Date(voucher.expiration_date) < new Date())) {
      resultContainer.innerHTML = `
                <div class="alert alert-danger" style="background:#f8d7da; color:#721c24; padding:15px; border-radius:8px; border:1px solid #f5c6cb;">
                    <h4><i class="fas fa-times-circle"></i> Voucher Scaduto</h4>
                    <p>Data Scadenza: ${formatDate(voucher.expiration_date)}</p>
                </div>
            `;
      return;
    }

    // 3. Show Verification Details & Confirm Redemption
    resultContainer.innerHTML = `
            <div class="voucher-card-preview" style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
                <div style="color: #22c55e; font-size: 3rem; margin-bottom: 10px;"><i class="fas fa-check-circle"></i></div>
                <h3 style="margin:0;">Voucher Valido!</h3>
                <div style="font-size: 2rem; font-weight: bold; margin: 10px 0;">${formatEuro(voucher.amount)}</div>
                <p><strong>Codice:</strong> ${voucher.code}</p>
                ${voucher.voucher_batches?.customer_name ? `<p><strong>Cliente:</strong> ${voucher.voucher_batches.customer_name}</p>` : ''}
                
                <div class="form-actions" style="margin-top: 20px;">
                    <button class="menu-button btn-danger" id="cancel-redeem">Annulla</button>
                    <button class="menu-button btn-success" id="confirm-redeem">
                        <i class="fas fa-save"></i> RISCATTA ORA
                    </button>
                </div>
            </div>
        `;

    document.getElementById('cancel-redeem').addEventListener('click', () => {
      resultContainer.innerHTML = '';
    });

    document.getElementById('confirm-redeem').addEventListener('click', () => redeemVoucher(voucher));

  } catch (err) {
    resultContainer.innerHTML = `
            <div class="alert alert-danger">
                <h4><i class="fas fa-times-circle"></i> Errore</h4>
                <p>${err.message}</p>
            </div>
        `;
  }
}

async function redeemVoucher(voucher) {
  const resultContainer = document.getElementById('voucher-result');
  resultContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Registrazione incasso...</div>';

  try {
    // Transaction: Update Voucher + Insert Cash Movement
    // Supabase doesn't support complex transactions in client library easily without RPC.
    // We will do optimistic sequential updates.

    // 1. Update Voucher Status
    const { error: updateError } = await supabase
      .from('vouchers')
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
        // redeemed_by: operator_id // captured by RLS or session theoretically
      })
      .eq('id', voucher.id);

    if (updateError) throw updateError;

    // 2. Insert Movimento Cassa (So it appears in Closure)
    const { error: moveError } = await supabase
      .from('movimenti_cassa')
      .insert([{
        tipo: 'voucher',
        importo: voucher.amount,
        descrizione: `Riscatto Voucher ${voucher.code}`
      }]);

    if (moveError) {
      // Rollback voucher (crudely)
      await supabase.from('vouchers').update({ status: 'active', redeemed_at: null }).eq('id', voucher.id);
      throw moveError;
    }

    Toast.show("Voucher Riscattato con Successo!", 'success');
    resultContainer.innerHTML = `
            <div class="alert alert-success" style="background:#d4edda; color:#155724; padding:20px; border-radius:8px; border:1px solid #c3e6cb; text-align: center;">
                <h2><i class="fas fa-check"></i> Completato</h2>
                <p>incasso di <strong>${formatEuro(voucher.amount)}</strong> registrato.</p>
                <button class="menu-button primary" onclick="document.getElementById('voucher-result').innerHTML=''">Nuova Scansione</button>
            </div>
        `;

  } catch (err) {
    console.error(err);
    showErrorMessage("Errore Riscatto", "Impossibile completare l'operazione. Riprova: " + err.message);
    resultContainer.innerHTML = ''; // Reset to allow retry
  }
}
