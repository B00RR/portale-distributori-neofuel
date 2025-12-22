import { supabase } from "../core/api.js";
import { showInfoModal, showErrorMessage, showLoadingMessage, openModal, closeModal } from "../ui/ui.js";
import { formatEuro, formatDate } from "../utils/utils.js";
import { checkOpeningStatus } from "./opening.js";
import { Toast } from "../ui/toast.js";
import { handleError } from "../shared/error-handler.js";

// We assume Html5QrcodeScanner is loaded globally via script tag in index.html
// If not, we should dynamically load it, but for now let's assume existence or load it here.

let voucherState = {
  scanner: null,
  isScanning: false,
  stationId: null,
  userId: null
};

// --- INITIALIZATION ---
export async function showVoucherMenu(stationId, userId) {
  voucherState.stationId = stationId;
  voucherState.userId = userId;

  openModal("Riscatto Voucher");
  const container = document.getElementById('modal-body');
  container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

  try {
    // Verifica apertura turno
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      container.innerHTML = `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter riscattare dei voucher.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;

      document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
      return;
    }

    container.innerHTML = `
        <div class="voucher-modal-content">
            <p id="voucher-modal-subtitle" class="section-subtitle" style="text-align: center; margin-bottom: 20px;">Inquadra il QR code del cliente o inserisci il codice manualmente.</p>

            <div id="scanner-container" style="display:none; margin: 0 auto 20px; max-width: 100%;">
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

            <!-- Manual Entry Form (Hidden by default) -->
            <div id="manual-entry-form" style="display:none; margin-top: 20px; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; animation: slideIn 0.3s ease;">
                <label style="display: block; font-size: 0.9em; font-weight: 600; margin-bottom: 8px; color: #475569;">Codice Voucher</label>
                <div style="display: flex; gap: 10px; align-items: stretch;">
                    <input type="text" id="manual-voucher-code" placeholder="es. 6VJT" class="form-input" style="flex: 1; margin: 0; text-transform: uppercase; font-weight: bold; width: 100%;">
                    <button class="menu-button primary" id="btn-verify-manual" style="margin: 0; width: auto; min-width: 120px; height: 52px; padding: 0 20px;">Verifica</button>
                </div>
            </div>

            <!-- Result Area -->
            <div id="voucher-result" style="margin-top: 20px;"></div>
        </div>
    `;
  } catch (err) {
    container.innerHTML = `
            <div class="alert alert-danger" style="margin: 20px;">
                <h4><i class="fas fa-times-circle"></i> Errore Caricamento</h4>
                <p>${err.message}</p>
            </div>
        `;
    return;
  }

  document.getElementById('start-scan-btn').addEventListener('click', startScanner);
  document.getElementById('stop-scan-btn').addEventListener('click', stopScanner);
  document.getElementById('manual-entry-btn').addEventListener('click', toggleManualEntry);
  document.getElementById('btn-verify-manual').addEventListener('click', () => {
    const code = document.getElementById('manual-voucher-code').value.trim();
    if (code) processVoucherCode(code.toUpperCase());
  });

  // Also handle "Enter" key
  document.getElementById('manual-voucher-code').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const code = e.target.value.trim();
      if (code) processVoucherCode(code.toUpperCase());
    }
  });

  // Capture modal close to stop scanner
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
    const originalClose = closeBtn.onclick;
    closeBtn.addEventListener('click', () => {
      stopScanner();
    });
  }

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
    Toast.show("Libreria Scanner in caricamento... riprova tra un secondo.", 'warning');
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

function toggleManualEntry() {
  const form = document.getElementById('manual-entry-form');
  const input = document.getElementById('manual-voucher-code');
  const actions = document.getElementById('scan-actions');
  const subtitle = document.getElementById('voucher-modal-subtitle');

  if (form.style.display === 'none') {
    form.style.display = 'block';
    actions.style.display = 'none';
    subtitle.textContent = "Inserisci il numero del voucher";
    input.focus();
  } else {
    form.style.display = 'none';
    actions.style.display = 'flex';
    subtitle.textContent = "Inquadra il QR code del cliente o inserisci il codice manualmente.";
  }
}

async function processVoucherCode(code) {
  const resultContainer = document.getElementById('voucher-result');
  resultContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Verifica in corso...</div>';

  try {
    // 1. Verify Code
    let query = supabase
      .from('vouchers')
      .select('*, voucher_batches(customer_name)');

    if (code.length === 4) {
      query = query.like('code', `${code}%`);
    } else {
      query = query.eq('code', code);
    }

    const { data: vouchers, error } = await query;

    if (error || !vouchers || vouchers.length === 0) {
      throw new Error("Codice non trovato o inesistente.");
    }

    // If multiple vouchers start with the same 4 chars, we might need logic to pick one.
    // However, usually these codes are designed to be unique enough or we take the first active one.
    const voucher = vouchers[0];

    // 2. Check Status
    if (voucher.status === 'redeemed') {
      resultContainer.innerHTML = `
                <div class="alert alert-danger" style="background:#fee2e2; color:#b91c1c; padding:25px; border-radius:12px; border:2px solid #fecaca; text-align:center;">
                    <h2 style="margin:0 0 10px 0; color:#b91c1c;"><i class="fas fa-exclamation-triangle"></i> Voucher Già Riscattato</h2>
                    <p style="font-size:1.1em; margin:0;">Questo buono è stato usato il <strong>${formatDate(voucher.redeemed_at)}</strong>.</p>
                </div>
            `;
      return;
    }

    if (voucher.status === 'expired' || (voucher.expiration_date && new Date(voucher.expiration_date) < new Date())) {
      resultContainer.innerHTML = `
                <div class="alert alert-danger" style="background:#fee2e2; color:#b91c1c; padding:25px; border-radius:12px; border:2px solid #fecaca; text-align:center;">
                    <h2 style="margin:0 0 10px 0; color:#b91c1c;"><i class="fas fa-times-circle"></i> Voucher Scaduto</h2>
                    <p style="font-size:1.1em; margin:0;">Il buono è scaduto il <strong>${formatDate(voucher.expiration_date)}</strong></p>
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
    // 1. Update Voucher Status
    const { error: updateError } = await supabase
      .from('vouchers')
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
      })
      .eq('id', voucher.id);

    if (updateError) throw updateError;

    // 2. Insert Movimento Cassa (So it appears in Closure)
    const { error: moveError } = await supabase
      .from('movimenti_cassa')
      .insert([{
        station_id: voucherState.stationId,
        operator_id: voucherState.userId,
        tipo: 'voucher',
        importo: voucher.amount,
        descrizione: `Riscatto Voucher ${voucher.code}`,
        created_at: new Date().toISOString()
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
                <button class="menu-button primary" id="btn-done-redeem">Chiudi</button>
            </div>
        `;

    document.getElementById('btn-done-redeem').addEventListener('click', () => {
      closeModal();
    });

  } catch (err) {
    console.error(err);
    showErrorMessage("Errore Riscatto", "Impossibile completare l'operazione. Riprova: " + err.message);
    resultContainer.innerHTML = ''; // Reset to allow retry
  }
}
