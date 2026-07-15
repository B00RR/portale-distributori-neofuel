/**
 * Authentication Module
 * Handles user authentication, login, logout, and password reset
 */

import { handleError } from '../shared/error-handler.js';
import { isBackofficeRole, normalizeUserRole, type UserRole } from '../shared/roles.js';
import { Toast } from '../ui/toast.js';
import {
  showFullScreenLoader,
  hideFullScreenLoader,
  setButtonLoading,
  showPromptModal
} from '../ui/ui.js';
import { isRateLimited, resetRateLimit, getRemainingAttempts } from '../utils/rate-limiter.js';
import { setSafeHTML } from '../utils/sanitizer.js';

import { supabase } from './api.js';
import { logger } from './logger.js';
import { LoginSchema, safeParse } from './schemas.js';

// ========== TYPE DEFINITIONS ==========

export type { UserRole } from '../shared/roles.js';

export interface AssignedStation {
  id: number;
  name?: string | undefined;
}

export interface UserStationData {
  station_id: number;
  fuel_stations?: {
    station_name?: string;
  };
}

export interface LoggedUserData {
  id: string; // Supabase Auth UUID
  user_id: number; // Database user_id
  email: string;
  full_name: string;
  role: UserRole;
  station_id?: number | null;
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
  if (!form) {
    return;
  }

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

function mapAssignedStations(stations: UserStationData[] | undefined | null): AssignedStation[] {
  if (!stations) {
    return [];
  }
  return stations.map(us => ({
    id: us.station_id,
    name: us.fuel_stations?.station_name ?? undefined
  }));
}

function setPasswordToggleState(
  toggleBtn: HTMLElement,
  passwordInput: HTMLInputElement,
  passwordIcon: HTMLElement
): void {
  const isHidden = passwordInput.type === 'password';
  const label = isHidden ? 'Mostra password' : 'Nascondi password';

  passwordIcon.classList.toggle('fa-eye', isHidden);
  passwordIcon.classList.toggle('fa-eye-slash', !isHidden);
  toggleBtn.title = label;
  toggleBtn.setAttribute('aria-label', label);
}

function setupPasswordToggle(toggleId: string, inputId: string, iconId: string): void {
  const toggleBtn = document.getElementById(toggleId);
  const passwordInput = document.getElementById(inputId) as HTMLInputElement | null;
  const passwordIcon = document.getElementById(iconId);

  if (!toggleBtn || !passwordInput || !passwordIcon) {
    return;
  }

  setPasswordToggleState(toggleBtn, passwordInput, passwordIcon);

  toggleBtn.addEventListener('click', (e: Event) => {
    e.preventDefault();
    e.stopPropagation();

    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    setPasswordToggleState(toggleBtn, passwordInput, passwordIcon);
  });
}

/**
 * Setup login form event listeners
 */
export function setupLoginForm(): void {
  if (!loginForm) {
    return;
  }
  if (loginFormInitialized) {
    return;
  }

  // Direct event listener for password toggle (more reliable than delegation)
  setupPasswordToggle('toggle-password', 'password', 'password-icon');

  loginForm.addEventListener('submit', async (e: Event) => {
    e.preventDefault();

    const errorElement = loginError || document.getElementById('login-error');
    if (errorElement) {
      errorElement.textContent = '';
    }

    // Defense-in-depth: enforce native HTML5 constraints (required, type=email)
    // and surface field-level feedback before any further processing. This guards
    // the path where native validation was bypassed (e.g. inline onsubmit removed).
    if (loginForm && !loginForm.checkValidity()) {
      loginForm.reportValidity();
      return;
    }

    const emailInput = loginForm?.querySelector('#email') as HTMLInputElement | null;
    const passwordInput = loginForm?.querySelector('#password') as HTMLInputElement | null;

    if (!emailInput || !passwordInput) {
      logger.error('auth', 'Form inputs not found');
      return;
    }

    // SECURITY: Validate input with Zod schema
    const validation = safeParse(LoginSchema, {
      email: emailInput.value,
      password: passwordInput.value
    });

    if (!validation.success) {
      if (errorElement) {
        errorElement.textContent = validation.error;
      }
      return;
    }

    const { email, password } = validation.data;

    // SECURITY: Rate limiting - prevent brute force attacks.
    // NOTA (#255): è un limite solo client-side (bypassabile azzerando lo
    // stato locale) e serve come UX; la protezione reale contro il brute
    // force è il rate limiting di Supabase Auth lato server.
    const rateLimitKey = `login:${email}`;
    if (isRateLimited(rateLimitKey, 5, 60000)) {
      // 5 attempts per minute
      const remaining = getRemainingAttempts(rateLimitKey, 5);
      if (errorElement) {
        errorElement.textContent = `Troppi tentativi di login. Riprova tra 1 minuto. (${remaining} tentativi rimanenti)`;
      }
      Toast.show('Rate limit superato. Attendere prima di riprovare.', 'warning');
      return;
    }

    try {
      showFullScreenLoader();
      const submitBtn = loginForm?.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      setButtonLoading(submitBtn, true, 'Accesso in corso...');

      // Get UI containers for later use
      const loginContainer = document.getElementById('login-container');
      const appContainer = document.getElementById('app-container');

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      let userData: LoggedUserData | null = null;

      if (authError) {
        logger.error('auth', 'Auth error:', authError);

        // Email not confirmed error
        if (
          authError.message &&
          (authError.message.includes('Email not confirmed') ||
            authError.message.includes('email_not_confirmed'))
        ) {
          if (errorElement) {
            errorElement.textContent =
              "Email non confermata. Contatta l'amministratore per la convalida.";
          }
          return;
        }

        // Invalid credentials or other errors - NO DATABASE FALLBACK
        if (errorElement) {
          errorElement.textContent =
            authError.message === 'Invalid login credentials' ||
            authError.message.includes('Invalid') ||
            authError.message.includes('invalid')
              ? 'Email o password errati.'
              : `Errore: ${authError.message === 'User not found' ? 'Utente non trovato' : authError.message}`;
        }
        return;
      }

      if (!authData?.user) {
        logger.error('auth', 'No user data returned');
        if (errorElement) {
          errorElement.textContent = 'Errore durante il login. Riprova.';
        }
        return;
      }

      // Fetch user data from database using authenticated user's email
      if (authData?.user) {
        if (!authData.user.email) {
          if (errorElement) {
            errorElement.textContent = 'Errore: email utente non disponibile.';
          }
          return;
        }
        const userEmail = authData.user.email;

        const { data: dbUserData, error: userError } = await supabase
          .from('users')
          .select(
            `
                    *,
                    user_stations(
                        station_id,
                        fuel_stations(station_name)
                    )
                `
          )
          .eq('email', userEmail)
          .maybeSingle();

        if (userError || !dbUserData) {
          if (userError) {
            logger.error('auth', 'Unable to load trusted user profile:', userError);
          } else {
            logger.warn('auth', 'Trusted user profile not found');
          }
          loggedUser = null;
          await supabase.auth.signOut();
          if (errorElement) {
            errorElement.textContent = 'Profilo utente non disponibile o non autorizzato.';
          }
          return;
        }

        const trustedRole = normalizeUserRole(dbUserData.role);
        if (!trustedRole) {
          logger.error('auth', 'Trusted user profile has an invalid role');
          loggedUser = null;
          await supabase.auth.signOut();
          if (errorElement) {
            errorElement.textContent = 'Ruolo utente non valido.';
          }
          return;
        }

        const fullName =
          dbUserData.full_name ||
          authData.user.user_metadata?.full_name ||
          userEmail.split('@')[0] ||
          'Operatore';
        userData = {
          id: authData.user.id,
          user_id: dbUserData.user_id,
          email: dbUserData.email,
          full_name: fullName,
          role: trustedRole,
          user_stations: dbUserData.user_stations,
          assignedStations: mapAssignedStations(dbUserData.user_stations)
        };
      }

      // Final userData validation
      if (!userData) {
        logger.error('auth', 'Failed to get userData from any source');
        if (errorElement) {
          errorElement.textContent = 'Errore durante il login. Utente non trovato.';
        }
        return;
      }

      loggedUser = userData;

      // [TESTBILITY] Allow role override via query param for E2E testing (dev-only)
      if (import.meta.env.DEV) {
        const urlParams = new URLSearchParams(window.location.search);
        const testRole = urlParams.get('test_role');
        if (testRole && (testRole === 'operator' || testRole === 'admin')) {
          const validRole: UserRole = testRole === 'admin' ? 'admin' : 'operator';
          loggedUser.role = validRole;
        }
      }

      // SECURITY: Clean URL to remove any credentials that may have leaked
      // (runs in all environments, not just dev)
      if (window.location.search || window.location.hash) {
        const cleanUrl =
          window.location.protocol + '//' + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }

      if (loginContainer) {
        loginContainer.style.display = 'none';
        loginContainer.classList.add('hidden');
      }
      if (appContainer) {
        appContainer.classList.remove('hidden');
        appContainer.style.display = 'block';
      }

      if (isBackofficeRole(loggedUser.role)) {
        document.body.classList.add('admin-layout', 'desktop-layout');
      } else {
        document.body.classList.remove('admin-layout', 'desktop-layout');
      }

      if (loggedUser) {
        // SECURITY: Reset rate limit on successful login — incondizionato,
        // non deve dipendere dalla presenza del callback (#255).
        resetRateLimit(`login:${email}`);
      }

      if (onLoginSuccessCallback && loggedUser) {
        loggedUser.assignedStations = mapAssignedStations(loggedUser.user_stations);
        onLoginSuccessCallback(loggedUser);
      }
    } catch (err: unknown) {
      logger.error('auth', 'Errore durante il login (catch):', err);
      if (errorElement) {
        const message = err instanceof Error ? err.message : 'Errore sconosciuto';
        errorElement.textContent = `Errore durante il login: ${message}`;
      }
    } finally {
      hideFullScreenLoader();
      const submitBtn = loginForm?.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      setButtonLoading(submitBtn, false);
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

    const {
      data: { session },
      error
    } = await supabase.auth.getSession();
    if (error || !session?.user) {
      return null;
    }

    const email = session.user.email;
    if (!email) {
      return null;
    }

    const { data: dbUserData, error: profileError } = await supabase
      .from('users')
      .select(
        `
                *,
                user_stations(
                    station_id,
                    fuel_stations(station_name)
                )
            `
      )
      .eq('email', email)
      .maybeSingle();

    if (profileError || !dbUserData) {
      if (profileError) {
        logger.error('auth', 'Unable to load trusted session profile:', profileError);
      } else {
        logger.warn('auth', 'Trusted session profile not found');
      }
      await supabase.auth.signOut();
      return null;
    }

    const trustedRole = normalizeUserRole(dbUserData.role);
    if (!trustedRole) {
      logger.error('auth', 'Trusted session profile has an invalid role');
      await supabase.auth.signOut();
      return null;
    }

    const fullName =
      dbUserData.full_name ||
      session.user.user_metadata?.full_name ||
      email.split('@')[0] ||
      'Operatore';
    const userData: LoggedUserData = {
      id: session.user.id,
      user_id: dbUserData.user_id,
      email: dbUserData.email,
      full_name: fullName,
      role: trustedRole,
      user_stations: dbUserData.user_stations,
      assignedStations: mapAssignedStations(dbUserData.user_stations)
    };

    userData.assignedStations = mapAssignedStations(userData.user_stations);

    return userData;
  } catch (err) {
    logger.error('auth', 'Errore nel caricamento sessione:', err);
    return null;
  }
}

/**
 * Clear current session and logout
 */
export async function clearSession(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.error('auth', 'Errore nel logout:', error);
    }

    // Clear Supabase localStorage keys
    const supabaseKeys = Object.keys(localStorage).filter(
      key => key.startsWith('sb-') || key.includes('supabase')
    );
    supabaseKeys.forEach(key => localStorage.removeItem(key));

    // Clear sessionStorage
    const supabaseSessionKeys = Object.keys(sessionStorage).filter(
      key => key.startsWith('sb-') || key.includes('supabase')
    );
    supabaseSessionKeys.forEach(key => sessionStorage.removeItem(key));

    // Reset loggedUser
    loggedUser = null;
  } catch (err) {
    logger.error('auth', 'Errore nel logout:', err);
  }
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;

    localStorage.setItem('password_reset_email', email);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

    if (error) {
      throw error;
    }

    Toast.show(
      'Email di reset password inviata! Usa il codice OTP a 6 cifre ricevuto via email.',
      'success',
      5000
    );

    showOTPResetForm();

    return { success: true };
  } catch (error: unknown) {
    handleError(error, 'authResetPassword');
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    return { success: false, error: message };
  }
}

