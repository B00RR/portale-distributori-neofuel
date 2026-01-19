// ==========================================
// APP ENTRY POINT
// ==========================================
import { showAdminArea } from './admin.js';
import { initAnalytics, trackLogin } from './core/analytics.js';
import { supabase } from './core/api.js';
// import { initSentry, setSentryUser, clearSentryUser } from './core/sentry.js';
import {
  initLoginElements, loadSession, setLoggedUser, setOnLoginSuccess,
  handlePasswordReset, requestPasswordReset
} from './core/auth.js';
import { showOperatorMenu } from './operator.js';
import { store } from './shared/state.js';
import './utils/calculation-engine.js';
import { Toast } from './ui/toast.js';
import { initializeCalculationPresets } from './utils/calculation-presets.js';
import { syncManager } from './core/sync.js';

// PWA Update Logic
import { registerSW } from 'virtual:pwa-register';

/** @type {import('./types.js').CustomWindow} */
const customWindow = /** @type {any} */(window);
// Espone funzioni globali per compatibilità (es. onclick in HTML se presenti, o console debug)
customWindow.requestPasswordReset = requestPasswordReset;

async function initializeApp() {
  // Initialize monitoring and analytics
  // initSentry();
  initAnalytics();

  initializeCalculationPresets();

  // Configura callback login
  setOnLoginSuccess(async (user) => {
    store.setUser(user);

    // Set user context for error tracking
    // setSentryUser({
    //     id: user.user_id,
    //     email: user.email,
    //     role: user.role
    // });

    // Track login event
    trackLogin(user.role);

    const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(user.role);
    if (isAdminRole) {
      showAdminArea();
    } else {
      let stId = user.station_id;
      if (!stId) {
        // Recupera station_id se non presente
        const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', user.user_id).maybeSingle();
        stId = us?.station_id;
      }
      showOperatorMenu(user.user_id, stId);
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
  const user = await loadSession();
  if (user) {
    setLoggedUser(user);
    store.setUser(user);

    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');

    if (loginContainer) {loginContainer.style.display = 'none';}
    if (appContainer) {appContainer.style.display = 'block';}

    const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(user.role);
    if (isAdminRole) {
      document.body.classList.add('admin-layout', 'desktop-layout');
      showAdminArea();
    } else {
      document.body.classList.remove('admin-layout', 'desktop-layout');
      let stId = user.station_id;
      if (!stId) {
        const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', user.user_id).maybeSingle();
        stId = us?.station_id;
      }
      showOperatorMenu(user.user_id, stId);
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
const updateSW = registerSW({
  onNeedRefresh() {
    Toast.show('Nuova versione disponibile!', 'info', 0, {
      action: {
        text: 'AGGIORNA',
        onClick: () => {
          console.log('[PWA] Update button clicked');
          updateSW(true)
            .then(() => console.log('[PWA] Update accepted, waiting for reload...'))
            .catch(e => {
              console.error('[PWA] Update failed:', e);
              window.location.reload();
            });
        }
      }
    });
  },
  onOfflineReady() {
    Toast.show('App pronta per l\'uso offline', 'success');
  }
});
