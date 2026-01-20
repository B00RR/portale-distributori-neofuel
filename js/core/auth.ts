/**
 * Authentication Module
 * Handles user authentication, login, logout, and password reset
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./api.js";
import { Toast } from "../ui/toast.js";
import {
    showFullScreenLoader,
    hideFullScreenLoader,
    setButtonLoading,
    showPromptModal
} from "../ui/ui.js";
import { isRateLimited, resetRateLimit, getRemainingAttempts } from "../utils/rate-limiter.js";

// ========== TYPE DEFINITIONS ==========

export type UserRole = 'admin' | 'super_admin' | 'full_admin' | 'operator' | 'accounting' | 'billing';

export interface AssignedStation {
    id: string;
    name?: string;
}

export interface UserStationData {
    station_id: string;
    fuel_stations?: {
        station_name?: string;
    };
}

export interface LoggedUserData {
    user_id: number | string;
    email: string;
    full_name: string;
    role: UserRole;
    user_stations?: UserStationData[];
    assignedStations?: AssignedStation[];
}

export type LoginSuccessCallback = (user: LoggedUserData) => void;

// ========== MODULE STATE ==========

// Rate Limiter for Login (5 attempts per minute) - Prepared for future use
// const loginRateLimiter: RateLimiter = createRateLimiter(5, 60000);

let loginForm: HTMLFormElement | null = null;
let loginContainer: HTMLElement | null = null;
let appContainer: HTMLElement | null = null;
let loginError: HTMLElement | null = null;
let loginFormInitialized = false;

export let loggedUser: LoggedUserData | null = null;
let onLoginSuccessCallback: LoginSuccessCallback | null = null;

// ========== PUBLIC FUNCTIONS ==========

export function setOnLoginSuccess(callback: LoginSuccessCallback): void {
    onLoginSuccessCallback = callback;
}

export function setLoggedUser(user: LoggedUserData): void {
    loggedUser = user;
}

/**
 * Initialize login DOM elements when ready
 */
export function initLoginElements(): void {
    const form = document.getElementById('login-form') as HTMLFormElement | null;
    if (!form) return;

    if (form !== loginForm) {
        loginFormInitialized = false;
    }

    if (!loginFormInitialized) {
        loginForm = form;
        loginContainer = document.getElementById('login-container');
        appContainer = document.getElementById('app-container');
        loginError = document.getElementById('login-error');

        if (loginForm) {
            setupLoginForm();
            loginFormInitialized = true;
        }
    } else {
        loginForm = form;
        loginContainer = document.getElementById('login-container');
        appContainer = document.getElementById('app-container');
        loginError = document.getElementById('login-error');
    }
}

/**
 * Setup login form event listeners
 */
