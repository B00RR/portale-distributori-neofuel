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
import { Toast } from './ui/toast.js';
import { initializeCalculationPresets } from './utils/calculation-presets.js';
// import { syncManager } from './core/sync.js'; // Unused in original app.js but imported
import { registerSW } from 'virtual:pwa-register';
import { CustomWindow } from './types.js';
import { LoggedUserData } from './core/auth.js';

const customWindow = window as unknown as CustomWindow;

// Espone funzioni globali per compatibilità
customWindow.requestPasswordReset = requestPasswordReset;

async function initializeApp(): Promise<void> {
    // Initialize monitoring and analytics
    // initSentry();
    initAnalytics();

    initializeCalculationPresets();

    // Configura callback login
    setOnLoginSuccess(async (user: LoggedUserData) => {
        store.setUser(user as any);

        // Track login event
        trackLogin(user.role);

        const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(user.role);
        if (isAdminRole) {
            showAdminArea();
        } else {
            // ALWAYS fetch the authoritative station_id from DB, ignoring potential stale session data
            let stId: number | null = null;
            const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', user.user_id).maybeSingle();
            stId = us?.station_id;

            if (stId) {
                // Update the user object in store with the fresh station_id
                const freshUser = { ...user, station_id: stId };
                store.setUser(freshUser as any);
                showOperatorMenu(String(user.user_id), stId);
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
    const user = await loadSession();
    if (user) {
        setLoggedUser(user);
        store.setUser(user as any);

        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app-container');

        if (loginContainer) { loginContainer.style.display = 'none'; }
        if (appContainer) { appContainer.style.display = 'block'; }

        const isAdminRole = ['admin', 'super_admin', 'accounting', 'billing'].includes(user.role);
        if (isAdminRole) {
            document.body.classList.add('admin-layout', 'desktop-layout');
            showAdminArea();
        } else {
            document.body.classList.remove('admin-layout', 'desktop-layout');
            document.body.classList.remove('admin-layout', 'desktop-layout');

            // ALWAYS fetch the authoritative station_id from DB
            let stId: number | null = null;
            const { data: us } = await supabase.from('user_stations').select('station_id').eq('user_id', user.user_id).maybeSingle();
            stId = us?.station_id;

            if (stId) {
                // Update the user object in store with the fresh station_id
                const freshUser = { ...user, station_id: stId };
                store.setUser(freshUser as any);
                showOperatorMenu(String(user.user_id), stId);
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
    },
    onRegistered(r) {
        if (!r) return;

        // 1. Hyper-aggressive polling (every 15 seconds)
        setInterval(() => {
            r.update().catch(() => { });
        }, 15 * 1000);

        // 2. Immediate check when window gets focus
        window.addEventListener('focus', () => {
            r.update().catch(() => { });
        });

        // 3. Check on user interaction (throttled to once every 5s)
        let lastInteractionCheck = 0;
        document.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastInteractionCheck > 5000) {
                lastInteractionCheck = now;
                r.update().catch(() => { });
            }
        });
    }
});