/**
 * Show OTP reset form
 */
export function showOTPResetForm(): void {
  initLoginElements();
  if (loginContainer) {
    loginContainer.style.display = 'none';
  }
  if (appContainer) {
    appContainer.style.display = 'block';
  }

  const mainContent = document.getElementById('main-content') || document.body;
  setSafeHTML(
    mainContent,
    `
        <div id="otp-reset-container" style="max-width: 400px; margin: 50px auto; padding: 20px; background: var(--bg-surface); border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="text-align: center; margin-bottom: 20px;">Reimposta Password</h2>
            <p style="text-align: center; color: var(--text-secondary); margin-bottom: 20px;">Inserisci il codice a 6 cifre ricevuto via email</p>
            <form id="otp-reset-form">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="otp-code">Codice OTP</label>
                    <input type="text" id="otp-code" name="otp-code" required maxlength="6" pattern="[0-9]{6}"
                        style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; text-align: center; font-size: 24px; letter-spacing: 8px;"
                        placeholder="000000" autocomplete="off" />
                </div>
                <div id="otp-reset-error" style="color: var(--danger-color); margin-bottom: 15px; text-align: center; min-height: 20px;"></div>
                <button type="submit" class="menu-button success" style="width: 100%; margin-top: 10px;">Verifica Codice</button>
                <button type="button" id="back-to-login-otp" class="menu-button secondary" style="width: 100%; margin-top: 12px;">Torna al Login</button>
            </form>
        </div>
    `
  );

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
        const email = await showPromptModal(
          'Inserisci la tua email per verificare il codice:',
          'email@esempio.com',
          'Email Richiesta'
        );
        if (!email) {
          errorElement.textContent = 'Email richiesta per verificare il codice.';
          return;
        }
        sessionStorage.setItem('password_reset_in_progress', 'true');
        const { error } = await supabase.auth.verifyOtp({
          email: email,
          token: otpCode,
          type: 'recovery'
        });
        if (error) {
          errorElement.textContent = 'Codice non valido o scaduto: ' + error.message;
          return;
        }
        sessionStorage.setItem('password_reset_in_progress', 'true');
        localStorage.setItem('password_reset_session', 'true');
        showResetPasswordForm();
      } else {
        sessionStorage.setItem('password_reset_in_progress', 'true');
        const { error } = await supabase.auth.verifyOtp({
          email: savedEmail,
          token: otpCode,
          type: 'recovery'
        });
        if (error) {
          errorElement.textContent = 'Codice non valido o scaduto: ' + error.message;
          return;
        }
        sessionStorage.setItem('password_reset_in_progress', 'true');
        localStorage.setItem('password_reset_session', 'true');
        localStorage.removeItem('password_reset_email');
        showResetPasswordForm();
      }
    } catch (err: unknown) {
      const msg =
        'Errore imprevisto: ' + (err instanceof Error ? err.message : 'Errore sconosciuto');
      if (errorElement) {
        errorElement.textContent = msg;
      } else {
        logger.error('auth', 'OTP reset failure (no error element):', msg);
      }
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
  if (loginContainer) {
    loginContainer.style.display = 'none';
  }
  if (appContainer) {
    appContainer.style.display = 'block';
  }

  const mainContent = document.getElementById('main-content') || document.body;
  setSafeHTML(
    mainContent,
    `
        <div id="reset-password-container" style="max-width: 400px; margin: 50px auto; padding: 20px; background: var(--bg-surface); border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="text-align: center; margin-bottom: 20px;">Reimposta Password</h2>
            <p style="text-align: center; color: var(--text-secondary); margin-bottom: 20px;">Inserisci la tua nuova password</p>
            <form id="reset-password-form">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="new-password">Nuova Password</label>
                    <div class="password-wrapper">
                        <input type="password" id="new-password" name="new-password" required minlength="6" placeholder="Inserisci la nuova password" />
                        <button type="button" id="toggle-new-password" title="Mostra password" aria-label="Mostra password"><i class="fas fa-eye" id="new-password-icon"></i></button>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="confirm-password">Conferma Password</label>
                    <div class="password-wrapper">
                        <input type="password" id="confirm-password" name="confirm-password" required minlength="6" placeholder="Conferma la nuova password" />
                        <button type="button" id="toggle-confirm-password" title="Mostra password" aria-label="Mostra password"><i class="fas fa-eye" id="confirm-password-icon"></i></button>
                    </div>
                </div>
                <div id="reset-password-error" style="color: var(--danger-color); margin-bottom: 15px; text-align: center; min-height: 20px;"></div>
                <button type="submit" class="menu-button success" style="width: 100%; margin-top: 10px;">Aggiorna Password</button>
            </form>
        </div>
    `
  );

  const resetForm = document.getElementById('reset-password-form') as HTMLFormElement;
  const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
  const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;
  const errorElement = document.getElementById('reset-password-error') as HTMLElement;

  setupPasswordToggle('toggle-new-password', 'new-password', 'new-password-icon');
  setupPasswordToggle('toggle-confirm-password', 'confirm-password', 'confirm-password-icon');

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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        errorElement.textContent =
          "Errore durante l'aggiornamento della password: " + error.message;
        return;
      }
      sessionStorage.removeItem('password_reset_in_progress');
      localStorage.removeItem('password_reset_session');
      await supabase.auth.signOut();
      Toast.show('Password aggiornata con successo! Ora puoi effettuare il login.', 'success');
      window.location.href = window.location.pathname;
    } catch (err: unknown) {
      const msg =
        'Errore imprevisto: ' + (err instanceof Error ? err.message : 'Errore sconosciuto');
      if (errorElement) {
        errorElement.textContent = msg;
      } else {
        logger.error('auth', 'Password reset failure (no error element):', msg);
      }
    }
  });
}

/**
 * Handle password reset callback
 */
export async function handlePasswordReset(): Promise<void> {
  showResetPasswordForm();
}
