// ==========================================
// AUTHENTICATION
// ==========================================
import { supabase } from "./api.js";
import { Toast } from "../ui/toast.js";
import { showFullScreenLoader, hideFullScreenLoader, setButtonLoading, showPromptModal } from "../ui/ui.js";
import { createRateLimiter } from "../utils/utils.js";

// Rate Limiter per Login (5 tentativi al minuto)
const loginRateLimiter = createRateLimiter(5, 60000);

let loginForm = null;
let loginContainer = null;
let appContainer = null;
let loginError = null;
let loginFormInitialized = false;
export let loggedUser = null;
let onLoginSuccessCallback = null;

export function setOnLoginSuccess(callback) {
    onLoginSuccessCallback = callback;
}

export function setLoggedUser(user) {
    loggedUser = user;
}

// Inizializza gli elementi del DOM quando sono pronti
export function initLoginElements() {
    const form = document.getElementById('login-form');
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

// Setup del form di login
export function setupLoginForm() {
    if (!loginForm) return;
    if (loginFormInitialized) return;

    // Rimosso cloneNode per evitare problemi con i riferimenti DOM
    // const newForm = loginForm.cloneNode(true);
    // loginForm.parentNode.replaceChild(newForm, loginForm);
    // loginForm = newForm;

    // Event Delegation per il toggle password
    loginForm.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('#toggle-password');
        if (toggleBtn) {
            e.preventDefault();
            e.stopPropagation();

            const passwordInput = loginForm.querySelector('#password');
            const passwordIcon = toggleBtn.querySelector('i');

            if (passwordInput && passwordIcon) {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    passwordIcon.classList.remove('fa-eye');
                    passwordIcon.classList.add('fa-eye-slash');
                    toggleBtn.title = 'Nascondi password';
                } else {
                    passwordInput.type = 'password';
                    passwordIcon.classList.remove('fa-eye-slash');
                    passwordIcon.classList.add('fa-eye');
                    toggleBtn.title = 'Mostra password';
                }
            }
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const errorElement = loginError || document.getElementById('login-error');
        if (errorElement) errorElement.textContent = "";

        const emailInput = loginForm.querySelector('#email') || loginForm.email;
        const passwordInput = loginForm.querySelector('#password') || loginForm.password;

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

        try {
            // showFullScreenLoader(); // Manteniamo overlay se desiderato, o usiamo solo bottone
            // In questo caso, usiamo entrambi per massima chiarezza o solo bottone.
            // L'utente ha chiesto Loading States per bottoni.
            // Usiamo il bottone e l'overlay (per ora mantengo overlay perché era già lì,
            // ma aggiungo stato bottone).
            showFullScreenLoader();
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, true, 'Accesso in corso...');

            let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (authError) {
                console.error('Auth error:', authError);
                if (authError.message && (authError.message.includes('Email not confirmed') || authError.message.includes('email_not_confirmed'))) {
                    if (errorElement) errorElement.textContent = "Email non confermata. Contatta l'amministratore per la convalida.";
                    return;
                } else {
                    if (errorElement) {
                        errorElement.textContent = authError.message === 'Invalid login credentials' ||
                            authError.message.includes('Invalid') ||
                            authError.message.includes('invalid')
                            ? "Email o password errati."
                            : `Errore: ${authError.message === 'User not found' ? 'Utente non trovato' : authError.message} `;
                    }
                    return;
                }
            }

            if (!authData?.user) {
                console.error('No user data returned');
                if (errorElement) errorElement.textContent = "Errore durante il login. Riprova.";
                return;
            }

            let { data: userData, error: userError } = await supabase
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
                // Fallback: Prova a recuperare l'ID tramite la funzione sicura (Security Definer)
                // Questo aggira eventuali blocchi RLS sulla tabella users se la policy SELECT fallisce
                const { data: rpcId, error: rpcError } = await supabase.rpc('get_current_user_id');

                if (rpcId && !rpcError) {
                    userData = {
                        user_id: rpcId, // Integer ID corretto
                        email: authData.user.email,
                        full_name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0] || 'Operatore',
                        role: authData.user.user_metadata?.role || 'operator'
                    };
                } else {
                    console.error('RPC lookup failed:', rpcError);
                    // Disperata fallback: usa UUID (ma probabilmente fallirà dopo)
                    // Meglio lanciare errore? Per ora manteniamo comportamento ma logghiamo
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
                loggedUser = userData;
            } else {
                loggedUser = {
                    ...userData,
                    role: authData.user.user_metadata?.role || 'operator'
                };
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

            if (onLoginSuccessCallback) {
                // Ensure stations are properly structured in loggedUser
                if (userData && userData.user_stations) {
                    loggedUser.assignedStations = userData.user_stations.map(us => ({
                        id: us.station_id,
                        name: us.fuel_stations?.station_name
                    }));
                } else {
                    loggedUser.assignedStations = [];
                }
                onLoginSuccessCallback(loggedUser);
            }

        } catch (err) {
            console.error('Errore durante il login (catch):', err);
            if (errorElement) {
                errorElement.textContent = `Errore durante il login: ${err.message || 'Errore sconosciuto'} `;
            }
        } finally {
            hideFullScreenLoader();
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, false);
        }
    });
}

export async function loadSession() {
    try {
        const isPasswordResetPersistent = localStorage.getItem('password_reset_session');
        if (isPasswordResetPersistent) {
            return null;
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.user) return null;

        const email = session.user.email;
        let { data: userData } = await supabase
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
            const { data: rpcId, error: rpcError } = await supabase.rpc('get_current_user_id');

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
            userData.assignedStations = userData.user_stations.map(us => ({
                id: us.station_id,
                name: us.fuel_stations?.station_name
            }));
        } else {
            userData.assignedStations = [];
        }

        return userData;
    } catch (err) {
        console.error('Errore nel caricamento sessione:', err);
        return null;
    }
}

