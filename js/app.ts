// ==========================================
// APP ENTRY POINT
// ==========================================
import { registerSW } from 'virtual:pwa-register';

import { showAdminArea } from './admin.js';
import { initAnalytics, trackLogin } from './core/analytics.js';
import { supabase } from './core/api.js';
import type { Json } from './core/api.js';
import {
  initLoginElements,
  loadSession,
  setLoggedUser,
  setOnLoginSuccess,
  handlePasswordReset,
  requestPasswordReset
} from './core/auth.js';
import { LoggedUserData } from './core/auth.js';
import { logger } from './core/logger.js';
import { initOfflineQueue, setupAutoSync, registerExecutor } from './core/offline-queue.js';
import './operator/offline-financial-executors-v2.js';
import { ensureSelectedOperatorStation } from './operator/station-context.js';
import { showOperatorMenu } from './operator.js';
import { handleError, AppError } from './shared/error-handler.js';
import { store, User as StateUser } from './shared/state.js';
import { CustomWindow } from './types.js';
import './ui/ui-settings-panel.js';
import { initializeCalculationPresets } from './utils/calculation-presets.js';

const customWindow = window as unknown as CustomWindow;
const APP_VERSION = '1.2.0'; // Increment manually on breaking changes

interface RpcResult {
  success: boolean;
  error?: string;
}

function isRpcResult(value: unknown): value is RpcResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof value.success === 'boolean'
  );
}

function getRpcError(value: unknown): string | undefined {
  if (isRpcResult(value)) {
    return value.error;
  }
  return undefined;
}

function toJsonValue(value: unknown): Json {
  if (value === undefined) {
    return null;
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as Json;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue) as Json;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, toJsonValue(val)])
    ) as Json;
  }
  return null;
}

function parseUserId(userId: string | number | undefined): number | undefined {
  if (userId === undefined || userId === null || userId === '') {
    return undefined;
  }
  const parsed = Number(userId);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

function mapLoggedUserToStoreUser(loggedUser: LoggedUserData): StateUser {
  const user: StateUser = {
    id: loggedUser.id,
    user_id: String(loggedUser.user_id),
    email: loggedUser.email,
    full_name: loggedUser.full_name,
    role: loggedUser.role,
    station_id: loggedUser.station_id ?? null
  };

  if (loggedUser.assignedStations) {
    user.assignedStations = loggedUser.assignedStations.map(station =>
      station.name ? { id: station.id, name: station.name } : { id: station.id }
    );
  }

  return user;
}

type AssignedStation = NonNullable<StateUser['assignedStations']>[number];

function readStationNameFromRelation(relation: unknown): string | undefined {
  const station = Array.isArray(relation) ? relation[0] : relation;
  if (typeof station !== 'object' || station === null || !('station_name' in station)) {
    return undefined;
  }

  const name = (station as { station_name?: unknown }).station_name;
  return typeof name === 'string' ? name : undefined;
}

async function fetchAssignedStations(dbUserId: number): Promise<AssignedStation[]> {
  const { data, error } = await supabase
    .from('user_stations')
    .select('station_id, fuel_stations(station_name)')
    .eq('user_id', dbUserId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ station_id: string | number; fuel_stations?: unknown }>).map(
    row => {
      const name = readStationNameFromRelation(row.fuel_stations);
      return name ? { id: row.station_id, name } : { id: row.station_id };
    }
  );
}

async function buildOperatorUserContext(
  userForStore: StateUser,
  dbUserId: number
): Promise<{ user: StateUser; stationId: string | null }> {
  const assignedStations = await fetchAssignedStations(dbUserId);
  return ensureSelectedOperatorStation({
    ...userForStore,
    station_id: userForStore.station_id ?? assignedStations[0]?.id ?? null,
    assignedStations
  });
}

// Espone funzioni globali per compatibilità
customWindow.requestPasswordReset = requestPasswordReset;

