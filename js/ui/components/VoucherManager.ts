import { html, css, CSSResultGroup, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

import { supabase } from '../../core/api.js';
import { isOffline, queueAction } from '../../core/offline-queue.js';
import { validateVoucher } from '../../core/rules.js';
import type { Html5QrcodeConstructor, Html5QrcodeInstance } from '../../types.js';
import { createRateLimiter } from '../../utils/utils.js';
import { formatEuro, formatDate } from '../../utils/utils.js';
import { Toast } from '../toast.js';


import { BaseComponent } from './BaseComponent.js';
declare const window: Window & { Html5Qrcode?: Html5QrcodeConstructor };

interface RpcResult {
  success: boolean;
  error?: string;
}

function isRpcResult(value: unknown): value is RpcResult {
  return typeof value === 'object' && value !== null && 'success' in value && typeof value.success === 'boolean';
}

interface Voucher {
    code: string;
    amount: number;
    voucher_batches?: { customer_name: string | null } | null;
    id?: string;
    status?: string | null;
    batch_id?: string | null;
    created_at?: string;
    expiration_date?: string | null;
    redeemed_at?: string | null;
    redeemed_by?: string | null;
    serial_number?: number | null;
    station_id?: number | null;
}

export class VoucherManager extends BaseComponent {
    @property({ type: String }) stationId: string = '';
    @property({ type: String }) userId: string = '';
    @property({ type: String }) shiftId: string = '';

    @state() private mode: 'menu' | 'scan' | 'manual' | 'loading' | 'verify' | 'result' | 'success' | 'error' = 'menu';
    @state() private errorMessage: string = '';
    @state() private activeVoucher: Voucher | null = null;
    @state() private validationResult: { valid: boolean; error?: string; reason?: string; details?: { date?: string | null } } | null = null;
    @state() private manualCode: string = '';

    // Scanner state
    private html5QrCode: Html5QrcodeInstance | null = null;
    private rateLimiter = createRateLimiter(5, 60000);

    // Styles
    static override styles: CSSResultGroup = [
      BaseComponent.styles,
      css`
      :host {
        display: block;
        max-width: 600px;
        margin: 0 auto;
        font-family: 'Inter', sans-serif;
      }

      .menu-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1fr 1fr;
      }

      .action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 2rem;
        border: 2px solid var(--border-color, #e2e8f0);
        border-radius: 12px;
        background: white;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary, #1e293b);
      }

      .action-btn:hover {
        border-color: var(--primary-color, #3b82f6);
        background: var(--primary-light, #eff6ff);
        transform: translateY(-2px);
      }

      .action-btn.primary {
        background: var(--primary-color, #3b82f6);
        color: white;
        border: none;
      }
      .action-btn.primary:hover {
        background: var(--primary-dark, #2563eb);
      }

      .scanner-container {
        width: 100%;
        max-width: 400px;
        margin: 0 auto;
        overflow: hidden;
        border-radius: 12px;
        background: black;
      }

      .manual-input-container {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
      }

      input[type="text"] {
        flex: 1;
        padding: 0.75rem;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 1.1rem;
        text-transform: uppercase;
        font-weight: 600;
        text-align: center;
        letter-spacing: 2px;
      }
      
      input[type="text"]:focus {
        border-color: var(--primary-color, #3b82f6);
        outline: none;
      }

      .card-preview, .error-box {
        padding: 2.5rem 0 !important;
        text-align: center !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        animation: fadeIn 0.3s ease;
      }

      .small-btn {
        width: 100% !important;
        max-width: 300px !important;
        padding: 0.85rem !important;
        border-radius: 50px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        border: none !important;
        font-size: 1.1rem !important;
        margin-top: 2rem !important;
        display: block !important;
        margin-left: auto !important;
        margin-right: auto !important;
        text-transform: none !important;
        letter-spacing: normal !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
      }

      .small-btn.primary {
        background: #8DC63F !important; /* Verde Lime Neofuel */
        color: white !important;
      }

      .small-btn.outline {
        background: #0A2342 !important; /* Blu Navy Neofuel */
        color: white !important;
      }

      .small-btn:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 16px rgba(0,0,0,0.15) !important;
      }

      .error-box {
        color: #c53030 !important;
      }


      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Helper Classes for CSP Compliance */
      .mt-3 { margin-top: 1rem !important; }
      .w-100 { width: 100% !important; }
      .h-100 { height: 100% !important; }
      
      .icon-success-lg { color: var(--success-color, #10b981); font-size: 3rem; margin-bottom: 1rem; }
      .icon-error-lg { color: #dc2626; font-size: 3rem; margin-bottom: 1rem; }
      
      .circle-wrapper {
        background: white;
        width: 100px;
        height: 100px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 2rem auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }
      
      .text-center { text-align: center; }
      
      .spinner-wrapper {
        padding: 3rem;
        text-align: center;
      }
      .spinner-lg {
        font-size: 3rem;
        color: var(--primary-color, #0A2342);
      }
    `
    ];

    constructor() {
      super();
      // Html5Qrcode will be loaded on-demand in startScanner()
    }

    override createRenderRoot() {
      return this; // Disable Shadow DOM so Html5Qrcode can find #reader
    }

    override disconnectedCallback() {
      super.disconnectedCallback();
      this.stopScanner();
    }

    private async startScanner() {
      this.mode = 'scan';
      // Small delay to allow render
      await this.updateComplete;

      // Load Html5Qrcode library on-demand if not already loaded
      if (!window.Html5Qrcode && !document.querySelector('script[src*="html5-qrcode"]')) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode';
        document.head.appendChild(script);
      }

      // Check if library is loaded with retries
      let retries = 0;
      while (!window.Html5Qrcode && retries < 20) {
        await new Promise(r => setTimeout(r, 200));
        retries++;
      }

      if (!window.Html5Qrcode) {
        this.errorMessage = 'Libreria scanner non caricata. Riprova o ricarica la pagina.';
        this.mode = 'error';
        return;
      }

      // Check for Secure Context (HTTPS) - required for camera access on mobile
      if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        this.errorMessage = 'Errore: Lo scanner richiede una connessione sicura (HTTPS). Se stai accedendo via IP locale, la fotocamera sarà bloccata dal browser.';
        this.mode = 'error';
        return;
      }

      try {
        this.html5QrCode = new window.Html5Qrcode('reader');
        await this.html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => this.handleCodeFound(decodedText),
          () => { } // Ignore failures
        );
      } catch (e: unknown) {
        console.error('Scanner error', e);
        const errDetails = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        this.errorMessage = `Impossibile avviare la fotocamera. Dettaglio: ${errDetails}`;
        this.mode = 'error';
      }
    }

    private async stopScanner() {
      if (this.html5QrCode) {
        try {
          await this.html5QrCode.stop();
          this.html5QrCode.clear();
        } catch (e) {
          console.warn('Error stopping scanner', e);
        }
        this.html5QrCode = null;
      }
    }

    private handleCodeFound(code: string) {
      this.stopScanner();
      if (navigator.vibrate) {navigator.vibrate(200);}
      this.processCode(code);
    }

    private async processCode(code: string) {
      if (!this.rateLimiter.check()) {
        Toast.show('Troppi tentativi. Riprova tra un minuto.', 'error');
        return;
      }

      this.mode = 'loading';
      this.errorMessage = '';

      // OFFLINE MODE: Skip validation and prepare for deferred redemption
      if (isOffline()) {
        // Create a minimal voucher object for offline queueing
        this.activeVoucher = {
          code: code,
          amount: 0, // Will be determined when synced
          voucher_batches: { customer_name: 'Verifica al ritorno online' }
        };
        this.mode = 'verify';
        Toast.show('Modalità offline: il voucher verrà validato al ritorno online.', 'warning');
        return;
      }

      try {
        // Online query for validation
        let query = supabase.from('vouchers').select('*, voucher_batches(customer_name)');

        if (code.length === 4) {
          query = query.like('code', `${code}%`);
        } else {
          query = query.eq('code', code);
        }

        const { data: vouchers, error } = await query;

        if (error || !vouchers || vouchers.length === 0) {
          throw new Error('Codice non trovato.');
        }

        const voucher = vouchers[0] ?? null;
        const validation = validateVoucher(voucher);

        if (!validation.valid) {
          this.activeVoucher = voucher;
          this.validationResult = validation;
          this.mode = 'error'; // Show specific validation error
        } else {
          this.activeVoucher = voucher;
          this.mode = 'verify';
        }

      } catch (e: unknown) {
        this.errorMessage = (e as { message?: string })?.message || 'Errore di controllo';
        this.mode = 'error';
      }
    }

    private async confirmRedeem() {
      if (!this.activeVoucher || !this.stationId || !this.userId) {return;}

      this.mode = 'loading';

      // Check if offline - queue action for later sync
      if (isOffline()) {
        try {
          await queueAction('voucher_redeem', {
            voucherCode: this.activeVoucher.code,
            stationId: this.stationId,
            operatorId: this.userId,
            voucherAmount: this.activeVoucher.amount
          });
          this.mode = 'success';
          this.emit('voucher-redeemed', { voucher: this.activeVoucher, queued: true });
        } catch {
          this.errorMessage = "Impossibile salvare l'azione offline";
          this.mode = 'error';
        }
        return;
      }

      try {
        const { data: result, error } = await supabase.rpc('redeem_voucher_validated', {
          p_voucher_code: this.activeVoucher.code,
          p_station_id: Number(this.stationId),
          p_operator_id: this.userId
        });

        if (error) {throw error;}
        if (result && isRpcResult(result) && !result.success) {throw new Error(result.error);}

        Toast.show('Voucher Riscattato!', 'success');
        this.mode = 'success';
        this.emit('voucher-redeemed', { voucher: this.activeVoucher });
      } catch (e: unknown) {
        this.errorMessage = (e as { message?: string })?.message || 'Riscatto fallito';
        this.mode = 'error';
      }
    }

    override render(): TemplateResult {
      return html`
      <div class="voucher-manager">
        ${this.renderContent()}
      </div>
    `;
    }

    private renderContent() {
      switch (this.mode) {
        case 'menu':
          return html`
                <div class="menu-grid">
                    <button class="action-btn primary" @click=${() => this.startScanner()}>
                        <i class="fas fa-camera fa-2x"></i>
                        <span>Scan QR</span>
                    </button>
                    <button class="action-btn" @click=${() => this.mode = 'manual'}>
                        <i class="fas fa-keyboard fa-2x"></i>
                        <span>Manuale</span>
                    </button>
                </div>
            `;

        case 'scan':
          return html`
                <div class="scanner-wrapper">
                    <div id="reader" class="scanner-container"></div>
                    <button class="action-btn mt-3 w-100" @click=${() => { this.stopScanner(); this.mode = 'menu'; }}>
                        Annulla
                    </button>
                </div>
            `;

        case 'manual':
          return html`
                <div class="manual-entry">
                    <h3>Inserisci Codice</h3>
                    <div class="manual-input-container">
                        <input type="text" 
                            .value=${this.manualCode} 
                            @input=${(e: Event) => this.manualCode = (e.target as HTMLInputElement).value}
                            @keypress=${(e: KeyboardEvent) => e.key === 'Enter' && this.processCode(this.manualCode)}
                            placeholder="Codice" 
                            autofocus
                        >
                        <button class="action-btn primary" style="padding: 0 1.5rem" @click=${() => this.processCode(this.manualCode)}>
                            <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <button class="action-btn mt-3 w-100" @click=${() => this.mode = 'menu'}>
                        Indietro
                    </button>
                </div>
            `;

        case 'loading':
          return html`
                <div class="loading-state spinner-wrapper">
                    <i class="fas fa-spinner fa-spin spinner-lg"></i>
                    <p class="mt-3">Elaborazione in corso...</p>
                </div>
            `;

        case 'verify':
          if (!this.activeVoucher) {return html``;}
          return html`
                <div class="card-preview">
                    <div class="icon-success-wrapper">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h2>Voucher Valido</h2>
                    <div class="amount-display">${formatEuro(this.activeVoucher.amount)}</div>
                    <p>Codice: <strong>${this.activeVoucher.code}</strong></p>
                    ${this.activeVoucher.voucher_batches?.customer_name ? html`<p>Cliente: ${this.activeVoucher.voucher_batches.customer_name}</p>` : ''}
                    
                    <div class="menu-grid mt-3">
                        <button class="action-btn" @click=${() => { this.mode = 'menu'; this.activeVoucher = null; }}>Annulla</button>
                        <button class="action-btn primary" @click=${() => this.confirmRedeem()}>Riscatta</button>
                    </div>
                </div>
            `;

        case 'error': {
          const isValidationErr = this.validationResult && !this.validationResult.valid;
          return html`
                <div class="error-box-container">
                    <div class="icon-error-wrapper">
                        <i class="fas fa-exclamation-triangle icon-error"></i>
                    </div>
                    <h2 class="title-lg">${isValidationErr ? this.validationResult?.error : 'Errore'}</h2>
                    <p class="subtitle-gray">${isValidationErr
    ? (this.validationResult?.reason === 'redeemed'

      ? `Usato il ${formatDate(this.validationResult?.details?.date)}`
      : 'Voucher non valido')
    : this.errorMessage}</p>
                    
                    <button class="small-btn outline" 
                            style="background: #0A2342 !important; color: white !important; width: 100% !important; max-width: 300px !important; padding: 0.85rem !important; border-radius: 50px !important; font-weight: 700 !important; cursor: pointer !important; border: none !important; font-size: 1.1rem !important; margin-top: 2rem !important; display: block !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;"
                            @click=${() => this.mode = 'menu'}>
                        Riprova
                    </button>
                </div>
             `;
        }

        case 'success':
          return html`
                <div class="card-preview" style="padding: 2.5rem 0 !important; text-align: center !important; display: flex !important; flex-direction: column !important; align-items: center !important; width: 100% !important;">
                    <div style="background: white !important; width: 100px !important; height: 100px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; margin: 0 auto 2rem auto !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;">
                        <i class="fas fa-check fa-3x" style="color: #8DC63F !important; display: block !important;"></i>
                    </div>
                    <h2 style="margin: 0 0 1rem 0 !important; color: #1e293b !important; text-align: center !important; width: 100% !important; font-weight: 700 !important;">Riscattato!</h2>
                    <p style="color: #64748b !important; margin: 0 0 0.5rem 0 !important; text-align: center !important; width: 100% !important;">L'importo è stato registrato nel turno corrente.</p>
                    <button class="small-btn primary" 
                            style="background: #8DC63F !important; color: white !important; width: 100% !important; max-width: 300px !important; padding: 0.85rem !important; border-radius: 50px !important; font-weight: 700 !important; cursor: pointer !important; border: none !important; font-size: 1.1rem !important; margin-top: 2rem !important; display: block !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;"
                            @click=${() => { this.mode = 'menu'; this.activeVoucher = null; }}>
                        Nuova Scansione
                    </button>
                </div>
            `;

        default:
          return html`<div>Mode unknown: ${this.mode}</div>`;
      }
    }
}

if (!customElements.get('voucher-manager')) {
  customElements.define('voucher-manager', VoucherManager);
}
