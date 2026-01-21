import { html, css, CSSResultGroup, TemplateResult, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { supabase } from '../../core/api.js';
import { loadSession, LoggedUserData } from '../../core/auth.js';
import { store } from '../../shared/state.js';
import { Toast } from '../toast.js';
import { registerSW } from 'virtual:pwa-register';

// Import delle aree per registrazione componenti
import '../../admin.js';
import '../../operator.js';

type AuthStatus = 'checking' | 'logged-out' | 'logged-in';
type AppView = 'login' | 'operator' | 'admin';

@customElement('app-root')
export class AppRoot extends LitElement {
    @state() private authStatus: AuthStatus = 'checking';
    @state() private currentView: AppView = 'login';
    @state() private user: LoggedUserData | null = null;
    @state() private stationId: number | null = null;
    @state() private loginError: string = '';
    @state() private isLoggingIn: boolean = false;

    static override styles: CSSResultGroup = css`
        :host {
            display: block;
            min-height: 100vh;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .checking-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #0A2342 0%, #1a3a5c 100%);
            color: white;
        }

        .checking-container i {
            font-size: 3rem;
            margin-bottom: 1rem;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Login Styles */
        .login-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #0A2342 0%, #1a3a5c 100%);
            padding: 2rem;
        }

        .login-form {
            background: white;
            padding: 2.5rem;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 400px;
        }

        .login-header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .login-logo {
            height: 60px;
            margin-bottom: 0.5rem;
        }

        .login-tagline {
            color: #64748b;
            font-size: 0.9rem;
        }

        .login-title {
            text-align: center;
            color: #0A2342;
            margin-bottom: 1.5rem;
            font-size: 1.5rem;
        }

        .form-group {
            margin-bottom: 1.25rem;
        }

        .form-group label {
            display: block;
            color: #475569;
            font-weight: 600;
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
        }

        .form-group input {
            width: 100%;
            padding: 0.875rem 1rem;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.2s;
            box-sizing: border-box;
        }

        .form-group input:focus {
            outline: none;
            border-color: #0A2342;
        }

        .password-wrapper {
            position: relative;
        }

        .password-wrapper input {
            padding-right: 3rem;
        }

        .password-toggle {
            position: absolute;
            right: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            color: #64748b;
            padding: 0.5rem;
        }

        .submit-btn {
            width: 100%;
            padding: 1rem;
            background: #8DC63F;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 0.5rem;
        }

        .submit-btn:hover:not(:disabled) {
            background: #7ab536;
            transform: translateY(-1px);
        }

        .submit-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }

        .error-msg {
            color: #dc2626;
            font-size: 0.9rem;
            text-align: center;
            margin-top: 1rem;
            min-height: 1.5rem;
        }

        .forgot-password {
            display: block;
            text-align: center;
            margin-top: 1rem;
            color: #0A2342;
            font-size: 0.9rem;
            cursor: pointer;
        }

        .forgot-password:hover {
            text-decoration: underline;
        }

        /* App Container */
        .app-container {
            min-height: 100vh;
        }

        .main-content {
            padding: 16px;
        }
    `;

    override connectedCallback(): void {
        super.connectedCallback();
        this.initializeApp();
        this.setupPWA();
    }

    private async initializeApp(): Promise<void> {
        try {
            // Check URL params for password reset
            const urlParams = new URLSearchParams(window.location.search);
            const tokenHash = urlParams.get('token_hash');
            const type = urlParams.get('type');

            if (tokenHash && type === 'recovery') {
                // Redirect to password reset flow (handled by auth.ts)
                const { handlePasswordReset } = await import('../../core/auth.js');
                this.authStatus = 'logged-out';
                await handlePasswordReset();
                return;
            }

            // Try to load existing session
            const user = await loadSession();
            if (user) {
                await this.handleSuccessfulAuth(user);
            } else {
                this.authStatus = 'logged-out';
                this.currentView = 'login';
            }
        } catch (err) {
            console.error('[AppRoot] Error initializing:', err);
            this.authStatus = 'logged-out';
            this.currentView = 'login';
        }
    }

    private setupPWA(): void {
        const updateSW = registerSW({
            onNeedRefresh: () => {
                Toast.show('Nuova versione disponibile!', 'info', 0, {
                    action: {
                        text: 'AGGIORNA',
                        onClick: () => {
                            updateSW(true)
                                .then(() => console.log('[PWA] Update accepted'))
                                .catch(() => window.location.reload());
                        }
                    }
                });
            },
            onOfflineReady: () => {
                Toast.show('App pronta per l\'uso offline', 'success');
            },
            onRegistered: (r) => {
                if (!r) return;
                // Poll for updates every 15 seconds
                setInterval(() => r.update().catch(() => { }), 15 * 1000);
                // Check on focus
                window.addEventListener('focus', () => r.update().catch(() => { }));
            }
        });
    }

    private async handleSuccessfulAuth(user: LoggedUserData): Promise<void> {
        this.user = user;
        store.setUser(user as any);

        const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(user.role);

        if (isAdminRole) {
            document.body.classList.add('admin-layout', 'desktop-layout');
            this.currentView = 'admin';
            this.authStatus = 'logged-in';
        } else {
            document.body.classList.remove('admin-layout', 'desktop-layout');

            // Fetch station ID from DB
            const { data: us } = await supabase
                .from('user_stations')
                .select('station_id')
                .eq('user_id', user.user_id)
                .maybeSingle();

            if (us?.station_id) {
                this.stationId = us.station_id;
                const freshUser = { ...user, station_id: us.station_id };
                store.setUser(freshUser as any);
                this.user = freshUser;
                this.currentView = 'operator';
                this.authStatus = 'logged-in';
            } else {
                Toast.show('Nessuna stazione assegnata all\'utente', 'error');
                this.authStatus = 'logged-out';
                this.currentView = 'login';
            }
        }
    }

    private async handleLogin(e: Event): Promise<void> {
        e.preventDefault();
        this.loginError = '';
        this.isLoggingIn = true;

        const form = e.target as HTMLFormElement;
        const emailInput = form.querySelector('#email') as HTMLInputElement;
        const passwordInput = form.querySelector('#password') as HTMLInputElement;

        const email = emailInput?.value?.trim().toLowerCase();
        const password = passwordInput?.value;

        if (!email || !password) {
            this.loginError = 'Inserisci email e password.';
            this.isLoggingIn = false;
            return;
        }

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) {
                if (authError.message?.includes('Email not confirmed')) {
                    this.loginError = 'Email non confermata. Contatta l\'amministratore.';
                } else if (authError.message?.includes('Invalid')) {
                    this.loginError = 'Email o password errati.';
                } else {
                    this.loginError = `Errore: ${authError.message}`;
                }
                this.isLoggingIn = false;
                return;
            }

            if (!authData?.user) {
                this.loginError = 'Errore durante il login. Riprova.';
                this.isLoggingIn = false;
                return;
            }

            // Fetch user data from DB
            let { data: userData } = await supabase
                .from('users')
                .select(`*, user_stations(station_id, fuel_stations(station_name))`)
                .eq('email', email)
                .maybeSingle();

            if (!userData) {
                // Fallback: create minimal user object from auth data
                userData = {
                    id: authData.user.id,
                    user_id: authData.user.id,
                    email: authData.user.email,
                    full_name: authData.user.user_metadata?.full_name || email.split('@')[0],
                    role: authData.user.user_metadata?.role || 'operator'
                };
            } else {
                userData.id = authData.user.id;
            }

            if (!userData.role) {
                userData.role = authData.user.user_metadata?.role || 'operator';
            }

            await this.handleSuccessfulAuth(userData as LoggedUserData);

        } catch (err: any) {
            console.error('[AppRoot] Login error:', err);
            this.loginError = `Errore: ${err.message || 'Errore sconosciuto'}`;
        } finally {
            this.isLoggingIn = false;
        }
    }

    private togglePasswordVisibility(e: Event): void {
        const button = e.currentTarget as HTMLButtonElement;
        const input = button.parentElement?.querySelector('input') as HTMLInputElement;
        const icon = button.querySelector('i');

        if (input && icon) {
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }
    }

    override render(): TemplateResult {
        if (this.authStatus === 'checking') {
            return this.renderCheckingState();
        }

        if (this.authStatus === 'logged-out' || this.currentView === 'login') {
            return this.renderLoginForm();
        }

        return this.renderAppContainer();
    }

    private renderCheckingState(): TemplateResult {
        return html`
            <div class="checking-container">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Caricamento...</p>
            </div>
        `;
    }

    private renderLoginForm(): TemplateResult {
        return html`
            <div class="login-container">
                <form class="login-form" @submit=${this.handleLogin}>
                    <div class="login-header">
                        <img class="login-logo" src="/assets/images/logo-svg.svg" alt="Logo Neofuel" />
                        <p class="login-tagline">Portale Distributori</p>
                    </div>

                    <h1 class="login-title">Accedi</h1>

                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" required
                               autocomplete="email" placeholder="es. operatore@neofuel.it" />
                    </div>

                    <div class="form-group">
                        <label for="password">Password</label>
                        <div class="password-wrapper">
                            <input type="password" id="password" name="password" required
                                   autocomplete="current-password" />
                            <button type="button" class="password-toggle" @click=${this.togglePasswordVisibility}>
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>

                    <button type="submit" class="submit-btn" ?disabled=${this.isLoggingIn}>
                        ${this.isLoggingIn ? html`<i class="fas fa-spinner fa-spin"></i> Accesso...` : 'Accedi'}
                    </button>

                    <div class="error-msg">${this.loginError}</div>
                </form>
            </div>
        `;
    }

    private renderAppContainer(): TemplateResult {
        return html`
            <div class="app-container">
                <main class="main-content" id="main-content">
                    ${this.currentView === 'admin'
                ? html`<admin-dashboard></admin-dashboard>`
                : html`<operator-dashboard 
                                  .userId=${this.user?.id || ''} 
                                  .stationId=${this.stationId || 0}>
                               </operator-dashboard>`
            }
                </main>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'app-root': AppRoot;
    }
}
