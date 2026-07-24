/**
 * Authentication Module
 * Handles user authentication, login, logout, and password reset
 */

import type { RealtimeChannel } from '@supabase/supabase-js';

import { deriveAuthAlias } from '../../supabase/functions/_shared/auth-identity.js';
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
import { quarantineUserActions, setOfflineQueueUserAliases } from './offline-queue.js';
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

const INVALID_LOGIN_MESSAGE = 'Username o password errati.';

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

let userStatusChannel: RealtimeChannel | null = null;
let userStatusRevalidationTimer: ReturnType<typeof setInterval> | null = null;

// ========== PUBLIC FUNCTIONS ==========

export function setOnLoginSuccess(callback: LoginSuccessCallback): void {
  onLoginSuccessCallback = callback;
}

export function setLoggedUser(user: LoggedUserData): void {
  userStatusGeneration++;
  loggedUser = user;
  if (user) {
    const aliases: string[] = [];
    if (user.id && typeof user.id === 'string' && user.id.trim()) {
      aliases.push(user.id.trim());
    }
    if (user.user_id != null) {
      const profileIdStr = String(user.user_id).trim();
      if (profileIdStr && !aliases.includes(profileIdStr)) {
        aliases.push(profileIdStr);
      }
    }
    setOfflineQueueUserAliases(aliases);
  } else {
    setOfflineQueueUserAliases(null);
  }
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

    const usernameInput = loginForm?.querySelector('#username') as HTMLInputElement | null;
    const passwordInput = loginForm?.querySelector('#password') as HTMLInputElement | null;

    if (!usernameInput || !passwordInput) {
      logger.error('auth', 'Form inputs not found');
      return;
    }

    // SECURITY: Validate input with Zod schema
    const validation = safeParse(LoginSchema, {
      username: usernameInput.value,
      password: passwordInput.value
    });

    if (!validation.success) {
      if (errorElement) {
        errorElement.textContent = validation.error;
      }
      return;
    }

    const { username, password } = validation.data;

    // SECURITY: Rate limiting - prevent brute force attacks.
    // NOTA (#255): è un limite solo client-side (bypassabile azzerando lo
    // stato locale) e serve come UX; la protezione reale contro il brute
    // force è il rate limiting di Supabase Auth lato server.
    const rateLimitKey = `login:${username}`;
    if (isRateLimited(rateLimitKey, 5, 60000)) {
      // 5 attempts per minute
      const remaining = getRemainingAttempts(rateLimitKey, 5);
      if (errorElement) {
        errorElement.textContent = `Troppi tentativi di login. Riprova tra 1 minuto. (${remaining} tentativi rimanenti)`;
      }
      Toast.show('Rate limit superato. Attendere prima di riprovare.', 'warning');
      return;
    }

    let authenticationSucceeded = false;
    try {
      showFullScreenLoader();
      const submitBtn = loginForm?.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      setButtonLoading(submitBtn, true, 'Accesso in corso...');

      // Get UI containers for later use
      const loginContainer = document.getElementById('login-container');
      const appContainer = document.getElementById('app-container');

      const authAlias = deriveAuthAlias(username);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authAlias,
        password: password
      });

      let userData: LoggedUserData | null = null;

      if (authError) {
        logger.error('auth', 'Auth error:', authError);

        // Auth errors never fall back to the application database.
        if (errorElement) {
          errorElement.textContent = INVALID_LOGIN_MESSAGE;
        }
        return;
      }

      if (!authData?.user) {
        logger.error('auth', 'No user data returned');
        if (errorElement) {
          errorElement.textContent = INVALID_LOGIN_MESSAGE;
        }
        return;
      }
      authenticationSucceeded = true;

      // Load the server-authoritative profile only after Auth succeeds. The
      // immutable Auth UUID keeps this lookup valid during an email-alias migration.
      if (authData?.user) {
        const userEmail = authData.user.email ?? authAlias;

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
          .eq('created_by_auth', authData.user.id)
          .maybeSingle();

        if (userError || !dbUserData) {
          const isInactive = userError?.message?.includes('account_inactive');
          if (userError) {
            logger.error('auth', 'Unable to load trusted user profile:', userError);
          } else {
            logger.warn('auth', 'Trusted user profile not found');
          }
          loggedUser = null;
          if (authData.user.id) {
            try {
              if (isInactive) {
                await quarantineUserActions(authData.user.id);
              }
            } catch (qErr) {
              logger.error('auth', 'quarantine failed during login cleanup:', qErr);
            }
          }
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            logger.error('auth', 'signOut failed during login cleanup:', signOutErr);
          }
          if (errorElement) {
            errorElement.textContent = isInactive
              ? 'Account disattivato. Contatta un amministratore.'
              : 'Profilo utente non disponibile o non autorizzato.';
          }
          return;
        }

        if (dbUserData.is_active === false) {
          logger.warn('auth', 'Trusted user profile is inactive (is_active=false)');
          loggedUser = null;
          const inactiveAliases: string[] = [];
          if (authData.user.id) inactiveAliases.push(authData.user.id);
          if (dbUserData.user_id != null) inactiveAliases.push(String(dbUserData.user_id));
          if (inactiveAliases.length > 0) {
            try {
              await quarantineUserActions(inactiveAliases);
            } catch (qErr) {
              logger.error('auth', 'quarantine failed during inactive login:', qErr);
            }
          }
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            logger.error('auth', 'signOut failed during inactive login:', signOutErr);
          }
          if (errorElement) {
            errorElement.textContent = 'Account disattivato. Contatta un amministratore.';
          }
          return;
        }

        const trustedRole = normalizeUserRole(dbUserData.role);
        if (!trustedRole) {
          logger.error('auth', 'Trusted user profile has an invalid role');
          loggedUser = null;
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            logger.error('auth', 'signOut failed during login cleanup:', signOutErr);
          }
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
      const aliases: string[] = [];
      if (userData.id) aliases.push(userData.id);
      if (userData.user_id != null) aliases.push(String(userData.user_id));
      setOfflineQueueUserAliases(aliases);

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
      // (runs in all environments, not just dev).
      // Preserviamo l'eventuale hash di deep-link (#/admin/...) perche' il
      // routing iniziale lo usa subito dopo il login.
      if (window.location.search) {
        const cleanUrl =
          window.location.protocol +
          '//' +
          window.location.host +
          window.location.pathname +
          window.location.hash;
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
        resetRateLimit(`login:${username}`);
      }

      if (onLoginSuccessCallback && loggedUser) {
        loggedUser.assignedStations = mapAssignedStations(loggedUser.user_stations);
        onLoginSuccessCallback(loggedUser);
      }

      setupUserStatusMonitoring(loggedUser.id);
    } catch (err: unknown) {
      logger.error('auth', 'Errore durante il login (catch):', err);
      loggedUser = null;
      if (authenticationSucceeded) {
        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          logger.error('auth', 'signOut failed after authenticated login exception:', signOutErr);
        }
      }
      if (errorElement) {
        errorElement.textContent = INVALID_LOGIN_MESSAGE;
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

    const email = session.user.email ?? '';

    let dbUserData: Record<string, unknown> | null = null;
    let profileError: { message?: string; code?: string; status?: number } | null = null;
    try {
      const res = await supabase
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
        .eq('created_by_auth', session.user.id)
        .maybeSingle();

      dbUserData = res.data;
      profileError = res.error;
    } catch (err) {
      if (isTransportOrOfflineError(err)) {
        logger.warn('auth', 'Transport/offline exception loading session profile:', err);
        return null;
      }
      profileError = err as { message?: string; code?: string; status?: number };
    }

    if (profileError) {
      if (isTransportOrOfflineError(profileError)) {
        logger.warn('auth', 'Transport/offline error loading session profile:', profileError);
        return null;
      }
      const isInactive = profileError?.message?.includes('account_inactive');
      logger.error('auth', 'Unable to load trusted session profile:', profileError);
      if (session.user.id) {
        try {
          if (isInactive) {
            await quarantineUserActions(session.user.id);
          }
        } catch (qErr) {
          logger.error('auth', 'Failed to quarantine user actions during session recovery:', qErr);
        }
      }
      await clearSession();
      if (isInactive) {
        Toast.show('Account disattivato. Contatta un amministratore.', 'error', 7000);
      }
      return null;
    }

    if (!dbUserData) {
      logger.warn('auth', 'Trusted session profile not found');
      await clearSession();
      return null;
    }

    if (dbUserData.is_active === false) {
      logger.warn('auth', 'Trusted session profile is inactive (is_active=false)');
      const inactiveAliases: string[] = [];
      if (session.user.id) inactiveAliases.push(session.user.id);
      if (dbUserData.user_id != null) inactiveAliases.push(String(dbUserData.user_id));
      if (inactiveAliases.length > 0) {
        try {
          await quarantineUserActions(inactiveAliases);
        } catch (qErr) {
          logger.error('auth', 'Failed to quarantine user actions during session recovery:', qErr);
        }
      }
      await clearSession();
      Toast.show('Account disattivato. Contatta un amministratore.', 'error', 7000);
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
      user_id: dbUserData.user_id as number,
      email: (dbUserData.email as string) || email,
      full_name: String(fullName),
      role: trustedRole,
      ...(dbUserData.user_stations
        ? { user_stations: dbUserData.user_stations as UserStationData[] }
        : {}),
      assignedStations: mapAssignedStations(
        dbUserData.user_stations as UserStationData[] | undefined
      )
    };

    // Install loggedUser FIRST
    loggedUser = userData;

    // Install offline queue user aliases SECOND
    const sessionAliases: string[] = [];
    if (userData.id) sessionAliases.push(userData.id);
    if (userData.user_id != null) sessionAliases.push(String(userData.user_id));
    setOfflineQueueUserAliases(sessionAliases);

    // Setup user status monitoring THIRD
    setupUserStatusMonitoring(userData.id);

    return userData;
  } catch (err) {
    logger.error('auth', 'Errore nel caricamento sessione:', err);
    return null;
  }
}

