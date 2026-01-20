import { html, css, CSSResultGroup, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { BaseComponent } from './BaseComponent.js';
import { supabase } from '../../core/api.js';
import { createRateLimiter } from '../../utils/utils.js';
import { Toast } from '../toast.js';
import { validateVoucher } from '../../core/rules.js';
import { formatEuro, formatDate } from '../../utils/utils.js';
declare const window: Window & { Html5Qrcode?: any };

interface Voucher {
    code: string;
    amount: number;
    voucher_batches?: { customer_name?: string };
    // Add other fields as needed based on DB schema
    id?: string;
    status?: string;
    batch_id?: number;
    created_at?: string;
    expires_at?: string;
    redeemed_at?: string;
}

export class VoucherManager extends BaseComponent {
    @property({ type: String }) stationId: string = '';
    @property({ type: String }) userId: string = '';

    @state() private mode: 'menu' | 'scan' | 'manual' | 'loading' | 'verify' | 'result' | 'success' | 'error' = 'menu';
    @state() private errorMessage: string = '';
    @state() private activeVoucher: Voucher | null = null;
    @state() private validationResult: { valid: boolean; error?: string; reason?: string; details?: any } | null = null;
    @state() private manualCode: string = '';

    // Scanner state
    private html5QrCode: any = null;
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

      .card-preview {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        text-align: center;
        animation: fadeIn 0.3s ease;
      }

      .amount-display {
        font-size: 2.5rem;
        font-weight: 800;
        color: var(--success-color, #22c55e);
        margin: 1rem 0;
      }

      .error-box {
        background: #fee2e2;
        border: 1px solid #fecaca;
        color: #991b1b;
        padding: 1.5rem;
        border-radius: 8px;
        text-align: center;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `
    ];

    constructor() {
        super();
        // Load Html5Qrcode if needed
        if (!window.Html5Qrcode && !document.querySelector('script[src*="html5-qrcode"]')) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/html5-qrcode';
            document.head.appendChild(script);
        }
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

        // Check if library is loaded with retries
        let retries = 0;
        while (!window.Html5Qrcode && retries < 20) {
            await new Promise(r => setTimeout(r, 200));
            retries++;
        }

        if (!window.Html5Qrcode) {
            this.errorMessage = "Libreria scanner non caricata. Riprova o ricarica la pagina.";
            this.mode = 'error';
            return;
        }

        // Check for Secure Context (HTTPS) - required for camera access on mobile
        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            this.errorMessage = "Errore: Lo scanner richiede una connessione sicura (HTTPS). Se stai accedendo via IP locale, la fotocamera sarà bloccata dal browser.";
            this.mode = 'error';
            return;
        }

        try {
            this.html5QrCode = new window.Html5Qrcode("reader");
            await this.html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText: string) => this.handleCodeFound(decodedText),
                () => { } // Ignore failures
            );
        } catch (e: any) {
            console.error("Scanner error", e);
            const errDetails = e.name ? `${e.name}: ${e.message}` : String(e);
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
                console.warn("Error stopping scanner", e);
            }
            this.html5QrCode = null;
        }
    }

    private handleCodeFound(code: string) {
        this.stopScanner();
        if (navigator.vibrate) navigator.vibrate(200);
        this.processCode(code);
    }

    private async processCode(code: string) {
        if (!this.rateLimiter.check()) {
            Toast.show('Troppi tentativi. Riprova tra un minuto.', 'error');
            return;
        }

        this.mode = 'loading';
        this.errorMessage = '';

        try {
            // Mock query for now or real
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

            const voucher = vouchers[0];
            const validation = validateVoucher(voucher);

            if (!validation.valid) {
                this.activeVoucher = voucher;
                this.validationResult = validation;
                this.mode = 'error'; // Show specific validation error
            } else {
                this.activeVoucher = voucher;
                this.mode = 'verify';
            }

        } catch (e: any) {
            this.errorMessage = e.message || "Errore di controllo";
            this.mode = 'error';
        }
    }

    private async confirmRedeem() {
        if (!this.activeVoucher || !this.stationId || !this.userId) return;

        this.mode = 'loading';

        try {
            const { data: result, error } = await supabase.rpc('redeem_voucher_validated', {
                p_voucher_code: this.activeVoucher.code,
                p_station_id: this.stationId,
                p_operator_id: this.userId
            });

            if (error) throw error;
            if (result && !result.success) throw new Error(result.error);

            Toast.show('Voucher Riscattato!', 'success');
            this.mode = 'success';
            this.emit('voucher-redeemed', { voucher: this.activeVoucher });
        } catch (e: any) {
            this.errorMessage = e.message || "Riscatto fallito";
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
                    <button class="action-btn" style="margin-top: 1rem; width: 100%" @click=${() => { this.stopScanner(); this.mode = 'menu'; }}>
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
                            @input=${(e: any) => this.manualCode = e.target.value}
                            @keypress=${(e: KeyboardEvent) => e.key === 'Enter' && this.processCode(this.manualCode)}
                            placeholder="Codice" 
                            autofocus
                        >
                        <button class="action-btn primary" style="padding: 0 1.5rem" @click=${() => this.processCode(this.manualCode)}>
                            <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <button class="action-btn" style="margin-top: 1rem; width: 100%" @click=${() => this.mode = 'menu'}>
                        Indietro
                    </button>
                </div>
            `;

            case 'loading':
                return html`
                <div class="loading-state" style="text-align: center; padding: 3rem;">
                    <i class="fas fa-spinner fa-spin fa-3x" style="color: var(--primary-color)"></i>
                    <p style="margin-top: 1rem">Elaborazione in corso...</p>
                </div>
            `;

            case 'verify':
                if (!this.activeVoucher) return html``;
                return html`
                <div class="card-preview">
                    <div style="color: var(--success-color); font-size: 3rem; margin-bottom: 1rem">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h2>Voucher Valido</h2>
                    <div class="amount-display">${formatEuro(this.activeVoucher.amount)}</div>
                    <p>Codice: <strong>${this.activeVoucher.code}</strong></p>
                    ${this.activeVoucher.voucher_batches?.customer_name ? html`<p>Cliente: ${this.activeVoucher.voucher_batches.customer_name}</p>` : ''}
                    
                    <div class="menu-grid" style="margin-top: 2rem">
                        <button class="action-btn" @click=${() => { this.mode = 'menu'; this.activeVoucher = null; }}>Annulla</button>
                        <button class="action-btn primary" @click=${() => this.confirmRedeem()}>Riscatta</button>
                    </div>
                </div>
            `;

            case 'error':
                // Check if it's a validation error with details
                const isValidationErr = this.validationResult && !this.validationResult.valid;
                return html`
                <div class="error-box">
                    <i class="fas fa-exclamation-triangle fa-3x" style="margin-bottom: 1rem; display: block"></i>
                    <h2>${isValidationErr ? this.validationResult?.error : 'Errore'}</h2>
                    <p>${isValidationErr
                        ? (this.validationResult?.reason === 'redeemed'
                            ? `Usato il ${formatDate(this.validationResult?.details?.date)}`
                            : 'Voucher non valido')
                        : this.errorMessage}</p>
                    
                    <button class="action-btn" style="width: 100%; margin-top: 1rem; border: 1px solid #b91c1c" @click=${() => this.mode = 'menu'}>
                        Riprova
                    </button>
                </div>
             `;

            case 'success':
                return html`
                <div class="card-preview" style="border-color: var(--success-color)">
                    <i class="fas fa-check fa-4x" style="color: var(--success-color); margin-bottom: 1rem"></i>
                    <h2>Riscattato!</h2>
                    <p>L'importo è stato registrato nel turno corrente.</p>
                    <button class="action-btn primary" style="width: 100%; margin-top: 1rem" @click=${() => { this.mode = 'menu'; this.activeVoucher = null; }}>
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