async function initializeApp(): Promise<void> {
  // Initialize monitoring and analytics
  initAnalytics();

  // VERSION GUARD: Clear stale session data if version mismatch
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    logger.info(
      'App',
      `Version mismatch: ${storedVersion} -> ${APP_VERSION}. Clearing Supabase cache.`
    );
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem('app_version', APP_VERSION);
  }

  initializeCalculationPresets();

  // Initialize offline queue for background sync
  try {
    await initOfflineQueue();

    // Register executors for offline actions
    registerExecutor('voucher_redeem', async action => {
      const payload = action.payload as {
        voucherCode: string;
        stationId: string;
        operatorId: string;
      };

      // Ensure stationId is a number
      const stationIdNum = Number(payload.stationId);
      if (isNaN(stationIdNum)) {
        logger.error('OfflineQueue', 'Invalid station ID:', payload.stationId);
        return false;
      }

      const { data: result, error } = await supabase.rpc('redeem_voucher_validated', {
        p_voucher_code: payload.voucherCode,
        p_station_id: stationIdNum,
        p_operator_id: payload.operatorId,
        p_request_id: action.id
      });
      if (error || (result && isRpcResult(result) && !result.success)) {
        logger.error('OfflineQueue', 'Voucher redeem failed:', error || getRpcError(result));
        return false;
      }
      return true;
    });

    registerExecutor('shift_close', async action => {
      const payload = action.payload as {
        shiftId: number;
        stationId: number;
        closingData: { [key: string]: unknown };
        isFinal: boolean;
        finalCounters: unknown;
      };
      const closingData = toJsonValue(payload.closingData);
      const finalCounters = toJsonValue(payload.finalCounters);
      const { data: res, error } = await supabase.rpc('submit_shift_closure', {
        p_shift_id: payload.shiftId,
        p_station_id: payload.stationId,
        p_closing_data: closingData,
        p_is_final: payload.isFinal,
        p_final_counters: finalCounters,
        p_tank_usage: [],
        p_request_id: action.id
      });
      if (error || (res && isRpcResult(res) && !res.success)) {
        logger.error('OfflineQueue', 'Shift close failed:', error || getRpcError(res));
        return false;
      }
      return true;
    });

    setupAutoSync();
    logger.info('App', 'Offline queue initialized with executors');
  } catch (err) {
    logger.warn('App', 'Offline queue initialization failed:', err);
  }

  // Configura callback login
  // Configura callback login
  setOnLoginSuccess(async (loggedUser: LoggedUserData) => {
    const userForStore = mapLoggedUserToStoreUser(loggedUser);
    store.setUser(userForStore);

    // Track login event
    trackLogin(userForStore.role);

    const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(
      userForStore.role
    );
    if (isAdminRole) {
      showAdminArea();
    } else {
      // ALWAYS fetch the authoritative station_id from DB, ignoring potential stale session data
      const dbUserId = parseUserId(userForStore.user_id);
      if (dbUserId === undefined) {
        logger.error('App', 'Invalid user_id from store:', userForStore.user_id);
        handleError(new AppError('Errore identificativo utente', 'VALIDATION_ERROR'), 'App');
        return;
      }
      try {
        const { user: freshUser, stationId } = await buildOperatorUserContext(
          userForStore,
          dbUserId
        );

        if (!stationId) {
          handleError(
            new AppError("Nessuna stazione assegnata all'utente", 'VALIDATION_ERROR'),
            'App'
          );
          return;
        }

        // Update the user object in store with all assignments and selected station_id.
        store.setUser(freshUser);
        try {
          await showOperatorMenu(String(userForStore.id), stationId);
        } catch (menuError) {
          logger.error('App', 'Failed to show operator menu:', menuError);
          handleError(
            new AppError(
              'Errore durante il caricamento del menu operatore',
              'APP_ERROR',
              menuError
            ),
            'App'
          );
        }
      } catch (err) {
        logger.error('App', 'Failed to load operator station assignments:', err);
        handleError(
          new AppError('Errore durante il caricamento delle stazioni operatore', 'APP_ERROR', err),
          'App'
        );
      }
    }
  });

  // Gestione reset password da URL
  const urlParams = new URLSearchParams(window.location.search);
  const tokenHash = urlParams.get('token_hash');
  const type = urlParams.get('type');

  if (tokenHash && type === 'recovery') {
    await handlePasswordReset();
    return;
  }

  // Controllo sessione esistente
  const loggedUser = await loadSession();
  if (loggedUser) {
    setLoggedUser(loggedUser);
    store.setUser(mapLoggedUserToStoreUser(loggedUser));

    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');

    // NB: la classe .hidden usa `display: none !important`, quindi impostare
    // solo lo style inline non basta: va rimossa/aggiunta la classe come fa
    // il percorso di login (auth.ts), altrimenti al ripristino sessione
    // (reload con sessione valida) l'app resterebbe nascosta.
    if (loginContainer) {
      loginContainer.classList.add('hidden');
      loginContainer.style.display = 'none';
    }
    if (appContainer) {
      appContainer.classList.remove('hidden');
      appContainer.style.display = 'block';
    }

    const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(loggedUser.role);
    if (isAdminRole) {
      document.body.classList.add('admin-layout', 'desktop-layout');
      showAdminArea();
    } else {
      document.body.classList.remove('admin-layout', 'desktop-layout');

      // ALWAYS fetch the authoritative station_id from DB
      const dbUserId = parseUserId(loggedUser.user_id);
      if (dbUserId === undefined) {
        logger.error('App', 'Invalid user_id from session:', loggedUser.user_id);
        handleError(new AppError('Errore identificativo utente', 'VALIDATION_ERROR'), 'App');
      } else {
        try {
          const { user: freshUser, stationId } = await buildOperatorUserContext(
            mapLoggedUserToStoreUser(loggedUser),
            dbUserId
          );

          if (!stationId) {
            handleError(
              new AppError("Nessuna stazione assegnata all'utente", 'VALIDATION_ERROR'),
              'App'
            );
            return;
          }

          store.setUser(freshUser);
          try {
            await showOperatorMenu(String(loggedUser.id), stationId);
          } catch (menuError) {
            logger.error('App', 'Failed to restore operator menu:', menuError);
            handleError(
              new AppError('Errore durante il ripristino della sessione', 'APP_ERROR', menuError),
              'App'
            );
          }
        } catch (err) {
          logger.error('App', 'Failed to restore operator station assignments:', err);
          handleError(
            new AppError(
              'Errore durante il caricamento delle stazioni operatore',
              'APP_ERROR',
              err
            ),
            'App'
          );
        }
      }
    }
  } else {
    initLoginElements();
  }
}