/**
 * Clear current session and logout
 */
export async function clearSession(expectedGen?: number, targetUserId?: string): Promise<void> {
  if (expectedGen !== undefined && expectedGen !== userStatusGeneration) {
    logger.warn('auth', 'Stale clearSession ignored (generation mismatch)');
    return;
  }
  if (targetUserId && loggedUser && loggedUser.id !== targetUserId) {
    logger.warn('auth', 'Stale clearSession ignored (user mismatch)');
    return;
  }

  cleanupUserStatusMonitoring();
  const genAfterCleanup = userStatusGeneration;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.error('auth', 'Errore nel logout:', error);
    }
  } catch (err) {
    logger.error('auth', 'Errore nel logout:', err);
  } finally {
    if (
      userStatusGeneration !== genAfterCleanup &&
      loggedUser !== null &&
      (targetUserId === undefined || loggedUser.id !== targetUserId)
    ) {
      logger.warn(
        'auth',
        'Stale clearSession finally block skipped (account switched during signOut)'
      );
    } else if (targetUserId && loggedUser && loggedUser.id !== targetUserId) {
      logger.warn(
        'auth',
        'Stale clearSession finally block skipped (user mismatch during signOut)'
      );
    } else {
      // Clear Supabase localStorage keys
      const localKeysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          localKeysToRemove.push(key);
        }
      }
      localKeysToRemove.forEach(key => localStorage.removeItem(key));

      // Clear sessionStorage
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));

      // Reset loggedUser and offline queue aliases
      loggedUser = null;
      setOfflineQueueUserAliases(null);
    }
  }
}