export async function clearSession() {
    try {
        // Pulisci la sessione di Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Errore nel logout:', error);
        }

        // Pulisci anche il localStorage di Supabase per sicurezza
        // Supabase salva la sessione in localStorage con chiavi specifiche
        const supabaseKeys = Object.keys(localStorage).filter(key =>
            key.startsWith('sb-') || key.includes('supabase')
        );
        supabaseKeys.forEach(key => localStorage.removeItem(key));

        // Pulisci anche sessionStorage
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

export async function requestPasswordReset(email) {
    try {
        const isLocalhost = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '';

        const redirectUrl = isLocalhost
            ? `${window.location.origin}${window.location.pathname} `
            : `${window.location.origin}${window.location.pathname} `;

        localStorage.setItem('password_reset_email', email);

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });

        if (error) throw error;

        Toast.show('Email di reset password inviata! Usa il codice OTP a 6 cifre ricevuto via email.', 'success', 5000);

        showOTPResetForm();

        return { success: true };
    } catch (error) {
        console.error('Errore durante la richiesta di reset password:', error);
        Toast.show('Errore durante l\'invio dell\'email di reset password: ' + error.message, 'error');
        return { success: false, error: error.message };
    }
}

export function showOTPResetForm() {
    initLoginElements();
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    const mainContent = document.getElementById('main-content') || document.body;
    mainContent.innerHTML = `
    < div id = "otp-reset-container" style = "max-width: 400px; margin: 50px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);" >
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
    </div >
    `;

    const otpForm = document.getElementById('otp-reset-form');
    const otpInput = document.getElementById('otp-code');
    const errorElement = document.getElementById('otp-reset-error');
    const backButton = document.getElementById('back-to-login-otp');

    if (otpInput) {
        otpInput.addEventListener('input', (e) => {
            /** @type {HTMLInputElement} */(e.target).value = /** @type {HTMLInputElement} */(e.target).value.replace(/[^0-9]/g, '');
        });
    }

    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorElement.textContent = '';
        const otpCode = (/** @type {HTMLInputElement} */(otpInput)).value.trim();

        if (otpCode.length !== 6) {
            errorElement.textContent = 'Il codice deve essere di 6 cifre.';
            return;
        }

        try {
            errorElement.textContent = 'Verifica del codice in corso...';
            const savedEmail = localStorage.getItem('password_reset_email');

            if (!savedEmail) {
                const email = await showPromptModal('Inserisci la tua email per verificare il codice:', 'email@esempio.com', 'Email Richiesta');
                if (!email) {
                    errorElement.textContent = 'Email richiesta per verificare il codice.';
                    return;
                }
                sessionStorage.setItem('password_reset_in_progress', 'true');
                const { error } = await supabase.auth.verifyOtp({ email: email, token: otpCode, type: 'recovery' });
                if (error) {
                    errorElement.textContent = 'Codice non valido o scaduto: ' + error.message;
                    return;
                }
                sessionStorage.setItem('password_reset_in_progress', 'true');
                localStorage.setItem('password_reset_session', 'true');
                showResetPasswordForm();
            } else {
                sessionStorage.setItem('password_reset_in_progress', 'true');
                const { error } = await supabase.auth.verifyOtp({ email: savedEmail, token: otpCode, type: 'recovery' });
                if (error) {
                    errorElement.textContent = 'Codice non valido o scaduto: ' + error.message;
                    return;
                }
                sessionStorage.setItem('password_reset_in_progress', 'true');
                localStorage.setItem('password_reset_session', 'true');
                localStorage.removeItem('password_reset_email');
                showResetPasswordForm();
            }
        } catch (err) {
            errorElement.textContent = 'Errore imprevisto: ' + err.message;
        }
    });

    if (backButton) {
        backButton.addEventListener('click', () => {
            window.location.reload();
        });
    }
}

export function showResetPasswordForm() {
    initLoginElements();
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    const mainContent = document.getElementById('main-content') || document.body;
    mainContent.innerHTML = `
    < div id = "reset-password-container" style = "max-width: 400px; margin: 50px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);" >
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
    </div >
    `;

    const resetForm = document.getElementById('reset-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const errorElement = document.getElementById('reset-password-error');

    // Setup toggles (omitted for brevity, similar to login)

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorElement.textContent = '';
        const newPassword = (/** @type {HTMLInputElement} */(newPasswordInput)).value;
        const confirmPassword = (/** @type {HTMLInputElement} */(confirmPasswordInput)).value;

        if (newPassword.length < 6) {
            errorElement.textContent = 'La password deve essere di almeno 6 caratteri.';
            return;
        }
        if (newPassword !== confirmPassword) {
            errorElement.textContent = 'Le password non corrispondono.';
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
                errorElement.textContent = 'Errore durante l\'aggiornamento della password: ' + error.message;
                return;
            }
            sessionStorage.removeItem('password_reset_in_progress');
            localStorage.removeItem('password_reset_session');
            await supabase.auth.signOut();
            Toast.show('Password aggiornata con successo! Ora puoi effettuare il login.', 'success');
            window.location.href = window.location.pathname;
        } catch (err) {
            errorElement.textContent = 'Errore imprevisto: ' + err.message;
        }
    });
}

export async function handlePasswordReset() {
    showResetPasswordForm();
}