export function setupLoginForm(): void {
    if (!loginForm) return;
    if (loginFormInitialized) return;

    // Event delegation for password toggle
    loginForm.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement;
        const toggleBtn = target.closest('#toggle-password');
        if (toggleBtn) {
            e.preventDefault();
            e.stopPropagation();

            const passwordInput = loginForm?.querySelector('#password') as HTMLInputElement | null;
            const passwordIcon = toggleBtn.querySelector('i');

            if (passwordInput && passwordIcon) {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    passwordIcon.classList.remove('fa-eye');
                    passwordIcon.classList.add('fa-eye-slash');
                    (toggleBtn as HTMLElement).title = 'Nascondi password';
                } else {
                    passwordInput.type = 'password';
                    passwordIcon.classList.remove('fa-eye-slash');
                    passwordIcon.classList.add('fa-eye');
                    (toggleBtn as HTMLElement).title = 'Mostra password';
                }
            }
        }
    });

    loginForm.addEventListener('submit', async (e: Event) => {
        e.preventDefault();

        const errorElement = loginError || document.getElementById('login-error');
        if (errorElement) errorElement.textContent = "";

        const emailInput = loginForm?.querySelector('#email') as HTMLInputElement | null;
        const passwordInput = loginForm?.querySelector('#password') as HTMLInputElement | null;

        if (!emailInput || !passwordInput) {
            console.error('Email or password input not found');
            return;
        }

        const email = emailInput.value?.trim().toLowerCase();
        const password = passwordInput.value;

        if (!email || !password) {
            if (errorElement) errorElement.textContent = "Inserisci email e password.";
            return;
        }

        // SECURITY: Rate limiting - prevent brute force attacks
        const rateLimitKey = `login:${email}`;
        if (isRateLimited(rateLimitKey, 5, 60000)) { // 5 attempts per minute
            const remaining = getRemainingAttempts(rateLimitKey, 5);
            if (errorElement) {
                errorElement.textContent = `Troppi tentativi di login. Riprova tra 1 minuto. (${remaining} tentativi rimanenti)`;
            }
            Toast.show('Rate limit superato. Attendere prima di riprovare.', 'warning');
            return;
        }

        try {
            showFullScreenLoader();
            const submitBtn = loginForm?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
            (setButtonLoading as any)(submitBtn, true, 'Accesso in corso...');

            const { data: authData, error: authError } = await (supabase as any).auth.signInWithPassword({
                email: email,
                password: password
            });

            if (authError) {
                console.error('Auth error:', authError);
                if (authError.message && (
                    authError.message.includes('Email not confirmed') ||
                    authError.message.includes('email_not_confirmed')
                )) {
                    if (errorElement) {
                        errorElement.textContent = "Email non confermata. Contatta l'amministratore per la convalida.";
                    }
                    return;
                } else {
                    if (errorElement) {
                        errorElement.textContent =
                            authError.message === 'Invalid login credentials' ||
                                authError.message.includes('Invalid') ||
                                authError.message.includes('invalid')
                                ? "Email o password errati."
                                : `Errore: ${authError.message === 'User not found' ? 'Utente non trovato' : authError.message}`;
                    }
                    return;
                }
            }

            if (!authData?.user) {
                console.error('No user data returned');
                if (errorElement) errorElement.textContent = "Errore durante il login. Riprova.";
                return;
            }

            let { data: userData, error: userError } = await (supabase as any)
                .from('users')
                .select(`
                    *,
                    user_stations(
                        station_id,
                        fuel_stations(station_name)
                    )
                `)
                .eq('email', email)
                .maybeSingle();

            console.log('[Auth] User lookup for', email, 'result:', userData, 'error:', userError);

            if (!userData) {
                console.warn('User not found via standard SELECT. Attempting Secure RPC lookup...');
                const { data: rpcId, error: rpcError } = await (supabase as any).rpc('get_current_user_id');

                if (rpcId && !rpcError) {
                    userData = {
                        user_id: rpcId,
                        email: authData.user.email,
                        full_name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0] || 'Operatore',
                        role: authData.user.user_metadata?.role || 'operator'
                    };
                } else {
                    console.error('RPC lookup failed:', rpcError);
                    userData = {
                        user_id: authData.user.id,
                        email: authData.user.email,
                        full_name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0] || 'Operatore',
                        role: authData.user.user_metadata?.role || 'operator'
                    };
                    console.error("ATTENZIONE: Stiamo usando un UUID come user_id. Le query SQL potrebbero fallire.");
                }
            }

            if (userData?.role) {
                loggedUser = userData as LoggedUserData;
            } else {
                loggedUser = {
                    ...userData,
                    role: authData.user.user_metadata?.role || 'operator'
                } as LoggedUserData;
            }
            console.log('[Auth] Final LoggedUser:', loggedUser);

            if (loginContainer) loginContainer.style.display = 'none';
            if (appContainer) appContainer.style.display = 'block';

            const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(loggedUser.role);
            if (isAdminRole) {
                document.body.classList.add('admin-layout', 'desktop-layout');
            } else {
                document.body.classList.remove('admin-layout', 'desktop-layout');
            }

            if (onLoginSuccessCallback && loggedUser) {
                if (userData && userData.user_stations) {
                    loggedUser.assignedStations = userData.user_stations.map((us: UserStationData) => ({
                        id: us.station_id,
                        name: us.fuel_stations?.station_name
                    }));
                } else {
                    loggedUser.assignedStations = [];
                }
                onLoginSuccessCallback(loggedUser);

                // SECURITY: Reset rate limit on successful login
                resetRateLimit(`login:${email}`);
            }

        } catch (err: any) {
            console.error('Errore durante il login (catch):', err);
            if (errorElement) {
                errorElement.textContent = `Errore durante il login: ${err.message || 'Errore sconosciuto'}`;
            }
        } finally {
            hideFullScreenLoader();
            const submitBtn = loginForm?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
            (setButtonLoading as any)(submitBtn, false);
        }
    });
}

/**
 * Load existing session
 */