let userStatusGeneration = 0;
let userStatusMonitoredUserId: string | null = null;

function isMonitoringSessionValid(monitoredUserId: string, gen: number): boolean {
  return (
    userStatusGeneration === gen &&
    userStatusMonitoredUserId === monitoredUserId &&
    loggedUser !== null &&
    loggedUser.id === monitoredUserId
  );
}

/**
 * Handle immediate account deactivation on event or verification check
 */
export async function handleUserDeactivation(userId: string, expectedGen?: number): Promise<void> {
  if (expectedGen !== undefined && expectedGen !== userStatusGeneration) {
    logger.warn('auth', 'Stale deactivation ignored (generation mismatch):', userId);
    return;
  }
  if (loggedUser && loggedUser.id !== userId) {
    logger.warn('auth', 'Stale deactivation ignored (user mismatch):', userId);
    return;
  }

  logger.warn('auth', 'Handling user deactivation for:', userId);

  const currentGen = userStatusGeneration;

  const aliases: string[] = [];
  if (userId && typeof userId === 'string' && userId.trim()) {
    aliases.push(userId.trim());
  }
  if (loggedUser && loggedUser.id === userId && loggedUser.user_id != null) {
    const profileIdStr = String(loggedUser.user_id).trim();
    if (profileIdStr && !aliases.includes(profileIdStr)) {
      aliases.push(profileIdStr);
    }
  }

  if (aliases.length > 0) {
    try {
      await quarantineUserActions(aliases);
    } catch (qErr) {
      logger.error('auth', 'Failed to quarantine user actions during deactivation:', qErr);
    }
  }

  if (userStatusGeneration !== currentGen || (loggedUser && loggedUser.id !== userId)) {
    logger.warn('auth', 'Stale deactivation ignored after quarantine (account switched):', userId);
    return;
  }

  try {
    await clearSession(currentGen, userId);
  } catch (csErr) {
    logger.error('auth', 'clearSession failed during deactivation:', csErr);
    if (userStatusGeneration === currentGen && loggedUser && loggedUser.id === userId) {
      loggedUser = null;
    }
  }

  if (userStatusGeneration !== currentGen && loggedUser !== null && loggedUser.id !== userId) {
    logger.warn('auth', 'Stale deactivation ignored before UI update (account switched):', userId);
    return;
  }
  if (loggedUser !== null && loggedUser.id !== userId) {
    logger.warn('auth', 'Stale deactivation ignored before UI update (user mismatch):', userId);
    return;
  }

  Toast.show('Account disattivato. Contatta un amministratore.', 'error', 7000);

  const errorElement = document.getElementById('login-error');
  if (errorElement) {
    errorElement.textContent = 'Account disattivato. Contatta un amministratore.';
  }

  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('app-container');
  if (loginContainer) {
    loginContainer.style.display = 'block';
    loginContainer.classList.remove('hidden');
  }
  if (appContainer) {
    appContainer.style.display = 'none';
    appContainer.classList.add('hidden');
  }
}