// Avvio
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// PWA Update Handler - silent auto-update when app is idle
let pendingSWUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

function applyUpdateWhenIdle(updateFn: (reloadPage?: boolean) => Promise<void>): void {
  pendingSWUpdate = updateFn;

  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }

  idleCheckInterval = setInterval(() => {
    if (store.isLoading() || store.isBusy()) {
      return;
    }

    const activeModal = document.getElementById('app-modal');
    if (activeModal && activeModal.style.display === 'flex') {
      return;
    }

    const focusedTag = document.activeElement?.tagName?.toLowerCase();
    const focusedInForm = !!(
      document.activeElement &&
      (focusedTag === 'input' ||
        focusedTag === 'textarea' ||
        focusedTag === 'select' ||
        document.activeElement.closest('form'))
    );
    if (focusedInForm) {
      return;
    }

    // App is idle: apply update silently
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }

    logger.info('PWA', 'App idle; applying silent update');
    updateFn(true)
      .then(() => {
        window.location.reload();
        return undefined;
      })
      .catch(e => {
        logger.error('PWA', 'Silent update failed:', e);
        // Try a plain reload as fallback
        window.location.reload();
      });
  }, 2000);
}

const updateSW = registerSW({
  onNeedRefresh() {
    if (!pendingSWUpdate) {
      logger.info('PWA', 'New version available; waiting for idle state to update silently');
      applyUpdateWhenIdle(updateSW);
    }
  },
  onOfflineReady() {
    // Silently ignore offline-ready notification
  },
  onRegistered(r: ServiceWorkerRegistration | undefined): void {
    if (!r) {
      return;
    }

    // Poll for updates every 60 seconds (less aggressive)
    setInterval(() => {
      r.update().catch(() => {
        /* ignore */
      });
    }, 60 * 1000);

    // Immediate check when window gets focus
    window.addEventListener('focus', () => {
      r.update().catch(() => {
        /* ignore */
      });
    });
  }
});
