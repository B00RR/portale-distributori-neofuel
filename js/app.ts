// ==========================================
// APP ENTRY POINT
// ==========================================
import { registerSW } from 'virtual:pwa-register';

import { showAdminArea } from './admin.js';
import { initAnalytics, trackLogin } from './core/analytics.js';
import { supabase } from './core/api.js';
import {
  initLoginElements, loadSession, setLoggedUser, setOnLoginSuccess,
  handlePasswordReset, requestPasswordReset
} from './core/auth.js';
import { LoggedUserData } from './core/auth.js';
import { logger } from './core/logger.js';
import { showOperatorMenu } from './operator.js';
import { store, User as StateUser } from './shared/state.js';
import type { Json } from './core/api.js';
import { CustomWindow } from './types.js';
import { Toast } from './ui/toast.js';
import './ui/ui-settings-panel.js';
import { initializeCalculationPresets } from './utils/calculation-presets.js';

const customWindow = window as unknown as CustomWindow;
const APP_VERSION = '1.2.0'; // Increment manually on breaking changes

interface RpcResult {
  success: boolean;
  error?: string;
}

function isRpcResult(value: unknown): value is RpcResult {
  return typeof value === 'object' && value !== null && 'success' in value && typeof value.success === 'boolean';
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
    const result: { [key: string]: Json | undefined } = {};
    for (const key of Object.keys(value)) {
      result[key] = toJsonValue((value as Record<string, unknown>)[key]);
    }
    return result;
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
  return {
    id: loggedUser.id,
    user_id: String(loggedUser.user_id),
    email: loggedUser.email,
    full_name: loggedUser.full_name,
    role: loggedUser.role,
    station_id: loggedUser.station_id ?? null
  };
}

// Espone funzioni globali per compatibilità
customWindow.requestPasswordReset = requestPasswordReset;

async function initializeApp(): Promise<void> {
  // Initialize monitoring and analytics
  initAnalytics();

  // VERSION GUARD: Clear stale session data if version mismatch
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    logger.info('App', `Version mismatch: ${storedVersion} -> ${APP_VERSION}. Clearing Supabase cache.`);
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
    const { initOfflineQueue, setupAutoSync, registerExecutor } = await import('./core/offline-queue.js');
    await initOfflineQueue();

    // Register executors for offline actions
    registerExecutor('voucher_redeem', async (action) => {
      const payload = action.payload as { voucherCode: string; stationId: string; operatorId: string };

      // Ensure stationId is a number
      const stationIdNum = Number(payload.stationId);
      if (isNaN(stationIdNum)) {
        logger.error('OfflineQueue', 'Invalid station ID:', payload.stationId);
        return false;
      }

      const { data: result, error } = await supabase.rpc('redeem_voucher_validated', {
        p_voucher_code: payload.voucherCode,
        p_station_id: stationIdNum,
        p_operator_id: payload.operatorId
      });
      if (error || (result && isRpcResult(result) && !result.success)) {
        logger.error('OfflineQueue', 'Voucher redeem failed:', error || getRpcError(result));
        return false;
      }
      return true;
    });

    registerExecutor('shift_close', async (action) => {
      const payload = action.payload as {
        shiftId: string;
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
        p_tank_usage: []
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

    const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(userForStore.role);
    if (isAdminRole) {
      showAdminArea();
    } else {
      // ALWAYS fetch the authoritative station_id from DB, ignoring potential stale session data
      const dbUserId = parseUserId(userForStore.user_id);
      if (dbUserId === undefined) {
        logger.error('App', 'Invalid user_id from store:', userForStore.user_id);
        Toast.show('Errore identificativo utente', 'error');
        return;
      }
      const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', dbUserId).maybeSingle();
      const stId = us?.station_id ?? null;

      if (stId) {
        // Update the user object in store with the fresh station_id
        const freshUser = { ...userForStore, station_id: stId };
        store.setUser(freshUser);
        try {
          await showOperatorMenu(String(userForStore.id), stId);
        } catch (err) {
          logger.error('App', 'Failed to show operator menu:', err);
          Toast.show('Errore durante il caricamento del menu operatore', 'error');
        }
      } else {
        Toast.show('Nessuna stazione assegnata all\'utente', 'error');
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
        Toast.show('Errore identificativo utente', 'error');
      } else {
        const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', dbUserId).maybeSingle();
        const stId = us?.station_id ?? null;

        if (stId) {
          const freshUser = mapLoggedUserToStoreUser({ ...loggedUser, station_id: stId });
          store.setUser(freshUser);
          try {
            await showOperatorMenu(String(loggedUser.id), stId);
          } catch (err) {
            logger.error('App', 'Failed to restore operator menu:', err);
            Toast.show('Errore durante il ripristino della sessione', 'error');
          }
        } else {
          Toast.show('Nessuna stazione assegnata all\'utente', 'error');
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

// PWA Update Handler
// PWA Update Handler
let updateToastShown = false;

const updateSW = registerSW({
  onNeedRefresh() {
    if (updateToastShown) {return;}
    updateToastShown = true;

    Toast.show('Nuova versione disponibile!', 'info', 0, {
      action: {
        text: 'AGGIORNA',
        onClick: () => {
          logger.info('PWA', 'Update button clicked');
          // Force reload immediately after clicking
          updateSW(true)
            .then(() => {
              logger.info('PWA', 'Update accepted, reloading...');
              // Force hard reload to bypass cache
              window.location.reload();
              return undefined;
            })
            .catch(e => {
              logger.error('PWA', 'Update failed:', e);
              // Reload anyway to try to get new version
              window.location.reload();
            });
        }
      }
    });
  },
  onOfflineReady() {
    Toast.show('App pronta per l\'uso offline', 'success');
  },
  onRegistered(r: ServiceWorkerRegistration | undefined): void {
    if (!r) {return;}

    // Poll for updates every 60 seconds (less aggressive)
    setInterval(() => {
      r.update().catch(() => { /* ignore */ });
    }, 60 * 1000);

    // Immediate check when window gets focus
    window.addEventListener('focus', () => {
      r.update().catch(() => { /* ignore */ });
    });
  }
});