/**
 * Handle session clearance for missing or ambiguous user profile
 */
export async function handleInvalidProfileSession(
  message: string,
  userId?: string,
  expectedGen?: number
): Promise<void> {
  if (expectedGen !== undefined && expectedGen !== userStatusGeneration) {
    logger.warn('auth', 'Stale invalid profile session handler ignored (generation mismatch)');
    return;
  }
  if (userId && loggedUser && loggedUser.id !== userId) {
    logger.warn('auth', 'Stale invalid profile session handler ignored (user mismatch)');
    return;
  }

  logger.warn('auth', 'Handling invalid profile session:', message);

  const currentGen = userStatusGeneration;

  await clearSession(currentGen, userId);

  if (
    userStatusGeneration !== currentGen &&
    loggedUser !== null &&
    (userId === undefined || loggedUser.id !== userId)
  ) {
    logger.warn('auth', 'Stale invalid profile session handler ignored after clearSession');
    return;
  }
  if (userId && loggedUser && loggedUser.id !== userId) {
    logger.warn(
      'auth',
      'Stale invalid profile session handler ignored after clearSession (user mismatch)'
    );
    return;
  }

  Toast.show(message, 'error', 7000);

  const errorElement = document.getElementById('login-error');
  if (errorElement) {
    errorElement.textContent = message;
  }

  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('app-container');
  if (loginContainer) {
    loginContainer.style.display = 'block';
    loginContainer.classList.remove('hidden');
  }
  if (appContainer) {
    appContainer.style.display = 'none';
    appContainer.classList.add('hidden');
  }
}

function isAuthoritativeSemanticError(err: unknown): boolean {
  if (!err) {
    return false;
  }
  const errorObj = err as { message?: string; name?: string; status?: number; code?: string };
  const msg = (errorObj.message || String(err)).toLowerCase();
  const code = (errorObj.code || '').toLowerCase();

  return (
    msg.includes('account_inactive') ||
    msg.includes('profile_missing') ||
    msg.includes('profile_ambiguous') ||
    msg.includes('pgrst116') ||
    code === 'pgrst116'
  );
}

function isTransportOrOfflineError(err: unknown): boolean {
  if (isAuthoritativeSemanticError(err)) {
    return false;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  if (!err) {
    return false;
  }
  const errorObj = err as { message?: string; name?: string; status?: number; code?: string };
  const msg = (errorObj.message || String(err)).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    (errorObj.name === 'TypeError' && msg.includes('fetch')) ||
    errorObj.status === 0 ||
    errorObj.code === 'FetchError'
  );
}

/**
 * Check if the active user profile remains active (is_active !== false)
 */