export async function loadSession(): Promise<LoggedUserData | null> {
    try {
        const isPasswordResetPersistent = localStorage.getItem('password_reset_session');
        if (isPasswordResetPersistent) {
            return null;
        }

        const { data: { session }, error } = await (supabase as any).auth.getSession();
        if (error || !session?.user) return null;

        const email = session.user.email;
        let { data: userData } = await (supabase as any)
            .from('users')
            .select(`
                *,
                user_stations(
                    station_id,
                    fuel_stations(station_name)
                )
            `)
            .eq('email', email)
            .maybeSingle();

        if (!userData) {
            console.warn('Session User not found via SELECT. Attempting Secure RPC...');
            const { data: rpcId, error: rpcError } = await (supabase as any).rpc('get_current_user_id');

            if (rpcId && !rpcError) {
                userData = {
                    user_id: rpcId,
                    email: session.user.email,
                    full_name: session.user.user_metadata?.full_name || 'Operatore',
                    role: session.user.user_metadata?.role || 'operator'
                };
            } else {
                userData = {
                    user_id: session.user.id,
                    email: session.user.email,
                    full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Operatore',
                    role: session.user.user_metadata?.role || 'operator'
                };
            }
        }

        if (!userData.role) {
            userData.role = session.user.user_metadata?.role || 'operator';
        }

        if (userData.user_stations) {
            userData.assignedStations = userData.user_stations.map((us: UserStationData) => ({
                id: us.station_id,
                name: us.fuel_stations?.station_name
            }));
        } else {
            userData.assignedStations = [];
        }

        return userData as LoggedUserData;
    } catch (err) {
        console.error('Errore nel caricamento sessione:', err);
        return null;
    }
}

/**
 * Clear current session and logout
 */
export async function clearSession(): Promise<void> {
    try {
        const { error } = await (supabase as any).auth.signOut();
        if (error) {
            console.error('Errore nel logout:', error);
        }

        // Clear Supabase localStorage keys
        const supabaseKeys = Object.keys(localStorage).filter(key =>
            key.startsWith('sb-') || key.includes('supabase')
        );
        supabaseKeys.forEach(key => localStorage.removeItem(key));

        // Clear sessionStorage
        const supabaseSessionKeys = Object.keys(sessionStorage).filter(key =>
            key.startsWith('sb-') || key.includes('supabase')
        );
        supabaseSessionKeys.forEach(key => sessionStorage.removeItem(key));

        // Reset loggedUser
        loggedUser = null;
    } catch (err) {
        console.error('Errore nel logout:', err);
    }
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
        const redirectUrl = `${window.location.origin}${window.location.pathname}`;

        localStorage.setItem('password_reset_email', email);

        const { error } = await (supabase as any).auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });

        if (error) throw error;

        (Toast as any).show('Email di reset password inviata! Usa il codice OTP a 6 cifre ricevuto via email.', 'success', 5000);

        showOTPResetForm();

        return { success: true };
    } catch (error: any) {
        console.error('Errore durante la richiesta di reset password:', error);
        (Toast as any).show('Errore durante l\'invio dell\'email di reset password: ' + error.message, 'error');
        return { success: false, error: error.message };
    }
}

/**
 * Show OTP reset form
 */
