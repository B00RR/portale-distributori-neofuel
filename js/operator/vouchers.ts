/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../core/api.js';
import { validateVoucher } from '../core/rules.js';
import { Toast } from '../ui/toast.js';
import { showErrorMessage, closeModal, openModal } from '../ui/ui.js';
import { formatEuro, formatDate, escapeHtml, createRateLimiter } from '../utils/utils.js';

// Assume opening.js is not yet migrated, so no types available easily.
// We import it as any or declare it.
// @ts-ignore
import { checkOpeningStatus } from './opening.js';

// --- INTERFACES ---

interface VoucherState {
    scanner: any | null; // Html5Qrcode type
    isScanning: boolean;
    stationId: number | string | null;
    userId: string | null;
    isRedeeming: boolean;
}

interface CustomWindow extends Window {
    Html5Qrcode?: any;
}

declare const window: CustomWindow;

// --- STATE ---

const voucherState: VoucherState = {
    scanner: null,
    isScanning: false,
    stationId: null,
    userId: null,
    isRedeeming: false
};

const voucherRateLimiter = createRateLimiter(5, 60000); // 5 attempts per minute

// --- FUNCTIONS ---

export async function showVoucherMenu(stationId: number | string, userId: string): Promise<void> {
    voucherState.stationId = stationId;
    voucherState.userId = userId;

    openModal('Riscatto Voucher');
    const container = document.getElementById('modal-body');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

    try {
        // Check opening status
        const activeOpening = await checkOpeningStatus(stationId);
        if (!activeOpening) {
            container.innerHTML = `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter riscattare dei voucher.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;
            const closeBtn = document.getElementById('btn-close-warning');
            if (closeBtn) closeBtn.addEventListener('click', () => closeModal());
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
                <p>${escapeHtml((err as Error).message)}</p>
            </div>
        `;
        return;
    }

    const startScanBtn = document.getElementById('start-scan-btn');
    if (startScanBtn) startScanBtn.addEventListener('click', startScanner);

    const stopScanBtn = document.getElementById('stop-scan-btn');
    if (stopScanBtn) stopScanBtn.addEventListener('click', stopScanner);

    const manualEntryBtn = document.getElementById('manual-entry-btn');
    if (manualEntryBtn) manualEntryBtn.addEventListener('click', toggleManualEntry);

    const verifyBtn = document.getElementById('btn-verify-manual');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
            const input = document.getElementById('manual-voucher-code') as HTMLInputElement;
            const code = input.value.trim();
            if (code) { processVoucherCode(code.toUpperCase()); }
        });
    }

    const manualInput = document.getElementById('manual-voucher-code');
    if (manualInput) {
        manualInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const code = (e.target as HTMLInputElement).value.trim();
                if (code) { processVoucherCode(code.toUpperCase()); }
            }
        });
    }

    // Capture modal close
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            stopScanner();
        });
    }

    // Dynamically load library if not present
    if (!window.Html5Qrcode) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode';
        document.head.appendChild(script);
    }
}

function startScanner(): void {
    const container = document.getElementById('scanner-container');
    const actions = document.getElementById('scan-actions');

    if (actions) actions.style.display = 'none';
    if (container) container.style.display = 'block';

    if (!window.Html5Qrcode) {
        (Toast as any).show('Libreria Scanner in caricamento... riprova tra un secondo.', 'warning');
        return;
    }

    const html5QrCode = new window.Html5Qrcode('reader');
    voucherState.scanner = html5QrCode;
    voucherState.isScanning = true;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: 'environment' },
        config,
        onScanSuccess,
        onScanFailure
    ).catch((err: any) => {
        console.error('Error starting scanner', err);
        (showErrorMessage as any)('Errore Fotocamera', 'Impossibile avviare la fotocamera. Assicurati di aver dato i permessi.');
        stopScanner();
    });
}

function stopScanner(): void {
    if (voucherState.scanner && voucherState.isScanning) {
        voucherState.scanner.stop().then(() => {
            if (voucherState.scanner) {
                voucherState.scanner.clear();
                voucherState.scanner = null;
            }
            const container = document.getElementById('scanner-container');
            if (container) container.style.display = 'none';
            const actions = document.getElementById('scan-actions');
            if (actions) actions.style.display = 'flex';
        }).catch((err: any) => console.error('Failed to stop scanner', err));
    }
}

function onScanFailure(_error: any): void {
    // console.warn(`Code scan error = ${error}`);
}

function onScanSuccess(decodedText: string, _decodedResult: any): void {
    stopScanner();
    if (navigator.vibrate) { navigator.vibrate(200); }
    processVoucherCode(decodedText);
}

function toggleManualEntry(): void {
    const form = document.getElementById('manual-entry-form');
    // const input = document.getElementById('manual-voucher-code'); // not used
    const actions = document.getElementById('scan-actions');
    const subtitle = document.getElementById('voucher-modal-subtitle');

    if (!form || !actions || !subtitle) return;

    if (form.style.display === 'none') {
        form.style.display = 'block';
        actions.style.display = 'none';
        subtitle.textContent = 'Inserisci il numero del voucher';
        const input = document.getElementById('manual-voucher-code');
        if (input) input.focus();
    } else {
        form.style.display = 'none';
        actions.style.display = 'flex';
        subtitle.textContent = 'Inquadra il QR code del cliente o inserisci il codice manualmente.';
    }
}

