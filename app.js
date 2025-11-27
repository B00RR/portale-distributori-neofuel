// ==========================================
// APP ENTRY POINT
// ==========================================
import { supabase } from "./js/api.js";
import {
  initLoginElements, loadSession, setLoggedUser, setOnLoginSuccess,
  handlePasswordReset, requestPasswordReset
} from "./js/auth.js";
import { showAdminArea } from "./js/admin.js";
import { showOperatorMenu } from "./js/operator.js";

// Espone funzioni globali per compatibilità (es. onclick in HTML se presenti, o console debug)
window.requestPasswordReset = requestPasswordReset;

async function initializeApp() {
  console.log('Inizializzazione App...');

  // Configura callback login
  setOnLoginSuccess(async (user) => {
    console.log('Login success callback:', user);
    if (user.role === 'admin') {
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
    console.log('Rilevato token di recupero password');
    await handlePasswordReset();
    return;
  }

  // Controllo sessione esistente
  const user = await loadSession();
  if (user) {
    console.log('Sessione trovata:', user);
    setLoggedUser(user);

    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');

    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    if (user.role === 'admin') {
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
    console.log('Nessuna sessione attiva, mostro login');
    initLoginElements();
  }
}

// Avvio
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
