// ==========================================
// APP ENTRY POINT
// ==========================================
import { showAdminArea } from './admin.js';
import { initAnalytics, trackLogin } from './core/analytics.js';
import { supabase } from './core/api.js';
import {
  initLoginElements, loadSession, setLoggedUser, setOnLoginSuccess,
  handlePasswordReset, requestPasswordReset
} from './core/auth.js';
import { LoggedUserData } from './core/auth.js';
import { showOperatorMenu } from './operator.js';
import { store, User as StateUser } from './shared/state.js';
import { CustomWindow } from './types.js';
import { Toast } from './ui/toast.js';
import './ui/ui-settings-panel.js';
import { initializeCalculationPresets } from './utils/calculation-presets.js';

import { registerSW } from 'virtual:pwa-register';

const customWindow = window as unknown as CustomWindow;
const APP_VERSION = '1.2.0'; // Increment manually on breaking changes

// Espone funzioni globali per compatibilità
customWindow.requestPasswordReset = requestPasswordReset;

async function initializeApp(): Promise<void> {
  // Initialize monitoring and analytics
  initAnalytics();

  // VERSION GUARD: Clear stale session data if version mismatch
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    console.log(`[App] Version mismatch: ${storedVersion} -> ${APP_VERSION}. Clearing Supabase cache.`);
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
        console.error('[OfflineQueue] Invalid station ID:', payload.stationId);
        return false;
      }

      const { data: result, error } = await supabase.rpc('redeem_voucher_validated', {
        p_voucher_code: payload.voucherCode,
        p_station_id: stationIdNum,
        p_operator_id: payload.operatorId
      });
      if (error || (result && !result.success)) {
        console.error('[OfflineQueue] Voucher redeem failed:', error || result?.error);
        return false;
      }
      return true;
    });

    registerExecutor('shift_close', async (action) => {
      const payload = action.payload as {
                shiftId: number; stationId: number; closingData: Record<string, unknown>;
                isFinal: boolean; finalCounters: unknown
            };
      const { data: res, error } = await supabase.rpc('submit_shift_closure', {
        p_shift_id: payload.shiftId,
        p_station_id: payload.stationId,
        p_closing_data: payload.closingData,
        p_is_final: payload.isFinal,
        p_final_counters: payload.finalCounters,
        p_tank_usage: []
      });
      if (error || (res && !res.success)) {
        console.error('[OfflineQueue] Shift close failed:', error || res?.error);
        return false;
      }
      return true;
    });

    setupAutoSync();
    console.log('[App] Offline queue initialized with executors');
  } catch (err) {
    console.warn('[App] Offline queue initialization failed:', err);
  }

  // Configura callback login
  // Configura callback login
  setOnLoginSuccess(async (loggedUser: LoggedUserData) => {
    // Explicitly map LoggedUserData to the User interface required by store
    // We ensure all required properties are present
    const userForStore: StateUser = {
      id: loggedUser.id,
      user_id: String(loggedUser.user_id),
      email: loggedUser.email,
      full_name: loggedUser.full_name,
      role: loggedUser.role as StateUser['role'],
      station_id: loggedUser.station_id
    } as StateUser;

    store.setUser(userForStore);

    // Track login event
    trackLogin(userForStore.role);

    const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(userForStore.role);
    if (isAdminRole) {
      showAdminArea();
    } else {
      // ALWAYS fetch the authoritative station_id from DB, ignoring potential stale session data
      let stId: number | null = null;
      const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', userForStore.user_id).maybeSingle();
      stId = us?.station_id;

      if (stId) {
        // Update the user object in store with the fresh station_id
        const freshUser = { ...userForStore, station_id: stId };
        store.setUser(freshUser);
        try {
          await showOperatorMenu(String(userForStore.id), stId);
        } catch (err) {
          console.error('[App] Failed to show operator menu:', err);
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
    store.setUser(loggedUser as unknown as StateUser);

    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');

    if (loginContainer) { loginContainer.style.display = 'none'; }
    if (appContainer) { appContainer.style.display = 'block'; }

    const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(loggedUser.role);
    if (isAdminRole) {
      document.body.classList.add('admin-layout', 'desktop-layout');
      showAdminArea();
    } else {
      document.body.classList.remove('admin-layout', 'desktop-layout');

      // ALWAYS fetch the authoritative station_id from DB
      let stId: number | null = null;
      const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', String(loggedUser.user_id)).maybeSingle();
      stId = us?.station_id;

      if (stId) {
        const freshUser = { ...loggedUser, station_id: stId } as unknown as StateUser;
        store.setUser(freshUser);
        try {
          await showOperatorMenu(String(loggedUser.id), stId);
        } catch (err) {
          console.error('[App] Failed to restore operator menu:', err);
          Toast.show('Errore durante il ripristino della sessione', 'error');
        }
      } else {
        Toast.show('Nessuna stazione assegnata all\'utente', 'error');
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
          console.log('[PWA] Update button clicked');
          // Force reload immediately after clicking
          updateSW(true)
            .then(() => {
              console.log('[PWA] Update accepted, reloading...');
              // Force hard reload to bypass cache
              (window.location as any).reload(true);
            })
            .catch(e => {
              console.error('[PWA] Update failed:', e);
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
  onRegistered(r) {
    if (!r) {return;}

    // Poll for updates every 60 seconds (less aggressive)
    setInterval(() => {
      r.update().catch(() => { });
    }, 60 * 1000);

    // Immediate check when window gets focus
    window.addEventListener('focus', () => {
      r.update().catch(() => { });
    });
  }
});