async function processVoucherCode(code: string): Promise<void> {
    if (!voucherRateLimiter.check()) {
        (Toast as any).show('Troppi tentativi. Riprova tra un minuto.', 'error');
        return;
    }

    const resultContainer = document.getElementById('voucher-result');
    if (!resultContainer) return;

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
            throw new Error('Codice non trovato o inesistente.');
        }

        const voucher = vouchers[0];

        // 2. Check Status
        const validation = validateVoucher(voucher);
        if (!validation.valid) {
            let icon = 'fa-times-circle';
            let detailText = '';

            if (validation.reason === 'redeemed') {
                icon = 'fa-exclamation-triangle';
                const dateRedeemed = validation.details?.date ? formatDate(validation.details.date) : '';
                detailText = `Questo buono è stato usato il <strong>${dateRedeemed}</strong>.`;
            } else if (validation.reason === 'expired') {
                const dateExpired = validation.details?.date ? formatDate(validation.details.date) : '';
                if (dateExpired) {
                    detailText = `Il buono è scaduto il <strong>${dateExpired}</strong>`;
                } else {
                    detailText = 'Il buono risulta scaduto.';
                }
            }

            resultContainer.innerHTML = `
                <div class="alert alert-danger" style="background:#fee2e2; color:#b91c1c; padding:25px; border-radius:12px; border:2px solid #fecaca; text-align:center;">
                    <h2 style="margin:0 0 10px 0; color:#b91c1c;"><i class="fas ${icon}"></i> ${validation.error}</h2>
                    <p style="font-size:1.1em; margin:0;">${detailText}</p>
                </div>
            `;
            return;
        }

        // 3. Show Verification Details & Confirm Redemption
        const customerName = voucher.voucher_batches?.customer_name;
        resultContainer.innerHTML = `
            <div class="voucher-card-preview" style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
                <div style="color: #22c55e; font-size: 3rem; margin-bottom: 10px;"><i class="fas fa-check-circle"></i></div>
                <h3 style="margin:0;">Voucher Valido!</h3>
                <div style="font-size: 2rem; font-weight: bold; margin: 10px 0;">${formatEuro(voucher.amount)}</div>
                <p><strong>Codice:</strong> ${escapeHtml(voucher.code)}</p>
                ${customerName ? `<p><strong>Cliente:</strong> ${escapeHtml(customerName)}</p>` : ''}
                
                <div class="form-actions" style="margin-top: 20px;">
                    <button class="menu-button btn-danger" id="cancel-redeem">Annulla</button>
                    <button class="menu-button btn-success" id="confirm-redeem">
                        <i class="fas fa-save"></i> RISCATTA ORA
                    </button>
                </div>
            </div>
        `;

        const cancelRedeem = document.getElementById('cancel-redeem');
        if (cancelRedeem) {
            cancelRedeem.addEventListener('click', () => {
                resultContainer.innerHTML = '';
            });
        }

        const confirmRedeem = document.getElementById('confirm-redeem');
        if (confirmRedeem) {
            confirmRedeem.addEventListener('click', () => redeemVoucher(voucher));
        }

    } catch (err) {
        resultContainer.innerHTML = `
            <div class="alert alert-danger">
                <h4><i class="fas fa-times-circle"></i> Errore</h4>
                <p>${escapeHtml((err as Error).message)}</p>
            </div>
        `;
    }
}

async function redeemVoucher(voucher: any): Promise<void> {
    if (voucherState.isRedeeming) {
        console.warn('Riscatto già in corso, richiesta ignorata');
        return;
    }

    voucherState.isRedeeming = true;

    const resultContainer = document.getElementById('voucher-result');
    if (!resultContainer) return;

    const confirmBtn = document.getElementById('confirm-redeem') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-redeem') as HTMLButtonElement;

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Riscatto in corso...';
    }
    if (cancelBtn) {
        cancelBtn.disabled = true;
    }

    resultContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Registrazione incasso...</div>';

    try {
        const { data: result, error: rpcError } = await supabase.rpc('redeem_voucher_validated', {
            p_voucher_code: voucher.code,
            p_station_id: voucherState.stationId,
            p_operator_id: voucherState.userId
        });

        if (rpcError) { throw rpcError; }

        if (result && !result.success) {
            throw new Error(result.error || 'Errore durante il riscatto del voucher');
        }

        (Toast as any).show('Voucher Riscattato con Successo!', 'success');
        resultContainer.innerHTML = `
            <div class="alert alert-success" style="background:#d4edda; color:#155724; padding:20px; border-radius:8px; border:1px solid #c3e6cb; text-align: center;">
                <h2><i class="fas fa-check"></i> Completato</h2>
                <p>incasso di <strong>${formatEuro(voucher.amount)}</strong> registrato.</p>
                <button class="menu-button primary" id="btn-done-redeem">Chiudi</button>
            </div>
        `;

        const doneBtn = document.getElementById('btn-done-redeem');
        if (doneBtn) {
            doneBtn.addEventListener('click', () => {
                closeModal();
                voucherState.isRedeeming = false;
            });
        }

    } catch (err) {
        console.error(err);
        (showErrorMessage as any)('Errore Riscatto', "Impossibile completare l'operazione. Riprova: " + ((err as Error).message || (err as any).toString()));
        resultContainer.innerHTML = '';
        voucherState.isRedeeming = false;
    }
}