export async function checkUserActiveStatus(
  userId: string,
  expectedGen?: number
): Promise<boolean> {
  if (expectedGen !== undefined && expectedGen !== userStatusGeneration) {
    return true;
  }
  if (loggedUser && loggedUser.id !== userId) {
    return true;
  }

  try {
    const { data: dbUserData, error } = await supabase
      .from('users')
      .select('is_active')
      .eq('created_by_auth', userId)
      .maybeSingle();

    if (expectedGen !== undefined && expectedGen !== userStatusGeneration) {
      return true;
    }
    if (loggedUser && loggedUser.id !== userId) {
      return true;
    }

    if (error) {
      if (isTransportOrOfflineError(error)) {
        logger.warn('auth', 'Transport/offline error checking user active status:', error);
        return true;
      }

      const msg = error.message || '';
      const code = error.code || '';
      if (msg.includes('account_inactive')) {
        await handleUserDeactivation(userId, expectedGen);
        return false;
      }
      if (
        msg.includes('profile_missing') ||
        msg.includes('profile_ambiguous') ||
        code === 'PGRST116' ||
        msg.includes('PGRST116')
      ) {
        await handleInvalidProfileSession(
          'Profilo utente non disponibile o non autorizzato.',
          userId,
          expectedGen
        );
        return false;
      }

      logger.error('auth', 'Semantic/unknown error checking user active status:', error);
      await handleInvalidProfileSession(
        'Profilo utente non disponibile o non autorizzato.',
        userId,
        expectedGen
      );
      return false;
    }

    if (!dbUserData) {
      logger.warn('auth', 'User active status check returned null data without error');
      await handleInvalidProfileSession(
        'Profilo utente non disponibile o non autorizzato.',
        userId,
        expectedGen
      );
      return false;
    }

    if (dbUserData.is_active === false) {
      await handleUserDeactivation(userId, expectedGen);
      return false;
    }

    return true;
  } catch (err) {
    if (expectedGen !== undefined && expectedGen !== userStatusGeneration) {
      return true;
    }
    if (loggedUser && loggedUser.id !== userId) {
      return true;
    }

    if (isTransportOrOfflineError(err)) {
      logger.warn('auth', 'Transport/offline exception checking user active status:', err);
      return true;
    }

    const errorObj = err as { message?: string; code?: string };
    const msg = (errorObj?.message || String(err)).toLowerCase();
    if (msg.includes('account_inactive')) {
      await handleUserDeactivation(userId, expectedGen);
      return false;
    }

    logger.error('auth', 'Exception checking user active status:', err);
    await handleInvalidProfileSession(
      'Profilo utente non disponibile o non autorizzato.',
      userId,
      expectedGen
    );
    return false;
  }
}

/**
 * Subscribe to Realtime postgres_changes on users table for the active user
 * and set up fallback periodic revalidation.
 */
export function setupUserStatusMonitoring(userId: string): void {
  cleanupUserStatusMonitoring();

  if (!userId) {
    return;
  }

  const currentGen = userStatusGeneration;
  userStatusMonitoredUserId = userId;

  try {
    userStatusChannel = supabase
      .channel(`user_status_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `created_by_auth=eq.${userId}`
        },
        async payload => {
          if (!isMonitoringSessionValid(userId, currentGen)) {
            logger.warn('auth', 'Ignoring stale Realtime update event for:', userId);
            return;
          }
          const updatedUser = payload.new as { is_active?: boolean | null } | undefined;
          if (updatedUser && updatedUser.is_active === false) {
            logger.warn('auth', 'Realtime update: user is_active set to false');
            if (!isMonitoringSessionValid(userId, currentGen)) {
              logger.warn('auth', 'Ignoring stale Realtime update event after check for:', userId);
              return;
            }
            await handleUserDeactivation(userId, currentGen);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || err) {
          logger.error('auth', 'Realtime user status subscription error:', err || status);
        }
      });
  } catch (err) {
    logger.error('auth', 'Failed to subscribe to user status realtime:', err);
  }

  userStatusRevalidationTimer = setInterval(async () => {
    if (!isMonitoringSessionValid(userId, currentGen)) {
      cleanupUserStatusMonitoring();
      return;
    }
    await checkUserActiveStatus(userId, currentGen);
    if (!isMonitoringSessionValid(userId, currentGen)) {
      return;
    }
  }, 60000);
}

/**
 * Clean up active user status Realtime channel and revalidation timer
 */
export function cleanupUserStatusMonitoring(): void {
  userStatusGeneration++;
  userStatusMonitoredUserId = null;
  if (userStatusChannel) {
    try {
      supabase.removeChannel(userStatusChannel).catch((err: unknown) => {
        logger.error('auth', 'Error removing userStatusChannel async:', err);
      });
    } catch (err) {
      logger.error('auth', 'Error removing userStatusChannel:', err);
    }
    userStatusChannel = null;
  }
  if (userStatusRevalidationTimer !== null) {
    clearInterval(userStatusRevalidationTimer);
    userStatusRevalidationTimer = null;
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
                        <input type="password" id="new-password" name="new-password" required minlength="12" placeholder="Inserisci la nuova password" />
                        <button type="button" id="toggle-new-password" title="Mostra password" aria-label="Mostra password"><i class="fas fa-eye" id="new-password-icon"></i></button>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="confirm-password">Conferma Password</label>
                    <div class="password-wrapper">
                        <input type="password" id="confirm-password" name="confirm-password" required minlength="12" placeholder="Conferma la nuova password" />
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

    if (newPassword.length < 12) {
      errorElement.textContent = 'La password deve essere di almeno 12 caratteri.';
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