export function showOTPResetForm(): void {
    initLoginElements();
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    const mainContent = document.getElementById('main-content') || document.body;
    mainContent.innerHTML = `
        <div id="otp-reset-container" style="max-width: 400px; margin: 50px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="text-align: center; margin-bottom: 20px;">Reimposta Password</h2>
            <p style="text-align: center; color: #666; margin-bottom: 20px;">Inserisci il codice a 6 cifre ricevuto via email</p>
            <form id="otp-reset-form">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="otp-code">Codice OTP</label>
                    <input type="text" id="otp-code" name="otp-code" required maxlength="6" pattern="[0-9]{6}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; text-align: center; font-size: 24px; letter-spacing: 8px;"
                        placeholder="000000" autocomplete="off" />
                </div>
                <div id="otp-reset-error" style="color: red; margin-bottom: 15px; text-align: center; min-height: 20px;"></div>
                <button type="submit" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold;">Verifica Codice</button>
                <button type="button" id="back-to-login-otp" style="width: 100%; padding: 10px; margin-top: 10px; background: #f5f5f5; color: #333; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 14px;">Torna al Login</button>
            </form>
        </div>
    `;

    const otpForm = document.getElementById('otp-reset-form') as HTMLFormElement;
    const otpInput = document.getElementById('otp-code') as HTMLInputElement;
    const errorElement = document.getElementById('otp-reset-error') as HTMLElement;
    const backButton = document.getElementById('back-to-login-otp') as HTMLButtonElement;

    if (otpInput) {
        otpInput.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            target.value = target.value.replace(/[^0-9]/g, '');
        });
    }

    otpForm.addEventListener('submit', async (e: Event) => {
        e.preventDefault();
        errorElement.textContent = '';
        const otpCode = otpInput.value.trim();

        if (otpCode.length !== 6) {
            errorElement.textContent = 'Il codice deve essere di 6 cifre.';
            return;
        }

        try {
            errorElement.textContent = 'Verifica del codice in corso...';
            const savedEmail = localStorage.getItem('password_reset_email');

            if (!savedEmail) {
                const email = await (showPromptModal as any)('Inserisci la tua email per verificare il codice:', 'email@esempio.com', 'Email Richiesta');
                if (!email) {
                    errorElement.textContent = 'Email richiesta per verificare il codice.';
                    return;
                }
                sessionStorage.setItem('password_reset_in_progress', 'true');
                const { error } = await (supabase as any).auth.verifyOtp({ email: email, token: otpCode, type: 'recovery' });
                if (error) {
                    errorElement.textContent = 'Codice non valido o scaduto: ' + error.message;
                    return;
                }
                sessionStorage.setItem('password_reset_in_progress', 'true');
                localStorage.setItem('password_reset_session', 'true');
                showResetPasswordForm();
            } else {
                sessionStorage.setItem('password_reset_in_progress', 'true');
                const { error } = await (supabase as any).auth.verifyOtp({ email: savedEmail, token: otpCode, type: 'recovery' });
                if (error) {
                    errorElement.textContent = 'Codice non valido o scaduto: ' + error.message;
                    return;
                }
                sessionStorage.setItem('password_reset_in_progress', 'true');
                localStorage.setItem('password_reset_session', 'true');
                localStorage.removeItem('password_reset_email');
                showResetPasswordForm();
            }
        } catch (err: any) {
            errorElement.textContent = 'Errore imprevisto: ' + err.message;
        }
    });

    if (backButton) {
        backButton.addEventListener('click', () => {
            window.location.reload();
        });
    }
}

/**
 * Show reset password form
 */
export function showResetPasswordForm(): void {
    initLoginElements();
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    const mainContent = document.getElementById('main-content') || document.body;
    mainContent.innerHTML = `
        <div id="reset-password-container" style="max-width: 400px; margin: 50px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="text-align: center; margin-bottom: 20px;">Reimposta Password</h2>
            <p style="text-align: center; color: #666; margin-bottom: 20px;">Inserisci la tua nuova password</p>
            <form id="reset-password-form">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="new-password">Nuova Password</label>
                    <div class="password-wrapper">
                        <input type="password" id="new-password" name="new-password" required minlength="6" placeholder="Inserisci la nuova password" />
                        <button type="button" id="toggle-new-password" title="Mostra password"><i class="fas fa-eye" id="new-password-icon"></i></button>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="confirm-password">Conferma Password</label>
                    <div class="password-wrapper">
                        <input type="password" id="confirm-password" name="confirm-password" required minlength="6" placeholder="Conferma la nuova password" />
                        <button type="button" id="toggle-confirm-password" title="Mostra password"><i class="fas fa-eye" id="confirm-password-icon"></i></button>
                    </div>
                </div>
                <div id="reset-password-error" style="color: red; margin-bottom: 15px; text-align: center; min-height: 20px;"></div>
                <button type="submit" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold;">Aggiorna Password</button>
            </form>
        </div>
    `;

    const resetForm = document.getElementById('reset-password-form') as HTMLFormElement;
    const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
    const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;
    const errorElement = document.getElementById('reset-password-error') as HTMLElement;

    resetForm.addEventListener('submit', async (e: Event) => {
        e.preventDefault();
        errorElement.textContent = '';
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword.length < 6) {
            errorElement.textContent = 'La password deve essere di almeno 6 caratteri.';
            return;
        }
        if (newPassword !== confirmPassword) {
            errorElement.textContent = 'Le password non corrispondono.';
            return;
        }

        try {
            const { error } = await (supabase as any).auth.updateUser({ password: newPassword });
            if (error) {
                errorElement.textContent = 'Errore durante l\'aggiornamento della password: ' + error.message;
                return;
            }
            sessionStorage.removeItem('password_reset_in_progress');
            localStorage.removeItem('password_reset_session');
            await (supabase as any).auth.signOut();
            (Toast as any).show('Password aggiornata con successo! Ora puoi effettuare il login.', 'success');
            window.location.href = window.location.pathname;
        } catch (err: any) {
            errorElement.textContent = 'Errore imprevisto: ' + err.message;
        }
    });
}

/**
 * Handle password reset callback
 */
export async function handlePasswordReset(): Promise<void> {
    showResetPasswordForm();
}
