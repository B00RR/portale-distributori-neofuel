import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm";
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const scriptRel = "modulepreload";
const assetsURL = function(dep, importerUrl) {
  return new URL(dep, importerUrl).href;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    let allSettled2 = function(promises) {
      return Promise.all(
        promises.map(
          (p) => Promise.resolve(p).then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
        )
      );
    };
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = allSettled2(
      deps.map((dep) => {
        dep = assetsURL(dep, importerUrl);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        const isBaseRelative = !!importerUrl;
        if (isBaseRelative) {
          for (let i = links.length - 1; i >= 0; i--) {
            const link2 = links[i];
            if (link2.href === dep && (!isCss || link2.rel === "stylesheet")) {
              return;
            }
          }
        } else if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
const SUPABASE_URL = "https://ahlmgafaurossyghimxc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobG1nYWZhdXJvc3N5Z2hpbXhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzU3OTIsImV4cCI6MjA3NzE1MTc5Mn0.f2PIG3qksNyz-Z3RKBjZ4OdV-suB8kUmjyPhrmrA6G4";
const DEFAULT_TTL = 5 * 60 * 1e3;
const cacheStore = /* @__PURE__ */ new Map();
const Cache = {
  /**
   * Ottiene un valore dalla cache
   * @param {string} key - Chiave del valore
   * @returns {*} Il valore se presente e non scaduto, altrimenti null
   */
  get(key) {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cacheStore.delete(key);
      return null;
    }
    return entry.data;
  },
  /**
   * Imposta un valore nella cache
   * @param {string} key - Chiave del valore
   * @param {*} data - Dati da memorizzare
   * @param {number} ttl - Time to live in millisecondi (default: 5 minuti)
   */
  set(key, data, ttl = DEFAULT_TTL) {
    cacheStore.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    });
  },
  /**
   * Invalida (rimuove) un valore dalla cache
   * @param {string} key - Chiave da invalidare
   */
  invalidate(key) {
    cacheStore.delete(key);
  },
  /**
   * Invalida tutti i valori con un prefisso
   * @param {string} prefix - Prefisso delle chiavi da invalidare
   */
  invalidateByPrefix(prefix) {
    for (const key of cacheStore.keys()) {
      if (key.startsWith(prefix)) {
        cacheStore.delete(key);
      }
    }
  },
  /**
   * Pulisce tutta la cache
   */
  clear() {
    cacheStore.clear();
  },
  /**
   * Helper per fetch con cache
   * Esegue la funzione solo se i dati non sono in cache
   * @param {string} key - Chiave cache
   * @param {Function} fetchFn - Funzione async che recupera i dati
   * @param {number} ttl - TTL in millisecondi
   * @returns {Promise<*>} Dati dalla cache o dal fetch
   */
  async getOrFetch(key, fetchFn, ttl = DEFAULT_TTL) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }
    const data = await fetchFn();
    if (data !== null && data !== void 0) {
      this.set(key, data, ttl);
    }
    return data;
  },
  /**
   * Ottiene statistiche sulla cache
   * @returns {Object} Statistiche
   */
  getStats() {
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();
    for (const entry of cacheStore.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else {
        validCount++;
      }
    }
    return {
      total: cacheStore.size,
      valid: validCount,
      expired: expiredCount
    };
  }
};
const CACHE_KEYS = {
  STATION_PREFIX: "station_"
};
const globalSupabase = globalThis.__supabaseClient;
const supabase = globalSupabase || createClient(SUPABASE_URL, SUPABASE_KEY);
if (!globalThis.__supabaseClient) globalThis.__supabaseClient = supabase;
async function safeSupabaseQuery(queryFn, errorMessage = "Errore nella query") {
  const queryStr = queryFn.toString();
  const isMutation = queryStr.includes(".insert") || queryStr.includes(".update") || queryStr.includes(".upsert") || queryStr.includes(".delete");
  try {
    const result = await queryFn();
    if (result.error) {
      if (isMutation && (!navigator.onLine || result.error.status === 0 || result.error.status >= 500)) {
        await handleOfflineMutation(queryFn);
        return { data: null, error: null, offline: true };
      }
      throw new Error(result.error.message || errorMessage);
    }
    return result;
  } catch (err) {
    if (isMutation && (!navigator.onLine || err.message.toLowerCase().includes("fetch"))) {
      try {
        await handleOfflineMutation(queryFn);
        return { data: null, error: null, offline: true };
      } catch (queueErr) {
        console.error("Errore critico accodamento offline:", queueErr);
      }
    }
    console.error(errorMessage, err);
    throw err;
  }
}
async function handleOfflineMutation(queryFn) {
  const { offlineDB: offlineDB2 } = await __vitePreload(async () => {
    const { offlineDB: offlineDB3 } = await Promise.resolve().then(() => offlineDb);
    return { offlineDB: offlineDB3 };
  }, true ? void 0 : void 0, import.meta.url);
  const { Toast: Toast2 } = await __vitePreload(async () => {
    const { Toast: Toast3 } = await Promise.resolve().then(() => toast);
    return { Toast: Toast3 };
  }, true ? void 0 : void 0, import.meta.url);
  Toast2.show("Connessione assente. L'operazione è stata salvata localmente e verrà sincronizzata appena possibile.", "warning");
  return offlineDB2.enqueue({
    type: "mutation_retry",
    description: "Operazione database in attesa"
    // queryFn: queryFn.toString() // Potrebbe non essere ri-eseguibile direttamente
  });
}
async function getStationName(stationId) {
  if (!stationId) return `#${stationId}`;
  const cacheKey = `${CACHE_KEYS.STATION_PREFIX}${stationId}`;
  return Cache.getOrFetch(cacheKey, async () => {
    try {
      const { data: st } = await supabase.from("fuel_stations").select("station_name").eq("station_id", stationId).maybeSingle();
      return st?.station_name || `#${stationId}`;
    } catch (err) {
      console.warn("Errore nel caricamento nome stazione:", err);
      return `#${stationId}`;
    }
  }, 10 * 60 * 1e3);
}
const __vite_import_meta_env__ = {};
const env = __vite_import_meta_env__ || {};
const PLAUSIBLE_DOMAIN = env.VITE_ANALYTICS_DOMAIN || "neofuel-portal.local";
const PLAUSIBLE_ENABLED = env.VITE_ANALYTICS_ENABLED === "true";
function initAnalytics() {
  if (!PLAUSIBLE_ENABLED) {
    console.info("[Analytics] Disabled");
    return;
  }
  console.info("[Analytics] Initialized for domain:", PLAUSIBLE_DOMAIN);
}
function trackEvent(eventName, props = {}) {
  if (!PLAUSIBLE_ENABLED || !window.plausible) {
    console.debug("[Analytics] Event:", eventName, props);
    return;
  }
  window.plausible(eventName, { props });
}
function trackLogin(role) {
  trackEvent("Login", { role });
}
class Toast {
  /**
   * Mostra una notifica toast
   * @param {string} message - Il messaggio da mostrare
   * @param {string} type - Tipo di toast: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Durata in millisecondi (default: 3000)
   */
  static show(message, type = "info", duration = 3e3) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
    const toast2 = document.createElement("div");
    toast2.className = `toast toast-${type}`;
    const icon = this._getIcon(type);
    toast2.innerHTML = `
      <i class="fas fa-${icon}"></i>
      <span class="toast-message">${this._escapeHtml(message)}</span>
    `;
    container.appendChild(toast2);
    void toast2.offsetWidth;
    setTimeout(() => toast2.classList.add("show"), 10);
    setTimeout(() => {
      toast2.classList.remove("show");
      setTimeout(() => {
        if (toast2.parentNode) {
          toast2.parentNode.removeChild(toast2);
        }
        if (container.children.length === 0 && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 300);
    }, duration);
  }
  /**
   * Ottiene l'icona FontAwesome appropriata per il tipo
   * @private
   */
  static _getIcon(type) {
    const icons = {
      success: "check-circle",
      error: "exclamation-circle",
      warning: "exclamation-triangle",
      info: "info-circle"
    };
    return icons[type] || "info-circle";
  }
  /**
   * Escape HTML per prevenire XSS
   * @private
   */
  static _escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
const toast = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Toast
}, Symbol.toStringTag, { value: "Module" }));
const escapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
  // Or &#x27; or &apos; depending on context, &#039; is generally safe
};
function escapeHtml$2(text) {
  if (text == null) return "";
  return String(text).replace(/[&<>"']/g, (match) => escapeMap[match]);
}
function escapeNumber(num) {
  if (num == null || num === "") return "";
  return String(parseFloat(String(num)));
}
function formatNumberIt(value, fractionDigits = 0) {
  const num = Number(value);
  const safeNum = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(safeNum);
}
function formatLitri(value) {
  return formatNumberIt(value, 2);
}
function formatGunCounter(value) {
  const num = Number(value);
  const safeNum = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeNum);
}
function parseGunCounter(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = value.toString().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}
function slugifyLabel(text) {
  return text.toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "chiusura";
}
function base64ToArrayBuffer(base64) {
  const cleaned = base64.replace(/\s+/g, "");
  if (!cleaned) return null;
  const binary = atob(cleaned);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
function formatEuro(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `€ ${formatNumberIt(safe, 2)}`;
}
function formatDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("it-IT").format(date);
  } catch (e) {
    return value;
  }
}
function showLoadingMessage(content, message = "") {
  if (content) {
    content.innerHTML = `
            <div class="loader-container">
                <img src="/assets/images/logo-svg.svg" alt="Loading..." class="loader-logo">
            </div>
        `;
  }
}
function showFullScreenLoader(message = "") {
  let loader = document.getElementById("full-screen-loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "full-screen-loader";
    loader.className = "loader-overlay-full";
    document.body.appendChild(loader);
  }
  loader.innerHTML = `
        <img src="/assets/images/logo-svg.svg" alt="Loading..." class="loader-logo">
    `;
  loader.style.display = "flex";
}
function hideFullScreenLoader() {
  const loader = document.getElementById("full-screen-loader");
  if (loader) {
    loader.style.opacity = "0";
    loader.style.transition = "opacity 0.3s ease";
    setTimeout(() => {
      loader.style.display = "none";
      loader.style.opacity = "1";
    }, 300);
  }
}
function showErrorMessage(content, error, defaultMessage = "Errore di caricamento") {
  if (content) {
    const errorMsg = error?.message || error || defaultMessage;
    content.innerHTML = `<span style="color:red">${escapeHtml$2(errorMsg)}</span>`;
  }
  console.error(defaultMessage, error);
}
function openModal(title = "") {
  let modal = document.getElementById("app-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "app-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modal-title"></h3>
          <button id="modal-close-btn">&times;</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    const closeBtn = modal.querySelector("#modal-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
  }
  const titleEl = modal.querySelector("#modal-title");
  if (titleEl) titleEl.textContent = title;
  const bodyEl = modal.querySelector("#modal-body");
  if (bodyEl) bodyEl.innerHTML = "";
  modal.style.display = "flex";
}
function closeModal() {
  const modal = document.getElementById("app-modal");
  if (modal) {
    modal.style.display = "none";
    const bodyEl = modal.querySelector("#modal-body");
    if (bodyEl) bodyEl.innerHTML = "";
  }
}
function showInfoModal(message, title = "Informazione") {
  openModal(title);
  const target = document.getElementById("modal-body");
  target.innerHTML = `
    <p style="margin-bottom:16px;">${escapeHtml$2(message)}</p>
    <div style="text-align:right;">
      <button id="info-modal-ok" class="menu-button">Ok</button>
    </div>
  `;
  const okBtn = document.getElementById("info-modal-ok");
  if (okBtn) {
    okBtn.addEventListener("click", () => closeModal(), { once: true });
  }
}
function openConfirmModal(message) {
  return new Promise((resolve) => {
    openModal("Conferma");
    const target = document.getElementById("modal-body");
    target.innerHTML = `
            <p>${escapeHtml$2(message)}</p>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                <button id="confirm-cancel" class="menu-button btn-danger">Annulla</button>
                <button id="confirm-ok" class="menu-button btn-success">Conferma</button>
            </div>
        `;
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");
    const handleOk = () => {
      closeModal();
      resolve(true);
    };
    const handleCancel = () => {
      closeModal();
      resolve(false);
    };
    okBtn.addEventListener("click", handleOk, { once: true });
    cancelBtn.addEventListener("click", handleCancel, { once: true });
  });
}
function showPromptModal(message, defaultValue = "", title = "Input Richiesto") {
  return new Promise((resolve) => {
    openModal(title);
    const target = document.getElementById("modal-body");
    target.innerHTML = `
            <p style="margin-bottom: 15px;">${escapeHtml$2(message)}</p>
            <div class="form-group">
                <input type="text" id="prompt-input" class="form-control" value="${escapeHtml$2(defaultValue)}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                <button id="prompt-cancel" class="menu-button">Annulla</button>
                <button id="prompt-ok" class="menu-button primary">Ok</button>
            </div>
        `;
    const input = document.getElementById("prompt-input");
    const okBtn = document.getElementById("prompt-ok");
    const cancelBtn = document.getElementById("prompt-cancel");
    setTimeout(() => input?.focus(), 100);
    const handleOk = () => {
      const val = input.value;
      closeModal();
      resolve(val);
    };
    const handleCancel = () => {
      closeModal();
      resolve(null);
    };
    okBtn.addEventListener("click", handleOk, { once: true });
    cancelBtn.addEventListener("click", handleCancel, { once: true });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleOk();
      if (e.key === "Escape") handleCancel();
    });
  });
}
function setButtonLoading(btn, isLoading, loadingText = "Attendi...") {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}
let loginForm = null;
let loginContainer = null;
let appContainer = null;
let loginError = null;
let loginFormInitialized = false;
let loggedUser = null;
let onLoginSuccessCallback = null;
function setOnLoginSuccess(callback) {
  onLoginSuccessCallback = callback;
}
function setLoggedUser(user) {
  loggedUser = user;
}
function initLoginElements() {
  const form = document.getElementById("login-form");
  if (!form) return;
  if (form !== loginForm) {
    loginFormInitialized = false;
  }
  if (!loginFormInitialized) {
    loginForm = form;
    loginContainer = document.getElementById("login-container");
    appContainer = document.getElementById("app-container");
    loginError = document.getElementById("login-error");
    if (loginForm) {
      setupLoginForm();
      loginFormInitialized = true;
    }
  } else {
    loginForm = form;
    loginContainer = document.getElementById("login-container");
    appContainer = document.getElementById("app-container");
    loginError = document.getElementById("login-error");
  }
}
function setupLoginForm() {
  if (!loginForm) return;
  if (loginFormInitialized) return;
  loginForm.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("#toggle-password");
    if (toggleBtn) {
      e.preventDefault();
      e.stopPropagation();
      const passwordInput = loginForm.querySelector("#password");
      const passwordIcon = toggleBtn.querySelector("i");
      if (passwordInput && passwordIcon) {
        if (passwordInput.type === "password") {
          passwordInput.type = "text";
          passwordIcon.classList.remove("fa-eye");
          passwordIcon.classList.add("fa-eye-slash");
          toggleBtn.title = "Nascondi password";
        } else {
          passwordInput.type = "password";
          passwordIcon.classList.remove("fa-eye-slash");
          passwordIcon.classList.add("fa-eye");
          toggleBtn.title = "Mostra password";
        }
      }
    }
  });
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorElement = loginError || document.getElementById("login-error");
    if (errorElement) errorElement.textContent = "";
    const emailInput = loginForm.querySelector("#email") || loginForm.email;
    const passwordInput = loginForm.querySelector("#password") || loginForm.password;
    if (!emailInput || !passwordInput) {
      console.error("Email or password input not found");
      return;
    }
    const email = emailInput.value?.trim().toLowerCase();
    const password = passwordInput.value;
    if (!email || !password) {
      if (errorElement) errorElement.textContent = "Inserisci email e password.";
      return;
    }
    try {
      showFullScreenLoader();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true, "Accesso in corso...");
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (authError) {
        console.error("Auth error:", authError);
        if (authError.message && (authError.message.includes("Email not confirmed") || authError.message.includes("email_not_confirmed"))) {
          if (errorElement) errorElement.textContent = "Email non confermata. Contatta l'amministratore per la convalida.";
          return;
        } else {
          if (errorElement) {
            errorElement.textContent = authError.message === "Invalid login credentials" || authError.message.includes("Invalid") || authError.message.includes("invalid") ? "Email o password errati." : `Errore: ${authError.message === "User not found" ? "Utente non trovato" : authError.message}`;
          }
          return;
        }
      }
      if (!authData?.user) {
        console.error("No user data returned");
        if (errorElement) errorElement.textContent = "Errore durante il login. Riprova.";
        return;
      }
      let { data: userData, error: userError } = await supabase.from("users").select(`
                    *,
                    user_stations (
                        station_id,
                        fuel_stations ( station_name )
                    )
                `).eq("email", email).maybeSingle();
      if (!userData) {
        console.warn("User not found via standard SELECT. Attempting Secure RPC lookup...");
        const { data: rpcId, error: rpcError } = await supabase.rpc("get_current_user_id");
        if (rpcId && !rpcError) {
          userData = {
            user_id: rpcId,
            // Integer ID corretto
            email: authData.user.email,
            full_name: authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "Operatore",
            role: authData.user.user_metadata?.role || "operator"
          };
        } else {
          console.error("RPC lookup failed:", rpcError);
          userData = {
            user_id: authData.user.id,
            email: authData.user.email,
            full_name: authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "Operatore",
            role: authData.user.user_metadata?.role || "operator"
          };
          console.error("ATTENZIONE: Stiamo usando un UUID come user_id. Le query SQL potrebbero fallire.");
        }
      }
      if (userData.role) {
        loggedUser = userData;
      } else {
        loggedUser = {
          ...userData,
          role: authData.user.user_metadata?.role || "operator"
        };
      }
      if (loginContainer) loginContainer.style.display = "none";
      if (appContainer) appContainer.style.display = "block";
      const isAdminRole = ["admin", "super_admin", "accounting", "billing"].includes(loggedUser.role);
      if (isAdminRole) {
        document.body.classList.add("admin-layout", "desktop-layout");
      } else {
        document.body.classList.remove("admin-layout", "desktop-layout");
      }
      if (onLoginSuccessCallback) {
        if (userData && userData.user_stations) {
          loggedUser.assignedStations = userData.user_stations.map((us) => ({
            id: us.station_id,
            name: us.fuel_stations?.station_name
          }));
        } else {
          loggedUser.assignedStations = [];
        }
        onLoginSuccessCallback(loggedUser);
      }
    } catch (err) {
      console.error("Errore durante il login (catch):", err);
      if (errorElement) {
        errorElement.textContent = `Errore durante il login: ${err.message || "Errore sconosciuto"}`;
      }
    } finally {
      hideFullScreenLoader();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, false);
    }
  });
}
async function loadSession() {
  try {
    const isPasswordResetPersistent = localStorage.getItem("password_reset_session");
    if (isPasswordResetPersistent) {
      return null;
    }
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) return null;
    const email = session.user.email;
    let { data: userData } = await supabase.from("users").select(`
                *,
                user_stations (
                    station_id,
                    fuel_stations ( station_name )
                )
            `).eq("email", email).maybeSingle();
    if (!userData) {
      console.warn("Session User not found via SELECT. Attempting Secure RPC...");
      const { data: rpcId, error: rpcError } = await supabase.rpc("get_current_user_id");
      if (rpcId && !rpcError) {
        userData = {
          user_id: rpcId,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name || "Operatore",
          role: session.user.user_metadata?.role || "operator"
        };
      } else {
        userData = {
          user_id: session.user.id,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Operatore",
          role: session.user.user_metadata?.role || "operator"
        };
      }
    }
    if (!userData.role) {
      userData.role = session.user.user_metadata?.role || "operator";
    }
    if (userData.user_stations) {
      userData.assignedStations = userData.user_stations.map((us) => ({
        id: us.station_id,
        name: us.fuel_stations?.station_name
      }));
    } else {
      userData.assignedStations = [];
    }
    return userData;
  } catch (err) {
    console.error("Errore nel caricamento sessione:", err);
    return null;
  }
}
async function clearSession() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Errore nel logout:", error);
    }
    const supabaseKeys = Object.keys(localStorage).filter(
      (key) => key.startsWith("sb-") || key.includes("supabase")
    );
    supabaseKeys.forEach((key) => localStorage.removeItem(key));
    const supabaseSessionKeys = Object.keys(sessionStorage).filter(
      (key) => key.startsWith("sb-") || key.includes("supabase")
    );
    supabaseSessionKeys.forEach((key) => sessionStorage.removeItem(key));
    loggedUser = null;
  } catch (err) {
    console.error("Errore nel logout:", err);
  }
}
async function requestPasswordReset(email) {
  try {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "";
    const redirectUrl = isLocalhost ? `${window.location.origin}${window.location.pathname}` : `${window.location.origin}${window.location.pathname}`;
    localStorage.setItem("password_reset_email", email);
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
    if (error) throw error;
    Toast.show("Email di reset password inviata! Usa il codice OTP a 6 cifre ricevuto via email.", "success", 5e3);
    showOTPResetForm();
    return { success: true };
  } catch (error) {
    console.error("Errore durante la richiesta di reset password:", error);
    Toast.show("Errore durante l'invio dell'email di reset password: " + error.message, "error");
    return { success: false, error: error.message };
  }
}
function showOTPResetForm() {
  initLoginElements();
  if (loginContainer) loginContainer.style.display = "none";
  if (appContainer) appContainer.style.display = "block";
  const mainContent = document.getElementById("main-content") || document.body;
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
  const otpForm = document.getElementById("otp-reset-form");
  const otpInput = document.getElementById("otp-code");
  const errorElement = document.getElementById("otp-reset-error");
  const backButton = document.getElementById("back-to-login-otp");
  if (otpInput) {
    otpInput.addEventListener("input", (e) => {
      e.target.value = /** @type {HTMLInputElement} */
      e.target.value.replace(/[^0-9]/g, "");
    });
  }
  otpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorElement.textContent = "";
    const otpCode = (
      /** @type {HTMLInputElement} */
      otpInput.value.trim()
    );
    if (otpCode.length !== 6) {
      errorElement.textContent = "Il codice deve essere di 6 cifre.";
      return;
    }
    try {
      errorElement.textContent = "Verifica del codice in corso...";
      const savedEmail = localStorage.getItem("password_reset_email");
      if (!savedEmail) {
        const email = await showPromptModal("Inserisci la tua email per verificare il codice:", "email@esempio.com", "Email Richiesta");
        if (!email) {
          errorElement.textContent = "Email richiesta per verificare il codice.";
          return;
        }
        sessionStorage.setItem("password_reset_in_progress", "true");
        const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: "recovery" });
        if (error) {
          errorElement.textContent = "Codice non valido o scaduto: " + error.message;
          return;
        }
        sessionStorage.setItem("password_reset_in_progress", "true");
        localStorage.setItem("password_reset_session", "true");
        showResetPasswordForm();
      } else {
        sessionStorage.setItem("password_reset_in_progress", "true");
        const { error } = await supabase.auth.verifyOtp({ email: savedEmail, token: otpCode, type: "recovery" });
        if (error) {
          errorElement.textContent = "Codice non valido o scaduto: " + error.message;
          return;
        }
        sessionStorage.setItem("password_reset_in_progress", "true");
        localStorage.setItem("password_reset_session", "true");
        localStorage.removeItem("password_reset_email");
        showResetPasswordForm();
      }
    } catch (err) {
      errorElement.textContent = "Errore imprevisto: " + err.message;
    }
  });
  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.reload();
    });
  }
}
function showResetPasswordForm() {
  initLoginElements();
  if (loginContainer) loginContainer.style.display = "none";
  if (appContainer) appContainer.style.display = "block";
  const mainContent = document.getElementById("main-content") || document.body;
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
  const resetForm = document.getElementById("reset-password-form");
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const errorElement = document.getElementById("reset-password-error");
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorElement.textContent = "";
    const newPassword = (
      /** @type {HTMLInputElement} */
      newPasswordInput.value
    );
    const confirmPassword = (
      /** @type {HTMLInputElement} */
      confirmPasswordInput.value
    );
    if (newPassword.length < 6) {
      errorElement.textContent = "La password deve essere di almeno 6 caratteri.";
      return;
    }
    if (newPassword !== confirmPassword) {
      errorElement.textContent = "Le password non corrispondono.";
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        errorElement.textContent = "Errore durante l'aggiornamento della password: " + error.message;
        return;
      }
      sessionStorage.removeItem("password_reset_in_progress");
      localStorage.removeItem("password_reset_session");
      await supabase.auth.signOut();
      Toast.show("Password aggiornata con successo! Ora puoi effettuare il login.", "success");
      window.location.href = window.location.pathname;
    } catch (err) {
      errorElement.textContent = "Errore imprevisto: " + err.message;
    }
  });
}
async function handlePasswordReset() {
  showResetPasswordForm();
}
const Validators = {
  /**
   * Verifica che il valore non sia vuoto (null, undefined o stringa vuota).
   */
  required(value) {
    if (value === null || value === void 0) return "Campo obbligatorio";
    if (typeof value === "string" && value.trim() === "") return "Campo obbligatorio";
    return true;
  },
  /**
   * Verifica formato email.
   */
  email(value) {
    if (!value) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value) || "Email non valida";
  },
  /**
   * Verifica lunghezza minima stringa.
   */
  minLength(min) {
    return (value) => {
      if (!value) return true;
      return value.length >= min || `Minimo ${min} caratteri`;
    };
  },
  /**
   * Verifica che sia un numero valido.
   */
  number(value) {
    if (value === "" || value === null || value === void 0) return true;
    return !isNaN(parseFloat(value)) && isFinite(value) || "Deve essere un numero";
  },
  /**
   * Verifica valore minimo (numerico).
   */
  minValue(min) {
    return (value) => {
      if (value === "" || value === null || value === void 0) return true;
      const num = parseFloat(value);
      return num >= min || `Deve essere almeno ${min}`;
    };
  },
  /**
   * Verifica valore massimo (numerico).
   */
  maxValue(max) {
    return (value) => {
      if (value === "" || value === null || value === void 0) return true;
      const num = parseFloat(value);
      return num <= max || `Non può superare ${max}`;
    };
  }
};
function validateForm(data, schema) {
  const errors = {};
  let isValid = true;
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    for (const rule of rules) {
      const result = rule(value);
      if (result !== true) {
        errors[field] = result;
        isValid = false;
        break;
      }
    }
  }
  return isValid ? null : errors;
}
function formatErrorMessages(errors) {
  if (!errors) return "";
  return Object.values(errors).join("\n");
}
const closureTemplateXlsxBase64 = "UEsDBBQABgAIAAAAIQC2mqBmdQEAAI0FAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACslM9OwzAMxu9IvEOVK2qzcUAIrdthwBEmMR4gJO4aLU2iOBvb2+Nmf4RQWTVtl0Zt7O/3xbUzmmwak60hoHa2ZMNiwDKw0iltFyX7nL/mjyzDKKwSxlko2RaQTca3N6P51gNmlG2xZHWM/olzlDU0AgvnwdJO5UIjIr2GBfdCLsUC+P1g8MClsxFszGOrwcajZ6jEysTsZUOfd04CGGTZdBfYskomvDdaikhO+dqqP5R8TygoM8VgrT3ekQ3GOwntzv+Afd47lSZoBdlMhPgmGrLBN4Z/u7D8cm5ZnBbpcOmqSktQTq4aqkCBPoBQWAPExhRpLRqh7cH3CX4KRp6W4ZWNtOdLwj0+Iv1v4Ol5uYUk0wPEuDWA1y57Eu0j1yKA+oiBJuPqBn5r9/iQwshpTS1y5SIcdU/xqW9nwXmkCQ5wvoHDiLbZuSchCFHDcUi7mv1IpOm/+MTQ3i8K1LlsucLomovxO5kOOE+X6fgHAAD//wMAUEsDBBQABgAIAAAAIQATXr5lAgEAAN8CAAALAAgCX3JlbHMvLnJlbHMgogQCKKAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArJJNSwMxEIbvgv8hzL072yoi0mwvRehNZP0BMZn9YDeZkKS6/fdGQXShth56nK93nnmZ9Wayo3ijEHt2EpZFCYKcZtO7VsJL/bi4BxGTckaN7EjCgSJsquur9TONKuWh2PU+iqziooQuJf+AGHVHVsWCPblcaThYlXIYWvRKD6olXJXlHYbfGlDNNMXOSAg7cwOiPvi8+bw2N02vact6b8mlIyuQpkTOkFn4kNlC6vM1olahpSTBsH7K6YjK+yJjAx4nWv2f6O9r0VJSRiWFmgOd5vnsOAW0vKRFcxN/3JlGfOcwvDIPp1huL8mi9zGxPWPOV883Es7esvoAAAD//wMAUEsDBBQABgAIAAAAIQDrWeAAbQMAAMAIAAAPAAAAeGwvd29ya2Jvb2sueG1srFVtb6M4EP5+0v0HxHcK5i0ENV1BAF2ldrfKZts7KVLlghOsAOZs06Ra7X/fMQlJuzmdst1FiY3t8eNnZh4Plx+2daU9Ey4oayY6urB0jTQ5K2izmuhf5pkR6JqQuClwxRoy0V+I0D9c/fnH5Ybx9RNjaw0AGjHRSynb0DRFXpIaiwvWkgZWlozXWMKQr0zRcoILURIi68q0Lcs3a0wbfYcQ8nMw2HJJc5KwvKtJI3cgnFRYAn1R0lYMaHV+DlyN+bprjZzVLUA80YrKlx5U1+o8vF41jOOnCtzeIk/bcvj58EcWNPZwEiydHFXTnDPBlvICoM0d6RP/kWUi9CYE29MYnIfkmpw8U5XDAyvuv5OVf8Dyj2DI+mU0BNLqtRJC8N6J5h242frV5ZJW5H4nXQ237Udcq0xVulZhIdOCSlJM9BEM2YYcJ8Ar3rVxRytYtceOHejm1UHOdxwGkPuokoQ3WJIpayRIbU/9V2XVY09LBiLWZuTfjnICdwckBO5Ai/MQP4k7LEut49VEn4aLLwI8XFSMk2bxqSEJp89kkRCxlqxdtJytOK5rrLUgYbJ4pUl8egF+QpU4V0ExIRA7srv3H4MCnHk4KO9Ocg3er5MbiP5n/Ay5gIwX+6t6DcFGzmOT8xA9fnVHTmo7TmT4GYoNNxtFRhwlnuGNgxRZforGAfoGznA/zBnuZLlPs4Ke6C7k9GTpFm+HFWSFHS2ONL5a+8dQ/Q/NsPZNOawK2j0lG3EUhBpq2wfaFGwDegn8ALx6GcYGsmG46VcfaCFLJSnLPcz9ReiqBMrIGylDUL6iNtHfUEp2lDJ4DNW8oWS+4tTXTuDW91rT6z1jq4oyBFVaFdY+zCDwUB3CrwvUp3HYl+Mqv+Oa6nrDMbLssbIgW3kjZN+D8CjwQ64Vjayxa1ip4xluMLaNwHVsY+omduqN0iSNPZUhVfzD31ECe/2Hw1dFsSwxl3OO8zV8i2ZkGWMBkto5BHxfk429ILYcoOhmKDNcNLaMOPZdw0syxxuhZJp62ZGscn/5zgIUmP1ugmUHN1dd2n4cqjbbzx4ml7uJfaLe3L5wlqi473f/n+Fn8L4iZxmn92caTj/ezm/PtL1J548P2bnG0W2cROfbR7NZ9M88/Xs4wvzPgJp9wlXby9QcZHL1HQAA//8DAFBLAwQUAAYACAAAACEAkgeU7AQBAAA/AwAAGgAIAXhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzIKIEASigAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArJLLasQwDEX3hf6D0b5xMn1QhnFm0VKYbZt+gHCUOExiB1t95O9rUjrJwJBusjFIwvceibvbf3et+CQfGmcVZEkKgqx2ZWNrBe/Fy80jiMBoS2ydJQUDBdjn11e7V2qR46dgmj6IqGKDAsPcb6UM2lCHIXE92TipnO+QY+lr2aM+Yk1yk6YP0s81ID/TFIdSgT+UtyCKoY/O/2u7qmo0PTv90ZHlCxYy8NDGBUSBviZW8FsnkRHkZfvNmvYcz0KT+1jK8c2WGLI1Gb6cPwZDxBPHqRXkOFmEuV8TRmOrnww2doI5tZYucrdqKAx6Kt/Yx8zPszFv/8HIs9jnPwAAAP//AwBQSwMEFAAGAAgAAAAhACB2iHz6EwAAynEAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWycVNuO2jAQfa/Uf7D8ThKHJEBEWKFdrbpvVa/PxjFgEcfUNpdV1X/v2LmARFWyiyAzOD7nzHhOMn84ywoduTZC1QUmQYQRr5kqRb0p8Pdvz6MpRsbSuqSVqnmBX7nBD4uPH+YnpXdmy7lFwFCbAm+t3edhaNiWS2oCtec13FkrLamFv3oTmr3mtPQgWYVxFGWhpKLGDUOuh3Co9Vow/qTYQfLaNiSaV9RC/WYr9qZjk2wInaR6d9iPmJJ7oFiJSthXT4qRZPnLplaariro+0wSytBZwzeG37iT8es3SlIwrYxa2wCYw6bm2/Zn4SykrGe67X8QDUlCzY/CDfBCFb+vJJL2XPGFbPxOsqwnc8el84MoC/w7aj8jiMRdosulu/cHL+algAm7rpDm6wIv43y5TMY4XMy9g34IfjJXObJ09ZVXnFkOKgQjZ9CVUju38QWWIuA0foPjpMyKI3/kVQXUjxmY/FcjAzlIhL3Gdd7pPXtTf9ao5Gt6qOwXdfrExWZrQTiFVp1X8vL1iRsGJgXpIE4dK1MVUMAVSQFPGxyxpGcfT6K02wKPA5JEGWxG7GCskj+bZdKCGxgcpodBbGFxME3TJJtO/g9MWiDEXm8QEGi9IsQWmATxNCXpvVLhXD0QYq+YTqIxudPipMVBfFul8LbyghB7YBKnk+k9xVkLhNgf6pBKCbwwvaJLeuQgSQImbaDOre2kh02SdNZxSQudDBsJ6ezjkhaaDYR2BnImf9M8SWeE+HqiExLNxv/2bOgflb8AAAD//wAAAP//nNxbj9pIFsDxrxL140a5AE1fRklL22Ab3wBjA4a3KJNo9mV2lYxmd7/9lu06rsvfmGVGao3041S56JwuV50yfPr527dvfyy//PHl5dOPf/77zY/Pd9O7Nz//9eX3n5/vJr9MH+7e/PaHstn76fzuzX8m91++/vLrf5fffn799rvyj+9n87uXT1+bdn9vGqpGd2/UCz+V/vny8dOHP18+ffiqI14l4oOGRQfTNvh+/vz44DZYyuvSIPAh9CHyYeVD3MHsTjpNOri3Bj5xx5FKhDTJfMg7aH4Zf75M3j/Mn90e1vK69LDxYesPq/Bh50PpQ+XDnm9t6g7s4L+Tow91Bw/y1p6fP1r/eb+pkwTL+zxb8EFlWJ9ms7+aZk3Dz3eP/T/fqw8LH5YdPPVNAh9CHyIfVj7EHTybNOpg8rGXVMuklwySa5n2MWstJkE3kK1/8cKHnQ+lD5UPe7yBA4Z7hNR4AycM92yLkwXqj86ZbAZmGDXxyAzTRKsZ5t7820MWkCUkgISQCLKCxJAEkkIySA5ZQzaQLaSA7CAlpILsIQfIEVJDTpCzLU4iqLvLX7vrNA1VTqj/9bedmXfb0SEPfdosIEtIoMVMNKGWJ5WP31/2k6e3+9lH9fP06cP3gbtdpMPNDLGCxJ1MzZyRdGL++FMdYt9X7903mOkQM4fkkDVko8VcaqvlXr/BZ/Xm1Pw+9OYKHTrvf6c7SKnF/N4r/83tdchje8Vw/nY7H77eQQeaOfwIqSEnyFlL+4/iJKBa6dwwEzXRn+9mH62sUyN3Fjt9SL/agSwhASTspcm6jcq6jcq6zcWsQwcrSAxJOrFm1lTH2Gnnrc6yPkTeYQ5ZQzaQbS/dO3xW7+5S2qHxDlJCKry7vY5Ri5N+1nj0FkY6xPx5HCE15AQ5a2lvWk7GPd6UcU20yjjzB/cKWUCWkAASQiLIChJDkk7sHNIxZgLIIDlkDdlAtACsoOUkApj3usYM+0ftFhTD6SGnCBnLZx6nm5KhCbaTQTIArKEBJAQEkFWkBiSdGIngo6xEgGSQ9aQDWQLKSA7SAmpMOY95AA5QmrIqZN7c4s/2+LMCM83JUIT/fnu3p8h1VLEuQf1If09qBPr32YJCSAhJIKsIDEkgaSQDJJD1pANZAspIDtICakge8gBcoTUkBPkbIuTGWpXecvypA1XuWFWhK9CaivW3/K8IsXCxEi+LEkBKSRFQmaztjJkhjDxakQx2yWklJSRctJ6cAxeEWPDdltSQdqRSlI1OAavLrOXIHPDP5COpJp04hjOQu2U7KaamlBuWAlPmnCVauru1ufVxN+BSVCzdUJZcGFeNWmne7VqNowKSZGQ+ksyw/H2S6vR4cTsNSGlpIyUa5rbG4WJt1NYS9Ck2QW1w/7ty49vv969+fHt++c79fIv60mzivyHKrjevbxOJu/UOxjeJ21MX/K73JIK0o5UCtmr5Im3CagkaNZu4dRg/5arVB7aM+5NqIztQDqSatJJk3UjO0sUV9qTpghp17THy0xtuJ/S3vbgVYIupLSuopr8XZoGfTWbFJIiofGU7i848BcWs9eElJIyUq7pSkp3w5k3tTsnpbskVr8BTAMb6djMeFtSQdqRSqHx1NWDbErb31/Wk+lI6vahJnVBR7mqWefWpJMmJ3V1XwOp25ROb0jdrtLqzsb+qnCigy6kbv+qmY1BgelDokJSJDSeumPDidlrQkpJGSnXdCV1u+HM25qUPRuPpW7fxsy6oEIub/aWO1IppHYJ5g7mrdQqCXrWqTv7W31x1tUDMXXIg2ktwz2SatJJk5O6uvuB1G2KvTekblcbdlJ36p8gqiu3q40Lqdu/alIXFJg+TOoiKpKo8dQdG07MCyWklJSRck1XUrcbzm2zbt/GpC6okMvbCwZElRI1vmDQ7WTB8DCyYOhDTeqCjnJVs6yoSSdNTurqvgZStymM9qmrJufm0aPJ/P2jSvYrOzZdUrWeCpmgErsgLUkBKSRFpBUpJiWklJSRctJa04NdXZh6tRd1Ytjedx7a6oLa5Uzeqp2O+rlXPxdOW7emjaRAQdoJmSpjyUFWEmUXHqdeRUYdpneD7I6eVVHhbaUGWalBVpcGeTBtzCq270aolqh2+ncLXU219a+lW1enVZOmXOZ1gmLugrQkBaSQFJFWpJiUkFJSRspJa01P6g+435lMvWLWRoK6I/31ZKbSTNWMhgpCWxNr0qz7PT7YU54mc38pObhK+rLvHFOvWLXXQY+qjKZ2/GoXpdLrwuAOJtakVzcS1dykl6b2GS8nvdRDHW56jU9hbbh6rs0q2QuZI+gFaUkKSCEpIq1IMSkhpaSMlJPWpA1pSypIO1JJqkh70oF0JNWkE+nskFO2Ul+PdFOOdA9XP9uftmq+qND5xq22z893z+Y7fxdCZp+wFHK68mosAbsK2VU02JX3kO+KXcXsKhnsyvukVsquMnaVD3blf+8Nu9qwq+1gV94Hewp2tWNX5WBX3ma7Yld7dnUY7MqrfB/ZVc2uTkLmZnTW1K2e3Zy9rUB/3xXon+2vTNZk7vcLiTI39yUbBkKmYciGkWnYfkvu/J3q6l2ifkr1c7ifvd2qn/z+wkPSK14k5kVUd+261XpbKRtmbKiu2zU0a5a1kFmNbITM8koN2r9iwSvueEX1rv2GFRvu2VD9qvyGRzas2fCkya4GONTl0wfzzf//AwAA//8AAAD//2zW0U7bMBiG4VupcgGjtpsULECKCyVlaVK5LrM4Y1soaEBR6bTb3zcktoO9Z83/yHVif/7l0+dhvx1mw9PT2+jb7ufL4aww46o4P/1bH+2H+7NiPbF+M7HF0X9yI8ko9cT52cTBmAvJHOVKskC5lrQoS0mPspJElLVkg3IjySi1vnSGX3ohmaNcSRYo15IWZSnpUVaSiBJc5eeugrVuJC1KJ4koSZJRenesMScwz0aSUXpnNMbgGKMxJLVzPjjKTnATfekE/i24UlLiGpRaA5JOYyJKkmSUYI/93B7TPJIWZNElCTJKL0b693GuG5jvRtJsMqBxRxIWpZNElCTJKL0b693GuG5jvRtJsMqBxRxIWpROElGSJKMEO9U8U1yDqeYh6TQmoiRJRglWu21ptxtJi9JJIkqSZJRglR2L2ZG0KJ0koiRJRunNiY8Gz48ko9TW+GDplASrvmOpKwerDmvp/DSSFqWTRJQkySjBKG8G8yZpUTpJREmSjNIbnR9DZ24jySjBKDsGsyNpUTpJREmSjBKMsmMwO5IWpZNElCTJKMFotw3tdiNpUTpJREmSjBKMsmMwO5IWpZNElCTJKPWJD3QSghlrfuxuxkjoJDSSFqWTRJQkySib0t/SftaVv6QMziu/oPrnyvdUX1V+jVmu/C11zloXKbxHOd9QvS79Jb3/vPQLqn8ufU/1VenXuA5WDQl6/8z6hurXiifVl7roUH1j/ReqZ+tv3+tH/66t56evd9thebffPr68jZ6Ge11hx5+mxWj/uH34+H3Yvb5Xy2L0dXc47J4/nh6Gu+/D/s+TK0b3u93h40EX3aNfu/2Pt4dhOJz/BgAA//8DAFBLAwQUAAYACAAAACEATT+ALIQGAACAGgAAEwAAAHhsL3RoZW1lL3RoZW1lMS54bWzsWc9v2zYUvg/Y/yDo7lq2JdkO6hS2bCdrk7Zo3A490jZtsaFEQ6STGkWBXXcZMKAbdhmw2w7DgALbaZf9Ny227o/YIyVbZEw3/ZEC3dAYCCTqe48f33v6+EPXbzxOqHOGM05Y2nFr1zzXwemETUk677j3R8NKy3W4QOkUUZbijrvC3L2x//ln19GeiHGCHbBP+R7quLEQi71qlU+gGfFrbIFTeDZjWYIE3Gbz6jRD5+A3odW654XVBJHUdVKUgNs7sxmZYGckXbr7a+cDCrep4LJhQrMT6RobFgo7Pa1JBF/xiGbOGaIdF/qZsvMRfixchyIu4EHH9dSfW92/XkV7hREVO2w1u6H6K+wKg+lpXfWZzcebTn0/8MPuxr8CULGNGzQH4SDc+FMANJnASHMuus+g1+71gwKrgfJLi+9+s9+oGXjNf2OLczeQPwOvQLl/fws/HEYQRQOvQDk+sMSkWY98A69AOT7cwje9bt9vGngFiilJT7fQXhA2ovVoN5AZo4dWeDvwh8164bxEQTVsqkt2MWOp2FVrCXrEsiEAJJAiQVJHrBZ4hiZQxRGiZJwR54jMYyi8BUoZh2av7g29BvyXP19dqYigPYw0a8kLmPCtJsnH4ZOMLETHvQleXQ3ycOkcMBGTSdGrcmJYHKJ0rlu8+vnbf378yvn7t59ePfsu7/Qinuv4l79+/fKPP1/nHsZaBuHF989f/v78xQ/f/PXLM4v3bobGOnxEEsyd2/jcuccSGJqFPx5nb2cxihExLFAMvi2uBxA4HXh7hagN18NmCB9koC824MHykcH1JM6Wglh6vhUnBvCYMdpjmTUAt2RfWoRHy3Ru7zxb6rh7CJ3Z+o5QaiR4sFyAsBKbyyjGBs27FKUCzXGKhSOfsVOMLaY7SIgR12MyyRhnM+E8JE4PEWtIRmRsFFJpdEgSyMvKRhBSbcTm+IHTY9Q26j4+M5HwWiBqIT/C1AjjAVoKlNhcjlBC9YAfIRHbSJ6ssomOG3ABmZ5jypzBFHNus7mTwXi1pN8CbbGn/ZiuEhOZCXJq83mEGNORfXYaxShZWDmTNNaxX/BTKFHk3GXCBj9m5hsi7yEPKN2Z7gcEG+m+XAjug6zqlMoCkU+WmSWXB5iZ7+OKzhBWKgOqb4h5QtJLlf2CpgcfWtPt6nwFam53/D463s2I9W06vKDeu3D/Qc3uo2V6F8Nrsj1nfZLsT5Lt/u8le9e7fPVCXWozyHa5Pler9WTnYn1GKD0RK4qPuFqvc5iRpkNoVBsJtZvcbN4WMVwWWwMDN8+QsnEyJr4kIj6J0QIW9TW19ZzzwvWcOwvGYa2vmtUmGF/wrXYMy+SYTfM9aq0m96O5eHAkynYv2LTD/kLk6LBZ7rs27tVOdq72x2sC0vZtSGidmSQaFhLNdSNk4XUk1MiuhEXbwqIl3a9Ttc7iJhRAbZMVWDI5sNDquIGf7/1hG4Uonso85ccA6+zK5FxppncFk+oVAOuHdQWUmW5LrjuHJ0eXl9obZNogoZWbSUIrwxhNcVGd+mHJVea6XabUoCdDsX4bShrN1ofItRSRC9pAU10paOqcd9ywEcB52AQtOu4M9vpwmSygdrhc6iI6hwOzicjyF/5dlGWRcdFHPM4DrkQnV4OECJw5lCQdVw5/Uw00VRqiuNXqIAgfLbk2yMrHRg6SbiYZz2Z4IvS0ay0y0vktKHyuFdanyvzdwdKSLSHdJ/H03BnTZXYPQYkFzZoM4JRwOPKp5dGcEjjD3AhZWX8XJqZCdvVDRFVDeTuiixgVM4ou5jlcieiGjrrbxEC7K8YMAd0O4XguJ9j3nnUvn6pl5DTRLOdMQ1XkrGkX0w83yWusyknUYJVLt9o28FLr2mutg0K1zhKXzLpvMCFo1MrODGqS8bYMS80uWk1qV7gg0CIR7ojbZo6wRuJdZ36wu1i1coJYrytV4auPHfr3CDZ+BOLRh5PfJRVcpRK+NmQIFn352XEuG/CKPBbFGhGunGVGOu4TL+j6UT2IKl4rGFT8hu9VWkG3UekGQaM2CGpev1d/ChOLiJNakH9oGcIRFF0Vn1tU+9Ynl2R9ynZtwpIqU59Uqoq4+uRSq+/+5OIQEJ0nYX3YbrR7YaXd6A4rfr/XqrSjsFfph1GzP+xHQas9fOo6ZwrsdxuRHw5albAWRRU/9CT9VrvS9Ov1rt/stgZ+92mxjIGR5/JRxALCq3jt/wsAAP//AwBQSwMEFAAGAAgAAAAhAGDp8ZQoCAAAp1kAAA0AAAB4bC9zdHlsZXMueG1s5FzNbuM2EL4X6DsI2qKndSQ5tmOnthcbJyoW2C4KbAoUaHuQbdohVj+uJKf2Fr30efpUfZIOScki15JNS7IlpckhEiUNZ4bf/HDIcPhm49jKM/ID7Lkj1bjSVQW5M2+O3eVI/enRbPVVJQgtd27ZnotG6hYF6pvx118Ng3Bro49PCIUKkHCDkfoUhqtbTQtmT8ixgitvhVx4svB8xwrh1l9qwcpH1jwgHzm21tb1nuZY2FUZhVtnJkPEsfxP61Vr5jkrK8RTbONwS2mpijO7fbd0Pd+a2sDqxuhYM2Vj9Py2svHjTmjrXj8Onvle4C3CK6CreYsFnqF9dgfaQLNmCSWgnI+S0dX0tiD7xs9JqaP56BmT4VPHQ3ftmE4YKDNv7YYjtbtrUtiTd3MY415HVdioTLw56OmXb1odQ//te+Qi37JVLSYjfNMVv5nDz7e/r73wu9cK++vAD7uKGr58YQs/GcR7InFG5t+//4kovXr96pV+pet6xuc3cp9nfA0A57Wx65xd/KrEvZPPtUjB4+HCcxM9G6AdiqvbT673h2uSZ6Bo0D55bTwMPivPlg0tBiEy82zPV0KwElA+bXEtB7E3JpaNpz4mry0sB9tb1twmDdSwovccDDCnHLEeyuxH40lOSccx+72EfX85HammCYMSj4uUDNm0++XS3vF8LrqdM+qCDjeDSRl6ToNfWeOHeXycS9fU8MvXR8nsCqbCWXoFQ/jWx8yT7zkRwQB3wLgc4JjLoK545zCOckuZDsAlYtveBbc+ca/QMB5CHhAi3zXhRomuH7crcK4upCzMSdL3jry99K2t0e7KfxB4Np4TLpYT6tKjgTbNh95gQMhMsx5oHMsQVRhjR9jL6O2hber3ab0lD8roLQpX1BJjsfi2EiUyTbM9maTqL35QYm+TAflN6S15UKL+IFUJMUnN9KubwWDQN3r9fn/QuTY6HWqDe4g5KDEFDtjF1PPnkMLHaZ9xDaBkbeOhjRYhQNHHyyfyN/RWBJheGEKeOx7OsbX0XMsmuU38hcSXMCWA7H+khk+QvccZzZ6fA4qkm+O9SJIjogiSSH4HMscil8y4qNjasCPJCMUEhUTjFSkB5cuB7AS7usBInVE1O09yJrM6WTvnYigvdvK42vxCF8Uddudog6BEABUCEhAq9g9RQIL4NkO2/ZFEnJ8XSZCDuLNZcDUKqFyRiSspcZBLyPiiSxbP2A0Ri6fGaPNkocqQh7CyWex6ENiKyi2MsXYmY7vvFWu1srcf1s4U+SatnZEiAWslhYXk7q2Nl66DWNN4CJUDdqs8eT7+DK+SksMMniNWKdgsvhDM6NGqDmPtuirWlODJx+6nR8/EVDgyRCms0qIVY5Vcpg/vSVqEjrJHqu7qoCWzPXUAvhK0A2piUMqDikyiEojd0cSyVMilMw7qrjvjHACJ2UQAhFbevxTWeGGj5twgUbUUm6JfESFQgpdJN93yNCdryFWOlZSX48aO1LQLjN2+StLtrs7wBf9Vrgo4HHLqBaXntuCDyOPCFDiMpA9w0pX4ZZrOwWpegXAryAE++0XIAeNUfznoGtdevK8FrqIUUxJYEoJUBazSBakKWacJkh6ehYyswS5LkKPBLkuQo8Euqxa4OjwrTndRtQBSYcYrdkkZk3tO42Q7RpT4QspafdYU+1LYIxXiGSmpwHICLY+lFCkk5Kg6uJUlR9WxTUoOLrQNElwJWRPZuhOV7msgUJUlnXHBBTWJcsGS4qVLjZLdjZMm58yQOTIJoFY/JOUUD1/aCRk1wAVABKCpauVUyDl6CydeZUcEOIIi/VBOvuKp+ThMH2DV91Izspb8zr7BxA3MgQeTiOmwGTl/GyoWwM6zUSJRLc4XyhNWD5dOsEm2uBLoa9eRKByTVk4n0gp2yJPiUeHYy8rNGNleKURBNRI2nO73sTnkDz1rtr--";
const SUMMARY_TEMPLATE_START_ROW = 42;
const ISLAND_TEMPLATE_BLOCKS = [
  {
    startRow: 9,
    endRow: 20,
    pistolaRows: 6,
    totals: [
      { type: "gasolio", valueCell: "O18", priceCell: "U18", priceType: "gasolio" },
      { type: "benzina", valueCell: "O19", priceCell: "U19", priceType: "benzina" }
    ]
  },
  {
    startRow: 21,
    endRow: 32,
    pistolaRows: 6,
    totals: [
      { type: "gasolio", valueCell: "O30", priceCell: "U30", priceType: "gasolio" },
      { type: "benzina", valueCell: "O31", priceCell: "U31", priceType: "benzina" }
    ]
  },
  {
    startRow: 33,
    endRow: 40,
    pistolaRows: 2,
    totals: [
      { type: "totale", valueCell: "O38", priceCell: "U38", priceType: "totale" }
    ]
  }
];
function inferFuelTypeFromNameExport(nomePistola = "") {
  const nome = (nomePistola || "").toString().toUpperCase();
  if (nome.includes("GASOLIO") || nome.includes("DIESEL") || nome.includes("G-") || nome.includes("-G") || nome.includes(" G") || nome.endsWith("G")) return "gasolio";
  if (nome.includes("B") || nome.includes("BENZINA")) return "benzina";
  return "benzina";
}
function fuelTypeSigla(tipo) {
  switch ((tipo || "").toLowerCase()) {
    case "gasolio":
      return "G";
    case "benzina":
      return "B";
    default:
      return (tipo || "?").substring(0, 1).toUpperCase();
  }
}
function getClosureTemplateBase64() {
  return closureTemplateXlsxBase64;
}
async function computeExportSummaryMetrics(adminClient, closure, stationId) {
  const safeNumber = (value) => {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : 0;
  };
  if (!adminClient || !closure || !stationId) return null;
  const openingData = closure.opening_data || {};
  const closingData = closure.closing_data || {};
  const dettaglioIncasso = closingData.dettaglio_incasso || {};
  const scontrinoSelf = closingData.scontrino_self || {};
  const startDate = closure.opened_at ? new Date(closure.opened_at) : closure.created_at ? new Date(closure.created_at) : null;
  const endDate = closure.closed_at ? new Date(closure.closed_at) : closure.date_time ? new Date(closure.date_time) : null;
  const startISO = startDate ? startDate.toISOString() : null;
  const endISO = endDate ? endDate.toISOString() : null;
  const carteSelfBase = safeNumber(openingData.pos_amount) || safeNumber(scontrinoSelf.bancomat_erogati) || 0;
  const fallback = {
    carteSelf: carteSelfBase,
    cartePos: safeNumber(dettaglioIncasso.pos_operatore) || 0,
    lubrAdblue: 0,
    nonErogato: 0,
    crediti: safeNumber(dettaglioIncasso.crediti) || 0
  };
  if (!startISO) {
    return fallback;
  }
  const applyRange = (query) => {
    let q = query;
    if (startISO) q = q.gte("created_at", startISO);
    if (endISO) q = q.lte("created_at", endISO);
    return q;
  };
  try {
    const [
      { data: movimentiData },
      { data: creditiCreatiData },
      { data: creditiPagatiData }
    ] = await Promise.all([
      applyRange(adminClient.from("movimenti_cassa").select("tipo, importo, descrizione, created_at").eq("station_id", stationId)),
      applyRange(adminClient.from("crediti_clienti").select("importo, created_at").eq("station_id", stationId)),
      applyRange(adminClient.from("crediti_movimenti").select("importo, metodo, created_at").eq("station_id", stationId))
    ]);
    const normalizeList = (list) => Array.isArray(list) ? list : [];
    const movimenti = normalizeList(movimentiData);
    const creditiCreati = normalizeList(creditiCreatiData);
    const creditiPagati = normalizeList(creditiPagatiData);
    const usciteCassa = movimenti.reduce((sum, mv) => {
      const val = safeNumber(mv?.importo);
      if (val <= 0) return sum;
      const tipo = (mv?.tipo || "").toLowerCase();
      if (tipo === "incasso" || tipo === "voucher") return sum;
      return sum + val;
    }, 0);
    const incassiOggettistica = movimenti.reduce((sum, mv) => {
      const val = safeNumber(mv?.importo);
      if (val <= 0) return sum;
      return (mv?.tipo || "").toLowerCase() === "incasso" ? sum + val : sum;
    }, 0);
    const rimborsi = movimenti.reduce((sum, mv) => {
      const tipo = (mv?.tipo || "").toLowerCase();
      if (tipo !== "pagamento") return sum;
      const descr = (mv?.descrizione || "").toLowerCase();
      if (!descr) return sum;
      if (descr.includes("rimbor") || descr.includes("risarc")) {
        const val = safeNumber(mv?.importo);
        return val > 0 ? sum + val : sum;
      }
      return sum;
    }, 0);
    const nonErogato = 0;
    const creditiPositivi = creditiCreati.reduce((sum, row) => {
      const val = safeNumber(row?.importo);
      return val > 0 ? sum + val : sum;
    }, 0);
    const creditiPagatiTot = creditiPagati.reduce((sum, row) => {
      const val = safeNumber(row?.importo);
      return val > 0 ? sum + val : sum;
    }, 0);
    const creditiNet = creditiPositivi - creditiPagatiTot;
    return {
      carteSelf: carteSelfBase,
      cartePos: safeNumber(dettaglioIncasso.pos_operatore) || 0,
      lubrAdblue: incassiOggettistica,
      nonErogato,
      crediti: creditiNet
    };
  } catch (err) {
    console.warn("Errore calcolo metriche riepilogo export:", err);
    return fallback;
  }
}
async function fetchClosureExportData(closureId) {
  const adminClient = supabase;
  const { data: closure, error } = await adminClient.from("shifts").select("*").eq("id", closureId).maybeSingle();
  if (error || !closure) {
    throw new Error(error?.message || "Chiusura non trovata");
  }
  const stationId = closure.station_id;
  const turnoId = closure.id;
  const closingData = closure.closing_data || {};
  closure.opening_data || {};
  const [
    { data: stationData },
    { data: operatorData },
    { data: islandsData },
    prezziRes
  ] = await Promise.all([
    adminClient.from("fuel_stations").select("station_name").eq("station_id", stationId).maybeSingle(),
    adminClient.from("users").select("full_name, username").eq("user_id", closure.operator_id).maybeSingle(),
    adminClient.from("islands").select("island_id, nome, island_name, station_id").eq("station_id", stationId).order("island_id", { ascending: true }),
    adminClient.from("prezzi_distributore").select("prezzo_benzina, prezzo_gasolio, data_validita").eq("station_id", stationId).order("data_validita", { ascending: false }).limit(1).maybeSingle()
  ]);
  const prezzi = {
    benzina: parseFloat(closingData.prezzo_benzina) || parseFloat(prezziRes.data?.prezzo_benzina) || 0,
    gasolio: parseFloat(closingData.prezzo_gasolio) || parseFloat(prezziRes.data?.prezzo_gasolio) || 0,
    gpl: 0,
    metano: 0
  };
  await computeExportSummaryMetrics(adminClient, closure, stationId);
  let normalizedIslands = (islandsData || []).map((isola, idx) => ({
    id: isola?.island_id ?? isola?.id ?? idx + 1,
    originalId: isola?.island_id ?? isola?.id ?? idx + 1,
    label: isola?.nome ?? isola?.island_name ?? `Isola ${idx + 1}`,
    stationId: isola?.station_id ?? stationId
  }));
  const islandIds = normalizedIslands.map((i) => i.id).filter((id) => id != null);
  let pistoleData = [];
  if (islandIds.length > 0) {
    const { data: pistoleRows } = await adminClient.from("pistole").select("id, nome, numero_litri, island_id").in("island_id", islandIds).order("nome");
    pistoleData = pistoleRows || [];
  } else {
    const { data: pistoleRows } = await adminClient.from("pistole").select("id, nome, numero_litri, island_id").order("nome");
    pistoleData = pistoleRows || [];
  }
  const aperturaMap = {};
  const chiusuraMap = {};
  if (turnoId) {
    const { data: shiftPistols } = await adminClient.from("shift_pistols").select("pistola_id, opened_at_counter, closed_at_counter").eq("shift_id", turnoId);
    (shiftPistols || []).forEach((row) => {
      if (row.opened_at_counter !== null) {
        aperturaMap[row.pistola_id] = parseFloat(row.opened_at_counter);
      }
      if (row.closed_at_counter !== null) {
        chiusuraMap[row.pistola_id] = parseFloat(row.closed_at_counter);
      }
    });
  }
  (pistoleData || []).forEach((p) => {
    if (aperturaMap[p.id] == null) {
      aperturaMap[p.id] = parseFloat(p.numero_litri) || 0;
    }
  });
  if ((!normalizedIslands || normalizedIslands.length === 0) && (pistoleData || []).length > 0) {
    const uniqueIslandIds = Array.from(new Set(pistoleData.map((p) => p.island_id).filter((id) => id != null)));
    if (uniqueIslandIds.length > 0) {
      normalizedIslands = uniqueIslandIds.map((id, idx) => ({
        id,
        originalId: id,
        label: `Isola ${idx + 1}`,
        stationId
      }));
    } else {
      normalizedIslands = [{
        id: "fallback-all",
        originalId: null,
        label: "Isola Unica",
        stationId
      }];
    }
  }
  const layoutByIsland = {};
  normalizedIslands.forEach((isola, idx) => {
    const layoutId = isola?.id ?? isola?.originalId ?? `isola-${idx + 1}`;
    const pistoleIsola = pistoleData.filter((p) => {
      if (isola.originalId == null) return true;
      return String(p.island_id) === String(isola.originalId);
    });
    const pistoleArray = [];
    pistoleIsola.forEach((p) => {
      const nome = (p.nome || "").toUpperCase();
      const apertura = aperturaMap[p.id] || 0;
      const chiusura = chiusuraMap[p.id] || apertura;
      const venduti = Math.max(0, chiusura - apertura);
      const tipo = inferFuelTypeFromNameExport(nome);
      const tipoSigla = fuelTypeSigla(tipo);
      const prezzo = prezzi[tipo] || 0;
      const totaleEuro = venduti * prezzo;
      pistoleArray.push({
        id: p.id,
        label: p.nome,
        apertura,
        chiusura,
        venduti,
        tipo,
        tipoSigla,
        prezzo,
        totaleEuro
      });
    });
    layoutByIsland[layoutId] = {
      id: layoutId,
      label: isola.label,
      pistole: pistoleArray
    };
  });
  const layout = [];
  normalizedIslands.forEach((isola, idx) => {
    const layoutId = isola?.id ?? isola?.originalId ?? `isola-${idx + 1}`;
    if (layoutByIsland[layoutId]) {
      layout.push(layoutByIsland[layoutId]);
    }
  });
  const pistoleById = {};
  const pistoleByName = {};
  (pistoleData || []).forEach((p) => {
    pistoleById[p.id] = {
      id: p.id,
      label: p.nome
    };
    pistoleByName[p.nome.toLowerCase()] = {
      id: p.id,
      label: p.nome
    };
  });
  const islandsById = {};
  normalizedIslands.forEach((isola, idx) => {
    const lookupId = isola?.id ?? isola?.originalId ?? `isola-${idx + 1}`;
    islandsById[lookupId] = {
      id: lookupId,
      label: isola.label
    };
  });
  const lookups = {
    stations: { [stationId]: stationData?.station_name },
    users: { [closure.operator_id]: operatorData?.full_name || operatorData?.username },
    pistoleById,
    pistoleByName,
    islandsById
  };
  const meta = {
    stationId,
    stationName: stationData?.station_name || "Stazione",
    operatorName: operatorData?.full_name || operatorData?.username || "Operatore",
    dateDisplay: new Date(closure.closed_at || closure.created_at).toLocaleDateString("it-IT"),
    shiftId: closure.id,
    prices: prezzi
  };
  const dettaglioIncasso = closingData.dettaglio_incasso || {};
  const scontrinoSelf = closingData.scontrino_self || {};
  const summaryDefaults = {
    self: scontrinoSelf.totale_scontrino_calcolato || 0,
    carteSelf: scontrinoSelf.bancomat_erogati || 0,
    contanti: dettaglioIncasso.contanti_operatore || closingData.incasso_contanti || 0,
    cartePos: dettaglioIncasso.pos_operatore || closingData.incasso_pos || 0,
    nonErogato: 0,
    lubrAdblue: 0,
    crediti: dettaglioIncasso.crediti || 0,
    utaDkv: dettaglioIncasso.uta_dkv_operatore || 0
  };
  const metricsMap = {};
  layout.forEach((isola) => {
    (isola.pistole || []).forEach((p) => {
      metricsMap[p.id] = {
        id: p.id,
        label: p.label,
        apertura: p.apertura,
        chiusura: p.chiusura,
        venduti: p.venduti,
        tipo: p.tipo,
        tipoSigla: p.tipoSigla,
        prezzo: p.prezzo,
        totaleEuro: p.totaleEuro
      };
    });
  });
  return {
    layout,
    lookups,
    meta,
    summaryDefaults,
    metricsMap,
    rawClosure: closure
  };
}
function buildClosureTemplate(ctx, layout, summaryValues) {
  const sections = [];
  let totalLtGasolio = 0;
  let totalLtBenzina = 0;
  let totalLtAltri = 0;
  let totalEuroGasolio = 0;
  let totalEuroBenzina = 0;
  let totalEuroAltri = 0;
  layout.forEach((isola) => {
    const pistoleRows = [];
    let islandLtGasolio = 0;
    let islandLtBenzina = 0;
    let islandLtAltri = 0;
    let islandEuro = 0;
    (isola.pistole || []).forEach((p) => {
      const metric = ctx.metricsMap[p.id];
      if (!metric) return;
      const row = {
        ...metric,
        label: p.label || metric.label
      };
      pistoleRows.push(row);
      switch (row.tipo) {
        case "gasolio":
          islandLtGasolio += row.venduti;
          islandEuro += row.totaleEuro;
          break;
        case "benzina":
          islandLtBenzina += row.venduti;
          islandEuro += row.totaleEuro;
          break;
        default:
          islandLtAltri += row.venduti;
          islandEuro += row.totaleEuro;
      }
    });
    totalLtGasolio += islandLtGasolio;
    totalLtBenzina += islandLtBenzina;
    totalLtAltri += islandLtAltri;
    totalEuroGasolio += pistoleRows.filter((r) => r.tipo === "gasolio").reduce((tot, r) => tot + r.totaleEuro, 0);
    totalEuroBenzina += pistoleRows.filter((r) => r.tipo === "benzina").reduce((tot, r) => tot + r.totaleEuro, 0);
    totalEuroAltri += pistoleRows.filter((r) => r.tipo !== "benzina" && r.tipo !== "gasolio").reduce((tot, r) => tot + r.totaleEuro, 0);
    sections.push({
      id: isola.id,
      label: isola.label || "Isola",
      pistole: pistoleRows,
      totals: {
        ltGasolio: islandLtGasolio,
        ltBenzina: islandLtBenzina,
        ltOther: islandLtAltri,
        totalEuro: islandEuro
      }
    });
  });
  const totals = {
    ltGasolio: totalLtGasolio,
    ltBenzina: totalLtBenzina,
    ltOther: totalLtAltri,
    euroGasolio: totalEuroGasolio,
    euroBenzina: totalEuroBenzina,
    euroOther: totalEuroAltri,
    totalEuro: totalEuroGasolio + totalEuroBenzina + totalEuroAltri
  };
  const stationSlug = ctx?.meta?.stationSlug || slugifyLabel(ctx?.meta?.stationName || "stazione");
  const dateSlug = ctx?.meta?.dateSlug || (ctx?.meta?.dateDisplay ? ctx.meta.dateDisplay.replace(/\//g, "-").replace(/\s+/g, "_") : "data");
  return {
    meta: {
      ...ctx.meta,
      totals,
      stationSlug,
      dateSlug
    },
    sections,
    summary: {
      self: summaryValues?.self || 0,
      carteSelf: summaryValues?.carteSelf || 0,
      contanti: summaryValues?.contanti || 0,
      cartePos: summaryValues?.cartePos || 0,
      nonErogato: summaryValues?.nonErogato || 0,
      lubrAdblue: summaryValues?.lubrAdblue || 0,
      crediti: summaryValues?.crediti || 0,
      utaDkv: summaryValues?.utaDkv || 0
    }
  };
}
async function generateClosureExcel(template) {
  if (!window.XlsxPopulate) {
    Toast.show("Impossibile generare il file Excel: libreria XlsxPopulate non disponibile", "error");
    return;
  }
  const templateBase64 = getClosureTemplateBase64();
  const arrayBuffer = base64ToArrayBuffer(templateBase64);
  if (!arrayBuffer) {
    Toast.show("Errore nella lettura del template (base64 non valido).", "error");
    return;
  }
  let workbook;
  try {
    workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);
  } catch (err) {
    console.error("Impossibile aprire il template con XlsxPopulate:", err);
    Toast.show("Errore durante il caricamento del template Excel. Controlla la console per i dettagli.", "error");
    return;
  }
  try {
    const sheet = workbook.sheet(0);
    const prices = template.meta.prices || {};
    const setCell = (addr, value) => {
      const cell = sheet.cell(addr);
      if (cell) cell.value(value ?? "");
    };
    setCell("C2", template.meta.dateDisplay || "");
    setCell("M2", Number(prices.gasolio) || 0);
    setCell("X2", Number(prices.benzina) || 0);
    setCell("F5", template.meta.totals.euroGasolio || 0);
    setCell("P5", template.meta.totals.euroBenzina || 0);
    setCell("U5", template.meta.totals.totalEuro || 0);
    setCell("F6", template.meta.totals.ltGasolio || 0);
    setCell("P6", template.meta.totals.ltBenzina || 0);
    setCell("U6", "LT TOTALI");
    setCell("V6", template.meta.totals.ltGasolio + template.meta.totals.ltBenzina + template.meta.totals.ltOther);
    const sections = template.sections || [];
    const fillPistolaRow = (rowIndex, pistola) => {
      const rowLetter = (col) => `${col}${rowIndex}`;
      if (pistola) {
        setCell(rowLetter("A"), pistola.label || "");
        setCell(rowLetter("B"), pistola.chiusura || 0);
        setCell(rowLetter("G"), "-");
        setCell(rowLetter("H"), pistola.apertura || 0);
        setCell(rowLetter("M"), "=");
        setCell(rowLetter("N"), pistola.venduti || 0);
        setCell(rowLetter("S"), pistola.tipoSigla || "");
        setCell(rowLetter("T"), pistola.totaleEuro || 0);
      } else {
        setCell(rowLetter("A"), "");
        setCell(rowLetter("B"), 0);
        setCell(rowLetter("G"), "-");
        setCell(rowLetter("H"), 0);
        setCell(rowLetter("M"), "=");
        setCell(rowLetter("N"), 0);
        setCell(rowLetter("S"), "");
        setCell(rowLetter("T"), 0);
      }
    };
    const activeCount = Math.min(sections.length, ISLAND_TEMPLATE_BLOCKS.length);
    if (sections.length > ISLAND_TEMPLATE_BLOCKS.length) {
      console.warn("Numero di isole superiore al supportato dal template (max 3). L'export includerà solo le prime 3 isole.");
    }
    ISLAND_TEMPLATE_BLOCKS.forEach((block, index) => {
      const section = sections[index];
      const isActive = index < activeCount && !!section;
      for (let r = block.startRow; r <= block.endRow; r++) {
        const row = sheet.row(r);
        if (row) row.hidden(!isActive);
      }
      if (!isActive) {
        setCell(`A${block.startRow}`, "");
        for (let i = 0; i < block.pistolaRows; i++) {
          fillPistolaRow(block.startRow + 2 + i, null);
        }
        block.totals.forEach((t) => {
          setCell(t.valueCell, 0);
          if (t.priceCell) {
            if (t.priceType === "gasolio") setCell(t.priceCell, Number(prices.gasolio) || 0);
            else if (t.priceType === "benzina") setCell(t.priceCell, Number(prices.benzina) || 0);
            else setCell(t.priceCell, 0);
          }
        });
        return;
      }
      setCell(`A${block.startRow}`, section.label || `Isola ${index + 1}`);
      const pistole = section.pistole || [];
      for (let i = 0; i < block.pistolaRows; i++) {
        fillPistolaRow(block.startRow + 2 + i, pistole[i] || null);
      }
      const typeTotals = { gasolio: 0, benzina: 0 };
      const typeTotalsEuro = { gasolio: 0, benzina: 0 };
      let islandEuro = 0;
      pistole.forEach((p) => {
        if (p?.tipo === "gasolio") typeTotals.gasolio += p.venduti || 0;
        if (p?.tipo === "benzina") typeTotals.benzina += p.venduti || 0;
        if (p?.tipo === "gasolio") typeTotalsEuro.gasolio += p?.totaleEuro || 0;
        if (p?.tipo === "benzina") typeTotalsEuro.benzina += p?.totaleEuro || 0;
        islandEuro += p?.totaleEuro || 0;
      });
      block.totals.forEach((t) => {
        if (t.type === "gasolio") {
          setCell(t.valueCell, typeTotals.gasolio || 0);
          if (t.priceCell) setCell(t.priceCell, typeTotalsEuro.gasolio || 0);
        } else if (t.type === "benzina") {
          setCell(t.valueCell, typeTotals.benzina || 0);
          if (t.priceCell) setCell(t.priceCell, typeTotalsEuro.benzina || 0);
        } else {
          setCell(t.valueCell, (typeTotals.gasolio || 0) + (typeTotals.benzina || 0));
          if (t.priceCell) setCell(t.priceCell, islandEuro || 0);
        }
      });
    });
    const summaryRow = SUMMARY_TEMPLATE_START_ROW;
    const summaryRows = [summaryRow, summaryRow + 1];
    summaryRows.forEach((r) => {
      const row = sheet.row(r);
      if (row) row.hidden(false);
    });
    setCell(`A${summaryRow}`, "SELF");
    setCell(`D${summaryRow}`, "CARTE SELF");
    setCell(`G${summaryRow}`, "CONTANTI");
    setCell(`J${summaryRow}`, "CARTE POS");
    setCell(`M${summaryRow}`, "NON EROGATO");
    setCell(`P${summaryRow}`, "LUBR/ADBLUE");
    setCell(`S${summaryRow}`, "CREDITI");
    setCell(`V${summaryRow}`, "UTA/DKV");
    setCell(`A${summaryRow + 1}`, template.summary.self || 0);
    setCell(`D${summaryRow + 1}`, template.summary.carteSelf || 0);
    setCell(`G${summaryRow + 1}`, template.summary.contanti || 0);
    setCell(`J${summaryRow + 1}`, template.summary.cartePos || 0);
    setCell(`M${summaryRow + 1}`, template.summary.nonErogato || 0);
    setCell(`P${summaryRow + 1}`, template.summary.lubrAdblue || 0);
    setCell(`S${summaryRow + 1}`, template.summary.crediti || 0);
    setCell(`V${summaryRow + 1}`, template.summary.utaDkv || 0);
  } catch (err) {
    console.error("Errore durante la compilazione del template Excel:", err);
    Toast.show("Errore nella compilazione del template Excel. Controlla la console per i dettagli.", "error");
    return;
  }
  let blob;
  try {
    blob = await workbook.outputAsync({ type: "blob" });
  } catch (err) {
    console.error("Errore generazione file Excel:", err);
    Toast.show("Errore nella generazione del file Excel.", "error");
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chiusura_${template.meta.stationSlug}_${template.meta.dateSlug}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
async function showGunsModal(islandId, islandName, stationId) {
  openModal(`Pistole - ${escapeHtml$2(islandName)}`);
  const modalContent = document.querySelector("#app-modal .modal-content");
  if (modalContent) {
    modalContent.classList.remove("modal-narrow");
  }
  const target = document.getElementById("modal-body");
  showLoadingMessage(target, "Caricamento pistole...");
  await renderGuns(target, islandId, islandName, stationId);
}
async function renderGuns(target, islandId, islandName, stationId) {
  try {
    const { data: guns } = await supabase.from("pistole").select("*").eq("island_id", islandId).order("nome");
    const latestCounters = {};
    const { data: allCounters } = await supabase.from("chiusura_turno_pistole").select("pistola_id, numeratore_chiusura, turno_id").order("turno_id", { ascending: false }).limit(200);
    if (allCounters && allCounters.length > 0) {
      const maxTurnoId = Math.max(...allCounters.map((c) => c.turno_id));
      const latest = allCounters.filter((c) => c.turno_id === maxTurnoId);
      latest.forEach((c) => {
        latestCounters[c.pistola_id] = parseFloat(c.numeratore_chiusura);
      });
    }
    if (!guns || guns.length === 0) {
      target.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6b7280;">
          <i class="fas fa-gas-pump" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;"></i>
          <p style="font-size: 1.125rem; margin-bottom: 20px;">Nessuna pistola configurata per questa isola</p>
          <button class="menu-button primary" id="add-gun-btn">
            <i class="fas fa-plus"></i> Aggiungi Prima Pistola
          </button>
        </div>
      `;
      const addFirstBtn = document.getElementById("add-gun-btn");
      if (addFirstBtn) {
        addFirstBtn.addEventListener("click", () => {
          openGunForm(islandId, islandName, stationId);
        });
      }
      return;
    }
    const fuelColors = {
      benzina: "#22c55e",
      gasolio: "#eab308"
    };
    const gunsHtml = guns.map((gun) => {
      const latestVal = latestCounters[gun.id];
      const fallbackVal = gun.numero_litri;
      const currentCounter = latestVal !== void 0 ? latestVal : fallbackVal;
      const counter = formatGunCounter(currentCounter);
      const color = fuelColors[gun.tipo_carburante] || "#6b7280";
      return `
        <div class="gun-card" style="
          background: white;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 15px;
          border-left: 4px solid ${color};
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
            <div>
              <h3 style="margin: 0 0 8px 0; font-size: 1.25rem; color: #1f2937;">
                <i class="fas fa-gas-pump" style="color: ${color}; margin-right: 8px;"></i>
                ${escapeHtml$2(gun.nome)}
              </h3>
              <div style="display: flex; gap: 15px; align-items: center;">
                <span style="
                  background: ${color}15;
                  color: ${color};
                  padding: 4px 12px;
                  border-radius: 6px;
                  font-size: 0.875rem;
                  font-weight: 600;
                  text-transform: uppercase;
                ">
                  ${escapeHtml$2(gun.tipo_carburante)}
                </span>
                <span style="color: #6b7280; font-size: 0.875rem;">
                  ID: ${gun.id}
                </span>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="icon-btn edit-gun" data-id="${gun.id}" title="Modifica Pistola">
                <i class="fas fa-edit"></i>
              </button>
              <button class="icon-btn delete-gun" data-id="${gun.id}" title="Elimina Pistola">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          
          <div style="
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 12px;
          ">
            <div style="font-size: 0.875rem; color: #0369a1; margin-bottom: 5px; font-weight: 500;">
              <i class="fas fa-tachometer-alt"></i> Numeratore Attuale
            </div>
            <div style="font-size: 1.75rem; font-weight: 700; color: #0c4a6e;">
              ${counter} <span style="font-size: 1rem; font-weight: 400;">L</span>
            </div>
          </div>

          <button 
            class="menu-button secondary edit-counter" 
            data-id="${gun.id}" 
            data-name="${escapeHtml$2(gun.nome)}"
            data-counter="${currentCounter}"
            style="width: 100%;"
          >
            <i class="fas fa-edit"></i> Modifica Numeratore
          </button>
        </div>
      `;
    }).join("");
    target.innerHTML = `
      <div style="margin-bottom: 20px;">
        <button class="menu-button primary" id="add-gun-btn">
          <i class="fas fa-plus"></i> Aggiungi Pistola
        </button>
      </div>
      ${gunsHtml}
    `;
    document.getElementById("add-gun-btn").addEventListener("click", () => {
      openGunForm(islandId, islandName, stationId);
    });
    document.querySelectorAll(".edit-gun").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (
          /** @type {HTMLElement} */
          btn.dataset.id
        );
        openGunForm(islandId, islandName, stationId, id ? Number(id) : null);
      });
    });
    document.querySelectorAll(".delete-gun").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (
          /** @type {HTMLElement} */
          btn.dataset.id
        );
        if (id) deleteGun(Number(id), islandId, islandName, stationId);
      });
    });
    document.querySelectorAll(".edit-counter").forEach((btn) => {
      btn.addEventListener("click", () => {
        const b = (
          /** @type {HTMLElement} */
          btn
        );
        showCounterEditModal(
          Number(b.dataset.id),
          b.dataset.name || "",
          parseFloat(b.dataset.counter || "0"),
          islandId,
          islandName,
          stationId
        );
      });
    });
  } catch (err) {
    target.innerHTML = `
      <div style="color: #dc2626; padding: 20px; text-align: center;">
        <i class="fas fa-exclamation-triangle"></i> Errore: ${escapeHtml$2(err.message)}
      </div>
    `;
  }
}
async function openGunForm(islandId, islandName, stationId, gunId = null) {
  const isEdit = !!gunId;
  openModal(isEdit ? "Modifica Pistola" : "Nuova Pistola");
  const target = document.getElementById("modal-body");
  let gun = { nome: "", tipo_carburante: "benzina", numero_litri: 0 };
  if (isEdit) {
    const { data } = await supabase.from("pistole").select("*").eq("id", gunId).single();
    gun = data || gun;
  }
  const counterFormatted = formatGunCounter(gun.numero_litri);
  target.innerHTML = `
    <form id="gun-form">
      <div class="form-group">
        <label>Nome Pistola</label>
        <input type="text" name="nome" value="${escapeHtml$2(gun.nome)}" required placeholder="es. Pistola 1">
      </div>
      <div class="form-group">
        <label>Tipo Carburante</label>
        <select name="tipo_carburante" required>
          <option value="benzina" ${gun.tipo_carburante === "benzina" ? "selected" : ""}>Benzina</option>
          <option value="gasolio" ${gun.tipo_carburante === "gasolio" ? "selected" : ""}>Gasolio</option>
        </select>
      </div>
      <div class="form-group">
        <label>Numeratore Iniziale</label>
        <input 
          type="text" 
          name="numero_litri" 
          value="${counterFormatted}" 
          required 
          placeholder="es. 1.234,56"
          pattern="[0-9.,]+"
        >
      </div>
      <div style="display: flex; gap: 10px;">
        <button type="button" class="menu-button btn-danger" id="cancel-btn">Annulla</button>
        <button type="submit" class="menu-button btn-success">${isEdit ? "Salva Modifiche" : "Crea Pistola"}</button>
      </div>
    </form>
  `;
  document.getElementById("cancel-btn").addEventListener("click", () => {
    closeModal();
    showGunsModal(islandId, islandName, stationId);
  });
  document.getElementById("gun-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const numeroLitriStr = fd.get("numero_litri")?.toString() || "0";
    const numeroLitri = Math.round(parseGunCounter(numeroLitriStr) * 100) / 100;
    const payload = {
      nome: fd.get("nome")?.toString() || "",
      tipo_carburante: fd.get("tipo_carburante")?.toString() || "benzina",
      numero_litri: numeroLitri,
      island_id: islandId
    };
    try {
      if (isEdit) {
        await safeSupabaseQuery(
          () => supabase.from("pistole").update(payload).eq("id", gunId)
        );
        showInfoModal("Pistola aggiornata con successo!");
      } else {
        await safeSupabaseQuery(
          () => supabase.from("pistole").insert([payload])
        );
        showInfoModal("Pistola creata con successo!");
      }
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    } catch (err) {
      Toast.show("Errore: " + err.message, "error");
    }
  });
}
async function showCounterEditModal(gunId, gunName, currentCounter, islandId, islandName, stationId) {
  openModal(`Modifica Numeratore - ${escapeHtml$2(gunName)}`);
  const target = document.getElementById("modal-body");
  const counterFormatted = formatGunCounter(Number(currentCounter));
  target.innerHTML = `
    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0284c7;">
      <div style="font-size: 0.875rem; color: #0369a1; margin-bottom: 5px;">Numeratore Attuale</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #0c4a6e;">${counterFormatted} L</div>
    </div>

    <form id="counter-form">
      <div class="form-group">
        <label>Nuovo Numeratore</label>
        <input 
          type="text" 
          name="numero_litri" 
          value="${counterFormatted}" 
          required 
          placeholder="es. 12.345,67"
          pattern="[0-9.,]+"
          style="font-size: 1.125rem; font-weight: 600;"
        >
      </div>

      <div style="background: #fef3c7; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 3px solid #f59e0b;">
        <div style="font-size: 0.875rem; color: #92400e;">
          <i class="fas fa-exclamation-triangle"></i> <strong>Attenzione:</strong> Modificare il numeratore influenzerà i calcoli delle chiusure future.
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button type="button" class="menu-button btn-danger" id="cancel-btn">Annulla</button>
        <button type="submit" class="menu-button btn-success">Salva Numeratore</button>
      </div>
    </form>
  `;
  document.getElementById("cancel-btn").addEventListener("click", () => {
    closeModal();
    showGunsModal(islandId, islandName, stationId);
  });
  document.getElementById("counter-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const numeroLitriStr = fd.get("numero_litri")?.toString() || "0";
    const numeroLitri = Math.round(parseGunCounter(numeroLitriStr) * 100) / 100;
    if (numeroLitri < 0) {
      Toast.show("Il numeratore non può essere negativo!", "warning");
      return;
    }
    try {
      await safeSupabaseQuery(
        () => supabase.from("pistole").update({ numero_litri: numeroLitri }).eq("id", gunId)
      );
      let currentTurnoId = null;
      try {
        const { data: lastCounters } = await supabase.from("chiusura_turno_pistole").select("turno_id").order("turno_id", { ascending: false }).limit(1);
        if (lastCounters && lastCounters.length > 0) {
          currentTurnoId = lastCounters[0].turno_id;
        }
      } catch (err) {
        console.warn("Errore recupero ultimo turno_id:", err);
      }
      if (currentTurnoId !== null) {
        const { data: existing } = await supabase.from("chiusura_turno_pistole").select("id").eq("pistola_id", gunId).eq("turno_id", currentTurnoId).single();
        if (existing) {
          await safeSupabaseQuery(
            () => supabase.from("chiusura_turno_pistole").update({ numeratore_chiusura: numeroLitri }).eq("pistola_id", gunId).eq("turno_id", currentTurnoId)
          );
        } else {
          await safeSupabaseQuery(
            () => supabase.from("chiusura_turno_pistole").insert([{
              pistola_id: gunId,
              numeratore_chiusura: numeroLitri,
              turno_id: currentTurnoId
            }])
          );
        }
      } else {
        await safeSupabaseQuery(
          () => supabase.from("chiusura_turno_pistole").insert([{
            pistola_id: gunId,
            numeratore_chiusura: numeroLitri,
            turno_id: 1
          }])
        );
      }
      showInfoModal(`Numeratore aggiornato a ${formatGunCounter(numeroLitri)} L`);
      closeModal();
      showGunsModal(islandId, islandName, stationId);
    } catch (err) {
      Toast.show("Errore: " + err.message, "error");
    }
  });
}
async function deleteGun(gunId, islandId, islandName, stationId) {
  try {
    if (!await openConfirmModal("Sei sicuro di voler eliminare questa pistola?")) return;
    await safeSupabaseQuery(
      () => supabase.from("pistole").delete().eq("id", gunId)
    );
    showInfoModal("Pistola eliminata con successo!");
    showGunsModal(islandId, islandName, stationId);
  } catch (err) {
    Toast.show("Errore eliminazione: " + err.message, "error");
  }
}
async function showIslandsModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Gestione Isole - ${escapeHtml$2(stationName)}`);
  const modalContent = document.querySelector("#app-modal .modal-content");
  if (modalContent) {
    modalContent.classList.add("modal-narrow");
  }
  const target = document.getElementById("modal-body");
  const renderIslands = async () => {
    showLoadingMessage(target);
    try {
      const { data: islands, error } = await supabase.from("islands").select(`
          island_id,
          nome,
          island_name,
          pistole (id)
        `).eq("station_id", stationId).order("island_id", { ascending: true });
      if (error) throw error;
      let html = `
        <div class="islands-list" style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h4>Isole Configurate</h4>
            <button class="menu-button primary small-btn" id="add-island-btn">
              <i class="fas fa-plus"></i> Aggiungi Isola
            </button>
          </div>
          ${!islands || islands.length === 0 ? "<p>Nessuna isola configurata.</p>" : ""}
          <div class="islands-grid">
      `;
      if (islands && islands.length > 0) {
        islands.forEach((island) => {
          const gunsCount = island.pistole?.length || 0;
          html += `
            <div class="island-card" style="background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                  <h5 style="margin: 0 0 5px 0;">${escapeHtml$2(island.nome || island.island_name)}</h5>
                  <span class="badge badge-info">${gunsCount} pistol${gunsCount !== 1 ? "e" : "a"}</span>
                </div>
                <button class="icon-btn delete-island" data-id="${island.island_id}" title="Elimina" style="color: #ef4444;">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button class="menu-button secondary small-btn edit-island" data-id="${island.island_id}">
                  <i class="fas fa-edit"></i> Modifica
                </button>
                <button class="menu-button primary small-btn manage-guns" data-id="${island.island_id}" data-name="${escapeHtml$2(island.nome || island.island_name)}">
                  <i class="fas fa-gas-pump"></i> Gestisci Pistole
                </button>
              </div>
            </div>
          `;
        });
      }
      html += `
          </div>
        </div>
      `;
      target.innerHTML = html;
      const addBtn = document.getElementById("add-island-btn");
      if (addBtn) {
        addBtn.addEventListener("click", () => openIslandForm(stationId));
      }
      target.querySelectorAll(".edit-island").forEach((btn) => {
        btn.addEventListener("click", () => openIslandForm(stationId, parseInt(
          /** @type {HTMLElement} */
          btn.dataset.id || "0"
        )));
      });
      target.querySelectorAll(".manage-guns").forEach((btn) => {
        btn.addEventListener("click", () => {
          showGunsModal(
            parseInt(
              /** @type {HTMLElement} */
              btn.dataset.id || "0"
            ),
            /** @type {HTMLElement} */
            btn.dataset.name || "",
            stationId
          );
        });
      });
      target.querySelectorAll(".delete-island").forEach((btn) => {
        btn.addEventListener("click", () => deleteIsland(parseInt(
          /** @type {HTMLElement} */
          btn.dataset.id || "0"
        ), stationId));
      });
    } catch (err) {
      showErrorMessage(target, err);
    }
  };
  renderIslands();
}
async function openIslandForm(stationId, islandId = null) {
  const isEdit = !!islandId;
  await getStationName(stationId);
  openModal(isEdit ? "Modifica Isola" : "Nuova Isola");
  const target = document.getElementById("modal-body");
  let island = { nome: "", island_name: "" };
  if (isEdit) {
    const { data } = await supabase.from("islands").select("*").eq("island_id", islandId).single();
    island = data || island;
  }
  target.innerHTML = `
    <form id="island-form">
      <div class="form-group">
        <label>Nome Isola</label>
        <input type="text" name="nome" value="${escapeHtml$2(island.nome)}" required placeholder="es. Isola 1">
      </div>
      <div style="display: flex; gap: 10px;">
        <button type="button" class="menu-button btn-danger" id="cancel-btn">Annulla</button>
        <button type="submit" class="menu-button btn-success">${isEdit ? "Salva Modifiche" : "Crea Isola"}</button>
      </div>
    </form>
  `;
  document.getElementById("cancel-btn").addEventListener("click", () => {
    closeModal();
    showIslandsModal(stationId);
  });
  document.getElementById("island-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const nome = fd.get("nome")?.toString() || "";
    const payload = {
      nome,
      island_name: nome,
      station_id: stationId
    };
    try {
      if (isEdit) {
        await safeSupabaseQuery(
          () => supabase.from("islands").update(payload).eq("island_id", islandId)
        );
        showInfoModal("Isola aggiornata con successo!");
      } else {
        await safeSupabaseQuery(
          () => supabase.from("islands").insert([payload])
        );
        showInfoModal("Isola creata con successo!");
      }
      closeModal();
      showIslandsModal(stationId);
    } catch (err) {
      Toast.show("Errore: " + err.message, "error");
    }
  });
}
async function deleteIsland(islandId, stationId) {
  try {
    const { data: guns } = await supabase.from("pistole").select("id").eq("island_id", islandId);
    if (guns && guns.length > 0) {
      Toast.show(`Impossibile eliminare: l'isola ha ${guns.length} pistol${guns.length !== 1 ? "e" : "a"} associate. Rimuovile prima.`, "warning");
      return;
    }
    if (!await openConfirmModal("Sei sicuro di voler eliminare questa isola?")) return;
    await safeSupabaseQuery(
      () => supabase.from("islands").delete().eq("island_id", islandId)
    );
    showInfoModal("Isola eliminata con successo!");
    showIslandsModal(stationId);
  } catch (err) {
    Toast.show("Errore eliminazione: " + err.message, "error");
  }
}
const MODULE_TABLE$1 = "calculation_modules";
const VERSION_TABLE$1 = "calculation_versions";
const DEFAULT_OPERATIONS = {
  constant: ({ value }) => value,
  input: ({ path }, ctx) => path ? getByPath(ctx, path) : ctx,
  sum: ({ source, selector }, ctx) => {
    const data = source ? getByPath(ctx, source) : ctx;
    if (!Array.isArray(data)) return 0;
    return data.reduce((acc, item) => {
      if (selector) {
        return acc + (Number(getByPath(item, selector)) || 0);
      }
      return acc + (Number(item) || 0);
    }, 0);
  },
  multiply: ({ value, by }, ctx, evaluate) => {
    const left = evaluate(value, ctx);
    const right = evaluate(by, ctx);
    return Number(left || 0) * Number(right || 0);
  },
  subtract: ({ minuend, subtrahend }, ctx, evaluate) => {
    const a = evaluate(minuend, ctx);
    const b = evaluate(subtrahend, ctx);
    return Number(a || 0) - Number(b || 0);
  },
  divide: ({ dividend, divisor, precision = 2 }, ctx, evaluate) => {
    const a = Number(evaluate(dividend, ctx) || 0);
    const b = Number(evaluate(divisor, ctx) || 1);
    if (b === 0) return 0;
    const result = a / b;
    return typeof precision === "number" ? Number(result.toFixed(precision)) : result;
  },
  condition: ({ test, then, else: elseNode }, ctx, evaluate) => {
    const outcome = evaluate(test, ctx);
    if (truthy(outcome)) {
      return then ? evaluate(then, ctx) : outcome;
    }
    return elseNode ? evaluate(elseNode, ctx) : null;
  },
  pipeline: ({ steps = [] }, ctx, evaluate) => {
    return steps.reduce((acc, step) => evaluate(step, acc), ctx);
  },
  map: ({ source, iteratee }, ctx, evaluate) => {
    const data = source ? getByPath(ctx, source) : ctx;
    if (!Array.isArray(data)) return [];
    return data.map((item) => evaluate(iteratee, item));
  },
  function: ({ name, args = {} }, ctx, evaluate, engine) => {
    const fn = engine.customFunctions.get(name);
    if (!fn) {
      console.warn(`Funzione custom "${name}" non registrata`);
      return null;
    }
    const resolvedArgs = {};
    for (const [key, val] of Object.entries(args)) {
      resolvedArgs[key] = evaluate(val, ctx);
    }
    return fn(resolvedArgs, ctx);
  }
};
const CALCULATION_SCOPES = {
  CHIUSURE_TOTALE: "chiusure.totale_teorico",
  CHIUSURE_CONTANTI: "chiusure.incassi_contanti",
  KPI_VENDUTO: "dashboard.kpi_venduto",
  KPI_EROGATO: "dashboard.kpi_erogato",
  CHIUSURE_MOVIMENTI: "chiusure.movimenti",
  CHIUSURE_TOTALE_ATTESO: "chiusure.totale_atteso",
  CHIUSURE_CASH_METRICS: "chiusure.cash_metrics",
  DEFAULT: "generic"
};
class CalculationEngine {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.pending = /* @__PURE__ */ new Map();
    this.fallbacks = /* @__PURE__ */ new Map();
    this.customFunctions = /* @__PURE__ */ new Map();
    this.operations = new Map(Object.entries(DEFAULT_OPERATIONS));
    this.lastFetchTime = /* @__PURE__ */ new Map();
    this.staleAfterMs = 5 * 60 * 1e3;
  }
  registerFallback(scope, evaluator) {
    this.fallbacks.set(scope, evaluator);
  }
  registerFunction(name, fn) {
    this.customFunctions.set(name, fn);
  }
  registerOperation(name, handler) {
    this.operations.set(name, handler);
  }
  invalidate(scope = null) {
    if (scope) {
      this.cache.delete(scope);
      this.lastFetchTime.delete(scope);
      this.pending.delete(scope);
      return;
    }
    this.cache.clear();
    this.lastFetchTime.clear();
    this.pending.clear();
  }
  async run(scope, context = {}, options = {}) {
    const compiled = await this.loadScope(scope, options.forceRefresh);
    if (!compiled) {
      const fallback = this.fallbacks.get(scope) || this.fallbacks.get(CALCULATION_SCOPES.DEFAULT);
      if (fallback) return fallback(context);
      console.warn(`Nessun motore disponibile per lo scope "${scope}"`);
      return null;
    }
    return compiled(context);
  }
  async loadScope(scope, force = false) {
    const now = Date.now();
    const lastFetch = this.lastFetchTime.get(scope) || 0;
    if (!force && this.cache.has(scope) && now - lastFetch < this.staleAfterMs) {
      return this.cache.get(scope);
    }
    if (this.pending.has(scope)) {
      return this.pending.get(scope);
    }
    const fetchPromise = this.fetchAndCompile(scope).then((compiled) => {
      if (compiled) {
        this.cache.set(scope, compiled);
        this.lastFetchTime.set(scope, Date.now());
      }
      return compiled;
    }).finally(() => {
      this.pending.delete(scope);
    });
    this.pending.set(scope, fetchPromise);
    return fetchPromise;
  }
  async fetchAndCompile(scope) {
    try {
      const { data, error } = await safeSupabaseQuery(
        () => supabase.from(MODULE_TABLE$1).select(`
            id,
            scope,
            active_version_id,
            calculation_versions!calculation_versions_module_id_fkey(
              id,
              version,
              status,
              dsl,
              created_at
            )
          `).eq("scope", scope).maybeSingle()
      );
      if (error) throw error;
      if (!data || !data.active_version_id) {
        console.info(`Nessuna versione attiva per scope "${scope}"`);
        return null;
      }
      const versions = data.calculation_versions || data[VERSION_TABLE$1] || [];
      const activeVersion = Array.isArray(versions) ? versions.find((v) => v.id === data.active_version_id && v.status === "published") : null;
      if (!activeVersion || !activeVersion.dsl) {
        console.warn(`Versione attiva non valida per scope "${scope}"`);
        return null;
      }
      const parsedDsl = typeof activeVersion.dsl === "string" ? JSON.parse(activeVersion.dsl) : activeVersion.dsl;
      validateDsl(parsedDsl);
      return this.compile(parsedDsl);
    } catch (err) {
      console.error(`Errore caricando lo scope "${scope}":`, err);
      return null;
    }
  }
  compile(dsl) {
    const evaluator = (node, ctx) => {
      if (node === null || node === void 0) return node;
      if (typeof node !== "object") return node;
      const { op } = node;
      if (!op) {
        console.warn("Nodo DSL senza 'op', restituisco il blob originale");
        return node;
      }
      const handler = this.operations.get(op);
      if (!handler) {
        console.warn(`Operazione non supportata: ${op}`);
        return null;
      }
      return handler(node, ctx, evaluator, this);
    };
    return (context) => evaluator(dsl, context);
  }
}
function getByPath(obj, path) {
  if (!path) return obj;
  const segments = path.split(".");
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === void 0) return void 0;
    current = current[segment];
  }
  return current;
}
function truthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !!value;
}
function validateDsl(dsl) {
  if (!dsl || typeof dsl !== "object") throw new Error("DSL non valido");
  if (!dsl.op) throw new Error("Ogni DSL deve avere la proprietà 'op'");
  if (!DEFAULT_OPERATIONS[dsl.op] && dsl.op !== "function") {
    console.warn(`Opzione "${dsl.op}" non predefinita: assicurarsi di registrare l'operazione custom prima dell'uso.`);
  }
}
const calculationEngine = new CalculationEngine();
window.calculationEngine = calculationEngine;
calculationEngine.registerFallback(CALCULATION_SCOPES.DEFAULT, () => null);
const presetState = {
  functionsRegistered: false,
  syncPromise: null
};
const CALCULATION_PRESETS = [
  {
    scope: CALCULATION_SCOPES.KPI_VENDUTO,
    name: "Dashboard KPI Venduto",
    description: "Calcolo dinamico del venduto giornaliero dalle chiusure",
    dsl: {
      op: "input",
      path: "salesEuro"
    }
  },
  {
    scope: CALCULATION_SCOPES.KPI_EROGATO,
    name: "Dashboard KPI Erogato",
    description: "Calcolo dinamico dei litri erogati (benzina e gasolio) dalle chiusure",
    dsl: {
      op: "input",
      path: "erogatoData"
    }
  },
  {
    scope: CALCULATION_SCOPES.CHIUSURE_MOVIMENTI,
    name: "Chiusure - Somme movimenti",
    description: "Aggrega crediti, voucher, rimborsi e incassi extra",
    dsl: {
      op: "function",
      name: "closure_movimenti_summary"
    }
  },
  {
    scope: CALCULATION_SCOPES.CHIUSURE_TOTALE_ATTESO,
    name: "Chiusure - Totale teorico carburante",
    description: "Calcola ricavo teorico e totale atteso",
    dsl: {
      op: "function",
      name: "closure_totale_atteso"
    }
  },
  {
    scope: CALCULATION_SCOPES.CHIUSURE_CASH_METRICS,
    name: "Chiusure - Contanti attesi",
    description: "Determina i contanti attesi e la discrepanza",
    dsl: {
      op: "function",
      name: "closure_expected_cash"
    }
  }
];
function round(value, precision = 2) {
  const factor = Math.pow(10, precision);
  return Math.round((Number(value) || 0) * factor) / factor;
}
function registerPresetFunctions() {
  if (presetState.functionsRegistered) return;
  presetState.functionsRegistered = true;
  calculationEngine.registerFunction("dashboard_kpi_venduto", (args = {}, ctx = {}) => {
    const source = { ...ctx, ...args };
    const manual = Number(source.salesEuro ?? source.manualValue ?? source.value ?? 0);
    if (Number.isFinite(manual) && manual !== 0) return manual;
    const litersB = Number(source.totalLitriBenzina ?? 0);
    const litersG = Number(source.totalLitriGasolio ?? 0);
    const priceB = Number(source.prezzoBenzina ?? 0);
    const priceG = Number(source.prezzoGasolio ?? 0);
    const computed = litersB * priceB + litersG * priceG;
    if (computed > 0) return round(computed);
    const fallback = Number(source.fallback ?? 0);
    return round(fallback);
  });
  calculationEngine.registerFunction("closure_movimenti_summary", (args = {}, ctx = {}) => {
    const movimenti = Array.isArray(ctx.movimenti || args.movimenti) ? ctx.movimenti || args.movimenti : [];
    const normalize = (value) => Number(value) || 0;
    const toLower = (value) => (value || "").toString().toLowerCase();
    const sumBy = (filterFn) => movimenti.reduce((sum, m) => sum + (filterFn(m) ? normalize(m.importo) : 0), 0);
    const credits = sumBy((m) => {
      const descr = toLower(m.descrizione);
      return m.tipo === "credito" || descr.includes("credito") && m.tipo !== "incasso";
    });
    const vouchers = sumBy((m) => {
      const descr = toLower(m.descrizione);
      return m.tipo === "voucher" || m.tipo === "punti" || descr.includes("voucher") || descr.includes("punti");
    });
    const refunds = sumBy((m) => {
      const descr = toLower(m.descrizione);
      return m.tipo === "pagamento" || m.tipo === "uscita" || descr.includes("rimborso");
    });
    const extraCash = sumBy((m) => m.tipo === "incasso");
    return {
      credits,
      vouchers,
      refunds,
      extra_cash: extraCash
    };
  });
  calculationEngine.registerFunction("closure_totale_atteso", (args = {}, ctx = {}) => {
    const source = { ...ctx, ...args };
    const includeCounters = Boolean(source.includeCounters ?? source.include_counters ?? true);
    const litersB = Number(source.totalLitriBenzina ?? source.litri_benzina ?? 0);
    const litersG = Number(source.totalLitriGasolio ?? source.litri_gasolio ?? 0);
    const priceB = Number(source.prezzoBenzina ?? source.prezzo_benzina ?? 0);
    const priceG = Number(source.prezzoGasolio ?? source.prezzo_gasolio ?? 0);
    const selfTotal = Number(source.selfTotalVenduto ?? source.self_total_venduto ?? 0);
    const ricavoTeorico = round(litersB * priceB + litersG * priceG);
    const totaleAtteso = includeCounters ? ricavoTeorico : selfTotal;
    return {
      ricavo_teorico: ricavoTeorico,
      totale_atteso: round(totaleAtteso)
    };
  });
  calculationEngine.registerFunction("closure_expected_cash", (args = {}, ctx = {}) => {
    const source = { tolerance: 5, ...ctx, ...args };
    const carburante = Number(source.carburanteAtteso ?? source.carburante_atteso ?? 0);
    const totalPosOperatore = Number(source.totalPosOperatore ?? source.pos_operatore ?? 0);
    const totalUtaOperatore = Number(source.totalUtaOperatore ?? source.uta_operatore ?? 0);
    const selfPos = Number(source.selfPos ?? source.pos_self ?? 0);
    const credits = Number(source.creditsSum ?? source.crediti ?? 0);
    const vouchers = Number(source.vouchersSum ?? source.voucher ?? 0);
    const selfCashIn = Number(source.selfCashIn ?? source.self_cash_in ?? 0);
    const selfCashOut = Number(source.selfCashOut ?? source.self_cash_out ?? 0);
    const refunds = Number(source.refundsSum ?? source.rimborsi ?? 0);
    const extraCash = Number(source.extraCashSum ?? source.incassi_extra ?? 0);
    const cashReal = Number(source.cashReal ?? source.contanti_cassa ?? 0);
    const tolerance = Number(source.tolerance ?? 5);
    const deltaSelf = selfCashIn - selfCashOut;
    const expectedCash = carburante - totalPosOperatore - totalUtaOperatore - selfPos - credits - vouchers + deltaSelf - refunds + extraCash;
    const roundedExpected = round(expectedCash);
    const cashDiff = round(cashReal - roundedExpected);
    const isValid = Math.abs(cashDiff) <= tolerance;
    return {
      expected_cash: roundedExpected,
      cash_diff: cashDiff,
      discrepanza: cashDiff,
      is_valid: isValid
    };
  });
}
async function syncCalculationPreset(preset) {
  const existingModule = await safeSupabaseQuery(
    () => supabase.from("calculation_modules").select("id, active_version_id").eq("scope", preset.scope).maybeSingle(),
    "Errore caricamento modulo calcoli"
  );
  let moduleId = existingModule?.data?.id;
  if (!moduleId) {
    const insertResult = await safeSupabaseQuery(
      () => supabase.from("calculation_modules").insert([{
        name: preset.name,
        scope: preset.scope,
        description: preset.description,
        created_by: null
      }]).select("id").single(),
      "Errore creazione modulo calcoli"
    );
    moduleId = insertResult.data.id;
  }
  const existingPublished = await safeSupabaseQuery(
    () => supabase.from("calculation_versions").select("id").eq("module_id", moduleId).eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle(),
    "Errore ricerca versioni calcoli"
  );
  if (!existingPublished?.data?.id) {
    const versionResult = await safeSupabaseQuery(
      () => supabase.from("calculation_versions").insert([{
        module_id: moduleId,
        version: 1,
        status: "published",
        dsl: preset.dsl,
        notes: "Preset automatico",
        published_at: (/* @__PURE__ */ new Date()).toISOString()
      }]).select("id").single(),
      "Errore creazione versione calcoli"
    );
    await safeSupabaseQuery(
      () => supabase.from("calculation_modules").update({ active_version_id: versionResult.data.id }).eq("id", moduleId),
      "Errore aggiornamento modulo attivo"
    );
  }
}
async function syncAllPresets() {
  for (const preset of CALCULATION_PRESETS) {
    try {
      await syncCalculationPreset(preset);
    } catch (err) {
      console.warn(`Preset calcoli "${preset.scope}" non sincronizzato:`, err);
    }
  }
}
function initializeCalculationPresets() {
  registerPresetFunctions();
}
async function ensureCalculationPresetsSynced() {
  registerPresetFunctions();
  if (!presetState.syncPromise) {
    presetState.syncPromise = syncAllPresets().catch((err) => {
      console.warn("Impossibile sincronizzare i preset del motore di calcolo:", err);
    });
  }
  return presetState.syncPromise;
}
const MODULE_TABLE = "calculation_modules";
const VERSION_TABLE = "calculation_versions";
const logicViewContext = { container: null, actions: null };
async function refreshSettingsTab() {
  if (logicViewContext.container) {
    await showSettingsTab(logicViewContext.container, logicViewContext.actions);
  }
}
async function showSettingsTab(container, actionsContainer) {
  if (!container) return;
  logicViewContext.container = container;
  logicViewContext.actions = actionsContainer || null;
  await ensureCalculationPresetsSynced();
  container.innerHTML = `
    <section class="settings-shell">
      <div class="content-box settings-header">
        <div>
          <p class="settings-kicker">Centro di controllo</p>
          <h2>Impostazioni Amministratore</h2>
          <p class="settings-subtitle">Gestisci logiche di calcolo e, in futuro, tutte le altre configurazioni centrali.</p>
        </div>
        <div class="settings-tabs">
          <button class="settings-tab active" data-settings-tab="logic">
            <i class="fas fa-brain"></i> Calcoli e funzioni
          </button>

        </div>
      </div>
      <div class="content-box settings-panel active" data-settings-panel="logic"></div>
    </section>
  `;
  const logicPanel = container.querySelector('[data-settings-panel="logic"]');
  showLoadingMessage(logicPanel, "Caricamento calcoli e funzioni...");
  if (actionsContainer) {
    actionsContainer.innerHTML = `
      <button class="action-btn primary" id="logic-create-module-btn">
        <i class="fas fa-plus"></i> Nuovo Modulo
      </button>
      <button class="action-btn secondary" id="logic-refresh-cache-btn">
        <i class="fas fa-sync"></i> Ricarica Cache Motore
      </button>
    `;
    const createBtn = document.getElementById("logic-create-module-btn");
    const refreshBtn = document.getElementById("logic-refresh-cache-btn");
    createBtn?.addEventListener("click", () => openNewModuleModal());
    refreshBtn?.addEventListener("click", () => {
      calculationEngine.invalidate();
      showInfoModal(
        "Cache del motore svuotata. Le logiche attive verranno ricaricate al prossimo calcolo.",
        "Cache ripulita"
      );
    });
  }
  try {
    const { data: modules, error } = await supabase.from(MODULE_TABLE).select(`
        id,
        name,
        scope,
        description,
        active_version_id,
        calculation_versions:calculation_versions!calculation_versions_module_id_fkey (
          id,
          version,
          status,
          created_at,
          created_by,
          dsl,
          notes
        )
      `).order("scope", { ascending: true });
    if (error) {
      if (error.code === "42P01") {
        renderMissingTablesState(container);
        return;
      }
      throw error;
    }
    renderModulesLayout(logicPanel, modules || []);
    bindModuleDetails(logicPanel, modules || []);
  } catch (err) {
    showErrorMessage(logicPanel, err, "Impossibile caricare i moduli di calcolo");
  }
}
function renderModulesLayout(container, modules) {
  if (!modules.length) {
    container.innerHTML = `
      <section class="logic-empty-state">
        <div class="logic-empty-icon">
          <i class="fas fa-cogs"></i>
        </div>
        <h3>Configura il motore di calcolo</h3>
        <p>
          Ancora nessun modulo: crea la prima logica per gestire KPI, chiusure o export in modo dinamico.
        </p>
        <ul class="logic-empty-steps">
          <li><span>1</span> Premi "Nuovo Modulo" per definire scope e descrizione.</li>
          <li><span>2</span> Inserisci il DSL JSON per descrivere la pipeline.</li>
          <li><span>3</span> Aggiungi casi di test e pubblica la versione.</li>
        </ul>
        <p class="logic-empty-tip">Suggerimento: crea subito gli scope principali come
          <code>${escapeHtml$2(CALCULATION_SCOPES.CHIUSURE_TOTALE)}</code> o
          <code>${escapeHtml$2(CALCULATION_SCOPES.KPI_VENDUTO)}</code>.
        </p>
      </section>
    `;
    return;
  }
  const cards = modules.map((module, idx) => renderModuleCard(module, idx)).join("");
  container.innerHTML = `
    <section class="logic-hero">
      <div>
        <h2>Motore dinamico di calcolo</h2>
        <p>
          Personalizza formule e pipeline senza rilasciare nuovo codice. Ogni modulo rappresenta uno scope
          logico e può contenere versioni multiple.
        </p>
      </div>
      <div class="logic-hero-stats">
        <div class="logic-hero-kpi">
          <span>${modules.length}</span>
          <small>Moduli configurati</small>
        </div>
        <div class="logic-hero-kpi">
          <span>${modules.filter((m) => findActiveVersion(m)).length}</span>
          <small>Scope attivi</small>
        </div>
      </div>
    </section>

    <section class="logic-grid">
      ${cards}
    </section>
  `;
}
function renderModuleCard(module, idx) {
  const active = findActiveVersion(module);
  const drafts = countDrafts(module);
  const publishedBadge = active ? `<span class="logic-badge success">v${escapeHtml$2(active.version || "1")}</span>` : '<span class="logic-badge muted">Nessuna versione attiva</span>';
  return `
    <article class="logic-card" data-module-index="${idx}">
      <div class="logic-card-top">
        <div>
          <p class="logic-card-scope">${escapeHtml$2(module.scope || "scope non definito")}</p>
          <h3>${escapeHtml$2(module.name || "Modulo senza nome")}</h3>
        </div>
        ${publishedBadge}
      </div>
      <p class="logic-card-description">${escapeHtml$2(module.description || "Descrizione mancante")}</p>
      <div class="logic-card-meta">
        <div>
          <span class="meta-label">Versioni</span>
          <span class="meta-value">${module.calculation_versions?.length || 0}</span>
        </div>
        <div>
          <span class="meta-label">Draft</span>
          <span class="meta-value">${drafts}</span>
        </div>
      </div>
      <button class="action-btn tertiary logic-details-btn" data-module-index="${idx}">
        Dettagli & Versioni
      </button>
    </article>
  `;
}
function bindModuleDetails(container, modules) {
  container.querySelectorAll(".logic-details-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.dataset.moduleIndex, 10);
      const module = modules[index];
      if (module) openModuleDetailsModal(module);
    });
  });
}
function bindVersionRowActions(target, module, versions) {
  target.querySelectorAll(".logic-version-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.dataset.versionIndex, 10);
      const version = versions[index];
      if (version) openDslEditorModal(module, version);
    });
  });
  target.querySelectorAll(".logic-version-publish").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = parseInt(btn.dataset.versionIndex, 10);
      const version = versions[index];
      if (!version) return;
      const confirmed = await openConfirmModal(`Pubblicare la versione v${version.version}?`);
      if (!confirmed) return;
      await handlePublishVersion(module, version);
    });
  });
}
function openModuleDetailsModal(module) {
  openModal(`Modulo: ${module.name || module.scope}`);
  const target = document.getElementById("modal-body");
  const active = findActiveVersion(module);
  const versions = module.calculation_versions || [];
  const versionRows = versions.length ? versions.map((v, idx) => `
        <tr>
          <td>${escapeHtml$2(v.version || "-")}</td>
          <td>${escapeHtml$2(v.status || "-")}</td>
          <td>${v.created_at ? new Date(v.created_at).toLocaleString("it-IT") : "-"}</td>
          <td>${escapeHtml$2(v.created_by || "-")}</td>
          <td>
            <div class="table-actions">
              <button
                class="icon-btn logic-version-view"
                data-version-index="${idx}"
                title="Apri editor"
              >
                <i class="fas fa-code"></i>
              </button>
              ${v.status !== "published" ? `<button
                    class="icon-btn logic-version-publish"
                    data-version-index="${idx}"
                    title="Pubblica versione"
                  >
                    <i class="fas fa-check"></i>
                  </button>` : ""}
            </div>
          </td>
        </tr>
      `).join("") : `<tr><td colspan="5">Nessuna versione creata.</td></tr>`;
  target.innerHTML = `
    <div class="logic-details">
      <section class="logic-details-summary">
        <p><strong>Scope:</strong> ${escapeHtml$2(module.scope || "-")}</p>
        <p><strong>Descrizione:</strong> ${escapeHtml$2(module.description || "Non impostata")}</p>
        <p><strong>Versione attiva:</strong> ${active ? `v${escapeHtml$2(active.version || "1")} (${escapeHtml$2(active.status)})` : "Nessuna"}</p>
      </section>

      <section class="logic-details-versions">
        <div class="table-responsive">
          <table class="admin-table compact-table">
            <thead>
              <tr>
                <th>Versione</th>
                <th>Stato</th>
                <th>Creato il</th>
                <th>Creato da</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              ${versionRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="logic-details-actions">
        <button class="menu-button primary" id="logic-new-version">
          Nuova Versione
        </button>
        <button class="menu-button" id="logic-open-editor" ${active ? "" : "disabled"}>
          Editor Versione Attiva
        </button>
        <button class="menu-button secondary" id="logic-close-modal">Chiudi</button>
      </section>
    </div>
  `;
  document.getElementById("logic-close-modal")?.addEventListener("click", () => closeModal());
  const editorBtn = document.getElementById("logic-open-editor");
  if (editorBtn && active) {
    editorBtn.addEventListener("click", () => openDslEditorModal(module, active));
  }
  document.getElementById("logic-new-version")?.addEventListener("click", () => openNewVersionModal(module));
  bindVersionRowActions(target, module, versions);
}
function openNewModuleModal() {
  openModal("Nuovo Modulo di Calcolo");
  const target = document.getElementById("modal-body");
  target.innerHTML = `
    <form id="logic-module-form" class="logic-form">
      <div class="form-group">
        <label>Nome Modulo</label>
        <input type="text" name="module_name" placeholder="Es. Chiusure - Totale Teorico" required>
      </div>
      <div class="form-group">
        <label>Scope (chiave tecnica)</label>
        <input type="text" name="scope" placeholder="chiusure.totale_teorico" required>
      </div>
      <div class="form-group">
        <label>Descrizione</label>
        <textarea rows="3" name="description" placeholder="Breve descrizione"></textarea>
      </div>
      <div class="form-group">
        <label>DSL (JSON)</label>
        <textarea rows="8" name="dsl" placeholder='{ "op": "pipeline", "steps": [] }' required></textarea>
      </div>
      <div class="form-group">
        <label>Stato iniziale</label>
        <select name="status">
          <option value="draft" selected>Draft</option>
          <option value="testing">Testing</option>
          <option value="published">Published (attiva subito)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Note</label>
        <input type="text" name="notes" placeholder="Note interne (facoltative)">
      </div>
      <div class="logic-form-actions">
        <button type="submit" class="menu-button btn-success">Crea Modulo</button>
        <button type="button" class="menu-button btn-danger" id="logic-module-close">Annulla</button>
      </div>
    </form>
  `;
  document.getElementById("logic-module-close")?.addEventListener("click", () => closeModal());
  const form = document.getElementById("logic-module-form");
  if (form) {
    form.addEventListener("submit", handleModuleCreation);
  }
}
function openNewVersionModal(module) {
  const versions = module.calculation_versions || [];
  const nextVersion = (Math.max(0, ...versions.map((v) => Number(v.version) || 0)) || 0) + 1;
  const templateDsl = findActiveVersion(module)?.dsl || versions[versions.length - 1]?.dsl || { op: "pipeline", steps: [] };
  openModal(`Nuova Versione · ${module.name || module.scope}`);
  const target = document.getElementById("modal-body");
  target.innerHTML = `
    <form id="logic-version-form" class="logic-form">
      <p>Versione proposta: <strong>v${nextVersion}</strong></p>
      <div class="form-group">
        <label>DSL (JSON)</label>
        <textarea id="logic-version-dsl" rows="10" required>${escapeHtml$2(JSON.stringify(templateDsl, null, 2))}</textarea>
      </div>
      <div class="form-group">
        <label>Stato</label>
        <select name="status">
          <option value="draft" selected>Draft</option>
          <option value="testing">Testing</option>
          <option value="published">Published (attiva subito)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Note interne</label>
        <input type="text" name="notes" placeholder="Es. fix calcolo contanti">
      </div>
      <div class="logic-form-actions">
        <button type="submit" class="menu-button btn-success">Salva Versione</button>
        <button type="button" class="menu-button btn-danger" id="logic-version-close">Annulla</button>
      </div>
    </form>
  `;
  document.getElementById("logic-version-close")?.addEventListener("click", () => closeModal());
  const form = document.getElementById("logic-version-form");
  form?.addEventListener("submit", (event) => handleVersionCreation(event, module, nextVersion));
}
function renderMissingTablesState(container) {
  container.innerHTML = `
    <section class="content-box warning-box">
      <h3>Tabelle mancanti</h3>
      <p>
        Il progetto Supabase non contiene ancora le tabelle
        <code>${MODULE_TABLE}</code> e <code>${VERSION_TABLE}</code>.
        Esegui la migrazione SQL dedicata prima di continuare.
      </p>
      <p>
        Consulta la cartella <code>supabase/</code> o chiedi al supporto per importare gli script
        di creazione. Dopo aver creato le tabelle, torna qui e aggiorna la pagina.
      </p>
    </section>
  `;
}
function findActiveVersion(module) {
  const versions = module.calculation_versions || [];
  if (!versions.length || !module.active_version_id) return null;
  return versions.find((v) => v.id === module.active_version_id) || null;
}
function countDrafts(module) {
  return (module.calculation_versions || []).filter((v) => v.status === "draft").length;
}
async function handleModuleCreation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const formData = new FormData(form);
    const name = formData.get("module_name")?.toString().trim();
    const scope = formData.get("scope")?.toString().trim();
    const description = formData.get("description")?.toString().trim() || null;
    const notes = formData.get("notes")?.toString().trim() || null;
    const status = formData.get("status")?.toString() || "draft";
    const dslRaw = formData.get("dsl")?.toString();
    if (!name || !scope || !dslRaw) {
      throw new Error("Compila tutti i campi obbligatori.");
    }
    let parsedDsl = null;
    try {
      parsedDsl = JSON.parse(dslRaw);
      if (typeof parsedDsl !== "object" || Array.isArray(parsedDsl)) {
        throw new Error("Il DSL deve essere un oggetto JSON valido.");
      }
    } catch (err) {
      throw new Error("DSL non valido: " + err.message);
    }
    const userId = loggedUser?.user_id;
    const isValidUuid = userId && typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    const modulePayload = {
      name,
      scope,
      description,
      created_by: isValidUuid ? userId : null
    };
    const { data: moduleRecord } = await safeSupabaseQuery(
      () => supabase.from(MODULE_TABLE).insert([modulePayload]).select("*").single(),
      "Errore creazione modulo"
    );
    const versionPayload = {
      module_id: moduleRecord.id,
      version: 1,
      status,
      dsl: parsedDsl,
      notes,
      created_by: isValidUuid ? userId : null,
      published_at: status === "published" ? (/* @__PURE__ */ new Date()).toISOString() : null
    };
    const { data: versionRecord } = await safeSupabaseQuery(
      () => supabase.from(VERSION_TABLE).insert([versionPayload]).select("*").single(),
      "Errore creazione versione"
    );
    if (versionRecord.status === "published") {
      await safeSupabaseQuery(
        () => supabase.from(MODULE_TABLE).update({ active_version_id: versionRecord.id }).eq("id", moduleRecord.id)
      );
      calculationEngine.invalidate(scope);
    }
    closeModal();
    showInfoModal("Modulo creato con successo!", "Calcoli e funzioni");
    await refreshSettingsTab();
  } catch (err) {
    Toast.show(err.message || "Errore durante la creazione del modulo.", "error");
    console.error("Errore creazione modulo:", err);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
function openDslEditorModal(module, version) {
  openModal(`Editor DSL · ${module.name || module.scope}`);
  const target = document.getElementById("modal-body");
  const prettyDsl = JSON.stringify(version.dsl || {}, null, 2);
  target.innerHTML = `
    <div class="logic-editor">
      <section class="logic-editor-meta">
        <p><strong>Scope:</strong> ${escapeHtml$2(module.scope || "-")}</p>
        <p><strong>Versione:</strong> v${escapeHtml$2(version.version || "1")} (${escapeHtml$2(version.status)})</p>
      </section>
      <div class="logic-editor-grid">
        <div class="form-group">
          <label>DSL (JSON)</label>
          <textarea id="logic-dsl-textarea" rows="12">${escapeHtml$2(prettyDsl)}</textarea>
        </div>
        <div class="form-group">
          <label>Input di test (JSON)</label>
          <textarea id="logic-test-input" rows="6" placeholder='{"example":42}'></textarea>
        </div>
        <div class="form-group">
          <label>Output</label>
          <pre id="logic-test-output" class="logic-output">// Esegui una preview per vedere il risultato</pre>
        </div>
      </div>
      <div class="logic-editor-actions">
        <button class="menu-button secondary" id="logic-validate-dsl">Valida DSL</button>
        <button class="menu-button primary" id="logic-run-preview">Esegui preview</button>
        <button class="menu-button" id="logic-editor-close">Chiudi</button>
      </div>
      <p class="logic-form-note">
        Nota: l'editor attuale consente solo anteprime locali. Per salvare modifiche dovrai creare una nuova versione tramite Supabase.
      </p>
    </div>
  `;
  document.getElementById("logic-editor-close")?.addEventListener("click", () => closeModal());
  document.getElementById("logic-validate-dsl")?.addEventListener("click", () => {
    try {
      const value = document.getElementById("logic-dsl-textarea").value;
      JSON.parse(value);
      showInfoModal("DSL valido.", "Validazione");
    } catch (err) {
      Toast.show("DSL non valido: " + err.message, "error");
    }
  });
  document.getElementById("logic-run-preview")?.addEventListener("click", () => {
    const output = document.getElementById("logic-test-output");
    try {
      const dslValue = document.getElementById("logic-dsl-textarea").value;
      const testInputValue = document.getElementById("logic-test-input").value || "{}";
      const parsedDsl = JSON.parse(dslValue);
      const parsedInput = JSON.parse(testInputValue);
      const evaluator = calculationEngine.compile(parsedDsl);
      const result = evaluator(parsedInput);
      output.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
      output.textContent = `Errore: ${err.message}`;
    }
  });
}
async function handleVersionCreation(event, module, nextVersion) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const formData = new FormData(form);
    const status = formData.get("status")?.toString() || "draft";
    const notes = formData.get("notes")?.toString().trim() || null;
    const dslRaw = document.getElementById("logic-version-dsl")?.value;
    if (!dslRaw) throw new Error("Inserisci il DSL della nuova versione.");
    let parsedDsl = null;
    try {
      parsedDsl = JSON.parse(dslRaw);
    } catch (err) {
      throw new Error("DSL non valido: " + err.message);
    }
    const userId = loggedUser?.user_id;
    const isValidUuid = userId && typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    const payload = {
      module_id: module.id,
      version: nextVersion,
      status,
      dsl: parsedDsl,
      notes,
      created_by: isValidUuid ? userId : null,
      published_at: status === "published" ? (/* @__PURE__ */ new Date()).toISOString() : null
    };
    const { data: versionRecord } = await safeSupabaseQuery(
      () => supabase.from(VERSION_TABLE).insert([payload]).select("*").single(),
      "Errore creazione versione"
    );
    if (versionRecord.status === "published") {
      await safeSupabaseQuery(
        () => supabase.from(MODULE_TABLE).update({ active_version_id: versionRecord.id }).eq("id", module.id)
      );
      calculationEngine.invalidate(module.scope);
    }
    closeModal();
    showInfoModal(`Versione v${nextVersion} creata!`, "Calcoli e funzioni");
    await refreshSettingsTab();
  } catch (err) {
    Toast.show(err.message || "Errore durante la creazione della versione.", "error");
    console.error("Errore creazione versione:", err);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
async function handlePublishVersion(module, version) {
  try {
    await safeSupabaseQuery(
      () => supabase.from(VERSION_TABLE).update({ status: "published", published_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", version.id)
    );
    await safeSupabaseQuery(
      () => supabase.from(MODULE_TABLE).update({ active_version_id: version.id }).eq("id", module.id)
    );
    calculationEngine.invalidate(module.scope);
    showInfoModal(`Versione v${version.version} pubblicata e impostata come attiva.`, "Calcoli e funzioni");
    await refreshSettingsTab();
  } catch (err) {
    Toast.show(err.message || "Errore durante la pubblicazione.", "error");
    console.error("Errore publish versione:", err);
  }
}
const KPI_CATALOG = {
  venduto: {
    id: "venduto",
    title: "Venduto Oggi",
    icon: "fa-euro-sign",
    description: "Totale vendite giornaliere in euro",
    defaultSize: "1x1",
    defaultVisible: true
  },
  erogato: {
    id: "erogato",
    title: "Erogato Oggi",
    icon: "fa-gas-pump",
    description: "Litri totali erogati oggi",
    defaultSize: "1x1",
    defaultVisible: true
  },
  stazioni: {
    id: "stazioni",
    title: "Stazioni Attive",
    icon: "fa-map-marker-alt",
    description: "Numero di stazioni attive",
    defaultSize: "1x1",
    defaultVisible: true
  },
  alert: {
    id: "alert",
    title: "Alert Cisterne",
    icon: "fa-exclamation-triangle",
    description: "Numero di chiusure registrate",
    defaultSize: "1x1",
    defaultVisible: true
  }
  // Future KPIs can be added here:
  // operatori: { ... },
  // fatture: { ... },
  // crediti: { ... }
};
const CARD_SIZES = [
  { value: "1x1", label: "Piccola (1x1)", cols: 1, rows: 1 },
  { value: "1x2", label: "Larga (1x2)", cols: 2, rows: 1 },
  { value: "2x1", label: "Alta (2x1)", cols: 1, rows: 2 },
  { value: "2x2", label: "Grande (2x2)", cols: 2, rows: 2 }
];
async function getCurrentUserId() {
  if (loggedUser?.id) return loggedUser.id;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}
async function loadDashboardConfig() {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn("[Dashboard Config] No logged user");
    return getDefaultConfig();
  }
  try {
    const { data, error } = await supabase.from("user_dashboard_config").select("kpi_layout, grid_columns").eq("user_id", userId).single();
    if (error && error.code !== "406" && error.code !== "PGRST116") {
      throw error;
    }
    if (!data) {
      await ensureDefaultConfig();
      return getDefaultConfig();
    }
    return {
      kpiLayout: data.kpi_layout || [],
      gridColumns: data.grid_columns || 4
    };
  } catch (err) {
    console.error("[Dashboard Config] Error loading:", err);
    Toast.show("Errore caricamento configurazione dashboard", "error");
    return getDefaultConfig();
  }
}
async function saveDashboardConfig(config) {
  const userId = await getCurrentUserId();
  if (!userId) {
    Toast.show("Utente non autenticato", "error");
    return false;
  }
  try {
    const { error } = await supabase.from("user_dashboard_config").upsert({
      user_id: userId,
      kpi_layout: config.kpiLayout,
      grid_columns: config.gridColumns,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, {
      onConflict: "user_id"
    });
    if (error) throw error;
    Toast.show("Configurazione dashboard salvata!", "success");
    return true;
  } catch (err) {
    console.error("[Dashboard Config] Error saving:", err);
    Toast.show("Errore salvataggio configurazione: " + err.message, "error");
    return false;
  }
}
async function resetDashboardConfig() {
  const userId = await getCurrentUserId();
  if (!userId) {
    Toast.show("Utente non autenticato", "error");
    return false;
  }
  try {
    const defaultConfig = getDefaultConfig();
    const { error } = await supabase.from("user_dashboard_config").upsert({
      user_id: userId,
      kpi_layout: defaultConfig.kpiLayout,
      grid_columns: defaultConfig.gridColumns,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, {
      onConflict: "user_id"
    });
    if (error) throw error;
    Toast.show("Configurazione ripristinata ai valori predefiniti", "success");
    return true;
  } catch (err) {
    console.error("[Dashboard Config] Error resetting:", err);
    Toast.show("Errore ripristino configurazione: " + err.message, "error");
    return false;
  }
}
async function ensureDefaultConfig() {
  const userId = await getCurrentUserId();
  if (!userId) return;
  try {
    const defaultConfig = getDefaultConfig();
    await supabase.from("user_dashboard_config").insert({
      user_id: userId,
      kpi_layout: defaultConfig.kpiLayout,
      grid_columns: defaultConfig.gridColumns
    });
  } catch (err) {
    if (!err.message?.includes("duplicate") && !err.code?.includes("23505")) {
      console.error("[Dashboard Config] Error creating default:", err);
    }
  }
}
function getDefaultConfig() {
  return {
    kpiLayout: Object.values(KPI_CATALOG).map((kpi, index) => ({
      id: kpi.id,
      visible: kpi.defaultVisible,
      order: index,
      size: kpi.defaultSize,
      position: { row: 0, col: index }
    })),
    gridColumns: 4
  };
}
function showDashboardConfigPanel() {
  openModal("Configura Dashboard");
  renderConfigPanel();
}
async function renderConfigPanel(container) {
  if (!container) {
    console.error("No container provided for renderConfigPanel");
    return;
  }
  container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento configurazione...</div>';
  try {
    const config = await loadDashboardConfig();
    container.innerHTML = `
      <div class="dashboard-config-panel">
        <div class="config-section">
          <h4><i class="fas fa-th"></i> Layout Griglia</h4>
          <p class="section-hint">Seleziona il numero di colonne per la griglia delle KPI</p>
          <div class="grid-columns-selector">
            ${[2, 3, 4, 5, 6].map((cols) => `
              <button 
                class="grid-col-btn ${config.gridColumns === cols ? "active" : ""}" 
                data-columns="${cols}"
              >
                <i class="fas fa-th"></i>
                <span>${cols} ${cols === 1 ? "colonna" : "colonne"}</span>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="config-section">
          <h4><i class="fas fa-layer-group"></i> KPI Disponibili</h4>
          <p class="section-hint">Trascina per riordinare, clicca l'occhio per nascondere, usa i pulsanti per ridimensionare</p>
          
          <div id="kpi-config-list" class="kpi-config-list">
            ${renderKpiConfigItems(config.kpiLayout)}
          </div>
        </div>

        <div class="config-actions">
          <button id="btn-config-reset" class="menu-button secondary">
            <i class="fas fa-undo"></i> Ripristina Default
          </button>
          
          <button id="btn-config-save" class="menu-button primary">
            <i class="fas fa-save"></i> Salva Configurazione
          </button>
        </div>
      </div>
    `;
    initializeConfigHandlers(config, container);
  } catch (err) {
    container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Errore caricamento configurazione: ${err.message}</p>
      </div>
    `;
  }
}
function renderKpiConfigItems(kpiLayout) {
  return kpiLayout.sort((a, b) => a.order - b.order).map((kpi) => {
    const kpiMeta = KPI_CATALOG[kpi.id];
    if (!kpiMeta) return "";
    return `
        <div class="kpi-config-item ${!kpi.visible ? "hidden" : ""}" data-kpi-id="${kpi.id}">
          <div class="kpi-drag-handle">
            <i class="fas fa-grip-vertical"></i>
          </div>
          
          <div class="kpi-info">
            <div class="kpi-icon-preview">
              <i class="fas ${kpiMeta.icon}"></i>
            </div>
            <div class="kpi-details">
              <strong>${kpiMeta.title}</strong>
              <small>${kpiMeta.description}</small>
            </div>
          </div>

          <div class="kpi-controls">
            <button 
              class="kpi-control-btn kpi-visibility-btn ${kpi.visible ? "active" : ""}" 
              data-action="toggle-visibility"
              title="${kpi.visible ? "Nascondi" : "Mostra"}"
            >
              <i class="fas ${kpi.visible ? "fa-eye" : "fa-eye-slash"}"></i>
            </button>

            <div class="kpi-size-dropdown">
              <button class="kpi-control-btn" data-action="resize" title="Ridimensiona">
                <i class="fas fa-expand-arrows-alt"></i>
                <span class="size-label">${kpi.size}</span>
              </button>
              <div class="size-dropdown-menu">
                ${CARD_SIZES.map((size) => `
                  <button 
                    class="size-option ${size.value === kpi.size ? "active" : ""}" 
                    data-size="${size.value}"
                  >
                    <span>${size.label}</span>
                  </button>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      `;
  }).join("");
}
function initializeConfigHandlers(initialConfig, container) {
  let currentConfig = JSON.parse(JSON.stringify(initialConfig));
  const $ = (selector) => container ? container.querySelector(selector) : document.querySelector(selector);
  const $$ = (selector) => container ? container.querySelectorAll(selector) : document.querySelectorAll(selector);
  $$(".grid-col-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".grid-col-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentConfig.gridColumns = parseInt(btn.dataset.columns);
    });
  });
  $$('[data-action="toggle-visibility"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const item = e.target.closest(".kpi-config-item");
      const kpiId = item.dataset.kpiId;
      const kpiIndex = currentConfig.kpiLayout.findIndex((k) => k.id === kpiId);
      if (kpiIndex !== -1) {
        currentConfig.kpiLayout[kpiIndex].visible = !currentConfig.kpiLayout[kpiIndex].visible;
        item.classList.toggle("hidden");
        btn.classList.toggle("active");
        btn.querySelector("i").className = currentConfig.kpiLayout[kpiIndex].visible ? "fas fa-eye" : "fas fa-eye-slash";
        btn.title = currentConfig.kpiLayout[kpiIndex].visible ? "Nascondi" : "Mostra";
      }
    });
  });
  $$('[data-action="resize"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = btn.nextElementSibling;
      dropdown.classList.toggle("show");
    });
  });
  $$(".size-option").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = e.target.closest(".kpi-config-item");
      const kpiId = item.dataset.kpiId;
      const newSize = btn.dataset.size;
      const kpiIndex = currentConfig.kpiLayout.findIndex((k) => k.id === kpiId);
      if (kpiIndex !== -1) {
        currentConfig.kpiLayout[kpiIndex].size = newSize;
        const sizeLabel = item.querySelector(".size-label");
        sizeLabel.textContent = newSize;
        item.querySelectorAll(".size-option").forEach((o) => o.classList.remove("active"));
        btn.classList.add("active");
      }
      btn.closest(".size-dropdown-menu").classList.remove("show");
    });
  });
  document.addEventListener("click", () => {
    $$(".size-dropdown-menu").forEach((menu) => {
      menu.classList.remove("show");
    });
  });
  initializeSortable(currentConfig, container);
  const saveBtn = $("#btn-config-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      updateKpiOrder(currentConfig, container);
      const success = await saveDashboardConfig(currentConfig);
      if (success) {
        const event = new CustomEvent("dashboard-config-changed");
        document.dispatchEvent(event);
      }
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const confirmed = await openConfirmModal("Sei sicuro di voler ripristinare la configurazione predefinita? Tutte le personalizzazioni andranno perse.");
      if (confirmed) {
        const success = await resetDashboardConfig();
        if (success) {
          const event = new CustomEvent("dashboard-config-changed");
          document.dispatchEvent(event);
          renderConfigPanel(container);
        }
      }
    });
  }
}
function initializeSortable(config, container) {
  const list = container ? container.querySelector("#kpi-config-list") : document.getElementById("kpi-config-list");
  if (!list) return;
  if (typeof Sortable === "undefined") {
    console.warn("[Dashboard Config] SortableJS library not loaded. Drag-and-drop disabled.");
    return;
  }
  new Sortable(list, {
    animation: 150,
    ghostClass: "kpi-item-ghost",
    chosenClass: "kpi-item-chosen",
    dragClass: "kpi-item-drag",
    handle: ".kpi-drag-handle",
    // Keep original handle class
    onEnd: function(evt) {
      updateKpiOrder(config, container);
    }
  });
}
function updateKpiOrder(config, container) {
  const list = container ? container.querySelector("#kpi-config-list") : document.getElementById("kpi-config-list");
  if (!list) return;
  const items = Array.from(list.children);
  items.forEach((item, index) => {
    const kpiId = item.dataset.kpiId;
    const configItem = config.kpiLayout.find((k) => k.id === kpiId);
    if (configItem) {
      configItem.order = index;
    }
  });
  config.kpiLayout.sort((a, b) => a.order - b.order);
}
async function showDashboard(container, stationId = null, checkActiveFn = null) {
  showLoadingMessage(container);
  try {
    const startOfDay = /* @__PURE__ */ new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = /* @__PURE__ */ new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const [
      stationsRes,
      operatorsRes,
      closuresRes,
      tanksRes,
      todayClosuresRes
    ] = await Promise.all([
      // 1. Stations Count
      stationId ? supabase.from("fuel_stations").select("*", { count: "exact", head: true }).eq("station_id", stationId) : supabase.from("fuel_stations").select("*", { count: "exact", head: true }),
      // 2. Operators Count
      stationId ? supabase.from("user_stations").select("*", { count: "exact", head: true }).eq("station_id", stationId) : supabase.from("users").select("*", { count: "exact", head: true }).eq("role", "operator"),
      // 3. Closures Count
      stationId ? supabase.from("shifts").select("*", { count: "exact", head: true }).eq("station_id", stationId) : supabase.from("shifts").select("*", { count: "exact", head: true }),
      // 4. Tanks List
      (async () => {
        let q = supabase.from("tanks").select("id, name, fuel_type, capacity, station_id, fuel_stations(station_name)");
        if (stationId) q = q.eq("station_id", stationId);
        return q.order("name");
      })(),
      // 5. Today's Closures (for Sales & Liters)
      (async () => {
        let q = supabase.from("shifts").select("closing_data").gte("closed_at", startOfDay.toISOString()).lte("closed_at", endOfDay.toISOString()).eq("status", "closed");
        if (stationId) q = q.eq("station_id", stationId);
        return q;
      })()
    ]);
    const stationsCount = stationsRes.count || 0;
    const operatorsCount = operatorsRes.count || 0;
    const closuresCount = closuresRes.count || 0;
    const tanks = tanksRes.data || [];
    const todayClosures = todayClosuresRes.data || [];
    if (checkActiveFn && !checkActiveFn()) return;
    let tanksHtmlRows = "";
    if (tanks.length > 0) {
      const tankIds = tanks.map((t) => t.id);
      const sevenDaysAgo = /* @__PURE__ */ new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: tankReadings } = await supabase.from("tank_readings").select("*").in("tank_id", tankIds).gte("created_at", sevenDaysAgo.toISOString()).order("created_at", { ascending: false });
      const latestByTank = {};
      if (tankReadings) {
        for (const r of tankReadings) {
          if (!latestByTank[r.tank_id]) {
            latestByTank[r.tank_id] = r;
          }
        }
      }
      tanks.forEach((t) => {
        const latest = latestByTank[t.id];
        const liters = latest?.liters ?? 0;
        const capacity = t.capacity || 0;
        const levelPerc = capacity > 0 ? Math.max(0, Math.min(100, liters / capacity * 100)) : 0;
        let levelClass = "tank-level-ok";
        let statusLabel = "(OK)";
        if (levelPerc < 10) {
          levelClass = "tank-level-crit";
          statusLabel = "(CRIT)";
        } else if (levelPerc < 30) {
          levelClass = "tank-level-low";
          statusLabel = "(LOW)";
        }
        const stationName = t.fuel_stations?.station_name || `Stazione #${t.station_id}`;
        tanksHtmlRows += `
          <tr>
            <td>${escapeHtml$2(stationName)}</td>
            <td>${escapeHtml$2(t.fuel_type || "")}</td>
            <td>
              <div class="tank-level-bar">
                <div class="tank-level-bar-inner ${levelClass}" style="width:${levelPerc.toFixed(0)}%;"></div>
              </div>
              <div class="tank-level-meta">${levelPerc.toFixed(0)}% ${statusLabel}</div>
            </td>
            <td>${latest ? escapeHtml$2(new Date(latest.created_at).toLocaleString("it-IT")) : "-"}</td>
          </tr>
        `;
      });
    } else {
      tanksHtmlRows = `<tr><td colspan="4">Nessuna cisterna configurata o trovata per questo filtro.</td></tr>`;
    }
    let vendutoDataValue = 0;
    let totalLitriBenzina = 0;
    let totalLitriGasolio = 0;
    if (Array.isArray(todayClosures)) {
      todayClosures.forEach((item) => {
        const closingData = item?.closing_data || {};
        vendutoDataValue += Number(closingData.ricavo_teorico || 0);
        totalLitriBenzina += Number(closingData.litri_benzina || 0);
        totalLitriGasolio += Number(closingData.litri_gasolio || 0);
      });
    }
    const erogatoKpiDataInput = {
      litriBenzina: totalLitriBenzina,
      litriGasolio: totalLitriGasolio,
      totale: totalLitriBenzina + totalLitriGasolio
    };
    let vendutoKpiValue = vendutoDataValue;
    let erogatoKpiData = { ...erogatoKpiDataInput };
    try {
      const [kpiVendutoRes, kpiErogatoRes] = await Promise.all([
        calculationEngine.run(CALCULATION_SCOPES.KPI_VENDUTO, {
          stationsCount,
          operatorsCount,
          closuresCount,
          salesEuro: vendutoDataValue,
          fallback: vendutoDataValue,
          timestamp: Date.now()
        }, { forceRefresh: false }),
        calculationEngine.run(CALCULATION_SCOPES.KPI_EROGATO, {
          erogatoData: erogatoKpiDataInput,
          totalLitriBenzina,
          totalLitriGasolio,
          fallback: erogatoKpiDataInput
        }, { forceRefresh: false })
      ]);
      if (typeof kpiVendutoRes === "number") {
        vendutoKpiValue = kpiVendutoRes;
      } else if (kpiVendutoRes && typeof kpiVendutoRes === "object" && typeof kpiVendutoRes.value === "number") {
        vendutoKpiValue = kpiVendutoRes.value;
      }
      if (kpiErogatoRes && typeof kpiErogatoRes === "object") {
        erogatoKpiData = {
          litriBenzina: kpiErogatoRes.litriBenzina ?? totalLitriBenzina,
          litriGasolio: kpiErogatoRes.litriGasolio ?? totalLitriGasolio,
          totale: (kpiErogatoRes.litriBenzina ?? totalLitriBenzina) + (kpiErogatoRes.litriGasolio ?? totalLitriGasolio)
        };
      }
    } catch (calcErr) {
      console.warn("Errore calcoli KPI (usando fallback):", calcErr);
    }
    const dashboardConfig = await loadDashboardConfig();
    const kpiData = {
      venduto: {
        value: vendutoKpiValue ? formatEuro(vendutoKpiValue) : "€ 0",
        subtitle: "+0% vs ieri"
      },
      erogato: {
        value: `${(erogatoKpiData.totale || 0).toFixed(2)} L`,
        subtitle: `${(erogatoKpiData.litriBenzina || 0).toFixed(2)} L Benzina / ${(erogatoKpiData.litriGasolio || 0).toFixed(2)} L Gasolio`
      },
      stazioni: {
        value: `${stationsCount || 0}`,
        subtitle: `${operatorsCount || 0} operatori attivi`
      },
      alert: {
        value: `${closuresCount || 0}`,
        subtitle: "Chiusure registrate"
      }
    };
    const kpiHtml = renderKpiCards(dashboardConfig, kpiData);
    if (checkActiveFn && !checkActiveFn()) return;
    container.innerHTML = `
      <section id="dashboard-kpi-grid" class="dashboard-grid" style="grid-template-columns: repeat(${dashboardConfig.gridColumns || 4}, 1fr);">
        ${kpiHtml}
      </section>

      <section class="dashboard-panels" id="dashboard-container">
        <article class="panel-card" id="panel-tanks">
          <h3 class="panel-title">Stato Cisterne Rete in Tempo Reale</h3>
          <p class="panel-subtitle">Panoramica livelli percentuali su tutte le stazioni.</p>
          <div class="table-responsive" style="box-shadow:none; border:none; background:transparent;">
            <table class="tanks-table">
              <thead>
                <tr>
                  <th>Stazione</th>
                  <th>Carburante</th>
                  <th>Livello %</th>
                  <th>Ultimo Agg.</th>
                </tr>
              </thead>
              <tbody>
                ${tanksHtmlRows}
              </tbody>
            </table>
          </div>
        </article>

        <article class="panel-card" id="panel-sales">
          <h3 class="panel-title">Andamento Vendite</h3>
          <p class="panel-subtitle">Trend vendite giornaliere per distributore (valore in €).</p>
          <div class="prices-chart-wrapper">
            <canvas id="sales-trend-chart"></canvas>
          </div>
        </article>
      </section>
    `;
    const gridEl = document.getElementById("dashboard-kpi-grid");
    if (gridEl && window.Sortable) {
      new Sortable(gridEl, {
        animation: 200,
        ghostClass: "kpi-card-ghost",
        onEnd: async function() {
          const newOrderIds = Array.from(gridEl.children).map((el) => el.dataset.kpiId);
          const allItems = [...dashboardConfig.kpiLayout];
          newOrderIds.forEach((id, index) => {
            const itemIndex = allItems.findIndex((k) => k.id === id);
            if (itemIndex !== -1) {
              allItems[itemIndex].order = index;
            }
          });
          dashboardConfig.kpiLayout = allItems;
          await saveDashboardConfig(dashboardConfig);
        }
      });
    }
    requestAnimationFrame(() => {
      initDashboardPanelsDrag();
    });
    if (window.Chart) {
      await renderSalesChart(stationId);
    }
  } catch (err) {
    showErrorMessage(container, err);
  }
}
async function renderSalesChart(stationId) {
  const daysBack = 30;
  const startDate = /* @__PURE__ */ new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  startDate.setHours(0, 0, 0, 0);
  let closuresQuery = supabase.from("shifts").select("id, station_id, closed_at, closing_data, fuel_stations(station_name)").gte("closed_at", startDate.toISOString()).eq("status", "closed");
  if (stationId) closuresQuery = closuresQuery.eq("station_id", stationId);
  closuresQuery = closuresQuery.order("closed_at", { ascending: true });
  const { data: closuresData } = await closuresQuery;
  let stationsQuery = supabase.from("fuel_stations").select("station_id, station_name").order("station_name");
  if (stationId) stationsQuery = stationsQuery.eq("station_id", stationId);
  const { data: allStations } = await stationsQuery;
  const salesByDateAndStation = {};
  const allDates = /* @__PURE__ */ new Set();
  if (closuresData) {
    closuresData.forEach((closure) => {
      if (!closure.closed_at || !closure.closing_data) return;
      const day = new Date(closure.closed_at).toISOString().substring(0, 10);
      allDates.add(day);
      const stationId2 = closure.station_id;
      const ricavo = Number(closure.closing_data?.ricavo_teorico || 0);
      if (!salesByDateAndStation[day]) {
        salesByDateAndStation[day] = {};
      }
      if (!salesByDateAndStation[day][stationId2]) {
        salesByDateAndStation[day][stationId2] = 0;
      }
      salesByDateAndStation[day][stationId2] += ricavo;
    });
  }
  const sortedDates = Array.from(allDates).sort();
  const colors = [
    "#8DC63F",
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
    "#f97316"
  ];
  const datasets = [];
  if (allStations) {
    allStations.forEach((station, index) => {
      const stationId2 = station.station_id;
      const stationName = station.station_name || `Distributore ${stationId2}`;
      const salesData = sortedDates.map((date) => {
        return salesByDateAndStation[date]?.[stationId2] || 0;
      });
      if (salesData.some((v) => v > 0)) {
        datasets.push({
          label: stationName,
          data: salesData,
          borderColor: colors[index % colors.length],
          backgroundColor: colors[index % colors.length] + "20",
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2.5,
          fill: false
        });
      }
    });
  }
  const ctx = document.getElementById("sales-trend-chart");
  if (ctx) {
    new window.Chart(ctx, {
      type: "line",
      data: {
        labels: sortedDates.map((d) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              boxWidth: 12,
              padding: 8,
              font: { size: 10 }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ": € " + context.parsed.y.toFixed(2);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 } }
          },
          y: {
            grid: { color: "rgba(148, 163, 184, 0.2)" },
            ticks: {
              font: { size: 10 },
              callback: function(value) {
                return "€ " + value.toFixed(0);
              }
            }
          }
        }
      }
    });
  }
}
function renderKpiCards(config, kpiData) {
  if (!config || !config.kpiLayout || !Array.isArray(config.kpiLayout)) {
    return "";
  }
  return config.kpiLayout.filter((kpi) => kpi.visible !== false).sort((a, b) => (a.order || 0) - (b.order || 0)).map((kpi) => {
    const kpiMeta = KPI_CATALOG[kpi.id];
    const kpiValue = kpiData[kpi.id];
    if (!kpiMeta || !kpiValue) return "";
    const sizeClass = `kpi-size-${kpi.size || "1x1"}`;
    return `
        <article class="kpi-card ${sizeClass}" data-kpi-id="${kpi.id}">
          <div class="kpi-row">
            <div class="kpi-icon"><i class="fas ${kpiMeta.icon}"></i></div>
          </div>
          <p class="kpi-title">${kpiMeta.title}</p>
          <p class="kpi-value">${kpiValue.value}</p>
          <p class="kpi-sub">${kpiValue.subtitle}</p>
        </article>
      `;
  }).join("");
}
function initDashboardPanelsDrag() {
  const container = document.getElementById("dashboard-container");
  if (!container || !window.Sortable) return;
  new Sortable(container, {
    animation: 250,
    handle: ".panel-title",
    // Drag only by title
    ghostClass: "panel-ghost",
    onEnd: function(evt) {
      saveDashboardState();
    }
  });
  const resizeObserver = new ResizeObserver((entries) => {
    if (window.dashboardResizeTimeout) clearTimeout(window.dashboardResizeTimeout);
    window.dashboardResizeTimeout = setTimeout(() => {
      saveDashboardState();
    }, 500);
  });
  Array.from(container.children).forEach((panel) => {
    resizeObserver.observe(panel);
  });
  restoreDashboardState();
}
function saveDashboardState() {
  const container = document.getElementById("dashboard-container");
  if (!container) return;
  const state = Array.from(container.children).map((el) => ({
    id: el.id,
    width: el.style.width,
    height: el.style.height,
    flex: el.style.flex
    // Save flex state if native resize alters it or if we switched to absolute sizes
  }));
  localStorage.setItem("dashboard_panels_state", JSON.stringify(state));
}
function restoreDashboardState() {
  const container = document.getElementById("dashboard-container");
  const savedState = JSON.parse(localStorage.getItem("dashboard_panels_state"));
  if (savedState && Array.isArray(savedState)) {
    savedState.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) {
        container.appendChild(el);
        if (item.width) el.style.width = item.width;
        if (item.height) el.style.height = item.height;
        if (item.width || item.height) {
          el.style.flex = "none";
        }
      }
    });
  }
}
class AppError extends Error {
  constructor(message, code, originalError) {
    super(message);
    this.code = code;
    this.originalError = originalError;
    this.name = "AppError";
  }
}
function handleError(error, context = "", renderTarget = null) {
  console.error(`[${context}] Error:`, error);
  let userMessage = "Si è verificato un errore imprevisto.";
  let type = "error";
  if (error?.code === "PGRST116") {
    userMessage = "Dati non trovati.";
    type = "warning";
  } else if (error?.message?.toLowerCase().includes("network") || error?.message?.toLowerCase().includes("fetch")) {
    userMessage = "Errore di connessione. Controlla la tua rete.";
  } else if (error instanceof AppError) {
    userMessage = error.message;
  } else if (error?.message) {
    userMessage = error.message;
  }
  if (Toast && typeof Toast.show === "function") {
    Toast.show(userMessage, type);
  } else {
    console.warn("Toast not available due to error", userMessage);
  }
  if (renderTarget && renderTarget instanceof HTMLElement) {
    renderTarget.innerHTML = `
        <div class="error-state" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
            <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color, #dc3545); margin-bottom: 1rem;"></i>
            <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">${userMessage}</p>
            <button class="menu-button primary" onclick="location.reload()">
                <i class="fas fa-sync-alt"></i> Ricarica Pagina
            </button>
        </div>
     `;
  }
}
class Store {
  constructor() {
    this.state = {
      user: null,
      stations: [],
      stationFilter: null,
      // ID of selected station in Admin global filter
      filters: {
        dateFrom: null,
        // YYYY-MM-DD
        dateTo: null,
        // YYYY-MM-DD
        searchQuery: "",
        rangeLabel: "all"
        // 'today', 'week', 'month', 'custom', 'all'
      },
      pagination: {
        page: 0,
        pageSize: 50,
        totalCount: 0
      },
      loading: false,
      error: null
    };
    this.listeners = /* @__PURE__ */ new Set();
  }
  /**
   * Get a snapshot of the current state
   */
  getState() {
    return { ...this.state };
  }
  /**
   * Set the logged-in user
   * @param {Object} user 
   */
  setUser(user) {
    this.state.user = user;
    this.notify("user", user);
  }
  /**
   * Set the list of available fuel stations
   * @param {Array} stations 
   */
  setStations(stations) {
    this.state.stations = stations;
    this.notify("stations", stations);
  }
  /**
   * Update the global station filter
   * @param {number|null} stationId 
   */
  setStationFilter(stationId) {
    this.state.stationFilter = stationId;
    this.notify("stationFilter", stationId);
  }
  /**
   * Update complex filters
   * @param {Object} newFilters - partial object to merge
   */
  setFilters(newFilters) {
    this.state.filters = { ...this.state.filters, ...newFilters };
    this.state.pagination.page = 0;
    this.notify("filters", this.state.filters);
    this.notify("pagination", this.state.pagination);
  }
  /**
   * Update pagination
   * @param {Object} newPagination 
   */
  setPagination(newPagination) {
    this.state.pagination = { ...this.state.pagination, ...newPagination };
    this.notify("pagination", this.state.pagination);
  }
  /**
   * Subscribe to state changes
   * @param {Function} callback - Function called with (key, value) on change
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  /**
   * Notify all listeners of a change
   * @param {string} key 
   * @param {any} value 
   */
  notify(key, value) {
    this.listeners.forEach((listener) => listener(key, value));
  }
  // --- Helpers ---
  /**
   * Get currently filtered station ID (or null for all)
   */
  getFilter() {
    return this.state.stationFilter;
  }
  getFilters() {
    return this.state.filters;
  }
  getPagination() {
    return this.state.pagination;
  }
  getUser() {
    return this.state.user;
  }
}
const store = new Store();
async function showPrezziAdminModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Modifica Prezzi - ${escapeHtml$2(stationName)}`);
  const target = document.getElementById("modal-body");
  const { data: current } = await supabase.from("prezzi_distributore").select("*").eq("station_id", stationId).order("data_validita", { ascending: false }).limit(1).maybeSingle();
  const benzinaValue = escapeNumber(current?.prezzo_benzina);
  const gasolioValue = escapeNumber(current?.prezzo_gasolio);
  target.innerHTML = `
    <form id="admin-prezzi-form">
      <div class="form-group"><label>Benzina</label><input class="price-input" type="number" step="0.001" min="0" name="benzina" value="${benzinaValue}" /></div>
      <div class="form-group"><label>Gasolio</label><input class="price-input" type="number" step="0.001" min="0" name="gasolio" value="${gasolioValue}" /></div>
      <fieldset class="form-group prezzi-validita-group">
        <legend>Validità</legend>
        <div class="validita-grid">
          <label class="validita-option">
            <input type="radio" name="validita" value="ora" checked>
            <span>Da ora</span>
          </label>
          <label class="validita-option">
            <input type="radio" name="validita" value="prossima">
            <span>Dalla prossima chiusura</span>
          </label>
        </div>
      </fieldset>
      <button type="submit" class="menu-button primary">Salva Prezzi</button>
    </form>
  `;
  document.getElementById("admin-prezzi-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    fd.get("validita")?.toString() || "ora";
    let dataValidita = /* @__PURE__ */ new Date();
    const payload = {
      station_id: stationId,
      prezzo_benzina: parseFloat(fd.get("benzina")?.toString() || "0") || 0,
      prezzo_gasolio: parseFloat(fd.get("gasolio")?.toString() || "0") || 0,
      prezzo_gpl: null,
      prezzo_metano: null,
      data_validita: dataValidita.toISOString()
    };
    try {
      await safeSupabaseQuery(() => supabase.from("prezzi_distributore").insert([payload]));
      closeModal();
      Toast.show("Prezzi aggiornati!", "success");
    } catch (err) {
      handleError(err, "savePrices");
    }
  });
}
async function showTanksAdminModal(stationId) {
  const stationName = await getStationName(stationId);
  openModal(`Gestione Cisterne - ${escapeHtml$2(stationName)}`);
  const target = document.getElementById("modal-body");
  const renderTanks = async () => {
    target.innerHTML = '<p class="loading-text">Caricamento cisterne e connessioni...</p>';
    const [tanksResult, linksResult, pumpsResult] = await Promise.all([
      supabase.from("tanks").select("*").eq("station_id", stationId).order("name"),
      supabase.from("tank_pump_links").select(`
          id,
          station_id,
          tank_id,
          pump_id,
          mode,
          ratio,
          priority,
          is_active,
          notes,
          tanks ( id, name, fuel_type ),
          pistole ( id, nome, tipo_carburante, islands(nome) )
        `).eq("station_id", stationId).order("pump_id"),
      supabase.from("pistole").select("id, nome, tipo_carburante, islands!inner(island_id, nome, station_id)").eq("islands.station_id", stationId).order("nome")
    ]);
    const { data: tanks, error: tanksError } = tanksResult;
    if (tanksError) {
      handleError(tanksError, "renderTanks", target);
      return;
    }
    let tankLinks = linksResult?.data || [];
    if (linksResult?.error) {
      if (linksResult.error.code && linksResult.error.code !== "42P01") {
        handleError(linksResult.error, "renderTanks_links", target);
        return;
      }
      tankLinks = [];
    }
    const { data: pumps, error: pumpsError } = pumpsResult;
    if (pumpsError) {
      handleError(pumpsError, "renderTanks_pumps", target);
      return;
    }
    const formatPumpLabel = (pump) => {
      const labelParts = [
        pump?.nome || `Pistola #${pump?.id}`,
        pump?.islands?.nome ? `Isola ${pump.islands.nome}` : null,
        pump?.tipo_carburante ? pump.tipo_carburante.toUpperCase() : null
      ].filter(Boolean);
      return labelParts.join(" · ");
    };
    const tanksList = Array.isArray(tanks) && tanks.length ? tanks.map((t) => `
          <li class="list-item tank-row">
            <div>
              <strong>${escapeHtml$2(t.name)}</strong>
              <span class="badge badge-info">${escapeHtml$2(t.fuel_type)}</span>
              <span class="tank-meta">Capacità: ${formatNumberIt(t.capacity)} L</span>
            </div>
            <button class="icon-btn delete-tank" data-id="${t.id}" title="Elimina">
              <i class="fas fa-trash"></i>
            </button>
          </li>
        `).join("") : "<p>Nessuna cisterna configurata.</p>";
    const linkRows = Array.isArray(tankLinks) && tankLinks.length ? tankLinks.map((link) => {
      const pumpLabel = formatPumpLabel(link.pistole || {});
      const tankLabel = link.tanks?.name ? `${link.tanks.name} (${link.tanks.fuel_type || "-"})` : `Cisterna #${link.tank_id}`;
      const modeBadge = link.mode === "manual" ? '<span class="badge badge-warning">Manuale</span>' : '<span class="badge badge-info">Automatica</span>';
      const metaValue = link.mode === "manual" ? `Priorità ${link.priority || 1}` : `${link.ratio || 0}%`;
      const statusBadge = link.is_active ? '<span class="badge badge-success">Attiva</span>' : '<span class="badge badge-muted">Disattiva</span>';
      const noteText = link.notes ? `<div class="tank-link-note">${escapeHtml$2(link.notes)}</div>` : "";
      return `
            <tr>
              <td>${escapeHtml$2(pumpLabel)}</td>
              <td>${escapeHtml$2(tankLabel)}</td>
              <td>${modeBadge}</td>
              <td>${escapeHtml$2(metaValue)}</td>
              <td>${statusBadge}</td>
              <td>
                <div class="table-actions">
                  <button class="icon-btn tank-link-toggle" data-id="${link.id}" data-active="${link.is_active}" title="Attiva/Disattiva">
                    <i class="fas ${link.is_active ? "fa-toggle-on" : "fa-toggle-off"}"></i>
                  </button>
                  <button class="icon-btn tank-link-delete" data-id="${link.id}" title="Rimuovi Associazione">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                ${noteText}
              </td>
            </tr>
          `;
    }).join("") : '<tr><td colspan="6">Nessuna associazione configurata.</td></tr>';
    const pumpOptions = Array.isArray(pumps) && pumps.length ? pumps.map((p) => `<option value="${p.id}">${escapeHtml$2(formatPumpLabel(p))}</option>`).join("") : '<option value="">Nessuna pistola disponibile</option>';
    const tankOptions = Array.isArray(tanks) && tanks.length ? tanks.map((t) => `<option value="${t.id}">${escapeHtml$2(`${t.name} (${t.fuel_type || "-"})`)}</option>`).join("") : '<option value="">Nessuna cisterna disponibile</option>';
    const formDisabled = !(pumps?.length && tanks?.length);
    target.innerHTML = `
      <div class="tanks-list">
        <h4>Cisterne Esistenti</h4>
        <ul class="list-group">
          ${tanksList}
        </ul>
      </div>

      <div class="add-tank-form content-box">
        <h4>Aggiungi Nuova Cisterna</h4>
        <form id="add-tank-form">
          <div class="form-row">
            <div class="form-group">
              <label>Nome (es. Cisterna 1)</label>
              <input type="text" name="name" required placeholder="Cisterna 1">
            </div>
            <div class="form-group">
              <label>Tipo Carburante</label>
              <select name="fuel_type" required>
                <option value="Benzina">Benzina</option>
                <option value="Gasolio">Gasolio</option>
                <option value="AdBlue">AdBlue</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Capacità Totale (Litri)</label>
            <input type="number" name="capacity" required min="0" step="1">
          </div>
          <button type="submit" class="menu-button success small-btn">Aggiungi Cisterna</button>
        </form>
      </div>

      <div class="content-box tank-links-section">
        <div class="section-header">
          <div>
            <h4>Associazioni Pistole ↔︎ Cisterne</h4>
            <p class="section-subtitle">Configura se una pistola attinge automaticamente da più serbatoi o se richiede la scelta dell'operatore.</p>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table tank-links-table">
            <thead>
              <tr>
                <th>Pistola</th>
                <th>Cisterna</th>
                <th>Modalità</th>
                <th>Ripartizione / Priorità</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              ${linkRows}
            </tbody>
          </table>
        </div>

        <form id="tank-link-form" class="tank-link-form ${formDisabled ? "form-disabled" : ""}">
          <h5>${formDisabled ? "Configura almeno una pistola e una cisterna per creare un'associazione" : "Crea nuova associazione"}</h5>
          <div class="form-row">
            <div class="form-group">
              <label>Pistola</label>
              <select name="pump_id" ${!pumps?.length ? "disabled" : ""} required>
                ${pumpOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Cisterna</label>
              <select name="tank_id" ${!tanks?.length ? "disabled" : ""} required>
                ${tankOptions}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Modalità</label>
              <select name="mode" id="tank-link-mode" ${formDisabled ? "disabled" : ""}>
                <option value="auto">Automatica (ripartizione)</option>
                <option value="manual">Manuale (scelta operatore)</option>
              </select>
            </div>
            <div class="form-group" data-role="ratio-group">
              <label>Percentuale (automatica)</label>
              <input type="number" name="ratio" value="100" min="1" max="100" step="1" ${formDisabled ? "disabled" : ""}>
            </div>
            <div class="form-group" data-role="priority-group" style="display:none;">
              <label>Priorità manuale</label>
              <input type="number" name="priority" value="1" min="1" step="1" ${formDisabled ? "disabled" : ""}>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group checkbox-group">
              <label class="checkbox">
                <input type="checkbox" name="is_active" ${formDisabled ? "disabled" : ""} checked>
                Associazione attiva
              </label>
            </div>
            <div class="form-group" style="flex:2;">
              <label>Note (opzionale)</label>
              <input type="text" name="notes" placeholder="Es. Devia verso cisterna 2 in caso di scorta">
            </div>
          </div>
          <button type="submit" class="menu-button primary small-btn" ${formDisabled ? "disabled" : ""}>
            <i class="fas fa-plug"></i> Salva Associazione
          </button>
        </form>
      </div>
    `;
    target.querySelectorAll(".delete-tank").forEach((btnElement) => {
      const btn = (
        /** @type {HTMLElement} */
        btnElement
      );
      btn.addEventListener("click", async () => {
        const confirmed = await openConfirmModal("Eliminare questa cisterna?");
        if (!confirmed) return;
        await safeSupabaseQuery(() => supabase.from("tanks").delete().eq("id", btn.dataset.id));
        renderTanks();
      });
    });
    const addTankForm = document.getElementById("add-tank-form");
    addTankForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = (
        /** @type {HTMLFormElement} */
        e.target
      );
      const fd = new FormData(form);
      const payload = {
        station_id: stationId,
        name: fd.get("name")?.toString() || "",
        fuel_type: fd.get("fuel_type")?.toString() || "",
        capacity: parseFloat(fd.get("capacity")?.toString() || "0")
      };
      try {
        await safeSupabaseQuery(() => supabase.from("tanks").insert([payload]));
        form.reset();
        renderTanks();
      } catch (err) {
        handleError(err, "addTank");
      }
    });
    const linkForm = document.getElementById("tank-link-form");
    const modeSelect = document.getElementById("tank-link-mode");
    const ratioGroup = linkForm?.querySelector('[data-role="ratio-group"]');
    const priorityGroup = linkForm?.querySelector('[data-role="priority-group"]');
    const refreshModeFields = () => {
      if (!modeSelect || !ratioGroup || !priorityGroup) return;
      const mode = (
        /** @type {HTMLSelectElement} */
        modeSelect.value
      );
      const isFormDisabled = linkForm?.classList.contains("form-disabled");
      const ratioInput = (
        /** @type {HTMLInputElement | null} */
        ratioGroup.querySelector("input")
      );
      const priorityInput = (
        /** @type {HTMLInputElement | null} */
        priorityGroup.querySelector("input")
      );
      if (mode === "manual") {
        /** @type {HTMLElement} */
        ratioGroup.style.display = "none";
        if (ratioInput) ratioInput.disabled = true;
        /** @type {HTMLElement} */
        priorityGroup.style.display = "block";
        if (priorityInput) priorityInput.disabled = isFormDisabled ? true : false;
      } else {
        /** @type {HTMLElement} */
        ratioGroup.style.display = "block";
        if (ratioInput) ratioInput.disabled = isFormDisabled ? true : false;
        /** @type {HTMLElement} */
        priorityGroup.style.display = "none";
        if (priorityInput) priorityInput.disabled = true;
      }
    };
    modeSelect?.addEventListener("change", refreshModeFields);
    refreshModeFields();
    linkForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = (
        /** @type {HTMLFormElement} */
        e.target
      );
      const fd = new FormData(form);
      const mode = fd.get("mode")?.toString() || "auto";
      const payload = {
        station_id: stationId,
        pump_id: parseInt(fd.get("pump_id")?.toString() || "0", 10),
        tank_id: parseInt(fd.get("tank_id")?.toString() || "0", 10),
        mode,
        ratio: mode === "auto" ? parseFloat(fd.get("ratio")?.toString() || "0") || 0 : null,
        priority: mode === "manual" ? parseInt(fd.get("priority")?.toString() || "0", 10) || 1 : null,
        is_active: fd.get("is_active") !== null,
        notes: fd.get("notes")?.toString().trim() || null
      };
      try {
        await safeSupabaseQuery(() => supabase.from("tank_pump_links").insert([payload]));
        form.reset();
        refreshModeFields();
        renderTanks();
      } catch (err) {
        handleError(err, "addTankLink");
      }
    });
    target.querySelectorAll(".tank-link-toggle").forEach((btnElement) => {
      const btn = (
        /** @type {HTMLElement} */
        btnElement
      );
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const current = btn.dataset.active === "true";
        await safeSupabaseQuery(() => supabase.from("tank_pump_links").update({ is_active: !current }).eq("id", id));
        renderTanks();
      });
    });
    target.querySelectorAll(".tank-link-delete").forEach((btnElement) => {
      const btn = (
        /** @type {HTMLElement} */
        btnElement
      );
      btn.addEventListener("click", async () => {
        const confirmed = await openConfirmModal("Rimuovere questa associazione pistola/cisterna?");
        if (!confirmed) return;
        await safeSupabaseQuery(() => supabase.from("tank_pump_links").delete().eq("id", btn.dataset.id));
        renderTanks();
      });
    });
  };
  renderTanks();
}
async function showStationsTab(container, actionsContainer) {
  showLoadingMessage(container);
  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-station-btn"><i class="fas fa-plus"></i> Nuovo Distributore</button>`;
    document.getElementById("add-station-btn").addEventListener("click", () => openStationModal());
  }
  try {
    const { data: stations, error } = await supabase.from("fuel_stations").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    if (!stations || stations.length === 0) {
      container.innerHTML = "<p>Nessun distributore trovato.</p>";
      return;
    }
    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Località</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;
    stations.forEach((st) => {
      html += `
        <tr>
          <td>${escapeHtml$2(st.station_name)}</td>
          <td>${escapeHtml$2(st.location)}</td>
          <td>
            <button class="icon-btn edit-station" data-id="${st.station_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn prices-station" data-id="${st.station_id}" title="Prezzi"><i class="fas fa-tag"></i></button>
            <button class="icon-btn islands-station" data-id="${st.station_id}" title="Isole e Pistole"><i class="fas fa-gas-pump"></i></button>
            <button class="icon-btn tanks-station" data-id="${st.station_id}" title="Cisterne"><span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="1" y="7" width="22" height="11" rx="5.5" /><rect x="14" y="3" width="7" height="4" rx="1" /><rect x="4" y="18" width="3" height="3" rx="1" /><rect x="17" y="18" width="3" height="3" rx="1" /><path d="M9 15.5l2-3.5 2 3.5H9z" fill="white" /></svg></span></button>
            <button class="icon-btn delete-station" data-id="${st.station_id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
    if (
      /** @type {import('../types.js').CustomWindow} */
      /** @type {any} */
      window.refreshUiIcons
    ) {
      /** @type {import('../types.js').CustomWindow} */
      /** @type {any} */
      window.refreshUiIcons();
    }
    container.querySelectorAll(".edit-station").forEach((btn) => {
      btn.addEventListener("click", () => openStationModal(
        /** @type {HTMLElement} */
        btn.dataset.id
      ));
    });
    container.querySelectorAll(".prices-station").forEach((btn) => {
      btn.addEventListener("click", () => showPrezziAdminModal(
        /** @type {HTMLElement} */
        btn.dataset.id
      ));
    });
    container.querySelectorAll(".islands-station").forEach((btn) => {
      btn.addEventListener("click", () => showIslandsModal(parseInt(
        /** @type {HTMLElement} */
        btn.dataset.id || "0"
      )));
    });
    container.querySelectorAll(".tanks-station").forEach((btn) => {
      btn.addEventListener("click", () => showTanksAdminModal(
        /** @type {HTMLElement} */
        btn.dataset.id
      ));
    });
    container.querySelectorAll(".delete-station").forEach((btn) => {
      btn.addEventListener("click", () => deleteStation(
        /** @type {HTMLElement} */
        btn.dataset.id
      ));
    });
  } catch (err) {
    showErrorMessage(container, err);
  }
}
async function openStationModal(stationId = null) {
  const isEdit = !!stationId;
  openModal(isEdit ? "Modifica Distributore" : "Nuovo Distributore");
  const target = document.getElementById("modal-body");
  let station = {};
  if (isEdit) {
    const { data } = await supabase.from("fuel_stations").select("*").eq("station_id", stationId).single();
    station = data || {};
  }
  const allowPartialClosure = station.allow_partial_closure !== false;
  target.innerHTML = `
    <form id="station-form">
      <div class="form-group">
        <label>Nome Distributore</label>
        <input type="text" name="station_name" value="${escapeHtml$2(station.station_name)}" required>
      </div>
      <div class="form-group">
        <label>Località (indirizzo / città)</label>
        <input type="text" name="location" value="${escapeHtml$2(station.location)}">
      </div>
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
          <input type="checkbox" name="allow_partial_closure" ${allowPartialClosure ? "checked" : ""} style="width: 18px; height: 18px;">
          <span>Consenti chiusura parziale per gli operatori</span>
        </label>
        <small style="color: #666; margin-top: 5px; display: block;">
          Se disabilitato, gli operatori di questo distributore potranno effettuare solo chiusure finali.
        </small>
      </div>
      <button type="submit" class="menu-button primary">${isEdit ? "Salva Modifiche" : "Crea Distributore"}</button>
    </form>
  `;
  document.getElementById("station-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = (
      /** @type {HTMLFormElement} */
      e.target
    );
    const formData = new FormData(form);
    const payload = {
      station_name: formData.get("station_name")?.toString() || "",
      location: formData.get("location")?.toString() || "",
      allow_partial_closure: formData.get("allow_partial_closure") === "on"
    };
    const submitBtn = form.querySelector('button[type="submit"]');
    try {
      setButtonLoading(submitBtn, true, "Salvataggio...");
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from("fuel_stations").update(payload).eq("station_id", stationId));
      } else {
        await safeSupabaseQuery(() => supabase.from("fuel_stations").insert([payload]));
      }
      closeModal();
      const event = new CustomEvent("stations-updated");
      document.dispatchEvent(event);
    } catch (err) {
      Toast.show("Errore salvataggio: " + err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}
async function deleteStation(stationId) {
  if (!await openConfirmModal("Sei sicuro di voler eliminare questo distributore?")) return;
  try {
    await safeSupabaseQuery(() => supabase.from("fuel_stations").delete().eq("station_id", stationId));
    const event = new CustomEvent("stations-updated");
    document.dispatchEvent(event);
  } catch (err) {
    Toast.show("Errore eliminazione: " + err.message, "error");
  }
}
let creditsContext = { container: null, actions: null, stationId: null };
async function showCreditiOverview(container, actionsContainer, stationId = null) {
  creditsContext = { container, actions: actionsContainer, stationId };
  showLoadingMessage(container);
  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-customer-btn"><i class="fas fa-plus"></i> Nuovo Cliente</button>`;
    const addBtn = document.getElementById("add-customer-btn");
    if (addBtn) addBtn.addEventListener("click", () => openCustomerModal());
  }
  try {
    let query = supabase.from("crediti_clienti").select(`
        *,
        fuel_stations(station_name)
      `);
    if (stationId) query = query.eq("station_id", stationId);
    query = query.order("cliente");
    const { data: customers, error } = await query;
    if (error) throw error;
    if (!customers || customers.length === 0) {
      container.innerHTML = "<p>Nessun cliente trovato.</p>";
      return;
    }
    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Distributore</th>
              <th>Saldo Attuale</th>
              <th>Ultimo Aggiornamento</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;
    customers.forEach((c) => {
      const stationName = c.fuel_stations?.station_name || "-";
      html += `
        <tr>
          <td>${escapeHtml$2(c.cliente)}</td>
          <td>${escapeHtml$2(stationName)}</td>
          <td><strong>${formatEuro(c.saldo || 0)}</strong></td>
          <td>${c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "-"}</td>
          <td>
            <button class="icon-btn edit-customer" data-id="${c.id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn delete-customer" data-id="${c.id}" title="Elimina"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
    container.querySelectorAll(".edit-customer").forEach((btn) => {
      btn.addEventListener("click", () => openCustomerModal(btn.dataset.id));
    });
    container.querySelectorAll(".delete-customer").forEach((btn) => {
      btn.addEventListener("click", () => deleteCustomer(btn.dataset.id));
    });
  } catch (err) {
    handleError(err, "showCreditiOverview", container);
  }
}
async function openCustomerModal(customerId = null) {
  const isEdit = !!customerId;
  openModal(isEdit ? "Modifica Cliente" : "Nuovo Cliente");
  const target = document.getElementById("modal-body");
  let customer = {};
  if (isEdit) {
    const { data } = await supabase.from("crediti_clienti").select("*").eq("id", customerId).single();
    customer = data || {};
  }
  target.innerHTML = `
    <form id="customer-form">
      <div class="form-group">
        <label>Nome Cliente / Azienda</label>
        <input type="text" name="cliente" value="${escapeHtml$2(customer.cliente)}" required>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Saldo Iniziale (€)</label>
        <input type="number" name="saldo" step="0.01">
      </div>` : ""}
      <button type="submit" class="menu-button primary">${isEdit ? "Salva Modifiche" : "Crea Cliente"}</button>
    </form>
  `;
  const form = document.getElementById("customer-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const cliente = fd.get("cliente");
      const saldo = parseFloat(fd.get("saldo")) || 0;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const errors = validateForm({ cliente, saldo }, {
        cliente: [Validators.required],
        saldo: [Validators.number]
      });
      if (errors) {
        Toast.show("Errore validazione: " + formatErrorMessages(errors), "error");
        return;
      }
      try {
        setButtonLoading(submitBtn, true, "Salvataggio...");
        if (isEdit) {
          await safeSupabaseQuery(() => supabase.from("crediti_clienti").update({ cliente }).eq("id", customerId));
        } else {
          await safeSupabaseQuery(() => supabase.from("crediti_clienti").insert([{
            cliente,
            saldo,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          }]));
        }
        closeModal();
        Toast.show(isEdit ? "Cliente aggiornato" : "Cliente creato", "success");
        refreshCreditsTab();
      } catch (err) {
        handleError(err, "saveCustomer");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
}
async function deleteCustomer(customerId) {
  if (!await openConfirmModal("Sei sicuro? Verranno eliminati anche i movimenti associati.")) return;
  try {
    await safeSupabaseQuery(() => supabase.from("crediti_clienti").delete().eq("id", customerId));
    Toast.show("Cliente eliminato", "success");
    refreshCreditsTab();
  } catch (err) {
    handleError(err, "deleteCustomer");
  }
}
function refreshCreditsTab() {
  if (creditsContext.container) {
    showCreditiOverview(creditsContext.container, creditsContext.actions, creditsContext.stationId);
  }
}
async function showOperatorsTab(container, actionsContainer) {
  showLoadingMessage(container);
  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-operator-btn"><i class="fas fa-plus"></i> Nuovo Operatore</button>`;
    document.getElementById("add-operator-btn").addEventListener("click", () => openOperatorModal());
  }
  try {
    const { data: users, error } = await supabase.from("users").select(`
        *,
        user_stations (
          station_id,
          fuel_stations ( station_name )
        )
      `).order("created_at", { ascending: false });
    if (error) throw error;
    if (!users || users.length === 0) {
      container.innerHTML = "<p>Nessun operatore trovato.</p>";
      return;
    }
    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Ruolo</th>
              <th>Distributore</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;
    users.forEach((u) => {
      const firstLink = Array.isArray(u.user_stations) ? u.user_stations[0] : u.user_stations;
      const stationName = firstLink?.fuel_stations?.station_name || "-";
      const roleLabels = {
        "admin": "Admin",
        "operator": "Operatore",
        "accounting": "Contabilità",
        "billing": "Fatturazione"
      };
      const roleLabel = roleLabels[u.role] || u.role || "Operatore";
      html += `
        <tr>
          <td>${escapeHtml$2(u.full_name)}</td>
          <td>${escapeHtml$2(u.email)}</td>
          <td><span class="badge role-${u.role || "operator"}">${roleLabel}</span></td>
          <td>${escapeHtml$2(stationName)}</td>
          <td>
            <button class="icon-btn edit-operator" data-id="${u.user_id}" title="Modifica"><i class="fas fa-edit"></i></button>
            <button class="icon-btn assign-station" data-id="${u.user_id}" title="Assegna Stazione"><i class="fas fa-map-marker-alt"></i></button>
            <button class="icon-btn delete-operator" data-id="${u.user_id}" title="Elimina" style="color: #ff4d4d;"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
    container.querySelectorAll(".edit-operator").forEach((btn) => {
      btn.addEventListener("click", () => openOperatorModal(
        /** @type {HTMLElement} */
        btn.dataset.id
      ));
    });
    container.querySelectorAll(".assign-station").forEach((btn) => {
      btn.addEventListener("click", () => openAssignStationModal(
        /** @type {HTMLElement} */
        btn.dataset.id
      ));
    });
    container.querySelectorAll(".delete-operator").forEach((btn) => {
      btn.addEventListener("click", () => deleteUser(
        /** @type {HTMLElement} */
        btn.dataset.id,
        container,
        actionsContainer
      ));
    });
  } catch (err) {
    handleError(err, "showOperatorsTab", container);
  }
}
async function deleteUser(userId, container, actionsContainer) {
  const confirmed = await openConfirmModal("Sei sicuro di voler eliminare questo operatore? Questa azione è irreversibile e rimuoverà tutte le sue assegnazioni.");
  if (!confirmed) {
    return;
  }
  try {
    await safeSupabaseQuery(() => supabase.from("user_stations").delete().eq("user_id", userId));
    await safeSupabaseQuery(() => supabase.from("users").delete().eq("user_id", userId));
    Toast.show("Operatore eliminato con successo!", "success");
    showOperatorsTab(container, actionsContainer);
  } catch (err) {
    handleError(err, "deleteUser");
    Toast.show("Errore durante l'eliminazione dell'operatore.", "error");
  }
}
async function openOperatorModal(userId = null) {
  const isEdit = !!userId;
  openModal(isEdit ? "Modifica Operatore" : "Nuovo Operatore");
  const target = document.getElementById("modal-body");
  let user = {};
  if (isEdit) {
    const { data } = await supabase.from("users").select("*").eq("user_id", userId).single();
    user = data || {};
  }
  target.innerHTML = `
    <form id="operator-form">
      <div class="form-group">
        <label>Nome Completo</label>
        <input type="text" name="full_name" value="${escapeHtml$2(user.full_name)}" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${escapeHtml$2(user.email || "")}" required ${isEdit ? "readonly" : ""}>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" required minlength="6">
      </div>` : ""}
      <div class="form-group">
        <label>Ruolo</label>
        <select name="role" class="form-control" required>
          <option value="operator" ${user.role === "operator" || !user.role ? "selected" : ""}>Operatore</option>
          <option value="accounting" ${user.role === "accounting" ? "selected" : ""}>Contabilità (Accounting)</option>
          <option value="billing" ${user.role === "billing" ? "selected" : ""}>Fatturazione (Billing)</option>
          <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin (Full Access)</option>
        </select>
      </div>
      <button type="submit" class="menu-button primary">${isEdit ? "Salva Modifiche" : "Crea Utente"}</button>
    </form>
  `;
  document.getElementById("operator-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = (
      /** @type {HTMLFormElement} */
      e.target
    );
    const fd = new FormData(form);
    const email = fd.get("email")?.toString();
    const password = fd.get("password")?.toString();
    const fullName = fd.get("full_name")?.toString();
    const role = fd.get("role")?.toString();
    const submitBtn = form.querySelector('button[type="submit"]');
    const schema = {
      full_name: [Validators.required],
      role: [Validators.required]
    };
    if (!isEdit) {
      schema.email = [Validators.required, Validators.email];
      schema.password = [Validators.required, Validators.minLength(6)];
    }
    const errors = validateForm({ full_name: fullName, email, password, role }, schema);
    if (errors) {
      Toast.show("Dati non validi:\n" + formatErrorMessages(errors), "error");
      return;
    }
    try {
      setButtonLoading(submitBtn, true, "Salvataggio...");
      if (isEdit) {
        await safeSupabaseQuery(() => supabase.from("users").update({
          full_name: fullName,
          role
        }).eq("user_id", userId));
      } else {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("admin_create_user_v2", {
          body: { email, password, full_name: fullName, role }
        });
        if (fnError) throw fnError;
        if (fnData?.error) throw new Error(fnData.error);
        Toast.show("Utente creato con successo (email pre-confermata)!", "success");
      }
      closeModal();
      const event = new CustomEvent("operators-updated");
      document.dispatchEvent(event);
      const adminContent = document.getElementById("admin-content");
      if (adminContent && adminContent.querySelector(".edit-operator")) {
        showOperatorsTab(adminContent, document.getElementById("header-actions"));
      }
    } catch (err) {
      handleError(err, "admin_action");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}
async function openAssignStationModal(userId) {
  openModal("Assegna Stazione");
  const target = document.getElementById("modal-body");
  const [stationsRes, currentRes] = await Promise.all([
    supabase.from("fuel_stations").select("*"),
    supabase.from("user_stations").select("station_id").eq("user_id", userId).maybeSingle()
  ]);
  const stations = stationsRes.data || [];
  const currentStationId = currentRes.data?.station_id;
  let html = `
    <form id="assign-station-form">
      <div class="form-group">
        <label>Seleziona Stazione</label>
        <select name="station_id" class="form-control">
          <option value="">Nessuna</option>
          ${stations.map((s) => `<option value="${s.station_id}" ${s.station_id === currentStationId ? "selected" : ""}>${escapeHtml$2(s.station_name)}</option>`).join("")}
        </select>
      </div>
      <button type="submit" class="menu-button primary">Salva Assegnazione</button>
    </form>
  `;
  target.innerHTML = html;
  document.getElementById("assign-station-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = (
      /** @type {HTMLFormElement} */
      e.target
    );
    const stationId = (
      /** @type {HTMLSelectElement} */
      form.elements.namedItem("station_id").value
    );
    const submitBtn = form.querySelector('button[type="submit"]');
    try {
      setButtonLoading(submitBtn, true, "Salvataggio...");
      await supabase.from("user_stations").delete().eq("user_id", userId);
      if (stationId) {
        await safeSupabaseQuery(() => supabase.from("user_stations").insert([{ user_id: userId, station_id: stationId }]));
      }
      closeModal();
      Toast.show("Assegnazione salvata", "success");
      const adminContent = document.getElementById("admin-content");
      if (adminContent && adminContent.querySelector(".edit-operator")) {
        showOperatorsTab(adminContent, document.getElementById("header-actions"));
      }
    } catch (err) {
      handleError(err, "admin_action");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}
class FilterBar {
  constructor(containerId) {
    this.containerId = containerId;
  }
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const currentFilters = store.getFilters();
    const activeChip = currentFilters.rangeLabel || "all";
    const chips = [
      { label: "Tutto", value: "all" },
      { label: "Oggi", value: "today" },
      { label: "Settimana", value: "week" },
      { label: "Mese", value: "month" }
    ];
    const stations = store.state.stations || [];
    const currentStation = store.getFilter();
    container.innerHTML = `
            <div class="filter-bar">
                <div class="station-filter-wrapper" style="flex: 1; min-width: 200px;">
                    <select id="station-filter-select" class="search-input" style="appearance: auto; padding-left: 12px; cursor: pointer;">
                        <option value="">Tutte le Stazioni</option>
                        ${stations.map((s) => `
                            <option value="${s.station_id}" ${currentStation == s.station_id ? "selected" : ""}>
                                ${s.station_name}
                            </option>
                        `).join("")}
                    </select>
                </div>

                <div class="filter-chips">
                    ${chips.map((chip) => `
                        <button class="chip ${activeChip === chip.value ? "active" : ""}" data-value="${chip.value}">
                            ${chip.label}
                        </button>
                    `).join("")}
                    <button class="chip ${activeChip === "custom" ? "active" : ""}" id="btn-custom-range" title="Date personalizzate">
                        <i class="fas fa-calendar-alt"></i>
                    </button>
                </div>
            </div>
        `;
    this.bindEvents();
  }
  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const stationSelect = container.querySelector("#station-filter-select");
    if (stationSelect) {
      stationSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        store.setStationFilter(val ? parseInt(val) : null);
      });
    }
    container.querySelectorAll(".chip[data-value]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.value;
        this.handleChipClick(value);
      });
    });
    const customBtn = container.querySelector("#btn-custom-range");
    if (customBtn) {
      customBtn.addEventListener("click", () => {
        this.openDateModal();
      });
    }
    const advancedBtn = container.querySelector("#btn-advanced-filters");
    if (advancedBtn) {
      advancedBtn.addEventListener("click", () => {
        this.openDateModal();
      });
    }
  }
  handleChipClick(rangeValue) {
    const today = /* @__PURE__ */ new Date();
    let from = null;
    let to = null;
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    switch (rangeValue) {
      case "today":
        from = today.toISOString().split("T")[0];
        to = tomorrow.toISOString().split("T")[0];
        break;
      case "week":
        const day = today.getDay() || 7;
        if (day !== 1) today.setHours(-24 * (day - 1));
        from = today.toISOString().split("T")[0];
        to = null;
        break;
      case "month":
        today.setDate(1);
        from = today.toISOString().split("T")[0];
        to = null;
        break;
      case "all":
      default:
        from = null;
        to = null;
        break;
    }
    store.setFilters({
      rangeLabel: rangeValue,
      dateFrom: from,
      dateTo: to
    });
    this.render();
  }
  openDateModal() {
    openModal("Filtri Personalizzati");
    const target = document.getElementById("modal-body");
    const current = store.getFilters();
    target.innerHTML = `
            <form id="filters-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Da:</label>
                        <input type="date" name="dateFrom" value="${current.dateFrom || ""}">
                    </div>
                    <div class="form-group">
                        <label>A:</label>
                        <input type="date" name="dateTo" value="${current.dateTo || ""}">
                    </div>
                </div>
                <!-- Future: Station Select here if needed -->
                <button type="submit" class="menu-button primary">Applica</button>
            </form>
        `;
    document.getElementById("filters-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const dateFrom = fd.get("dateFrom");
      const dateTo = fd.get("dateTo");
      store.setFilters({
        rangeLabel: "custom",
        dateFrom: dateFrom || null,
        dateTo: dateTo || null
      });
      closeModal();
      this.render();
    });
  }
}
class Pagination {
  constructor(containerId) {
    this.containerId = containerId;
  }
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const { page, pageSize, totalCount } = store.getPagination();
    const totalPages = Math.ceil(totalCount / pageSize);
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, totalCount);
    const canPrev = page > 0;
    const canNext = page + 1 < totalPages;
    container.innerHTML = `
            <div class="pagination-bar">
                <span class="pagination-info">
                    ${totalCount > 0 ? `${start}-${end} di ${totalCount}` : "Nessun risultato"}
                </span>
                <div class="pagination-controls">
                    <button class="menu-button secondary small btn-prev" ${!canPrev ? "disabled" : ""}>
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="menu-button secondary small btn-next" ${!canNext ? "disabled" : ""}>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;
    this.bindEvents();
  }
  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const btnPrev = container.querySelector(".btn-prev");
    const btnNext = container.querySelector(".btn-next");
    if (btnPrev && !btnPrev.disabled) {
      btnPrev.addEventListener("click", () => {
        const { page } = store.getPagination();
        store.setPagination({ page: Math.max(0, page - 1) });
      });
    }
    if (btnNext && !btnNext.disabled) {
      btnNext.addEventListener("click", () => {
        const { page } = store.getPagination();
        store.setPagination({ page: page + 1 });
      });
    }
  }
}
async function showChiusureTab(container, actionsContainer, defaultStationId = null) {
  container.innerHTML = `
        <div id="filters-container"></div>
        <div id="data-container"></div>
        <div id="pagination-container"></div>
    `;
  const filterBar = new FilterBar("filters-container");
  filterBar.render();
  const pagination = new Pagination("pagination-container");
  if (actionsContainer) actionsContainer.innerHTML = "";
  let lastParams = { page: -1 };
  const renderTable = async () => {
    const dataContainer = document.getElementById("data-container");
    if (!dataContainer) return;
    const filters = store.getFilters();
    const pagState = store.getPagination();
    const stationId = store.getFilter() || defaultStationId;
    const currentFiltersJson = JSON.stringify({ ...filters, stationId });
    lastParams = { page: pagState.page, filtersJson: currentFiltersJson };
    pagination.render();
    showLoadingMessage(dataContainer);
    try {
      let query = supabase.from("shifts").select(`
                    *,
                    fuel_stations(station_name),
                    users(full_name)
                `, { count: "exact" });
      if (stationId) query = query.eq("station_id", stationId);
      if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
      if (filters.dateTo) query = query.lte("created_at", filters.dateTo + "T23:59:59");
      const from = pagState.page * pagState.pageSize;
      const to = from + pagState.pageSize - 1;
      query = query.range(from, to).order("created_at", { ascending: false });
      const { data: closures, error, count } = await query;
      if (error) throw error;
      if (count !== null && count !== pagState.totalCount) {
        store.setPagination({ totalCount: count });
      }
      pagination.render();
      let filteredClosures = closures || [];
      if (filteredClosures.length === 0) {
        dataContainer.innerHTML = "<p>Nessuna chiusura trovata.</p>";
        return;
      }
      let html = `
              <div class="table-responsive">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Stazione</th>
                      <th>Operatore</th>
                      <th>Tipo</th>
                      <th>Totale €</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
            `;
      filteredClosures.forEach((c) => {
        const dateStr = new Date(c.closed_at || c.created_at).toLocaleString("it-IT");
        const stationName = c.fuel_stations?.station_name || `#${c.station_id}`;
        const operatorName = c.users?.full_name || `#${c.operator_id}`;
        const closingData = c.closing_data || {};
        const isFinal = c.status === "closed" || closingData.is_final === true;
        const closureType = isFinal ? "Finale" : "Parziale";
        const closureClass = isFinal ? "badge-success" : "badge-warning";
        const totalValue = closingData.ricavo_teorico || closingData.totale_atteso || 0;
        const total = formatEuro(totalValue);
        html += `
                <tr>
                  <td>${dateStr}</td>
                  <td>${escapeHtml$2(stationName)}</td>
                  <td>${escapeHtml$2(operatorName)}</td>
                  <td><span class="badge ${closureClass}">${closureType}</span></td>
                  <td>${total}</td>
                  <td>
                    <button class="icon-btn view-closure" data-id="${c.id}" title="Dettagli"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn export-closure" data-id="${c.id}" title="Export"><i class="fas fa-file-export"></i></button>
                    <button class="icon-btn delete-closure" data-id="${c.id}" title="Elimina" style="color: #dc2626;"><i class="fas fa-trash-alt"></i></button>
                  </td>
                </tr>
              `;
      });
      html += `</tbody></table></div>`;
      dataContainer.innerHTML = html;
      dataContainer.querySelectorAll(".view-closure").forEach((btn) => {
        btn.addEventListener("click", () => showClosureDetails(
          /** @type {HTMLElement} */
          btn.dataset.id
        ));
      });
      dataContainer.querySelectorAll(".export-closure").forEach((btn) => {
        btn.addEventListener("click", () => openExportModal(
          /** @type {HTMLElement} */
          btn.dataset.id
        ));
      });
      dataContainer.querySelectorAll(".delete-closure").forEach((btn) => {
        btn.addEventListener("click", () => deleteClosure(
          /** @type {HTMLElement} */
          btn.dataset.id,
          renderTable
        ));
      });
    } catch (err) {
      handleError(err, "showChiusureTab", dataContainer);
    }
  };
  await renderTable();
  const unsub = store.subscribe((key, val) => {
    if (!document.getElementById("filters-container")) {
      unsub();
      return;
    }
    if (key === "filters" || key === "stationFilter") {
      renderTable();
    } else if (key === "pagination") {
      if (val.page !== lastParams.page) {
        renderTable();
      } else {
        pagination.render();
      }
    }
  });
}
async function showClosureDetails(closureId) {
  openModal("Dettagli Chiusura");
  const target = document.getElementById("modal-body");
  showLoadingMessage(target);
  try {
    const { data: closure } = await supabase.from("shifts").select("*").eq("id", closureId).single();
    if (!closure) throw new Error("Chiusura non trovata");
    const closingData = closure.closing_data || {};
    const dettaglio = closingData.dettaglio_incasso || {};
    const dateStr = new Date(closure.closed_at || closure.created_at).toLocaleString("it-IT");
    const contanti = formatEuro(dettaglio.contanti_operatore || 0);
    const pos = formatEuro(dettaglio.pos_operatore || 0);
    const crediti = formatEuro(dettaglio.crediti || 0);
    const voucher = formatEuro(dettaglio.voucher || 0);
    const carteUta = formatEuro(dettaglio.uta_dkv_operatore || 0);
    const rimborsi = formatEuro(dettaglio.rimborsi_uscite || 0);
    const selfData = closingData.scontrino_self || {};
    const banconoteErogate = selfData.banconote_erogate || 0;
    const banconoteIncassate = selfData.banconote_incassate || 0;
    const bancomatSelf = selfData.bancomat_erogati || 0;
    const cardsSelf = selfData.transazioni_uta || 0;
    const selfTotalVal = banconoteErogate + bancomatSelf + cardsSelf;
    const selfTotalFormatted = formatEuro(selfTotalVal);
    let contantiSelfHtml = "";
    if (banconoteErogate === banconoteIncassate) {
      contantiSelfHtml = `<span>Contanti:</span> <b>${formatEuro(banconoteErogate)}</b>`;
    } else {
      contantiSelfHtml = `
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Contanti:</span>
                <div style="text-align: right;">
                    <div>Erogati: <b>${formatEuro(banconoteErogate)}</b></div>
                    <div style="font-size: 0.85em; color: #64748b;">Incassati: <b>${formatEuro(banconoteIncassate)}</b></div>
                </div>
            </div>`;
    }
    const extraVal = closingData.extra_incassi || 0;
    const extra = formatEuro(extraVal);
    const vendutoCarburanteVal = closingData.ricavo_teorico || 0;
    const vendutoCarburante = formatEuro(vendutoCarburanteVal);
    const totaleRealeVal = vendutoCarburanteVal + extraVal;
    const totaleReale = formatEuro(totaleRealeVal);
    target.innerHTML = `
      <div class="closure-details" style="font-size: 0.95rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            <span>ID Chiusura: <b>${closure.id}</b></span>
            <span>${dateStr}</span>
        </div>

        <!-- SEZIONE SELF SERVICE -->
        <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
            <div style="font-weight: 600; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Dettaglio Self Service</div>
            
            <p style="display: flex; justify-content: space-between; margin: 5px 0;">${contantiSelfHtml}</p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Bancomat:</span> <b>${formatEuro(bancomatSelf)}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Icad/DKV/Iscard:</span> <b>${formatEuro(cardsSelf)}</b></p>
            
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-weight: 700;">
                <span>Incasso Totale Self:</span> <span>${selfTotalFormatted}</span>
            </div>
        </div>

        <!-- SEZIONE OPERATORE -->
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
            <div style="font-weight: 600; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Dettaglio Operatore</div>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Contanti:</span> <b>${contanti}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0;"><span>POS:</span> <b>${pos}</b></p>
            <p style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Crediti:</span> <b>${crediti}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0;"><span>Voucher/Buoni:</span> <b>${voucher}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0;"><span>Carte (UTA/DKV):</span> <b>${carteUta}</b></p>
            <p style="display: flex; justify: space-between; margin: 5px 0; color: #dc2626;"><span>Uscite/Rimborsi:</span> <b>- ${rimborsi}</b></p>
            
            <hr style="margin: 8px 0; border-color: #e2e8f0;">
            
            <!-- NUOVA RIGA: Totale venduto della giornata (pistole) -->
            <p style="display: flex; justify-content: space-between; margin: 5px 0; font-weight: 600; color: #0f172a;"><span>Totale Venduto (Pistole):</span> <b>${vendutoCarburante}</b></p>
            
            <p style="display: flex; justify-content: space-between; margin: 5px 0; color: #1e40af;"><span>Incassi Extra:</span> <b>${extra}</b></p>
        </div>

        <div style="background: #eff6ff; padding: 15px; border-radius: 6px; border: 1px solid #bfdbfe; text-align: right; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 4px;">Totale Venduto (Carburante + Extra)</div>
            <div style="font-size: 1.6rem; font-weight: 700; color: #1e3a8a;">${totaleReale}</div>
        </div>
        
        <div style="margin-top: 15px; text-align: center;">
             <button class="menu-button" onclick="document.querySelector('.icon-btn.export-closure[data-id=\\'${closure.id}\\']').click()">
                <i class="fas fa-file-export"></i> Scarica Excel Dettagliato
             </button>
        </div>
      </div>
    `;
  } catch (err) {
    target.innerHTML = `<p class="error">Errore: ${err.message}</p>`;
  }
}
async function openExportModal(closureId) {
  try {
    const ctx = await fetchClosureExportData(closureId);
    const template = buildClosureTemplate(ctx, ctx.layout, ctx.summaryDefaults);
    await generateClosureExcel(template);
  } catch (err) {
    Toast.show("Errore export: " + (err?.message || err), "error");
    console.error("Errore export:", err);
  }
}
async function deleteClosure(closureId, onSuccessCallback) {
  const confirmed = await openConfirmModal("Sei sicuro di voler eliminare questa chiusura? L'operazione è irreversibile e cancellerà anche i dettagli dei contatori e lo scarico serbatoi.");
  if (!confirmed) return;
  try {
    await Promise.all([
      supabase.from("shift_pistols").delete().eq("shift_id", closureId),
      supabase.from("tank_pump_usages").delete().eq("shift_id", closureId)
    ]);
    const { error } = await supabase.from("shifts").delete().eq("id", closureId);
    if (error) throw error;
    Toast.show("Chiusura eliminata con successo", "success");
    if (onSuccessCallback) onSuccessCallback();
  } catch (err) {
    handleError(err, "deleteClosure");
  }
}
let currentAdminTab = "dashboard";
function showAdminArea() {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;
  async function renderGlobalFilter() {
    const container = document.getElementById("header-actions");
    if (!container) return;
    let stations = store.state.stations;
    if (!stations || stations.length === 0) {
      const { data } = await safeSupabaseQuery(() => supabase.from("fuel_stations").select("station_id, station_name").order("station_name"));
      if (data) {
        store.setStations(data);
        stations = data;
      }
    }
    const assignedStations = loggedUser?.assignedStations || [];
    let options = stations || [];
    if (!isFullAdmin) {
      options = options.filter((s) => assignedStations.some((as) => as.id === s.station_id));
    }
    const currentFilter = store.getFilter();
    if (currentFilter === null && !isFullAdmin && options.length > 0) {
      store.setStationFilter(options[0].station_id);
    }
    const finalFilter = store.getFilter();
    container.innerHTML = `
      <div class="global-filter-wrapper">
        <i class="fas fa-filter filter-icon"></i>
        <select id="global-station-filter" class="global-filter-select">
          ${isFullAdmin ? '<option value="">Tutte le Stazioni</option>' : ""}
          ${options.map((s) => `<option value="${s.station_id}" ${finalFilter == s.station_id ? "selected" : ""}>${escapeHtml$2(s.station_name)}</option>`).join("")}
        </select>
      </div>
    `;
    const filterSelect = document.getElementById("global-station-filter");
    if (filterSelect) {
      filterSelect.addEventListener("change", (e) => {
        const val = (
          /** @type {HTMLSelectElement} */
          e.target.value
        );
        const newFilter = val ? parseInt(val) : null;
        store.setStationFilter(newFilter);
        loadAdminTab(currentAdminTab);
      });
    }
  }
  function renderBreadcrumbs(tab, subPath = "") {
    const container = document.getElementById("breadcrumbs");
    if (!container) return;
    const labels = {
      "dashboard": "Dashboard",
      "stations": "Distributori",
      "operators": "Operatori",
      "shifts": "Chiusure",
      "crediti": "Crediti",
      "invoices": "Fatture",
      "vouchers": "Voucher",
      "notifiche": "Notifiche",
      "settings": "Impostazioni"
    };
    let html = `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="dashboard" style="cursor: pointer; text-decoration: none;"><i class="fas fa-home"></i> Home</a>`;
    if (labels[tab] && tab !== "dashboard") {
      html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
      if (subPath) {
        html += `<a href="#" class="breadcrumb-item breadcrumb-link" data-tab="${tab}" style="cursor: pointer; text-decoration: none;">${labels[tab]}</a>`;
      } else {
        html += `<span class="breadcrumb-item active">${labels[tab]}</span>`;
      }
    }
    if (subPath) {
      html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
      html += `<span class="breadcrumb-item active">${subPath}</span>`;
    }
    container.innerHTML = html;
    container.querySelectorAll(".breadcrumb-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetTab = (
          /** @type {HTMLElement} */
          link.dataset.tab
        );
        if (targetTab) {
          currentAdminTab = targetTab;
          loadAdminTab(targetTab);
        }
      });
    });
  }
  const userRole = loggedUser?.role || "operator";
  const isFullAdmin = userRole === "admin" || userRole === "super_admin";
  mainContent.innerHTML = `
    <div class="admin-container">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <p class="sidebar-subtitle">Control Center</p>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-btn active" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
          
          ${isFullAdmin ? `
            <button class="nav-btn" data-tab="stations"><i class="fas fa-gas-pump"></i> Distributori</button>
            <button class="nav-btn" data-tab="operators"><i class="fas fa-users-cog"></i> Gestione Operatori</button>
          ` : ""}

          ${isFullAdmin || userRole === "accounting" ? `
            <button class="nav-btn" data-tab="vouchers"><i class="fas fa-ticket-alt"></i> Gestione Voucher</button>
            <button class="nav-btn" data-tab="shifts"><i class="fas fa-clock"></i> Turni e Chiusure</button>
            <button class="nav-btn" data-tab="crediti"><i class="fas fa-credit-card"></i> Crediti</button>
          ` : ""}

          ${isFullAdmin || userRole === "billing" || userRole === "accounting" ? `
            <button class="nav-btn" data-tab="invoices"><i class="fas fa-file-invoice"></i> Fatture</button>
          ` : ""}

          <button class="nav-btn" data-tab="notifiche"><i class="fas fa-bell"></i> Notifiche</button>
          
          ${isFullAdmin ? `
            <button class="nav-btn" data-tab="settings"><i class="fas fa-cog"></i> Impostazioni</button>
          ` : ""}

          <button class="nav-btn logout-btn" id="admin-logout"><i class="fas fa-sign-out-alt"></i> Esci</button>
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-footer-avatar">
            <i class="fas fa-user-shield"></i>
          </div>
          <div class="sidebar-footer-meta">
            <span class="sidebar-footer-role">${escapeHtml$2(userRole === "admin" || userRole === "super_admin" ? "Amministratore" : userRole === "accounting" ? "Contabilità" : userRole === "billing" ? "Fatturazione" : "Operatore")}</span>
            <span class="sidebar-footer-name">${escapeHtml$2(loggedUser?.full_name || "Utente")}</span>
          </div>
        </div>
      </aside>
      <main class="admin-main">
        <header class="admin-header">
          <div class="admin-header-center">
            <img src="/assets/images/logo-svg.svg" alt="Neofuel" class="admin-header-logo" />
            <div class="header-titles">
              <p class="welcome-subtitle" id="page-subtitle">Dashboard</p>
              <nav id="breadcrumbs" class="breadcrumbs"></nav>
            </div>
          </div>
          <div class="admin-header-right">
            <div id="header-actions" class="header-actions"></div>
            <button class="header-icon-btn" type="button" title="Notifiche">
              <i class="fas fa-bell"></i>
            </button>
          </div>
        </header>
        <div id="admin-content" class="admin-content-area">
          <!-- Contenuto dinamico -->
        </div>
      </main>
    </div>
  `;
  const navBtns = document.querySelectorAll(".nav-btn[data-tab]");
  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      navBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = (
        /** @type {HTMLElement} */
        btn.dataset.tab
      );
      loadAdminTab(tab);
    });
  });
  document.getElementById("admin-logout").addEventListener("click", async () => {
    const confirmLogout = await openConfirmModal("Sei sicuro di voler uscire dal Portale Neofuel?");
    if (confirmLogout) {
      await clearSession();
      await new Promise((resolve) => setTimeout(resolve, 100));
      window.location.href = window.location.pathname;
    }
  });
  async function loadAdminTab(tab) {
    currentAdminTab = tab;
    const content = document.getElementById("admin-content");
    const headerActions = document.getElementById("header-actions");
    const pageSubtitle = document.getElementById("page-subtitle");
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle(
        "active",
        /** @type {HTMLElement} */
        b.dataset.tab === tab
      );
    });
    const titles = {
      "dashboard": "Dashboard",
      "stations": "Gestione Distributori",
      "operators": "Gestione Operatori",
      "shifts": "Registro Chiusure",
      "crediti": "Gestione Crediti",
      "invoices": "Richieste Fatture",
      "vouchers": "Gestione Voucher",
      "notifiche": "Notifiche",
      "settings": "Impostazioni"
    };
    if (pageSubtitle) pageSubtitle.textContent = titles[tab] || "Control Center";
    renderBreadcrumbs(tab);
    await renderGlobalFilter();
    const filter = store.getFilter();
    let allowed = true;
    if (["stations", "operators", "settings"].includes(tab) && !isFullAdmin) allowed = false;
    if (tab === "shifts" && !isFullAdmin && userRole !== "accounting") allowed = false;
    if (tab === "crediti" && !isFullAdmin && userRole !== "accounting") allowed = false;
    if (tab === "invoices" && !isFullAdmin && userRole !== "billing" && userRole !== "accounting") allowed = false;
    if (tab === "vouchers" && !isFullAdmin && userRole !== "accounting") allowed = false;
    if (!allowed) {
      content.innerHTML = `
        <div class="error-container">
          <i class="fas fa-lock error-icon"></i>
          <h2>Accesso Negato</h2>
          <p>Non disponi dei permessi necessari per visualizzare questa sezione.</p>
          <button class="menu-button primary" onclick="window.location.reload()">Torna alla Dashboard</button>
        </div>
      `;
      return;
    }
    switch (tab) {
      case "dashboard":
        showDashboard(content, filter);
        break;
      case "stations":
        showStationsTab(content, headerActions);
        break;
      case "operators":
        showOperatorsTab(content, headerActions);
        break;
      case "shifts":
        showChiusureTab(content, headerActions, filter);
        break;
      case "crediti":
        if (typeof showCreditiOverview !== "undefined") showCreditiOverview(content, headerActions);
        else content.innerHTML = "<p>Modulo Crediti in caricamento...</p>";
        break;
      case "invoices":
        await __vitePreload(() => import("./invoices-DwSZll9z.js"), true ? [] : void 0, import.meta.url).then((module) => {
          module.showFattureTab(content, headerActions, filter);
        });
        break;
      case "vouchers":
        showLoadingMessage(content);
        try {
          const { showVoucherAdminTab } = await __vitePreload(async () => {
            const { showVoucherAdminTab: showVoucherAdminTab2 } = await import("./vouchers_reboot-DLaeWLvM.js");
            return { showVoucherAdminTab: showVoucherAdminTab2 };
          }, true ? [] : void 0, import.meta.url);
          showVoucherAdminTab(content, headerActions);
        } catch (err) {
          handleError(err, "Caricamento modulo Voucher", content);
        }
        break;
      case "notifiche":
        content.innerHTML = `
          <div class="content-box" style="text-align: center; padding: 60px 20px;">
            <i class="fas fa-bell" style="font-size: 4rem; color: var(--secondary-color); margin-bottom: 20px;"></i>
            <h2 style="margin-bottom: 10px;">Notifiche</h2>
            <p style="color: var(--text-secondary);">Questa funzionalità sarà disponibile prossimamente.</p>
          </div>
        `;
        break;
      case "settings":
        showSettingsTab(content, headerActions);
        break;
      default:
        showDashboard(content, filter);
    }
  }
  if (!isFullAdmin && loggedUser?.assignedStations?.length > 0) {
    if (store.getFilter() === null) {
      store.setStationFilter(loggedUser.assignedStations[0].id);
    }
  }
  renderGlobalFilter();
  loadAdminTab("dashboard");
  document.getElementById("admin-content")?.addEventListener("click", (e) => {
    if (
      /** @type {HTMLElement} */
      e.target.closest("#btn-configure-dashboard")
    ) {
      showDashboardConfigPanel();
    }
  });
  document.addEventListener("dashboard-config-changed", () => {
    if (currentAdminTab === "dashboard") {
      loadAdminTab("dashboard");
    }
  });
}
function createWarningMessage(title, message, details = "") {
  return `
    <div class="warning-message">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>${escapeHtml$2(title)}</h3>
      <p>${escapeHtml$2(message)}</p>
      ${details ? `<p>${escapeHtml$2(details)}</p>` : ""}
    </div>
  `;
}
function createErrorMessage(title, error) {
  return `
    <div class="warning-message">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>${escapeHtml$2(title)}</h3>
      <p><strong>Errore:</strong> ${escapeHtml$2(error.message || "Errore sconosciuto")}</p>
      ${error.code ? `<p><strong>Codice:</strong> ${escapeHtml$2(error.code)}</p>` : ""}
      ${error.details ? `<p class="small-text">Dettagli: ${escapeHtml$2(error.details)}</p>` : ""}
      ${error.hint ? `<p class="small-text">Hint: ${escapeHtml$2(error.hint)}</p>` : ""}
    </div>
  `;
}
function createFormActions(options = {}) {
  const {
    cancelId = "btn-cancel",
    confirmId = "btn-confirm",
    cancelText = "Annulla",
    confirmText = "Conferma",
    confirmClass = "btn-success"
  } = options;
  return `
    <div class="form-actions">
      <button type="button" class="menu-button btn-danger" id="${cancelId}">
        <i class="fas fa-times"></i> ${escapeHtml$2(cancelText)}
      </button>
      <button type="submit" class="menu-button ${confirmClass}" id="${confirmId}">
        <i class="fas fa-check"></i> ${escapeHtml$2(confirmText)}
      </button>
    </div>
  `;
}
async function updateOpeningStatus(stationId) {
  const badge = document.getElementById("opening-status");
  if (!badge) return;
  const activeOpening = await checkOpeningStatus(stationId);
  if (activeOpening) {
    const hasPartial = activeOpening.closing_data?.closure_stage === "partial";
    const statusLabel = hasPartial ? "Parziale" : "Aperto";
    badge.textContent = statusLabel;
    badge.className = `status-badge ${hasPartial ? "status-partial" : "status-open"}`;
    badge.title = `Aperto da ${activeOpening.users?.full_name || "Operatore"} il ${new Date(activeOpening.date_time).toLocaleString("it-IT")}`;
  } else {
    badge.textContent = "Chiuso";
    badge.className = "status-badge status-closed";
    badge.title = "Nessuna apertura attiva";
  }
}
async function checkOpeningStatus(stationId) {
  try {
    const { data } = await supabase.from("shifts").select("id, opened_at, operator_id, status, opening_data, closing_data, users!operator_id(full_name)").eq("station_id", stationId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    return {
      ...data,
      date_time: data.opened_at
    };
  } catch (err) {
    console.error("Errore controllo apertura:", err);
    return null;
  }
}
async function showAperturaForm(stationId, userId) {
  try {
    const activeOpening = await checkOpeningStatus(stationId);
    if (activeOpening) {
      const openingDate = new Date(activeOpening.date_time).toLocaleString("it-IT");
      openModal("Apertura Già Effettuata");
      const modalBody2 = document.getElementById("modal-body");
      modalBody2.innerHTML = createWarningMessage(
        "Apertura Già Effettuata",
        "Il turno è già stato aperto",
        `Data apertura: ${openingDate}. Devi prima chiudere il turno corrente prima di aprirne uno nuovo.`
      ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById("btn-close-warning").addEventListener("click", () => closeModal());
      return;
    }
    openModal("Apertura Turno");
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = '<p style="text-align: center; padding: 20px;">Caricamento...</p>';
    const [islandsResult, tanksResult] = await Promise.all([
      supabase.from("islands").select("island_id, nome, island_name").eq("station_id", stationId).order("island_id", { ascending: true }),
      supabase.from("tanks").select("*").eq("station_id", stationId).order("name")
    ]);
    const { data: islandsData, error: islandsError } = islandsResult;
    const { data: tanks } = tanksResult;
    if (islandsError) {
      modalBody.innerHTML = createErrorMessage("Errore Caricamento Isole", islandsError) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-error" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById("btn-close-error").addEventListener("click", () => closeModal());
      return;
    }
    const islands = (islandsData || []).map((isola, idx) => ({
      id: isola?.island_id ?? idx + 1,
      nome: isola?.nome ?? isola?.island_name ?? `Isola ${idx + 1}`
    }));
    if (!islands || islands.length === 0) {
      modalBody.innerHTML = createWarningMessage(
        "Nessuna Isola Configurata",
        "Non ci sono isole configurate per questa stazione.",
        "Contatta l'amministratore per configurare le isole e le pistole."
      ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning2" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById("btn-close-warning2").addEventListener("click", () => closeModal());
      return;
    }
    const islandIds = islands.map((i) => i.id);
    const { data: allPistole, error: pistoleError } = await supabase.from("pistole").select("*, islands(nome)").in("island_id", islandIds).order("id");
    if (pistoleError) throw pistoleError;
    if (!allPistole || allPistole.length === 0) {
      modalBody.innerHTML = createWarningMessage(
        "Nessuna Pistola Configurata",
        "Non ci sono pistole configurate per questa stazione.",
        "Contatta l'amministratore per configurare le pistole."
      ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning3" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById("btn-close-warning3").addEventListener("click", () => closeModal());
      return;
    }
    let lastClosureCounters = {};
    const pistolaIds = allPistole.map((p) => p.id);
    try {
      const [newCountersResult, oldCountersResult] = await Promise.all([
        supabase.from("shift_pistols").select("pistola_id, closed_at_counter").in("pistola_id", pistolaIds).not("closed_at_counter", "is", null).order("created_at", { ascending: false }),
        supabase.from("chiusura_turno_pistole").select("pistola_id, numeratore_chiusura").in("pistola_id", pistolaIds).order("created_at", { ascending: false })
      ]);
      const newCountersMap = /* @__PURE__ */ new Map();
      if (newCountersResult.data) {
        const seen2 = /* @__PURE__ */ new Set();
        newCountersResult.data.forEach((c) => {
          if (!seen2.has(c.pistola_id)) {
            seen2.add(c.pistola_id);
            newCountersMap.set(c.pistola_id, parseFloat(c.closed_at_counter));
          }
        });
      }
      const oldCountersMap = /* @__PURE__ */ new Map();
      if (oldCountersResult.data) {
        const seen2 = /* @__PURE__ */ new Set();
        oldCountersResult.data.forEach((c) => {
          if (!seen2.has(c.pistola_id) && c.numeratore_chiusura !== null) {
            seen2.add(c.pistola_id);
            oldCountersMap.set(c.pistola_id, parseFloat(c.numeratore_chiusura));
          }
        });
      }
      allPistole.forEach((p) => {
        const counterValue = newCountersMap.get(p.id) || oldCountersMap.get(p.id) || parseFloat(p.numero_litri);
        if (Number.isFinite(counterValue)) {
          lastClosureCounters[p.id] = counterValue;
        }
      });
    } catch (closureErr) {
      console.warn("Errore recupero ultimi contatori:", closureErr);
      allPistole.forEach((p) => {
        const val = parseFloat(p.numero_litri);
        if (Number.isFinite(val)) {
          lastClosureCounters[p.id] = val;
        }
      });
    }
    modalBody.innerHTML = `
        <form id="apertura-form">
          <div class="form-row">
            <div class="form-group">
              <label>Banconote incassate (€)</label>
              <input type="number" name="cash_in" step="0.01" min="0" class="big-input">
            </div>
            <div class="form-group">
              <label>Banconote erogate (€)</label>
              <input type="number" name="cash_out" step="0.01" min="0" class="big-input">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Bancomat erogati (€)</label>
              <input type="number" name="pos_amount" step="0.01" min="0" class="big-input">
            </div>
            <div class="form-group">
              <label>Uta/Dkv/Iscard (€)</label>
              <input type="number" name="uta_dkv_iscard" step="0.01" min="0" class="big-input">
              <small style="color: #6b7280; display: block; margin-top: 5px;">Queste transazioni si sommeranno in fase di chiusura a quelle inserite dall'operatore.</small>
            </div>
          </div>

          <div class="form-group">
            <label>Totale scontrino (€)</label>
            <input type="number" name="total_amount" step="0.01" min="0" class="big-input">
          </div>
          
          <div class="form-group">
            <label>Note (opzionale)</label>
            <textarea name="notes" rows="3" placeholder="Eventuali annotazioni..."></textarea>
          </div>
          
          <div class="form-actions">
            <button type="button" class="menu-button secondary" id="btn-cancel-apertura">
              <i class="fas fa-times"></i> Annulla
            </button>
            <button type="submit" class="menu-button success">
              <i class="fas fa-check"></i> Conferma Apertura
            </button>
          </div>
        </form>
    `;
    document.getElementById("btn-cancel-apertura").addEventListener("click", () => {
      closeModal();
    });
    const form = document.getElementById("apertura-form");
    let isSubmitting = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmitting) {
        console.warn("Submit già in corso, ignorato");
        return;
      }
      const confirmed = await openConfirmModal("Confermi l'apertura del turno?");
      if (!confirmed) return;
      isSubmitting = true;
      const submitBtn = form.querySelector('button[type="submit"]');
      const cancelBtn = form.querySelector("#btn-cancel-apertura");
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...';
      const loadingEl = document.createElement("p");
      loadingEl.textContent = "Caricamento...";
      loadingEl.style.textAlign = "center";
      loadingEl.style.padding = "20px";
      modalBody.innerHTML = "";
      modalBody.appendChild(loadingEl);
      try {
        const activeOpening2 = await checkOpeningStatus(stationId);
        if (activeOpening2) {
          throw new Error("Il turno è già stato aperto. Ricarica la pagina per vedere lo stato aggiornato.");
        }
        const formData = new FormData(e.target);
        const cashIn = parseFloat(formData.get("cash_in")) || 0;
        const cashOut = parseFloat(formData.get("cash_out")) || 0;
        const posAmount = parseFloat(formData.get("pos_amount")) || 0;
        const totalAmount = parseFloat(formData.get("total_amount")) || 0;
        const utaDkvIscard = parseFloat(formData.get("uta_dkv_iscard")) || 0;
        const { data: opening, error: openingError } = await supabase.from("shifts").insert([{
          operator_id: userId,
          station_id: stationId,
          opened_at: (/* @__PURE__ */ new Date()).toISOString(),
          status: "open",
          opening_data: {
            cash_in: cashIn,
            cash_out: cashOut,
            pos_amount: posAmount,
            total_amount: totalAmount,
            uta_dkv_iscard: utaDkvIscard,
            cash_in_minus_out: cashIn - cashOut
          }
        }]).select().single();
        if (openingError) {
          if (openingError.code === "23505" || openingError.message?.includes("duplicate key")) {
            const checkAgain = await checkOpeningStatus(stationId);
            if (checkAgain) {
              throw new Error("Il turno è già stato aperto. Ricarica la pagina per vedere lo stato aggiornato.");
            }
          }
          throw openingError;
        }
        const counterInserts = allPistole.map((p) => {
          const finalClosureCounter = parseFloat(lastClosureCounters[p.id]);
          const fallbackCounter = parseFloat(p.numero_litri);
          const latestCounter = Number.isFinite(finalClosureCounter) ? finalClosureCounter : fallbackCounter;
          return {
            shift_id: opening.id,
            pistola_id: p.id,
            opened_at_counter: Number.isFinite(latestCounter) ? latestCounter : 0,
            closed_at_counter: null
            // Sarà popolato alla chiusura
          };
        });
        const { error: countersError } = await supabase.from("shift_pistols").insert(counterInserts);
        if (countersError) throw countersError;
        if (tanks && tanks.length > 0) {
          const tankReadings = tanks.map((t) => ({
            tank_id: t.id,
            shift_id: opening.id,
            reading_type: "opening",
            liters: parseFloat(formData.get(`tank_${t.id}`)) || 0,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          }));
          const { error: tankError } = await supabase.from("tank_readings").insert(tankReadings);
          if (tankError) console.error("Errore salvataggio cisterne:", tankError);
        }
        openModal("Apertura Registrata");
        const modalBody2 = document.getElementById("modal-body");
        modalBody2.innerHTML = `
                  <div class="success-message" style="text-align: center;">
                    <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
                    <h3>Apertura Registrata!</h3>
                    <p>Il turno è stato aperto correttamente.</p>
                    <p class="small-text">Data: ${(/* @__PURE__ */ new Date()).toLocaleString("it-IT")}</p>
                    <button id="btn-home" class="menu-button primary" style="margin-top: 20px;">Torna alla Home</button>
                  </div>
                `;
        document.getElementById("btn-home").addEventListener("click", () => {
          closeModal();
          updateOpeningStatus(stationId);
        });
      } catch (err) {
        isSubmitting = false;
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Conferma Apertura';
        modalBody.innerHTML = createErrorMessage("Errore Apertura Turno", err) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-error" class="menu-button primary">Chiudi</button></div>`;
        document.getElementById("btn-close-error").addEventListener("click", () => closeModal());
      }
    });
  } catch (err) {
    openModal("Errore");
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = `<p style="color: red; padding: 20px;">${escapeHtml$2(err.message)}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById("btn-close-err").addEventListener("click", () => closeModal());
  }
}
let closureState = {
  step: 1,
  data: {}
};
async function startClosureWizard(stationId, userId) {
  try {
    openModal("Chiusura Turno");
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = '<p style="text-align: center; padding: 20px;">Caricamento...</p>';
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      modalBody.innerHTML = createWarningMessage(
        "Nessuna Apertura Attiva",
        "Devi prima aprire il turno prima di poterlo chiudere.",
        "Clicca su <strong>Apertura</strong> per iniziare un nuovo turno."
      ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById("btn-close-warning").addEventListener("click", () => closeModal());
      return;
    }
    let movimentiQuery = supabase.from("movimenti_cassa").select("*").eq("station_id", stationId).gte("created_at", activeOpening.opened_at || activeOpening.date_time);
    const [
      openingCountersResult,
      pistoleResult,
      prezziResult,
      movimentiResult,
      stationDataResult,
      tankLinksResult
    ] = await Promise.all([
      // 2. Carica contatori di apertura dal turno corrente in shift_pistols
      supabase.from("shift_pistols").select("pistola_id, opened_at_counter").eq("shift_id", activeOpening.id),
      // 3. Carica pistole
      supabase.from("pistole").select("*, islands!inner(nome, station_id)").eq("islands.station_id", stationId).order("id"),
      // 4. Carica prezzi correnti
      supabase.from("prezzi_distributore").select("*").eq("station_id", stationId).order("data_validita", { ascending: false }).limit(1).maybeSingle(),
      // 5. Carica movimenti cassa (extra) del turno corrente
      movimentiQuery,
      // 6. Carica impostazione chiusura parziale dalla stazione
      supabase.from("fuel_stations").select("allow_partial_closure").eq("station_id", stationId).single(),
      // 7. Configurazioni serbatoi ↔︎ pistole
      supabase.from("tank_pump_links").select(`
          id,
          pump_id,
          tank_id,
          mode,
          ratio,
          priority,
          is_active,
          tanks ( id, name, fuel_type ),
          pistole ( id, nome, islands(nome) )
        `).eq("station_id", stationId).eq("is_active", true).order("pump_id")
    ]);
    const openingMap = {};
    try {
      const { data: openingCounters } = openingCountersResult;
      if (openingCounters && openingCounters.length > 0) {
        openingCounters.forEach((c) => {
          const parsed = parseFloat(c.opened_at_counter);
          openingMap[c.pistola_id] = Number.isFinite(parsed) ? parsed : 0;
        });
      }
    } catch (err) {
      console.warn("Errore caricamento contatori apertura:", err);
    }
    const { data: allPistole } = pistoleResult;
    if (!allPistole || allPistole.length === 0) {
      modalBody.innerHTML = createWarningMessage(
        "Nessuna Pistola Configurata",
        "Non ci sono pistole configurate per questa stazione.",
        ""
      ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning2" class="menu-button primary">Chiudi</button></div>`;
      document.getElementById("btn-close-warning2").addEventListener("click", () => closeModal());
      return;
    }
    const { data: prezzi } = prezziResult;
    const prezzoBenzina = prezzi?.prezzo_benzina || 0;
    const prezzoGasolio = prezzi?.prezzo_gasolio || 0;
    const { data: movimentiRaw } = movimentiResult;
    const movimentiMap = /* @__PURE__ */ new Map();
    (movimentiRaw || []).forEach((m) => {
      const dateKey = m.created_at ? new Date(m.created_at).setMilliseconds(0).toString() : "";
      const key = `${m.tipo}_${m.importo}_${dateKey}`;
      if (!movimentiMap.has(key) || m.id && movimentiMap.get(key).id > m.id) {
        movimentiMap.set(key, m);
      }
    });
    const movimenti = Array.from(movimentiMap.values());
    if (movimentiRaw && movimentiRaw.length !== movimenti.length) {
      console.warn(`Rimossi ${movimentiRaw.length - movimenti.length} movimenti duplicati`);
    }
    const { data: stationData } = stationDataResult;
    const allowPartialClosure = stationData?.allow_partial_closure !== false;
    const { data: tankLinksData, error: tankLinksError } = tankLinksResult || {};
    if (tankLinksError && tankLinksError.code !== "42P01") {
      console.warn("Errore configurazione serbatoi/pistole:", tankLinksError);
    }
    const tankLinksByPump = {};
    (tankLinksData || []).forEach((link) => {
      if (!link?.pump_id || !link?.tank_id) return;
      const normalized = {
        id: link.id,
        pump_id: link.pump_id,
        tank_id: link.tank_id,
        mode: link.mode || "auto",
        ratio: Number(link.ratio) || 0,
        priority: Number(link.priority) || 1,
        tankName: link.tanks?.name || `Cisterna #${link.tank_id}`,
        tankFuel: link.tanks?.fuel_type || "",
        pumpName: link.pistole?.nome || `Pistola #${link.pump_id}`,
        islandName: link.pistole?.islands?.nome || ""
      };
      if (!tankLinksByPump[link.pump_id]) {
        tankLinksByPump[link.pump_id] = [];
      }
      tankLinksByPump[link.pump_id].push(normalized);
    });
    Object.values(tankLinksByPump).forEach((list) => {
      list.sort((a, b) => {
        if (a.mode !== b.mode) return a.mode === "manual" ? -1 : 1;
        if (a.mode === "manual") {
          return (a.priority || 999) - (b.priority || 999);
        }
        return (b.ratio || 0) - (a.ratio || 0);
      });
    });
    const hasManualTankLinks = Object.values(tankLinksByPump).some((list) => list.some((link) => link.mode === "manual"));
    const pumpLabelMap = {};
    allPistole.forEach((p) => {
      pumpLabelMap[p.id] = p.nome || `Pistola #${p.id}`;
    });
    const partialCompleted = activeOpening.closing_data?.closure_stage === "partial";
    const previousClosing = activeOpening.closing_data || {};
    const partialAggregates = partialCompleted ? {
      selfManager: Number(previousClosing?.scontrino_self?.id_gestore) || 0,
      // Solo ID gestore si somma
      operatorPos: Number(previousClosing?.dettaglio_incasso?.pos_operatore) || 0,
      operatorUta: Number(previousClosing?.dettaglio_incasso?.uta_dkv_operatore) || 0
    } : null;
    const openingUtaDkvIscard = activeOpening.opening_data?.uta_dkv_iscard || 0;
    closureState = {
      step: 1,
      data: {
        stationId,
        userId,
        turnoId: activeOpening.id,
        openingDate: activeOpening.opened_at || activeOpening.date_time,
        pistole: allPistole,
        openingCounters: openingMap,
        prezzoBenzina,
        prezzoGasolio,
        movimenti: movimenti || [],
        existingClosingData: previousClosing,
        partialAggregates,
        partialCompleted,
        allowPartialClosure,
        // Flag per abilitare/disabilitare chiusura parziale
        openingUtaDkvIscard,
        // UTA/DKV/Iscard inserito in apertura
        // Default State
        closureType: partialCompleted ? "final" : allowPartialClosure ? "partial" : "final",
        // Se disabilitata, forza 'final'
        includeCounters: partialCompleted ? true : false,
        tankLinksByPump,
        tankSelections: {},
        hasManualTankLinks,
        pumpLabelMap,
        litersPerPump: {}
      }
    };
    showClosureStep1();
  } catch (err) {
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">Errore: ${escapeHtml$2(err.message)}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-error" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById("btn-close-error").addEventListener("click", () => closeModal());
  }
}
function showClosureStep1() {
  openModal("Chiusura Turno - Step 1/3");
  const container = document.getElementById("modal-body");
  const {
    pistole,
    openingCounters,
    closureType,
    includeCounters,
    openingDate,
    partialCompleted,
    allowPartialClosure,
    tankLinksByPump = {},
    tankSelections = {},
    hasManualTankLinks = false
  } = closureState.data;
  const isFinal = partialCompleted ? true : !allowPartialClosure ? true : closureType === "final";
  const showCounters = isFinal || includeCounters;
  const keepSectionVisible = hasManualTankLinks;
  const formattedDate = new Date(openingDate).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const infoBanner = partialCompleted ? `
    <div class="warning-message" style="margin-bottom: 15px;">
      <h3>Chiusura Parziale già registrata</h3>
      <p>Completa ora la chiusura finale per terminare il turno.</p>
    </div>
  ` : "";
  const showPartialOption = allowPartialClosure && !partialCompleted;
  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-door-closed"></i> Chiusura Turno - Step 1/3</h3>
      <p class="section-subtitle">Turno aperto il: <strong>${formattedDate}</strong></p>
      <p class="section-subtitle">Configurazione Chiusura</p>
      ${infoBanner}
      
      <form id="closure-step1-form">
        
        <!-- TIPO CHIUSURA -->
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 15px;">
                ${showPartialOption ? `
                <label class="radio-card ${!isFinal ? "selected" : ""}" data-type="partial" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <input type="radio" name="closure_type" value="partial" ${!isFinal ? "checked" : ""} style="display: none;">
                    <i class="fas fa-clock" style="font-size: 1.5rem; color: #3b82f6; margin-bottom: 8px; display: block;"></i>
                    <div style="font-weight: 600; color: #1e293b;">Parziale</div>
                    <div style="font-size: 0.8rem; color: #64748b;">Cambio Turno</div>
                </label>
                ` : ""}
                
                <label class="radio-card ${isFinal ? "selected" : ""}" data-type="final" style="flex: ${showPartialOption ? "1" : "1"}; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <input type="radio" name="closure_type" value="final" ${isFinal ? "checked" : ""} style="display: none;">
                    <i class="fas fa-flag-checkered" style="font-size: 1.5rem; color: #ef4444; margin-bottom: 8px; display: block;"></i>
                    <div style="font-weight: 600; color: #1e293b;">Finale</div>
                    <div style="font-size: 0.8rem; color: #64748b;">Fine Giornata</div>
                </label>
            </div>

            <div id="counters-toggle-container" style="display: ${isFinal ? "none" : "block"}; text-align: center;">
                <label style="display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;">
                    <input type="checkbox" id="include-counters-check" ${includeCounters ? "checked" : ""} style="width: 18px; height: 18px;">
                    <span style="font-weight: 500; color: #334155;">Inserisci Numeratori Pistole (Opzionale)</span>
                </label>
            </div>
        </div>

        <!-- GRIGLIA PISTOLE -->
        <div id="pistole-section" style="display: ${showCounters ? "block" : "none"};">
            <h4 style="margin-bottom: 15px; color: #475569;">Numeratori Erogatori</h4>
            <div class="pistole-grid">
            ${pistole.map((p) => {
    const opening = openingCounters[p.id] || 0;
    const links = tankLinksByPump[p.id] || [];
    const manualLinks = links.filter((l) => l.mode === "manual");
    const autoLinks = links.filter((l) => l.mode !== "manual");
    const savedSelection = tankSelections[p.id]?.tankId;
    const manualSelectHtml = manualLinks.length ? `
      <div class="form-group tank-link-panel">
        <label class="tank-link-title">Serbatoio collegato</label>
        <select name="tank_select_${p.id}" data-pump="${p.id}" class="big-input tank-select" ${manualLinks.length ? "required" : ""}>
          <option value="">Seleziona serbatoio...</option>
          ${manualLinks.map((link, idx) => {
      const isSelected = savedSelection ? savedSelection === link.tank_id : manualLinks.length === 1 && idx === 0;
      return `<option value="${link.tank_id}" ${isSelected ? "selected" : ""}>${escapeHtml$2(link.tankName)}${link.priority ? ` (prio ${link.priority})` : ""}</option>`;
    }).join("")}
        </select>
      </div>
    ` : "";
    const autoInfoHtml = autoLinks.length ? `
      <div class="tank-link-panel">
        <p class="tank-link-title">Ripartizione automatica</p>
        <div class="tank-link-info">
          ${autoLinks.map((link) => `<span class="badge badge-outline">${escapeHtml$2(link.tankName)} · ${link.ratio ? `${link.ratio}%` : "equamente"}</span>`).join("")}
        </div>
      </div>
    ` : "";
    const tankInfoHtml = links.length ? `${manualSelectHtml}${autoInfoHtml}` : "";
    return `
                <div class="pistola-card">
                    <div class="pistola-header">
                    <span class="pistola-name">${escapeHtml$2(p.nome || `Pistola #${p.id}`)}</span>
                    <span class="pistola-island">${escapeHtml$2(p.islands?.nome || "Isola")}</span>
                    </div>
                    <div class="form-group">
                    <label>Contatore Apertura</label>
                    <input type="number" value="${opening}" class="big-input" disabled>
                    </div>
                    <div class="form-group">
                    <label>Contatore Chiusura</label>
                    <input 
                        type="number" 
                        name="counter_${p.id}" 
                        step="0.01"
                        min="${opening}"
                        class="big-input gun-counter-input"
                        ${showCounters ? "" : "disabled"}
                        placeholder="Lascia vuoto se invariato"
                    >
                    </div>
                    ${tankInfoHtml || '<p class="tank-link-empty">Nessun serbatoio collegato</p>'}
                </div>
                `;
  }).join("")}
            </div>
        </div>
        
        <div class="form-actions">
          <button type="button" class="menu-button btn-danger" id="btn-cancel-closure">
            <i class="fas fa-times"></i> Annulla
          </button>
          <button type="submit" class="menu-button primary">
            <i class="fas fa-arrow-right"></i> Avanti
          </button>
        </div>
      </form>
      
      <style>
        .radio-card.selected {
            border-color: #3b82f6 !important;
            background-color: #eff6ff !important;
            box-shadow: 0 0 0 2px #3b82f633;
        }
      </style>
    </div>
  `;
  const form = document.getElementById("closure-step1-form");
  const radioInputs = form.querySelectorAll('input[name="closure_type"]');
  const countersCheck = document.getElementById("include-counters-check");
  const pistoleSection = document.getElementById("pistole-section");
  const countersToggleContainer = document.getElementById("counters-toggle-container");
  const gunInputs = form.querySelectorAll(".gun-counter-input");
  const tankSelects = form.querySelectorAll(".tank-select");
  const partialAlreadyDone = closureState.data.partialCompleted;
  const allowPartial = closureState.data.allowPartialClosure;
  const partialCard = document.querySelector('.radio-card[data-type="partial"]');
  const finalCard = document.querySelector('.radio-card[data-type="final"]');
  function updateUI() {
    let type = "final";
    if (!partialAlreadyDone && allowPartial) {
      const selected = (
        /** @type {HTMLInputElement} */
        document.querySelector('input[name="closure_type"]:checked')
      );
      type = selected ? selected.value : "partial";
    }
    const include = countersCheck ? (
      /** @type {HTMLInputElement} */
      countersCheck.checked
    ) : true;
    const shouldShowCounters = type === "final" || include;
    [partialCard, finalCard].forEach((c) => c?.classList.remove("selected"));
    if (type === "final") {
      finalCard?.classList.add("selected");
    } else if (partialCard) {
      partialCard?.classList.add("selected");
    }
    countersToggleContainer.style.display = type === "final" || partialAlreadyDone || !allowPartial ? "none" : "block";
    const shouldDisplayGrid = shouldShowCounters || keepSectionVisible;
    pistoleSection.style.display = shouldDisplayGrid ? "block" : "none";
    gunInputs.forEach((i) => {
      const input = (
        /** @type {HTMLInputElement} */
        i
      );
      input.required = shouldShowCounters;
      input.disabled = !shouldShowCounters;
    });
  }
  radioInputs.forEach((r) => r.addEventListener("change", updateUI));
  countersCheck?.addEventListener("change", updateUI);
  document.getElementById("btn-cancel-closure").addEventListener("click", () => {
    closeModal();
  });
  tankSelects.forEach((selectElement) => {
    const select = (
      /** @type {HTMLSelectElement} */
      selectElement
    );
    const pumpId = Number(select.dataset.pump);
    const savedValue = tankSelections[pumpId]?.tankId;
    if (!savedValue && select.options.length === 2) {
      select.selectedIndex = 1;
    }
    if (select.value) {
      closureState.data.tankSelections = closureState.data.tankSelections || {};
      closureState.data.tankSelections[pumpId] = {
        tankId: Number(select.value),
        mode: "manual"
      };
    }
    select.addEventListener("change", () => {
      closureState.data.tankSelections = closureState.data.tankSelections || {};
      closureState.data.tankSelections[pumpId] = {
        tankId: select.value ? Number(select.value) : null,
        mode: "manual"
      };
    });
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const type = partialCompleted || !allowPartial ? "final" : formData.get("closure_type")?.toString() || "final";
    const include = type === "final" ? true : countersCheck ? (
      /** @type {HTMLInputElement} */
      countersCheck.checked
    ) : false;
    closureState.data.closureType = type;
    closureState.data.includeCounters = include;
    closureState.data.finalCounters = {};
    if (include) {
      pistole.forEach((p) => {
        const counterValue = formData.get(`counter_${p.id}`)?.toString() || "";
        if (counterValue === "" || counterValue === null) {
          closureState.data.finalCounters[p.id] = openingCounters[p.id] || 0;
        } else {
          closureState.data.finalCounters[p.id] = parseFloat(counterValue) || 0;
        }
      });
    }
    const selections = {};
    let missingSelection = null;
    pistole.forEach((p) => {
      const manualLinks = (tankLinksByPump[p.id] || []).filter((l) => l.mode === "manual");
      if (manualLinks.length > 0) {
        const selectedTank = formData.get(`tank_select_${p.id}`)?.toString();
        if (!selectedTank) {
          missingSelection = p;
        } else {
          selections[p.id] = {
            tankId: Number(selectedTank),
            mode: "manual"
          };
        }
      }
    });
    if (missingSelection) {
      Toast.show(`Seleziona il serbatoio per ${missingSelection.nome || `Pistola #${missingSelection.id}`}`, "warning");
      const selectEl = (
        /** @type {HTMLElement} */
        form.querySelector(`[name="tank_select_${missingSelection.id}"]`)
      );
      selectEl?.focus();
      return;
    }
    closureState.data.tankSelections = selections;
    closureState.step = 2;
    await showClosureStep2();
  });
}
async function showClosureStep2() {
  openModal("Chiusura Turno - Step 2/3");
  const container = document.getElementById("modal-body");
  const { pistole, openingCounters, finalCounters, prezzoBenzina, prezzoGasolio } = closureState.data;
  let totalLitriBenzina = 0;
  let totalLitriGasolio = 0;
  let ricavoTotaleTeor = 0;
  const litersPerPump = {};
  if (closureState.data.includeCounters) {
    pistole.forEach((p) => {
      const opening = openingCounters[p.id] || 0;
      const closing = finalCounters[p.id] || 0;
      const litri = Math.max(0, closing - opening);
      litersPerPump[p.id] = litri;
      if (p.tipo_carburante === "benzina") {
        totalLitriBenzina += litri;
      } else if (p.tipo_carburante === "gasolio") {
        totalLitriGasolio += litri;
      }
    });
    const ricavoBenzina = totalLitriBenzina * prezzoBenzina;
    const ricavoGasolio = totalLitriGasolio * prezzoGasolio;
    ricavoTotaleTeor = ricavoBenzina + ricavoGasolio;
  }
  closureState.data.litersPerPump = litersPerPump;
  closureState.data.totalLitriBenzina = totalLitriBenzina;
  closureState.data.totalLitriGasolio = totalLitriGasolio;
  const movimenti = closureState.data.movimenti || [];
  let creditsSum = 0;
  let vouchersSum = 0;
  let refundsSum = 0;
  let extraCashSum = 0;
  try {
    const movimentiSummary = await calculationEngine.run(CALCULATION_SCOPES.CHIUSURE_MOVIMENTI, { movimenti });
    creditsSum = Number(movimentiSummary?.credits ?? 0);
    vouchersSum = Number(movimentiSummary?.vouchers ?? 0);
    refundsSum = Number(movimentiSummary?.refunds ?? 0);
    extraCashSum = Number(movimentiSummary?.extra_cash ?? 0);
  } catch (err) {
    console.warn("Motore calcoli movimenti indisponibile:", err);
    creditsSum = movimenti.filter((m) => m.tipo === "credito" || m.descrizione && m.descrizione.toLowerCase().includes("credito") && m.tipo !== "incasso").reduce((sum, m) => sum + Number(m.importo), 0);
    vouchersSum = movimenti.filter((m) => m.tipo === "voucher" || m.tipo === "punti" || m.descrizione && (m.descrizione.toLowerCase().includes("voucher") || m.descrizione.toLowerCase().includes("punti"))).reduce((sum, m) => sum + Number(m.importo), 0);
    refundsSum = movimenti.filter((m) => m.tipo === "pagamento" || m.tipo === "uscita" || m.descrizione && m.descrizione.toLowerCase().includes("rimborso")).reduce((sum, m) => sum + Number(m.importo), 0);
    extraCashSum = movimenti.filter((m) => m.tipo === "incasso").reduce((sum, m) => sum + Number(m.importo), 0);
  }
  const d = closureState.data;
  const selfCashIn = d.selfCashIn !== void 0 && d.selfCashIn !== null ? d.selfCashIn : "";
  const selfCashOut = d.selfCashOut !== void 0 && d.selfCashOut !== null ? d.selfCashOut : "";
  const selfPos = d.selfPos !== void 0 && d.selfPos !== null ? d.selfPos : "";
  const selfFleet = d.selfFleet !== void 0 && d.selfFleet !== null ? d.selfFleet : "";
  const selfManager = d.selfManager !== void 0 && d.selfManager !== null ? d.selfManager : "";
  const selfReceiptTotal = d.selfReceiptTotal !== void 0 && d.selfReceiptTotal !== null ? d.selfReceiptTotal : "";
  const partialAgg = d.partialAggregates || {};
  const prevSelfManager = partialAgg?.selfManager || 0;
  const prevOperatorPos = partialAgg?.operatorPos || 0;
  const prevOperatorUta = partialAgg?.operatorUta || 0;
  const totalSelfManager = closureState.data.allowPartialClosure ? selfManager + prevSelfManager : selfManager;
  const selfTotalVenduto = selfCashOut + selfPos + selfFleet + totalSelfManager;
  const selfDeltaContante = selfCashIn - selfCashOut;
  let totaleAtteso;
  try {
    const totalsResult = await calculationEngine.run(CALCULATION_SCOPES.CHIUSURE_TOTALE_ATTESO, {
      includeCounters: closureState.data.includeCounters,
      totalLitriBenzina,
      totalLitriGasolio,
      prezzoBenzina,
      prezzoGasolio,
      selfTotalVenduto
    });
    const ricavoEngine = Number(totalsResult?.ricavo_teorico ?? ricavoTotaleTeor);
    ricavoTotaleTeor = Number.isFinite(ricavoEngine) ? ricavoEngine : ricavoTotaleTeor;
    totaleAtteso = Number(totalsResult?.totale_atteso);
    if (!Number.isFinite(totaleAtteso)) {
      totaleAtteso = closureState.data.includeCounters ? ricavoTotaleTeor : selfTotalVenduto;
    }
  } catch (err) {
    console.warn("Motore calcoli totale atteso indisponibile:", err);
    totaleAtteso = closureState.data.includeCounters ? ricavoTotaleTeor : selfTotalVenduto;
  }
  closureState.data.ricavoTotaleTeor = ricavoTotaleTeor;
  closureState.data.creditsSum = creditsSum;
  closureState.data.vouchersSum = vouchersSum;
  closureState.data.refundsSum = refundsSum;
  closureState.data.extraCashSum = extraCashSum;
  closureState.data.totaleAtteso = totaleAtteso;
  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-calculator"></i> Chiusura Turno - Step 2/3</h3>
      <p class="section-subtitle">Dati Scontrino Self e Incassi Operatore</p>
      
      <div class="summary-box">
        <h4>Riepilogo Vendite Carburante ${!closureState.data.includeCounters ? "(Stimato da Self)" : ""}</h4>
        ${closureState.data.includeCounters ? `
        <div class="summary-row">
          <span>Totale Litri:</span>
          <strong>${formatLitri(totalLitriBenzina + totalLitriGasolio)} L</strong>
        </div>
        ` : ""}
        <div class="summary-row total">
          <span>Totale Atteso (Solo Carburante):</span>
          <strong id="total-expected-display">${formatEuro(totaleAtteso)}</strong>
        </div>
      </div>

      <form id="closure-step2-form">
        
        <!-- SEZIONE SCONTRINO SELF -->
        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
          <h4 style="color: #0369a1; margin-top: 0; margin-bottom: 15px; font-size: 1.1rem;">
            <i class="fas fa-receipt"></i> Dati Scontrino Self
          </h4>
          
          <div class="form-row">
            <div class="form-group">
              <label>1. Banconote Incassate (€)</label>
              <input type="number" name="self_cash_in" step="0.01" min="0" value="${selfCashIn}" class="big-input self-input" required>
            </div>
            <div class="form-group">
              <label>2. Banconote Erogate (€)</label>
              <input type="number" name="self_cash_out" step="0.01" min="0" value="${selfCashOut}" class="big-input self-input" required>
              <small style="color: #6b7280;">(Resto erogato - usato per totale venduto e delta contante)</small>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>3. Bancomat Erogati (€)</label>
              <input type="number" name="self_pos" step="0.01" min="0" value="${selfPos}" class="big-input self-input" required>
              <small style="color: #6b7280;">(Valore unico per tutto il turno - non si somma)</small>
            </div>
            <div class="form-group">
              <label>4. Transazioni UTA/DKV (€)</label>
              <input type="number" name="self_fleet" step="0.01" min="0" value="${selfFleet}" class="big-input self-input" required>
              <small style="color: #6b7280;">(Valore unico per tutto il turno - non si somma)</small>
            </div>
          </div>

          <div class="form-group">
            <label>5. ${closureState.data.allowPartialClosure ? "ID Gestore" : "Totale Gestore"} (€)</label>
            <input type="number" name="self_manager" step="0.01" min="0" value="${selfManager}" class="big-input self-input" required>
            ${closureState.data.allowPartialClosure && prevSelfManager ? `<small style="color: #6b7280;">Turno precedente: ${formatEuro(prevSelfManager)}</small>` : ""}
            <small style="color: #6b7280;">${closureState.data.allowPartialClosure ? "(Fondi cambio turno/test)" : "(Totale di entrambi gli operatori)"}</small>
          </div>

          <div class="summary-row total" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
            <span>Totale Self (Venduto):</span>
            <strong id="self-total-display">${formatEuro(selfTotalVenduto)}</strong>
          </div>
          <div class="summary-row" style="font-size: 0.9rem; color: #475569;">
            <span>Delta Contante (Incassato - Erogato):</span>
            <strong id="self-delta-display">${formatEuro(selfDeltaContante)}</strong>
          </div>

          <div class="form-group" style="margin-top: 15px;">
            <label>Totale Scontrino (Da Ricevuta) (€)</label>
            <input type="number" name="self_receipt_total" step="0.01" min="0" value="${selfReceiptTotal}" class="big-input" placeholder="Inserisci totale scontrino...">
            <small style="color: #6b7280;">Inserire il totale riportato sullo scontrino cartaceo per confronto.</small>
          </div>
        </div>

        <!-- SEZIONE INCASSI OPERATORE -->
        <div style="background: #fdf2f8; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #db2777;">
          <h4 style="color: #be185d; margin-top: 0; margin-bottom: 15px; font-size: 1.1rem;">
            <i class="fas fa-user-tag"></i> Incassi Operatore
          </h4>

          <div class="form-row">
            <div class="form-group">
              <label>Contanti Cassa (€)</label>
              <input type="number" name="cash_real" step="0.01" min="0" value="${d.cashReal || ""}" class="big-input" required>
              <small style="color: #6b7280;">Inserire il contante effettivamente presente in cassa.</small>
            </div>
            <div class="form-group">
              <label>POS Manuale (€)</label>
              <input type="number" name="pos_real" step="0.01" min="0" value="${d.posReal || ""}" class="big-input" required>
              ${prevOperatorPos ? `<small style="color: #6b7280;">Turno precedente: ${formatEuro(prevOperatorPos)}</small>` : ""}
            </div>
          </div>

          <div class="form-group">
             <label>Transazioni UTA/DKV/Fine Mese (€)</label>
             <input type="number" name="uta_dkv_real" step="0.01" min="0" value="${d.utaDkvReal || ""}" class="big-input" required>
             ${closureState.data.openingUtaDkvIscard > 0 ? `<small style="color: #6b7280; display: block; margin-top: 5px;">Da apertura: ${formatEuro(closureState.data.openingUtaDkvIscard)}</small>` : ""}
             ${prevOperatorUta ? `<small style="color: #6b7280; display: block; margin-top: 5px;">Turno precedente: ${formatEuro(prevOperatorUta)}</small>` : ""}
          </div>
          
          ${creditsSum > 0 ? `
          <div class="form-group">
            <label>Crediti (Nuovi Debiti)</label>
            <input type="text" value="${formatEuro(creditsSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <input type="hidden" name="credits_real" value="${creditsSum}">
          </div>
          ` : '<input type="hidden" name="credits_real" value="0">'}

          ${vouchersSum > 0 ? `
          <div class="form-group">
            <label>Voucher (Prepagati)</label>
            <input type="text" value="${formatEuro(vouchersSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <input type="hidden" name="vouchers_real" value="${vouchersSum}">
          </div>
          ` : '<input type="hidden" name="vouchers_real" value="0">'}
          
          ${refundsSum > 0 ? `
          <div class="form-group">
            <label>Rimborsi / Uscite Cassa</label>
            <input type="text" value="${formatEuro(refundsSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <input type="hidden" name="refunds_real" value="${refundsSum}">
            <div style="margin-top: 5px; font-size: 0.85em; color: #64748b; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                <strong>Dettaglio Uscite:</strong>
                <ul style="margin: 5px 0 0 0; padding-left: 20px;">
                    ${movimenti.filter((m) => m.tipo === "pagamento" || m.tipo === "uscita" || m.descrizione && m.descrizione.toLowerCase().includes("rimborso")).map((m) => `<li>${new Date(m.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}: ${escapeHtml$2(m.descrizione || "Uscita")} (${formatEuro(m.importo)})</li>`).join("")}
                </ul>
            </div>
          </div>
          ` : '<input type="hidden" name="refunds_real" value="0">'}

          ${extraCashSum > 0 ? `
           <div class="form-group">
            <label>Incassi Extra (Olio, Rec. Crediti)</label>
            <input type="text" value="${formatEuro(extraCashSum)}" class="big-input" disabled style="background: #e2e8f0; color: #475569;">
            <div style="margin-top: 5px; font-size: 0.85em; color: #64748b; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                <strong>Dettaglio Incassi:</strong>
                <ul style="margin: 5px 0 0 0; padding-left: 20px;">
                    ${movimenti.filter((m) => m.tipo === "incasso").map((m) => `<li>${new Date(m.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}: ${escapeHtml$2(m.descrizione || "Incasso")} (${formatEuro(m.importo)})</li>`).join("")}
                </ul>
            </div>
          </div>
          ` : ""}

        </div>

        <div class="form-group">
          <label>Note (opzionale)</label>
          <textarea name="notes" rows="3" placeholder="Eventuali annotazioni...">${d.notes || ""}</textarea>
        </div>
        
        <div class="form-actions">
          <button type="button" class="menu-button secondary" id="btn-back-step2">
            <i class="fas fa-arrow-left"></i> Indietro
          </button>
          <button type="submit" class="menu-button primary">
            <i class="fas fa-arrow-right"></i> Avanti
          </button>
        </div>
      </form>
    </div>
  `;
  const form = (
    /** @type {HTMLFormElement} */
    document.getElementById("closure-step2-form")
  );
  const selfInputs = form.querySelectorAll(".self-input");
  const totalDisplay = document.getElementById("self-total-display");
  const deltaDisplay = document.getElementById("self-delta-display");
  const expectedDisplay = document.getElementById("total-expected-display");
  function updateTotals() {
    const cashIn = parseFloat(
      /** @type {HTMLInputElement} */
      form.elements.namedItem("self_cash_in").value
    ) || 0;
    const cashOut = parseFloat(
      /** @type {HTMLInputElement} */
      form.elements.namedItem("self_cash_out").value
    ) || 0;
    const pos = parseFloat(
      /** @type {HTMLInputElement} */
      form.elements.namedItem("self_pos").value
    ) || 0;
    const fleet = parseFloat(
      /** @type {HTMLInputElement} */
      form.elements.namedItem("self_fleet").value
    ) || 0;
    const manager = parseFloat(
      /** @type {HTMLInputElement} */
      form.elements.namedItem("self_manager").value
    ) || 0;
    const prevManager = closureState.data.allowPartialClosure ? closureState.data.partialAggregates?.selfManager || 0 : 0;
    const totalVenduto = cashOut + pos + fleet + (manager + prevManager);
    const deltaContante = cashIn - cashOut;
    totalDisplay.textContent = formatEuro(totalVenduto);
    deltaDisplay.textContent = formatEuro(deltaContante);
    if (!closureState.data.includeCounters) {
      expectedDisplay.textContent = formatEuro(totalVenduto);
      closureState.data.totaleAtteso = totalVenduto;
    }
    closureState.data.selfDeltaContante = deltaContante;
  }
  selfInputs.forEach((input) => {
    input.addEventListener("input", updateTotals);
  });
  updateTotals();
  document.getElementById("btn-back-step2").addEventListener("click", () => {
    closureState.step = 1;
    showClosureStep1();
  });
  document.getElementById("closure-step2-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    closureState.data.selfCashIn = parseFloat(formData.get("self_cash_in")?.toString() || "0") || 0;
    closureState.data.selfCashOut = parseFloat(formData.get("self_cash_out")?.toString() || "0") || 0;
    closureState.data.selfPos = parseFloat(formData.get("self_pos")?.toString() || "0") || 0;
    closureState.data.selfFleet = parseFloat(formData.get("self_fleet")?.toString() || "0") || 0;
    closureState.data.selfManager = parseFloat(formData.get("self_manager")?.toString() || "0") || 0;
    closureState.data.selfReceiptTotal = parseFloat(formData.get("self_receipt_total")?.toString() || "0") || 0;
    closureState.data.cashReal = parseFloat(formData.get("cash_real")?.toString() || "0") || 0;
    closureState.data.posReal = parseFloat(formData.get("pos_real")?.toString() || "0") || 0;
    closureState.data.utaDkvReal = parseFloat(formData.get("uta_dkv_real")?.toString() || "0") || 0;
    closureState.data.notes = formData.get("notes")?.toString() || "";
    closureState.step = 3;
    await showClosureStep3();
  });
}
async function showClosureStep3() {
  openModal("Chiusura Turno - Step 3/3");
  const container = document.getElementById("modal-body");
  const {
    ricavoTotaleTeor,
    // Self Data
    selfCashIn,
    selfCashOut,
    selfPos,
    selfFleet,
    selfManager,
    selfReceiptTotal,
    // Operator Data
    cashReal,
    posReal,
    utaDkvReal,
    creditsSum,
    vouchersSum,
    refundsSum,
    extraCashSum,
    // Totals
    totalLitriBenzina,
    totalLitriGasolio,
    prezzoBenzina,
    prezzoGasolio,
    notes
  } = closureState.data;
  const partialAgg = closureState.data.partialAggregates || {};
  const prevSelfManager = partialAgg?.selfManager || 0;
  const prevOperatorPos = partialAgg?.operatorPos || 0;
  const prevOperatorUta = partialAgg?.operatorUta || 0;
  const totalSelfManager = closureState.data.allowPartialClosure ? selfManager + prevSelfManager : selfManager;
  const selfTotalVenduto = selfCashOut + selfPos + selfFleet + totalSelfManager;
  const totalPosOperatore = posReal + prevOperatorPos;
  const openingUtaDkv = closureState.data.openingUtaDkvIscard || 0;
  const totalUtaOperatore = utaDkvReal + openingUtaDkv + prevOperatorUta;
  const operatorTotalDeclared = cashReal + totalPosOperatore + totalUtaOperatore;
  const totaleAttesoGlobale = closureState.data.totaleAtteso + (extraCashSum || 0);
  const selfDelta = selfCashIn - selfCashOut;
  const carburanteAtteso = closureState.data.totaleAtteso;
  let expectedCash = 0;
  let cashDiff = 0;
  let isCashValid = true;
  let discrepanza = 0;
  let serverResult = null;
  try {
    const payload = {
      station_id: closureState.data.stationId,
      shift_id: closureState.data.turnoId,
      include_counters: closureState.data.includeCounters,
      allow_partial: closureState.data.allowPartialClosure,
      closing_counters: closureState.data.finalCounters,
      // map {id: val}
      self_data: {
        cash_in: selfCashIn,
        cash_out: selfCashOut,
        pos: selfPos,
        fleet: selfFleet,
        manager: selfManager
        // Totale Gestore for calculation
      },
      operator_data: {
        cash: cashReal,
        pos: totalPosOperatore,
        uta: totalUtaOperatore,
        credits: creditsSum,
        vouchers: vouchersSum,
        refunds: refundsSum
      }
    };
    const { data, error } = await supabase.functions.invoke("calculate-closure", {
      body: payload
    });
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error);
    serverResult = data.data;
    expectedCash = serverResult.expected_total;
    discrepanza = serverResult.discrepancy;
    cashDiff = discrepanza;
    expectedCash = cashReal - cashDiff;
    isCashValid = Math.abs(cashDiff) <= 5;
  } catch (err) {
    console.error("Edge Function Error:", err);
    Toast.show("Attenzione: Impossibile contattare il server per il calcolo sicuro. Uso calcolo locale di emergenza.", "warning");
    const selfDelta2 = selfCashIn - selfCashOut;
    expectedCash = closureState.data.totaleAtteso - totalPosOperatore - totalUtaOperatore - selfPos - creditsSum - vouchersSum + selfDelta2 - refundsSum + (extraCashSum || 0);
    cashDiff = cashReal - expectedCash;
    isCashValid = Math.abs(cashDiff) <= 5;
    discrepanza = cashDiff;
  }
  const discrepanzaClass = discrepanza >= 0 ? "positive" : "negative";
  container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-check-circle"></i> Chiusura Turno - Step 3/3</h3>
      <p class="section-subtitle">Conferma i dati prima di salvare</p>
      
      ${!isCashValid ? `
      <div class="warning-message" style="margin-bottom: 20px; border-left: 4px solid #f59e0b; background: #fffbeb; padding: 15px;">
        <div style="display: flex; align-items: center; gap: 10px; color: #b45309; font-weight: bold; margin-bottom: 5px;">
            <i class="fas fa-exclamation-triangle"></i> Attenzione: Discrepanza Contanti
        </div>
        <p style="margin: 0; color: #92400e;">
            I contanti inseriti (${formatEuro(cashReal)}) differiscono da quelli attesi (${formatEuro(expectedCash)}) di <strong>${formatEuro(cashDiff)}</strong>.
            <br>Il limite consentito è +/- 5,00 €. Verifica di aver contato bene.
        </p>
      </div>
      ` : ""}

      <div class="summary-box">
        <h4>Riepilogo Finale</h4>
        
        <!-- Totale Atteso -->
        <div class="summary-row">
          <span>Totale Atteso (Carburante):</span>
          <strong>${formatEuro(closureState.data.totaleAtteso)}</strong>
        </div>
        
        <div class="section-divider"></div>
        
        <!-- Dettaglio Self -->
        <div class="summary-row">
          <span>Totale Scontrino Self (Venduto):</span>
          <strong>${formatEuro(selfTotalVenduto)}</strong>
        </div>
        ${selfReceiptTotal > 0 ? `
        <div class="summary-row" style="font-size: 0.9em; color: #64748b;">
          <span>Totale Scontrino (Manuale):</span>
          <span>${formatEuro(selfReceiptTotal)}</span>
        </div>
        ` : ""}
        <div style="font-size: 0.85rem; color: #6b7280; padding-left: 10px; margin-bottom: 5px;">
          Incassato: ${formatEuro(selfCashIn)} | Erogato: ${formatEuro(selfCashOut)}<br>
          POS: ${formatEuro(selfPos)} | Fleet: ${formatEuro(selfFleet)} | ${closureState.data.allowPartialClosure ? "ID" : "Totale Gestore"}: ${formatEuro(totalSelfManager)}${closureState.data.allowPartialClosure && prevSelfManager ? ` (prev. ${formatEuro(prevSelfManager)})` : ""}
        </div>

        <!-- Dettaglio Operatore -->
        <div class="summary-row">
          <span>Totale Operatore:</span>
          <strong>${formatEuro(operatorTotalDeclared)}</strong>
        </div>
        <div style="font-size: 0.85rem; color: #6b7280; padding-left: 10px; margin-bottom: 5px;">
          Cassa: ${formatEuro(cashReal)} | POS: ${formatEuro(totalPosOperatore)}${prevOperatorPos ? ` (prev. ${formatEuro(prevOperatorPos)})` : ""} | UTA: ${formatEuro(totalUtaOperatore)}${prevOperatorUta ? ` (prev. ${formatEuro(prevOperatorUta)})` : ""}<br>
          Crediti: ${formatEuro(creditsSum)} | Voucher: ${formatEuro(vouchersSum)}
        </div>

        <!-- Extra e Rimborsi -->
        ${extraCashSum > 0 ? `
        <div class="summary-row">
            <span>Incassi Extra:</span>
            <strong style="color: #10b981;">+ ${formatEuro(extraCashSum)}</strong>
        </div>` : ""}
        
        ${refundsSum > 0 ? `
        <div class="summary-row">
            <span>Rimborsi / Uscite:</span>
            <strong style="color: #ef4444;">- ${formatEuro(refundsSum)}</strong>
        </div>` : ""}

        <div class="section-divider"></div>

        <!-- Dettaglio Calcolo Contanti Attesi -->
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #64748b;">
          <h5 style="margin-top: 0; color: #475569; font-size: 0.95rem;">Dettaglio Calcolo Contanti Attesi:</h5>
          <div style="font-size: 0.85rem; color: #64748b; line-height: 1.8;">
            <div>Totale Carburante: <strong>${formatEuro(carburanteAtteso)}</strong></div>
            <div style="margin-left: 20px; color: #ef4444;">
              - POS Operatore: <strong>${formatEuro(totalPosOperatore)}</strong>${prevOperatorPos ? ` (di cui ${formatEuro(prevOperatorPos)} da turno precedente)` : ""}
            </div>
            <div style="margin-left: 20px; color: #ef4444;">
              - UTA/DKV Operatore: <strong>${formatEuro(totalUtaOperatore)}</strong>${prevOperatorUta ? ` (di cui ${formatEuro(prevOperatorUta)} da turno precedente)` : ""}
            </div>
            ${selfPos > 0 ? `<div style="margin-left: 20px; color: #ef4444;">
              - Bancomat Self: <strong>${formatEuro(selfPos)}</strong>
            </div>` : ""}
            ${creditsSum > 0 ? `<div style="margin-left: 20px; color: #ef4444;">- Crediti: <strong>${formatEuro(creditsSum)}</strong></div>` : ""}
            ${vouchersSum > 0 ? `<div style="margin-left: 20px; color: #ef4444;">- Voucher: <strong>${formatEuro(vouchersSum)}</strong></div>` : ""}
            ${selfDelta !== 0 ? `<div style="margin-left: 20px; color: ${selfDelta > 0 ? "#10b981" : "#ef4444"};">
              ${selfDelta > 0 ? "+" : ""} Delta Self: <strong>${formatEuro(selfDelta)}</strong> (Incassato ${formatEuro(selfCashIn)} - Erogato ${formatEuro(selfCashOut)})
            </div>` : ""}
            ${refundsSum > 0 ? `<div style="margin-left: 20px; color: #ef4444;">- Rimborsi/Uscite: <strong>${formatEuro(refundsSum)}</strong></div>` : ""}
            ${extraCashSum > 0 ? `<div style="margin-left: 20px; color: #10b981;">+ Incassi Extra: <strong>${formatEuro(extraCashSum)}</strong></div>` : ""}
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-weight: 600; color: #1e293b;">
              = Contanti Attesi: <strong>${formatEuro(expectedCash)}</strong>
            </div>
          </div>
        </div>

        <!-- Totale Finale -->
        <div class="summary-row total">
          <span>Contanti Attesi:</span>
          <strong>${formatEuro(expectedCash)}</strong>
        </div>

        <div class="summary-row">
          <span>Contanti Inseriti (Cassa):</span>
          <strong>${formatEuro(cashReal)}</strong>
        </div>

        <div class="summary-row ${discrepanzaClass}">
          <span>Discrepanza:</span>
          <strong>${formatEuro(discrepanza)}</strong>
        </div>
        ${notes ? `<div class="summary-row"><span>Note:</span><p>${escapeHtml$2(notes)}</p></div>` : ""}
      </div>

      <div class="form-group">
        <div style="background: #f1f5f9; padding: 10px; border-radius: 6px; display: flex; align-items: center; gap: 10px;">
            <i class="fas ${closureState.data.closureType === "final" ? "fa-flag-checkered" : "fa-clock"}" style="color: #64748b;"></i>
            <span>Tipo Chiusura: <strong>${closureState.data.closureType === "final" ? "FINALE" : "PARZIALE"}</strong></span>
        </div>
      </div>
      
      <div class="form-actions">
        <button type="button" class="menu-button secondary" id="btn-back-step3">
          <i class="fas fa-arrow-left"></i> Indietro
        </button>
        <button type="button" class="menu-button btn-success" id="btn-confirm-closure">
          <i class="fas fa-save"></i> Conferma e Salva
        </button>
      </div>
    </div>
  `;
  document.getElementById("btn-back-step3").addEventListener("click", async () => {
    closureState.step = 2;
    await showClosureStep2();
  });
  document.getElementById("btn-confirm-closure").addEventListener("click", async () => {
    const isFinal = closureState.data.closureType === "final";
    if (!isCashValid) {
      const confirmProceed = await openConfirmModal("ATTENZIONE: C'è una discrepanza significativa nei contanti (> 5€). Sei sicuro di voler procedere?");
      if (!confirmProceed) return;
    }
    const confirmClosure = await openConfirmModal(`Confermi la chiusura ${isFinal ? "FINALE" : "PARZIALE"} del turno?`);
    if (!confirmClosure) return;
    showLoadingMessage(container);
    try {
      const {
        stationId,
        userId,
        turnoId,
        pistole,
        finalCounters,
        tankLinksByPump = {},
        tankSelections = {},
        litersPerPump = {},
        pumpLabelMap = {}
      } = closureState.data;
      const tankUsageRecords = [];
      Object.entries(tankLinksByPump).forEach(([pumpId, links]) => {
        if (!Array.isArray(links) || links.length === 0) return;
        const manualLinks = links.filter((l) => l.mode === "manual");
        const autoLinks = links.filter((l) => l.mode !== "manual");
        const litersValue = Number.isFinite(litersPerPump[pumpId]) ? litersPerPump[pumpId] : null;
        const pumpName = pumpLabelMap[pumpId] || `Pistola #${pumpId}`;
        if (manualLinks.length) {
          const selectedTankId = tankSelections[pumpId]?.tankId;
          const chosenLink = manualLinks.find((l) => l.tank_id === selectedTankId) || manualLinks[0];
          if (chosenLink) {
            tankUsageRecords.push({
              pump_id: Number(pumpId),
              pump_name: pumpName,
              tank_id: chosenLink.tank_id,
              tank_name: chosenLink.tankName,
              mode: "manual",
              ratio: null,
              liters: litersValue
            });
          }
        } else if (autoLinks.length) {
          const ratioTotal = autoLinks.reduce((sum, link) => sum + (Number(link.ratio) || 0), 0);
          autoLinks.forEach((link) => {
            let share = null;
            if (litersValue !== null) {
              if (ratioTotal > 0) {
                share = litersValue * (Number(link.ratio) || 0) / ratioTotal;
              } else {
                share = litersValue / autoLinks.length;
              }
              share = Number(share.toFixed(3));
            }
            tankUsageRecords.push({
              pump_id: Number(pumpId),
              pump_name: pumpName,
              tank_id: link.tank_id,
              tank_name: link.tankName,
              mode: "auto",
              ratio: link.ratio || null,
              liters: share
            });
          });
        }
      });
      const incassoContanti = selfCashIn - selfCashOut + cashReal;
      const incassoPos = selfPos + totalPosOperatore;
      const incassoUtaDkv = selfFleet + totalUtaOperatore + creditsSum + vouchersSum;
      const totaleReale = incassoContanti + incassoPos + incassoUtaDkv;
      const dataJson = {
        litri_benzina: totalLitriBenzina,
        litri_gasolio: totalLitriGasolio,
        prezzo_benzina: prezzoBenzina,
        prezzo_gasolio: prezzoGasolio,
        ricavo_teorico: ricavoTotaleTeor,
        extra_incassi: extraCashSum,
        totale_atteso: totaleAttesoGlobale,
        incasso_reale: totaleReale,
        closure_stage: closureState.data.closureType,
        // Nuovo oggetto Scontrino Self
        // NOTA: bancomat_erogati e transazioni_uta NON si sommano - sono sempre gli stessi per tutto il turno
        // Solo id_gestore si somma tra turni
        scontrino_self: {
          banconote_incassate: selfCashIn,
          banconote_erogate: selfCashOut,
          bancomat_erogati: selfPos,
          transazioni_uta: selfFleet,
          id_gestore: totalSelfManager,
          totale_scontrino_calcolato: selfTotalVenduto,
          totale_scontrino_manuale: selfReceiptTotal
        },
        // Dettaglio Operatore
        dettaglio_incasso: {
          contanti_operatore: cashReal,
          pos_operatore: totalPosOperatore,
          uta_dkv_operatore: totalUtaOperatore,
          crediti: creditsSum,
          voucher: vouchersSum,
          rimborsi_uscite: refundsSum
        },
        discrepanza,
        is_final: isFinal,
        closure_type: closureState.data.closureType,
        notes,
        tank_usage: tankUsageRecords
      };
      const updatePayload = {
        closing_data: dataJson,
        status: isFinal ? "closed" : "open"
      };
      if (isFinal) {
        updatePayload.closed_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      const { data: closure, error: closureError } = await supabase.from("shifts").update(updatePayload).eq("id", turnoId).select().single();
      if (closureError) throw closureError;
      if (closureState.data.includeCounters) {
        for (const p of pistole) {
          const { error: counterError } = await supabase.from("shift_pistols").update({
            closed_at_counter: finalCounters[p.id]
          }).eq("shift_id", turnoId).eq("pistola_id", p.id);
          if (counterError) {
            console.error(`Errore aggiornamento contatore pistola ${p.id}:`, counterError);
          }
        }
      }
      if (isFinal) {
        for (const p of pistole) {
          await supabase.from("pistole").update({ numero_litri: finalCounters[p.id] }).eq("id", p.id);
        }
      }
      if (tankUsageRecords.length) {
        const usagePayload = tankUsageRecords.map((record) => ({
          shift_id: turnoId,
          station_id: stationId,
          pump_id: record.pump_id,
          tank_id: record.tank_id,
          liters: record.liters,
          mode: record.mode,
          ratio: record.ratio
        }));
        const { error: tankUsageError } = await supabase.from("tank_pump_usages").insert(usagePayload);
        if (tankUsageError) {
          console.warn("Errore salvataggio distribuzione serbatoi:", tankUsageError);
        }
      }
      container.innerHTML = `
        <div class="success-message">
          <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
          <h3>Chiusura ${isFinal ? "FINALE" : "PARZIALE"} Registrata!</h3>
          <p>Il turno è stato chiuso correttamente.</p>
          <div class="summary-box" style="margin-top: 20px; text-align: left;">
             <p>Discrepanza: <strong>${formatEuro(discrepanza)}</strong></p>
          </div>
          <button id="btn-home" class="menu-button primary">Torna alla Home</button>
        </div>
      `;
      const operatorContent = document.getElementById("operator-content");
      document.getElementById("btn-home").addEventListener("click", () => {
        closeModal();
        if (operatorContent) {
          operatorContent.innerHTML = `<div class="welcome-message"><p>Seleziona un'attività dal menu in alto.</p></div>`;
        }
        updateOpeningStatus(stationId);
      });
    } catch (err) {
      container.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">Errore: ${escapeHtml$2(err.message)}</p>`;
    }
  });
}
async function showPrezziEditForm(stationId) {
  try {
    const { data: current } = await supabase.from("prezzi_distributore").select("*").eq("station_id", stationId).order("data_validita", { ascending: false }).maybeSingle();
    const benzina = current?.prezzo_benzina || 0;
    const gasolio = current?.prezzo_gasolio || 0;
    openModal("Modifica Prezzi");
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = `
      <form id="op-prezzi-form">
        <div class="form-row">
          <div class="form-group">
            <label>Benzina (€/L)</label>
            <input type="number" step="0.001" name="benzina" value="${benzina}" class="big-input" required>
          </div>
          <div class="form-group">
            <label>Gasolio (€/L)</label>
            <input type="number" step="0.001" name="gasolio" value="${gasolio}" class="big-input" required>
          </div>
        </div>
        
        <div class="form-group" style="margin-top: 20px;">
          <label style="margin-bottom: 10px; display: block; font-weight: 600;">Validità Prezzi:</label>
          <div style="display: flex; gap: 20px; justify-content: center;">
            <label class="radio-card" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
              <input type="radio" name="validita" value="immediate" checked style="display: none;">
              <i class="fas fa-bolt" style="font-size: 1.5rem; color: #f59e0b; margin-bottom: 8px; display: block;"></i>
              <div style="font-weight: 600; color: #1e293b;">Immediata</div>
              <div style="font-size: 0.8rem; color: #64748b;">Valido da subito</div>
            </label>
            
            <label class="radio-card" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
              <input type="radio" name="validita" value="next_day" style="display: none;">
              <i class="fas fa-calendar-day" style="font-size: 1.5rem; color: #3b82f6; margin-bottom: 8px; display: block;"></i>
              <div style="font-weight: 600; color: #1e293b;">Giornata Successiva</div>
              <div style="font-size: 0.8rem; color: #64748b;">Valido da domani 00:00</div>
            </label>
          </div>
        </div>
        
        <button type="submit" class="menu-button primary full-width" style="margin-top: 20px;">
          <i class="fas fa-save"></i> Aggiorna Prezzi
        </button>
      </form>
      
      <style>
        .radio-card.selected {
          border-color: #3b82f6 !important;
          background-color: #eff6ff !important;
          box-shadow: 0 0 0 2px #3b82f633;
        }
        input[type="radio"]:checked + * {
          color: #3b82f6;
        }
      </style>
    `;
    const radioCards = modalBody.querySelectorAll(".radio-card");
    const radioInputs = modalBody.querySelectorAll('input[name="validita"]');
    radioInputs.forEach((input) => {
      input.addEventListener("change", () => {
        radioCards.forEach((card) => card.classList.remove("selected"));
        const selectedCard = input.closest(".radio-card");
        if (selectedCard) selectedCard.classList.add("selected");
      });
    });
    const checkedInput = modalBody.querySelector('input[name="validita"]:checked');
    if (checkedInput) {
      checkedInput.closest(".radio-card")?.classList.add("selected");
    }
    modalBody.querySelector("#op-prezzi-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const validita = fd.get("validita");
      let dataValidita;
      if (validita === "next_day") {
        const tomorrow = /* @__PURE__ */ new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        dataValidita = tomorrow.toISOString();
      } else {
        dataValidita = (/* @__PURE__ */ new Date()).toISOString();
      }
      const payload = {
        station_id: stationId,
        prezzo_benzina: parseFloat(fd.get("benzina")),
        prezzo_gasolio: parseFloat(fd.get("gasolio")),
        data_validita: dataValidita,
        modificato_da: loggedUser?.user_id || null
      };
      try {
        const { data, error } = await supabase.functions.invoke("update-prices", {
          body: {
            station_id: stationId,
            benzina: parseFloat(fd.get("benzina")),
            gasolio: parseFloat(fd.get("gasolio")),
            validita
          }
        });
        if (error) throw new Error(error.message || "Errore durante l'aggiornamento prezzi");
        if (data && !data.success) throw new Error(data.error || "Errore sconosciuto dal server");
        const validitaMsg = validita === "next_day" ? "I prezzi saranno validi a partire da domani alle 00:00." : "I prezzi sono validi da subito.";
        closeModal();
        showInfoModal(`Prezzi aggiornati con successo! ${validitaMsg}`);
      } catch (err) {
        console.error("Errore update-prices:", err);
        showInfoModal("Errore: " + err.message);
      }
    });
  } catch (err) {
    openModal("Errore");
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = `<p style="color: red; padding: 20px;">${escapeHtml$2(err.message)}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById("btn-close-err").addEventListener("click", () => closeModal());
  }
}
async function showCreditsMenu(stationId, userId) {
  openModal("Gestione Crediti");
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';
  const activeOpening = await checkOpeningStatus(stationId);
  if (!activeOpening) {
    modalBody.innerHTML = `
            <div style="background:#fee2e2; color:#b91c1c; padding:30px; border-radius:12px; border:2px solid #fecaca; text-align:center; margin: 20px;">
                <h2 style="margin:0 0 15px 0; color:#b91c1c;"><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                <p style="font-size:1.1em; margin:0 0 20px 0;">Devi aprire un turno prima di poter gestire i crediti.</p>
                <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
            </div>
        `;
    document.getElementById("btn-close-warning").addEventListener("click", () => closeModal());
    return;
  }
  modalBody.innerHTML = `
        <div class="credits-menu-container">
            <p class="section-subtitle" style="text-align: center; margin-bottom: 20px;">Seleziona un'operazione</p>
            
            <div class="credits-options" style="display: flex; gap: 20px; justify-content: center;">
            <!-- Opzione 1: Nuovo Credito -->
            <button id="btn-new-credit" class="credit-option-card">
                <div class="icon-wrapper new-credit">
                    <i class="fas fa-plus-circle"></i>
                </div>
                <h3>Nuovo Credito</h3>
                <p>Erogazione senza incasso</p>
            </button>

            <!-- Opzione 2: Pagamento -->
            <button id="btn-payment-credit" class="credit-option-card">
                <div class="icon-wrapper payment">
                    <i class="fas fa-hand-holding-usd"></i>
                </div>
                <h3>Pagamento</h3>
                <p>Incasso su credito aperto</p>
            </button>
        </div>

        <style>
            .credit-option-card {
                flex: 1;
                background: white;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                max-width: 250px;
            }
            .credit-option-card:hover {
                border-color: #3b82f6;
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
            .icon-wrapper {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                margin-bottom: 5px;
            }
            .icon-wrapper.new-credit {
                background: #eff6ff;
                color: #3b82f6;
            }
            .icon-wrapper.payment {
                background: #f0fdf4;
                color: #22c55e;
            }
            .credit-option-card h3 {
                margin: 0;
                color: #1e293b;
                font-size: 1.1rem;
            }
            .credit-option-card p {
                margin: 0;
                color: #64748b;
                font-size: 0.9rem;
            }
        </style>
      </div>
    `;
  document.getElementById("btn-new-credit").addEventListener("click", () => showNewCreditForm(stationId, userId));
  document.getElementById("btn-payment-credit").addEventListener("click", () => showPaymentSelection(stationId, userId));
}
async function showNewCreditForm(stationId, userId) {
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = `
        <div class="content-box">
            <h3><i class="fas fa-user-plus"></i> Nuovo Credito</h3>
            <p class="section-subtitle">Registra un debito per un cliente</p>
            
            <form id="new-credit-form">
                <div class="form-group">
                    <label>Nome Cliente</label>
                    <div style="position: relative;">
                        <input type="text" id="customer-name" name="customer_name" class="big-input" required autocomplete="off" placeholder="Cerca o inserisci nuovo...">
                        <div id="customer-suggestions" class="suggestions-list" style="display: none;"></div>
                    </div>
                </div>

                    <div class="form-group">
                    <label>Importo (€)</label>
                    <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
                </div>

                <div class="form-group">
                    <label>Prodotto</label>
                    <select name="product" class="big-input" required>
                        <option value="Gasolio">Gasolio</option>
                        <option value="Benzina">Benzina</option>
                        <option value="AdBlue">AdBlue</option>
                        <option value="Accessori">Accessori</option>
                        <option value="Altro">Altro</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Note (Opzionale)</label>
                    <textarea name="notes" rows="2" class="big-input" placeholder="Targa, dettagli..."></textarea>
                </div>



                <div class="form-actions">
                    <button type="button" class="menu-button btn-danger" id="btn-back-credits">
                        <i class="fas fa-arrow-left"></i> Annulla
                    </button>
                    <button type="submit" class="menu-button btn-success">
                        Conferma Credito
                    </button>
                </div>
            </form>
            
            <style>
                .suggestions-list {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: white;
                    border: 1px solid #cbd5e1;
                    border-radius: 0 0 8px 8px;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 10;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .suggestion-item {
                    padding: 10px;
                    cursor: pointer;
                    border-bottom: 1px solid #f1f5f9;
                }
                .suggestion-item:hover {
                    background: #f8fafc;
                }
            </style>
        </div>
    `;
  document.getElementById("btn-back-credits").addEventListener("click", () => showCreditsMenu(stationId, userId));
  const nameInput = document.getElementById("customer-name");
  const suggestionsDiv = document.getElementById("customer-suggestions");
  let debounceTimer;
  nameInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const query = (
      /** @type {HTMLInputElement} */
      e.target.value
    );
    if (query.length < 2) {
      suggestionsDiv.style.display = "none";
      return;
    }
    debounceTimer = setTimeout(() => searchCustomersForInput(query, stationId, suggestionsDiv, nameInput), 300);
  });
  document.getElementById("new-credit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const customerName = formData.get("customer_name")?.toString().trim() || "";
    const amount = parseFloat(formData.get("amount")?.toString() || "0");
    const product = formData.get("product")?.toString() || "";
    const notes = formData.get("notes")?.toString() || "";
    if (!customerName || amount <= 0) return;
    try {
      await processNewCredit(stationId, userId, customerName, amount, product, notes);
      closeModal();
      showInfoModal("Credito registrato con successo!");
    } catch (err) {
      Toast.show("Errore: " + err.message, "error");
    }
  });
}
async function searchCustomersForInput(query, stationId, suggestionsDiv, inputField) {
  try {
    const { data: customers } = await supabase.from("crediti_clienti").select("cliente").eq("station_id", stationId).ilike("cliente", `%${query}%`).limit(5);
    if (customers && customers.length > 0) {
      suggestionsDiv.innerHTML = customers.map((c) => `
                <div class="suggestion-item">${escapeHtml$2(c.cliente)}</div>
            `).join("");
      suggestionsDiv.style.display = "block";
      suggestionsDiv.querySelectorAll(".suggestion-item").forEach((item) => {
        item.addEventListener("click", () => {
          inputField.value = item.textContent;
          suggestionsDiv.style.display = "none";
        });
      });
    } else {
      suggestionsDiv.style.display = "none";
    }
  } catch (err) {
    console.error(err);
  }
}
async function processNewCredit(stationId, userId, customerName, amount, product, notes) {
  let { data: customer, error: fetchError } = await supabase.from("crediti_clienti").select("*").eq("station_id", stationId).ilike("cliente", customerName).maybeSingle();
  if (fetchError) throw fetchError;
  if (!customer) {
    const { data: newCustomer, error: createError } = await supabase.from("crediti_clienti").insert([{ station_id: stationId, cliente: customerName, saldo: 0, importo: 0 }]).select().single();
    if (createError) throw createError;
    customer = newCustomer;
  }
  const newBalance = (customer.saldo || 0) + amount;
  const { error: updateError } = await supabase.from("crediti_clienti").update({ saldo: newBalance, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", customer.id);
  if (updateError) throw updateError;
  const { error: moveError } = await supabase.from("crediti_movimenti").insert([{
    cliente_id: customer.id,
    station_id: stationId,
    operator_id: userId,
    tipo: "credito",
    // IMPORTANTE: Questo tipo viene sottratto dai contanti in chiusura
    importo: amount,
    metodo: "credito",
    note: `${product} - ${notes || ""}`,
    // Include product in notes
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  }]);
  const { error: cashMoveError } = await supabase.from("movimenti_cassa").insert([{
    station_id: stationId,
    operator_id: userId,
    tipo: "credito",
    importo: amount,
    descrizione: `Credito: ${customerName} (${product}) ${notes ? "- " + notes : ""}`,
    // Include product in description
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  }]);
  if (moveError || cashMoveError) throw moveError || cashMoveError;
}
async function showPaymentSelection(stationId, userId) {
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = `
        <div class="content-box">
            <h3><i class="fas fa-list"></i> Crediti Aperti</h3>
            <div class="form-group">
                <input type="text" id="debtor-search" class="big-input" placeholder="Cerca cliente...">
            </div>
            <div id="debtors-list" class="results-list" style="max-height: 350px; overflow-y: auto;">
                <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>
            </div>
            <div style="margin-top: 15px;">
                 <button type="button" class="menu-button secondary full-width" id="btn-back-credits-2">
                    <i class="fas fa-arrow-left"></i> Indietro
                </button>
            </div>
        </div>
    `;
  document.getElementById("btn-back-credits-2").addEventListener("click", () => showCreditsMenu(stationId, userId));
  const listContainer = document.getElementById("debtors-list");
  const searchInput = document.getElementById("debtor-search");
  const loadDebtors = async (filter = "") => {
    try {
      let query = supabase.from("crediti_clienti").select("*").eq("station_id", stationId).gt("saldo", 0.01).order("cliente");
      if (filter) {
        query = query.ilike("cliente", `%${filter}%`);
      }
      const { data: debtors, error } = await query;
      if (error) throw error;
      if (!debtors || debtors.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Nessun credito aperto trovato.</p>';
        return;
      }
      listContainer.innerHTML = debtors.map((d) => `
                <div class="result-item" onclick="((/** @type {any} */(window)).openPaymentModal)('${d.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <div>
                        <div style="font-weight: bold; font-size: 1.1rem;">${escapeHtml$2(d.cliente)}</div>
                        <div style="font-size: 0.85rem; color: #64748b;">Ultimo agg: ${new Date(d.updated_at || d.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: #ef4444; font-size: 1.2rem;">${formatEuro(d.saldo)}</div>
                        <div style="font-size: 0.8rem; color: #3b82f6;">Paga <i class="fas fa-chevron-right"></i></div>
                    </div>
                </div>
            `).join("");
      /** @type {import('../types.js').CustomWindow} */
      /** @type {any} */
      window.openPaymentModal = (id) => {
        const debtor = debtors.find((x) => x.id == id);
        if (debtor) showPaymentModal(debtor, stationId, userId);
      };
    } catch (err) {
      listContainer.innerHTML = `<p class="error-text">Errore: ${err.message}</p>`;
    }
  };
  loadDebtors();
  searchInput.addEventListener("input", (e) => {
    loadDebtors(
      /** @type {HTMLInputElement} */
      e.target.value
    );
  });
}
function showPaymentModal(customer, stationId, userId) {
  openModal(`Pagamento: ${escapeHtml$2(customer.cliente)}`);
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = `
        <div style="background: #fff1f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 1px solid #fecdd3;">
            <div style="font-size: 0.9rem; color: #9f1239;">Debito Attuale</div>
            <div style="font-size: 2rem; font-weight: 700; color: #e11d48;">${formatEuro(customer.saldo)}</div>
        </div>

        <form id="payment-form">
            <div class="form-group">
                <label>Importo Pagamento (€)</label>
                <div style="display: flex; gap: 10px;">
                    <input type="number" name="amount" id="pay-amount" step="0.01" min="0.01" max="${customer.saldo}" class="big-input" required value="${customer.saldo}">
                    <button type="button" id="btn-full-amount" style="padding: 0 15px; background: #e2e8f0; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Tutto</button>
                </div>
            </div>

            <div class="form-group">
                <label>Metodo di Pagamento</label>
                <select name="method" id="pay-method" class="big-input" required>
                    <option value="contanti">Contanti (Aumenta Cassa)</option>
                    <option value="pos">POS (Neutro)</option>
                    <option value="uta">UTA/DKV/Fine Mese (Neutro)</option>
                </select>
            </div>

            <div id="cash-info" class="info-box" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
                <i class="fas fa-check-circle"></i> Questo importo verrà <strong>aggiunto</strong> al totale contanti della giornata.
            </div>
            
            <div id="pos-info" class="info-box" style="display: none; background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i> Questo pagamento non influisce sui contanti in cassa.
            </div>

            <div class="form-actions">
                <button type="button" class="menu-button btn-danger" id="btn-cancel-pay">
                    Annulla
                </button>
                <button type="submit" class="menu-button btn-success">
                    Registra Pagamento
                </button>
            </div>
        </form>
    `;
  const methodSelect = document.getElementById("pay-method");
  const cashInfo = document.getElementById("cash-info");
  const posInfo = document.getElementById("pos-info");
  methodSelect.addEventListener("change", () => {
    if (
      /** @type {HTMLSelectElement} */
      methodSelect.value === "contanti"
    ) {
      /** @type {HTMLElement} */
      cashInfo.style.display = "block";
      /** @type {HTMLElement} */
      posInfo.style.display = "none";
    } else {
      /** @type {HTMLElement} */
      cashInfo.style.display = "none";
      /** @type {HTMLElement} */
      posInfo.style.display = "block";
    }
  });
  document.getElementById("btn-full-amount").addEventListener("click", () => {
    /** @type {HTMLInputElement} */
    document.getElementById("pay-amount").value = customer.saldo.toString();
  });
  document.getElementById("btn-cancel-pay").addEventListener("click", () => {
    showPaymentSelection(stationId, userId);
  });
  document.getElementById("payment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const amount = parseFloat(formData.get("amount")?.toString() || "0");
    const method = formData.get("method")?.toString() || "";
    if (amount <= 0) return;
    if (amount > customer.saldo + 0.01) {
      Toast.show("L'importo non può superare il debito!", "warning");
      return;
    }
    try {
      await processPayment(stationId, userId, customer, amount, method);
      closeModal();
      showInfoModal("Pagamento registrato con successo!");
    } catch (err) {
      Toast.show("Errore: " + err.message, "error");
    }
  });
}
async function processPayment(stationId, userId, customer, amount, method) {
  const newBalance = Math.max(0, (customer.saldo || 0) - amount);
  const { error: updateError } = await supabase.from("crediti_clienti").update({ saldo: newBalance, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", customer.id);
  if (updateError) throw updateError;
  let movementType = "incasso";
  if (method === "pos") movementType = "incasso_pos";
  if (method === "uta") movementType = "incasso_uta";
  const { error: moveError } = await supabase.from("crediti_movimenti").insert([{
    cliente_id: customer.id,
    station_id: stationId,
    operator_id: userId,
    tipo: movementType,
    importo: amount,
    metodo: method,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  }]);
  const { error: cashMoveError } = await supabase.from("movimenti_cassa").insert([{
    station_id: stationId,
    operator_id: userId,
    tipo: movementType,
    // 'incasso', 'incasso_pos', 'incasso_uta'
    importo: amount,
    descrizione: `Pagamento Credito: ${customer.cliente} (${method})`,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  }]);
  if (moveError || cashMoveError) throw moveError || cashMoveError;
}
async function showOutflowMenu(stationId, userId) {
  openModal("Registra Uscita Cassa");
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';
  try {
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      modalBody.innerHTML = `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter registrare delle uscite.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;
      document.getElementById("btn-close-warning").addEventListener("click", () => closeModal());
      return;
    }
    renderOutflowForm(modalBody, stationId, userId, activeOpening.id);
  } catch (err) {
    modalBody.innerHTML = createErrorMessage("Errore Caricamento", err) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById("btn-close-err").addEventListener("click", () => closeModal());
  }
}
function renderOutflowForm(container, stationId, userId, turnoId) {
  container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Registra una spesa o un prelievo dalla cassa</p>
        <form id="outflow-form">
            <div class="form-group">
            <label>Importo (€)</label>
            <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
            </div>

            <div class="form-group">
            <label>Tipo di Uscita</label>
            <select name="type" class="big-input" required>
                <option value="rimborso">Rimborso Cliente</option>
                <option value="pagamento">Pagamento Fattura/Fornitore</option>
                <option value="prelievo">Prelievo Titolare</option>
                <option value="altro_uscita">Altro</option>
            </select>
            </div>

            <div class="form-group">
            <label>Descrizione / Note</label>
            <textarea name="description" rows="3" class="big-input" placeholder="Dettagli operazione..." required></textarea>
            </div>

            ${createFormActions({ confirmText: "Registra Uscita", confirmClass: "danger" })}
        </form>
      </div>
    `;
  container.querySelector("#btn-cancel").addEventListener("click", () => {
    closeModal();
  });
  document.getElementById("outflow-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const amount = parseFloat(formData.get("amount")?.toString() || "0");
    const type = formData.get("type")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    if (!amount || amount <= 0) {
      Toast.show("Inserire un importo valido.", "warning");
      return;
    }
    try {
      const { error } = await supabase.from("movimenti_cassa").insert([{
        station_id: stationId,
        operator_id: userId,
        tipo: "uscita",
        importo: amount,
        descrizione: `[${type.toUpperCase()}] ${description}`,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }]);
      if (error) throw error;
      closeModal();
      showInfoModal(`Uscita di € ${amount.toFixed(2)} registrata correttamente.`);
    } catch (err) {
      Toast.show("Errore salvataggio: " + err.message, "error");
    }
  });
}
async function showExtraIncomeMenu(stationId, userId) {
  openModal("Registra Incasso Extra");
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';
  try {
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      modalBody.innerHTML = `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter registrare degli incassi extra.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;
      document.getElementById("btn-close-warning").addEventListener("click", () => closeModal());
      return;
    }
    renderExtraIncomeForm(modalBody, stationId, userId, activeOpening.id);
  } catch (err) {
    modalBody.innerHTML = createErrorMessage("Errore Caricamento", err) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById("btn-close-err").addEventListener("click", () => closeModal());
  }
}
function renderExtraIncomeForm(container, stationId, userId, turnoId) {
  container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Registra una vendita extra carburante</p>
        <form id="extra-income-form">
            <div class="form-group">
            <label>Importo (€)</label>
            <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
            </div>

            <div class="form-group">
            <label>Tipo di Prodotto</label>
            <select name="type" id="product-type" class="big-input" required>
                <option value="olio">Olio Motore</option>
                <option value="adblue">AdBlue</option>
                <option value="accessori">Accessori Auto</option>
                <option value="altro_incasso">Altro</option>
            </select>
            </div>

            <div class="form-group">
            <label>Descrizione / Note <span id="required-indicator" style="display: none; color: #ef4444;">*</span></label>
            <textarea name="description" id="description-field" rows="3" class="big-input" placeholder="Dettagli vendita..."></textarea>
            </div>

            ${createFormActions({ confirmText: "Registra Incasso", confirmClass: "primary" })}
        </form>
      </div>
    `;
  container.querySelector("#btn-cancel").addEventListener("click", () => {
    closeModal();
  });
  const productTypeSelect = document.getElementById("product-type");
  const descriptionField = document.getElementById("description-field");
  const requiredIndicator = document.getElementById("required-indicator");
  function updateDescriptionRequired() {
    const selectedType = (
      /** @type {HTMLSelectElement} */
      productTypeSelect.value
    );
    const requiresDescription = selectedType === "accessori" || selectedType === "altro_incasso";
    /** @type {HTMLTextAreaElement} */
    descriptionField.required = requiresDescription;
    /** @type {HTMLElement} */
    requiredIndicator.style.display = requiresDescription ? "inline" : "none";
    if (!requiresDescription) {
      /** @type {HTMLTextAreaElement} */
      descriptionField.value = "";
    }
  }
  productTypeSelect.addEventListener("change", updateDescriptionRequired);
  updateDescriptionRequired();
  document.getElementById("extra-income-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const amount = parseFloat(formData.get("amount")?.toString() || "0");
    const type = formData.get("type")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    if (!amount || amount <= 0) {
      Toast.show("Inserire un importo valido.", "warning");
      return;
    }
    try {
      const { error } = await supabase.from("movimenti_cassa").insert([{
        station_id: stationId,
        operator_id: userId,
        tipo: "incasso",
        // Tipo per identificare gli incassi extra
        importo: amount,
        descrizione: `[${type.toUpperCase()}] ${description}`,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }]);
      if (error) throw error;
      closeModal();
      showInfoModal(`Incasso di € ${amount.toFixed(2)} registrato correttamente.`);
    } catch (err) {
      Toast.show("Errore salvataggio: " + err.message, "error");
    }
  });
}
let voucherState = {
  scanner: null,
  isScanning: false,
  stationId: null,
  userId: null
};
async function showVoucherMenu(stationId, userId) {
  voucherState.stationId = stationId;
  voucherState.userId = userId;
  openModal("Riscatto Voucher");
  const container = document.getElementById("modal-body");
  container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';
  try {
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      container.innerHTML = `
                <div class="warning-box">
                    <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p>Devi aprire un turno prima di poter riscattare dei voucher.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;
      document.getElementById("btn-close-warning").addEventListener("click", () => closeModal());
      return;
    }
    container.innerHTML = `
        <div class="voucher-modal-content">
            <p id="voucher-modal-subtitle" class="section-subtitle" style="text-align: center; margin-bottom: 20px;">Inquadra il QR code del cliente o inserisci il codice manualmente.</p>

            <div id="scanner-container" style="display:none; margin: 0 auto 20px; max-width: 100%;">
                <div id="reader"></div>
                <button class="menu-button secondary" id="stop-scan-btn" style="margin-top:10px; width:100%;">
                    Ferma Fotocamera
                </button>
            </div>

            <div id="scan-actions" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button class="menu-button primary big-btn" id="start-scan-btn">
                    <i class="fas fa-camera"></i> Avvia Scanner
                </button>
                <button class="menu-button secondary big-btn" id="manual-entry-btn">
                    <i class="fas fa-keyboard"></i> Inserimento Manuale
                </button>
            </div>

            <!-- Manual Entry Form (Hidden by default) -->
            <div id="manual-entry-form" style="display:none; margin-top: 20px; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; animation: slideIn 0.3s ease;">
                <label style="display: block; font-size: 0.9em; font-weight: 600; margin-bottom: 8px; color: #475569;">Codice Voucher</label>
                <div style="display: flex; gap: 10px; align-items: stretch;">
                    <input type="text" id="manual-voucher-code" placeholder="es. 6VJT" class="form-input" style="flex: 1; margin: 0; text-transform: uppercase; font-weight: bold; width: 100%;">
                    <button class="menu-button primary" id="btn-verify-manual" style="margin: 0; width: auto; min-width: 120px; height: 52px; padding: 0 20px;">Verifica</button>
                </div>
            </div>

            <!-- Result Area -->
            <div id="voucher-result" style="margin-top: 20px;"></div>
        </div>
    `;
  } catch (err) {
    container.innerHTML = `
            <div class="alert alert-danger" style="margin: 20px;">
                <h4><i class="fas fa-times-circle"></i> Errore Caricamento</h4>
                <p>${err.message}</p>
            </div>
        `;
    return;
  }
  document.getElementById("start-scan-btn").addEventListener("click", startScanner);
  document.getElementById("stop-scan-btn").addEventListener("click", stopScanner);
  document.getElementById("manual-entry-btn").addEventListener("click", toggleManualEntry);
  document.getElementById("btn-verify-manual").addEventListener("click", () => {
    const code = (
      /** @type {HTMLInputElement} */
      document.getElementById("manual-voucher-code").value.trim()
    );
    if (code) processVoucherCode(code.toUpperCase());
  });
  document.getElementById("manual-voucher-code").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const code = (
        /** @type {HTMLInputElement} */
        e.target.value.trim()
      );
      if (code) processVoucherCode(code.toUpperCase());
    }
  });
  const closeBtn = document.getElementById("modal-close-btn");
  if (closeBtn) {
    closeBtn.onclick;
    closeBtn.addEventListener("click", () => {
      stopScanner();
    });
  }
  const customWindow2 = (
    /** @type {any} */
    window
  );
  if (!customWindow2.Html5Qrcode) {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode";
    document.head.appendChild(script);
  }
}
function startScanner() {
  document.getElementById("reader");
  const container = document.getElementById("scanner-container");
  const actions = document.getElementById("scan-actions");
  actions.style.display = "none";
  container.style.display = "block";
  const customWindow2 = (
    /** @type {any} */
    window
  );
  if (!customWindow2.Html5Qrcode) {
    Toast.show("Libreria Scanner in caricamento... riprova tra un secondo.", "warning");
    return;
  }
  const html5QrCode = new customWindow2.Html5Qrcode("reader");
  voucherState.scanner = html5QrCode;
  voucherState.isScanning = true;
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  html5QrCode.start(
    { facingMode: "environment" },
    // Prefer back camera
    config,
    onScanSuccess,
    onScanFailure
  ).catch((err) => {
    console.error("Error starting scanner", err);
    showErrorMessage("Errore Fotocamera", "Impossibile avviare la fotocamera. Assicurati di aver dato i permessi.");
    stopScanner();
  });
}
function stopScanner() {
  if (voucherState.scanner && voucherState.isScanning) {
    voucherState.scanner.stop().then(() => {
      voucherState.scanner.clear();
      voucherState.scanner = null;
      document.getElementById("scanner-container").style.display = "none";
      document.getElementById("scan-actions").style.display = "flex";
    }).catch((err) => console.error("Failed to stop scanner", err));
  }
}
function onScanFailure(error) {
}
function onScanSuccess(decodedText, decodedResult) {
  stopScanner();
  if (navigator.vibrate) navigator.vibrate(200);
  processVoucherCode(decodedText);
}
function toggleManualEntry() {
  const form = document.getElementById("manual-entry-form");
  const input = document.getElementById("manual-voucher-code");
  const actions = document.getElementById("scan-actions");
  const subtitle = document.getElementById("voucher-modal-subtitle");
  if (form.style.display === "none") {
    form.style.display = "block";
    actions.style.display = "none";
    subtitle.textContent = "Inserisci il numero del voucher";
    input.focus();
  } else {
    form.style.display = "none";
    actions.style.display = "flex";
    subtitle.textContent = "Inquadra il QR code del cliente o inserisci il codice manualmente.";
  }
}
async function processVoucherCode(code) {
  const resultContainer = document.getElementById("voucher-result");
  resultContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Verifica in corso...</div>';
  try {
    let query = supabase.from("vouchers").select("*, voucher_batches(customer_name)");
    if (code.length === 4) {
      query = query.like("code", `${code}%`);
    } else {
      query = query.eq("code", code);
    }
    const { data: vouchers, error } = await query;
    if (error || !vouchers || vouchers.length === 0) {
      throw new Error("Codice non trovato o inesistente.");
    }
    const voucher = vouchers[0];
    if (voucher.status === "redeemed") {
      resultContainer.innerHTML = `
                <div class="alert alert-danger" style="background:#fee2e2; color:#b91c1c; padding:25px; border-radius:12px; border:2px solid #fecaca; text-align:center;">
                    <h2 style="margin:0 0 10px 0; color:#b91c1c;"><i class="fas fa-exclamation-triangle"></i> Voucher Già Riscattato</h2>
                    <p style="font-size:1.1em; margin:0;">Questo buono è stato usato il <strong>${formatDate(voucher.redeemed_at)}</strong>.</p>
                </div>
            `;
      return;
    }
    if (voucher.status === "expired" || voucher.expiration_date && new Date(voucher.expiration_date) < /* @__PURE__ */ new Date()) {
      resultContainer.innerHTML = `
                <div class="alert alert-danger" style="background:#fee2e2; color:#b91c1c; padding:25px; border-radius:12px; border:2px solid #fecaca; text-align:center;">
                    <h2 style="margin:0 0 10px 0; color:#b91c1c;"><i class="fas fa-times-circle"></i> Voucher Scaduto</h2>
                    <p style="font-size:1.1em; margin:0;">Il buono è scaduto il <strong>${formatDate(voucher.expiration_date)}</strong></p>
                </div>
            `;
      return;
    }
    resultContainer.innerHTML = `
            <div class="voucher-card-preview" style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
                <div style="color: #22c55e; font-size: 3rem; margin-bottom: 10px;"><i class="fas fa-check-circle"></i></div>
                <h3 style="margin:0;">Voucher Valido!</h3>
                <div style="font-size: 2rem; font-weight: bold; margin: 10px 0;">${formatEuro(voucher.amount)}</div>
                <p><strong>Codice:</strong> ${voucher.code}</p>
                ${voucher.voucher_batches?.customer_name ? `<p><strong>Cliente:</strong> ${voucher.voucher_batches.customer_name}</p>` : ""}
                
                <div class="form-actions" style="margin-top: 20px;">
                    <button class="menu-button btn-danger" id="cancel-redeem">Annulla</button>
                    <button class="menu-button btn-success" id="confirm-redeem">
                        <i class="fas fa-save"></i> RISCATTA ORA
                    </button>
                </div>
            </div>
        `;
    document.getElementById("cancel-redeem").addEventListener("click", () => {
      resultContainer.innerHTML = "";
    });
    document.getElementById("confirm-redeem").addEventListener("click", () => redeemVoucher(voucher));
  } catch (err) {
    resultContainer.innerHTML = `
            <div class="alert alert-danger">
                <h4><i class="fas fa-times-circle"></i> Errore</h4>
                <p>${err.message}</p>
            </div>
        `;
  }
}
async function redeemVoucher(voucher) {
  const resultContainer = document.getElementById("voucher-result");
  resultContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Registrazione incasso...</div>';
  try {
    const { error: updateError } = await supabase.from("vouchers").update({
      status: "redeemed",
      redeemed_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", voucher.id);
    if (updateError) throw updateError;
    const { error: moveError } = await supabase.from("movimenti_cassa").insert([{
      station_id: voucherState.stationId,
      operator_id: voucherState.userId,
      tipo: "voucher",
      importo: voucher.amount,
      descrizione: `Riscatto Voucher ${voucher.code}`,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    }]);
    if (moveError) {
      await supabase.from("vouchers").update({ status: "active", redeemed_at: null }).eq("id", voucher.id);
      throw moveError;
    }
    Toast.show("Voucher Riscattato con Successo!", "success");
    resultContainer.innerHTML = `
            <div class="alert alert-success" style="background:#d4edda; color:#155724; padding:20px; border-radius:8px; border:1px solid #c3e6cb; text-align: center;">
                <h2><i class="fas fa-check"></i> Completato</h2>
                <p>incasso di <strong>${formatEuro(voucher.amount)}</strong> registrato.</p>
                <button class="menu-button primary" id="btn-done-redeem">Chiudi</button>
            </div>
        `;
    document.getElementById("btn-done-redeem").addEventListener("click", () => {
      closeModal();
    });
  } catch (err) {
    console.error(err);
    showErrorMessage("Errore Riscatto", "Impossibile completare l'operazione. Riprova: " + err.message);
    resultContainer.innerHTML = "";
  }
}
async function showInvoiceMenu(stationId, userId) {
  openModal("Richiesta Fattura");
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';
  try {
    const activeOpening = await checkOpeningStatus(stationId);
    if (!activeOpening) {
      modalBody.innerHTML = `
                <div style="background:#fee2e2; color:#b91c1c; padding:30px; border-radius:12px; border:2px solid #fecaca; text-align:center; margin: 20px;">
                    <h2 style="margin:0 0 15px 0; color:#b91c1c;"><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
                    <p style="font-size:1.1em; margin:0 0 20px 0;">Devi aprire un turno prima di poter registrare richieste di fattura.</p>
                    <button id="btn-close-warning" class="menu-button primary" style="width: auto; min-width: 150px;">Chiudi</button>
                </div>
            `;
      document.getElementById("btn-close-warning").addEventListener("click", () => closeModal());
      return;
    }
    renderCustomerChoice(modalBody, stationId, userId);
  } catch (err) {
    modalBody.innerHTML = createErrorMessage("Errore Caricamento", err) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-err" class="menu-button primary">Chiudi</button></div>`;
    document.getElementById("btn-close-err").addEventListener("click", () => closeModal());
  }
}
function renderCustomerChoice(container, stationId, userId) {
  container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Seleziona il tipo di cliente</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 20px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
            <button id="btn-new-customer" class="menu-button primary" style="flex: 1; padding: 15px; font-size: 1rem;">
                <i class="fas fa-user-plus"></i> Nuovo Cliente
            </button>
            <button id="btn-existing-customer" class="menu-button" style="flex: 1; padding: 15px; font-size: 1rem;">
                <i class="fas fa-users"></i> Cliente Esistente
            </button>
        </div>

        <div style="text-align: center;">
            <button id="btn-cancel-choice" class="menu-button btn-danger">
                <i class="fas fa-times"></i> Annulla
            </button>
        </div>
      </div>
    `;
  document.getElementById("btn-new-customer").addEventListener("click", () => {
    renderNewCustomerForm(container, stationId, userId);
  });
  document.getElementById("btn-existing-customer").addEventListener("click", () => {
    renderExistingCustomerForm(container, stationId, userId);
  });
  document.getElementById("btn-cancel-choice").addEventListener("click", () => {
    closeModal();
  });
}
function renderNewCustomerForm(container, stationId, userId) {
  container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Nuovo Cliente</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <form id="new-customer-form">
            <div class="form-group">
                <label>Ragione Sociale / Nome Cliente</label>
                <input type="text" name="nome" class="big-input" placeholder="Es. Azienda SRL">
            </div>

            <div class="form-group">
                <label>Partita IVA</label>
                <input type="text" name="partita_iva" class="big-input" placeholder="Es. IT12345678901">
            </div>

            <div class="form-group">
                <label>Codice Univoco / PEC</label>
                <input type="text" name="codice_univoco_pec" class="big-input" placeholder="Es. ABCDEF12G34H567I">
            </div>

            <div class="form-group">
                <label>Numero di Telefono</label>
                <input type="tel" name="telefono" class="big-input" placeholder="Es. 3331234567">
            </div>

            <div class="form-group">
                <label>Targa</label>
                <input type="text" name="targa" class="big-input" placeholder="Es. AB123CD">
            </div>

            ${createFormActions({ confirmText: "Continua", confirmClass: "btn-success" })}
        </form>
      </div>
    `;
  container.querySelector("#btn-cancel").addEventListener("click", () => {
    renderCustomerChoice(container, stationId, userId);
  });
  document.getElementById("new-customer-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const nome = formData.get("nome")?.toString().trim() || "";
    const partitaIva = formData.get("partita_iva")?.toString().trim() || "";
    const codiceUnivoco = formData.get("codice_univoco_pec")?.toString().trim() || "";
    const telefono = formData.get("telefono")?.toString().trim() || "";
    const targa = formData.get("targa")?.toString().trim() || "";
    if (!nome && !partitaIva && !codiceUnivoco && !telefono && !targa) {
      Toast.show("Inserire almeno il numero di telefono o altri dati del cliente.", "warning");
      return;
    }
    try {
      let clienteId;
      const { data: existingCustomer } = await supabase.from("clienti_fatturazione").select("id").or(`nome.ilike.%${nome}%,partita_iva.eq.${partitaIva || "null"},telefono.eq.${telefono || "null"}`).maybeSingle();
      if (existingCustomer) {
        const updateData = {};
        if (nome) updateData.nome = nome;
        if (partitaIva) updateData.partita_iva = partitaIva;
        if (codiceUnivoco) updateData.codice_univoco_pec = codiceUnivoco;
        if (telefono) updateData.telefono = telefono;
        if (targa) updateData.targa = targa;
        updateData.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        const { error: updateError } = await supabase.from("clienti_fatturazione").update(updateData).eq("id", existingCustomer.id);
        if (updateError) throw updateError;
        clienteId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: createError } = await supabase.from("clienti_fatturazione").insert([{
          nome: nome || null,
          partita_iva: partitaIva || null,
          codice_univoco_pec: codiceUnivoco || null,
          telefono: telefono || null,
          targa: targa || null
        }]).select().single();
        if (createError) throw createError;
        clienteId = newCustomer.id;
      }
      renderInvoiceForm(container, stationId, userId, clienteId, nome || telefono || "Cliente");
    } catch (err) {
      Toast.show("Errore salvataggio cliente: " + err.message, "error");
    }
  });
}
function renderExistingCustomerForm(container, stationId, userId) {
  container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Cliente Esistente</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <form id="existing-customer-form">
            <div class="form-group">
                <label>Ragione Sociale / Nome Cliente</label>
                <div style="position: relative;">
                    <input type="text" id="customer-search" name="customer_name" class="big-input" required placeholder="Inizia a digitare il nome del cliente..." autocomplete="off">
                    <div id="customer-suggestions" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 6px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
                </div>
                <input type="hidden" id="selected-customer-id" name="customer_id">
            </div>

            ${createFormActions({ confirmText: "Continua", confirmClass: "btn-success" })}
        </form>
      </div>
    `;
  const searchInput = document.getElementById("customer-search");
  const suggestionsDiv = document.getElementById("customer-suggestions");
  const customerIdInput = document.getElementById("selected-customer-id");
  let searchTimeout;
  searchInput.addEventListener("input", async (e) => {
    const query = (
      /** @type {HTMLInputElement} */
      e.target.value.trim()
    );
    clearTimeout(searchTimeout);
    if (query.length < 2) {
      suggestionsDiv.style.display = "none";
      /** @type {HTMLInputElement} */
      customerIdInput.value = "";
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const { data: customers, error } = await supabase.from("clienti_fatturazione").select("id, nome, partita_iva, telefono, targa").or(`nome.ilike.%${query}%,partita_iva.ilike.%${query}%,telefono.ilike.%${query}%,targa.ilike.%${query}%`).limit(10);
        if (error) throw error;
        if (customers && customers.length > 0) {
          suggestionsDiv.innerHTML = customers.map((c) => `
                        <div class="suggestion-item" data-id="${c.id}" data-name="${c.nome || c.telefono || "Cliente"}" style="padding: 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" 
                             onmouseover="this.style.background='#f8fafc'" 
                             onmouseout="this.style.background='white'">
                            <div style="font-weight: 600;">${escapeHtml$1(c.nome || c.telefono || "Cliente")}</div>
                            ${c.partita_iva ? `<div style="font-size: 0.85rem; color: #64748b;">P.IVA: ${escapeHtml$1(c.partita_iva)}</div>` : ""}
                            ${c.telefono ? `<div style="font-size: 0.85rem; color: #64748b;">Tel: ${escapeHtml$1(c.telefono)}</div>` : ""}
                            ${c.targa ? `<div style="font-size: 0.85rem; color: #64748b;">Targa: ${escapeHtml$1(c.targa)}</div>` : ""}
                        </div>
                    `).join("");
          suggestionsDiv.style.display = "block";
          suggestionsDiv.querySelectorAll(".suggestion-item").forEach((itemElement) => {
            const item = (
              /** @type {HTMLElement} */
              itemElement
            );
            item.addEventListener("click", () => {
              const customerId = item.dataset.id;
              const customerName = item.dataset.name || "";
              /** @type {HTMLInputElement} */
              searchInput.value = customerName;
              /** @type {HTMLInputElement} */
              customerIdInput.value = customerId || "";
              suggestionsDiv.style.display = "none";
            });
          });
        } else {
          suggestionsDiv.innerHTML = '<div style="padding: 12px; color: #64748b; text-align: center;">Nessun cliente trovato</div>';
          suggestionsDiv.style.display = "block";
        }
      } catch (err) {
        console.error("Errore ricerca clienti:", err);
      }
    }, 300);
  });
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(
      /** @type {Node} */
      e.target
    ) && !suggestionsDiv.contains(
      /** @type {Node} */
      e.target
    )) {
      suggestionsDiv.style.display = "none";
    }
  });
  container.querySelector("#btn-cancel").addEventListener("click", () => {
    renderCustomerChoice(container, stationId, userId);
  });
  document.getElementById("existing-customer-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const customerId = (
      /** @type {HTMLInputElement} */
      customerIdInput.value
    );
    const customerName = (
      /** @type {HTMLInputElement} */
      searchInput.value.trim()
    );
    if (!customerId || !customerName) {
      Toast.show("Seleziona un cliente dalla lista.", "warning");
      return;
    }
    const { data: customer, error } = await supabase.from("clienti_fatturazione").select("*").eq("id", customerId).single();
    if (error) {
      Toast.show("Errore recupero cliente: " + error.message, "error");
      return;
    }
    renderInvoiceForm(container, stationId, userId, customerId, customer.nome || customer.telefono || "Cliente");
  });
}
function renderInvoiceForm(container, stationId, userId, clienteId, customerName) {
  container.innerHTML = `
      <div class="content-box">
        <p class="section-subtitle">Richiesta Fattura - ${escapeHtml$1(customerName)}</p>
        <div class="info-box" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Questa operazione <strong>NON</strong> influisce sui totali di cassa o sul venduto. Serve solo come promemoria per l'amministrazione.
        </div>

        <form id="invoice-form">
            <input type="hidden" name="cliente_id" value="${clienteId}">
            <input type="hidden" name="customer_name" value="${escapeHtml$1(customerName)}">

            <div class="form-group">
                <label>Importo Rifornimento (€)</label>
                <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
            </div>

            <div class="form-group">
                <label>Metodo di Pagamento</label>
                <select name="payment_method" class="big-input" required>
                    <option value="">Seleziona metodo...</option>
                    <option value="contanti">Contanti</option>
                    <option value="pos">POS</option>
                    <option value="bonifico">Bonifico</option>
                </select>
            </div>

            <div class="form-group">
                <label>Categoria Prodotto</label>
                <select name="product_category" id="product-category" class="big-input" required>
                    <option value="">Seleziona categoria...</option>
                    <option value="gasolio">Gasolio</option>
                    <option value="benzina">Benzina</option>
                    <option value="adblue">Adblue</option>
                    <option value="altro">Altro</option>
                </select>
            </div>

            <div class="form-group" id="product-note-group" style="display: none;">
                <label>Specifica Prodotto (obbligatorio se "Altro")</label>
                <input type="text" name="product_note" id="product-note" class="big-input" placeholder="Indica il prodotto da fatturare">
            </div>

            <div class="form-group">
                <label>Note</label>
                <textarea name="notes" rows="4" class="big-input" placeholder="Note aggiuntive..."></textarea>
            </div>

            ${createFormActions({ confirmText: "Invia Richiesta", confirmClass: "btn-success" })}
        </form>
      </div>
    `;
  const productCategorySelect = document.getElementById("product-category");
  const productNoteGroup = document.getElementById("product-note-group");
  const productNoteInput = document.getElementById("product-note");
  productCategorySelect.addEventListener("change", (e) => {
    if (
      /** @type {HTMLSelectElement} */
      e.target.value === "altro"
    ) {
      /** @type {HTMLElement} */
      productNoteGroup.style.display = "block";
      /** @type {HTMLInputElement} */
      productNoteInput.required = true;
    } else {
      /** @type {HTMLElement} */
      productNoteGroup.style.display = "none";
      /** @type {HTMLInputElement} */
      productNoteInput.required = false;
      /** @type {HTMLInputElement} */
      productNoteInput.value = "";
    }
  });
  container.querySelector("#btn-cancel").addEventListener("click", () => {
    renderCustomerChoice(container, stationId, userId);
  });
  document.getElementById("invoice-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(
      /** @type {HTMLFormElement} */
      e.target
    );
    const amount = parseFloat(formData.get("amount")?.toString() || "0");
    const paymentMethod = formData.get("payment_method")?.toString() || "";
    const productCategory = formData.get("product_category")?.toString() || "";
    const productNote = formData.get("product_note")?.toString().trim() || "";
    const notes = formData.get("notes")?.toString().trim() || "";
    if (productCategory === "altro" && !productNote) {
      Toast.show("Selezionando 'Altro' è obbligatorio specificare il prodotto nella nota.", "warning");
      return;
    }
    if (amount <= 0 || !paymentMethod || !productCategory) {
      Toast.show("Inserire tutti i dati obbligatori.", "warning");
      return;
    }
    let finalNotes = notes;
    if (productCategory === "altro" && productNote) {
      finalNotes = `${productNote}${notes ? "\n" + notes : ""}`;
    }
    try {
      const { error } = await supabase.from("invoices").insert([{
        station_id: stationId,
        operator_id: userId,
        cliente_id: clienteId,
        customer_name: customerName,
        amount,
        payment_method: paymentMethod,
        product_category: productCategory,
        description: finalNotes,
        status: "pending",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        // Fix: Campi obbligatori mancanti
        invoice_number: `REQ-${Date.now()}`,
        // Genera un ID richiesta temporaneo
        invoice_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        // Data odierna
      }]);
      if (error) throw error;
      closeModal();
      showInfoModal(`Richiesta fattura per ${customerName} inviata correttamente.`);
    } catch (err) {
      Toast.show("Errore salvataggio: " + err.message, "error");
    }
  });
}
function escapeHtml$1(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
async function showOperatorMenu(userId, stationId) {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;
  if (!document.getElementById("operator-custom-styles")) {
    const style = document.createElement("style");
    style.id = "operator-custom-styles";
    style.innerHTML = `
      .result-item {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;
      }
      .result-item:hover { background: #f9f9f9; }
      .customer-header {
        background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;
        border-left: 4px solid #0284c7;
      }
      .balance-display { font-size: 1.2em; color: #0284c7; margin-top: 5px; }
      .action-tabs { display: flex; gap: 10px; margin-bottom: 20px; }
      .tab-btn {
        flex: 1; padding: 10px; border: 1px solid #ddd; background: #fff; border-radius: 6px; cursor: pointer;
      }
      .tab-btn.active { background: #0284c7; color: white; border-color: #0284c7; }
      .voucher-amount { font-size: 2em; font-weight: bold; color: #10b981; margin: 10px 0; }
      .sync-badge {
        background: #f59e0b; color: white; font-size: 0.75em; padding: 2px 6px;
        border-radius: 10px; margin-left: 5px; display: none;
      }
      .sync-badge.active { display: inline-block; animation: pulse 2s infinite; }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  mainContent.innerHTML = `
    <div class="operator-container">
      <header class="operator-header">
        <div class="header-left">
          <img src="/assets/images/logo-svg.svg" alt="Neofuel" style="height: 40px; vertical-align: middle;">
          <span class="station-badge" id="station-badge">Caricamento...</span>
        </div>
        <div class="header-right">
          <span id="sync-indicator" class="sync-badge" title="Operazioni in attesa di sincronizzazione">
             <i class="fas fa-sync-alt"></i> <span id="sync-count">0</span>
          </span>
          <button id="op-logout-btn" class="icon-btn"><i class="fas fa-sign-out-alt"></i></button>
        </div>

      </header>
      
      <div class="operator-menu">
        <!-- Apertura/Chiusura (dinamico) -->
        <button class="op-menu-item primary" id="btn-turno">
          <i class="fas fa-door-open" id="turno-icon"></i>
          <span id="turno-text">Apertura</span>
          <span class="status-badge" id="opening-status"></span>
        </button>


        <!-- Movimenti (accordion) -->
        <div class="op-menu-accordion">
          <button class="op-menu-item accordion-trigger" id="btn-movimenti">
            <i class="fas fa-exchange-alt"></i>
            <span>Movimenti</span>
            <i class="fas fa-chevron-down accordion-icon"></i>
          </button>
          <div class="accordion-content" id="movimenti-content">
            <button class="op-submenu-item" id="btn-crediti">
              <i class="fas fa-credit-card"></i>
              <span>Crediti</span>
            </button>
            <button class="op-submenu-item" id="btn-voucher">
              <i class="fas fa-ticket-alt"></i>
              <span>Voucher</span>
            </button>
            <button class="op-submenu-item" id="btn-uscite">
              <i class="fas fa-hand-holding-usd"></i>
              <span>Uscite</span>
            </button>
            <button class="op-submenu-item" id="btn-incassi">
              <i class="fas fa-cash-register"></i>
              <span>Incassi</span>
            </button>
          </div>
        </div>

        <!-- Fatture -->
        <button class="op-menu-item" id="btn-fatture">
          <i class="fas fa-file-invoice"></i>
          <span>Fatture</span>
        </button>

        <!-- Prezzi -->
        <button class="op-menu-item" id="btn-prezzi">
          <i class="fas fa-tags"></i>
          <span>Prezzi</span>
        </button>
      </div>
      
      <div id="operator-content" class="operator-content">
        <div class="welcome-message">
            <p>Seleziona un'attività dal menu in alto.</p>
        </div>
      </div>
    </div>
  `;
  getStationName(stationId).then((name) => {
    const badge = document.getElementById("station-badge");
    if (badge) badge.textContent = name;
  });
  document.getElementById("op-logout-btn").addEventListener("click", async () => {
    const confirmed = await openConfirmModal("Vuoi uscire dal portale operatore?");
    if (confirmed) {
      await clearSession();
      await new Promise((resolve) => setTimeout(resolve, 100));
      window.location.href = window.location.pathname;
    }
  });
  const btnMovimenti = document.getElementById("btn-movimenti");
  const movimentiContent = document.getElementById("movimenti-content");
  btnMovimenti.addEventListener("click", () => {
    const isOpen = movimentiContent.classList.contains("open");
    movimentiContent.classList.toggle("open");
    /** @type {HTMLElement} */
    btnMovimenti.querySelector(".accordion-icon").style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
  });
  const btnTurno = document.getElementById("btn-turno");
  document.getElementById("turno-icon");
  document.getElementById("turno-text");
  checkOpeningStatus(stationId).then((opening) => {
    const newBtnTurno = (
      /** @type {HTMLElement} */
      btnTurno.cloneNode(true)
    );
    btnTurno.parentNode.replaceChild(newBtnTurno, btnTurno);
    const newTurnoIcon = (
      /** @type {HTMLElement} */
      newBtnTurno.querySelector("#turno-icon")
    );
    const newTurnoText = (
      /** @type {HTMLElement} */
      newBtnTurno.querySelector("#turno-text")
    );
    if (opening) {
      newTurnoIcon.className = "fas fa-door-closed";
      newTurnoText.textContent = "Chiusura";
      newBtnTurno.addEventListener("click", () => startClosureWizard(stationId, userId));
    } else {
      newTurnoIcon.className = "fas fa-door-open";
      newTurnoText.textContent = "Apertura";
      newBtnTurno.addEventListener("click", () => showAperturaForm(stationId, userId));
    }
    const badge = document.getElementById("opening-status");
    if (badge) {
      if (opening) {
        const hasPartial = opening.closing_data?.closure_stage === "partial";
        badge.textContent = hasPartial ? "Parziale" : "Aperto";
        badge.className = `status-badge ${hasPartial ? "status-partial" : "status-open"}`;
        badge.title = `Aperto da ${opening.users?.full_name || "Operatore"} il ${new Date(opening.date_time).toLocaleString("it-IT")}`;
      } else {
        badge.textContent = "Chiuso";
        badge.className = "status-badge status-closed";
        badge.title = "Nessuna apertura attiva";
      }
    }
  });
  document.getElementById("btn-prezzi").addEventListener("click", () => showPrezziEditForm(stationId));
  document.getElementById("btn-crediti").addEventListener("click", () => showCreditsMenu(stationId, userId));
  document.getElementById("btn-fatture").addEventListener("click", () => showInvoiceMenu(stationId, userId));
  document.getElementById("btn-voucher").addEventListener("click", () => showVoucherMenu(stationId, userId));
  document.getElementById("btn-uscite").addEventListener("click", () => showOutflowMenu(stationId, userId));
  document.getElementById("btn-incassi").addEventListener("click", () => showExtraIncomeMenu(stationId, userId));
  const updateSyncBadge = async () => {
    const { offlineDB: offlineDB2 } = await __vitePreload(async () => {
      const { offlineDB: offlineDB3 } = await Promise.resolve().then(() => offlineDb);
      return { offlineDB: offlineDB3 };
    }, true ? void 0 : void 0, import.meta.url);
    const count = await offlineDB2.getQueueCount();
    const badge = document.getElementById("sync-indicator");
    const countSpan = document.getElementById("sync-count");
    if (badge && countSpan) {
      countSpan.textContent = count.toString();
      badge.classList.toggle("active", count > 0);
    }
  };
  updateSyncBadge();
  document.addEventListener("sync-status-changed", updateSyncBadge);
}
const DB_NAME = "NeofuelOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "mutation_queue";
class OfflineDB {
  constructor() {
    this.db = null;
    this.initPromise = this._init();
  }
  async _init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (
          /** @type {IDBOpenDBRequest} */
          event.target.result
        );
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      request.onsuccess = (event) => {
        this.db = /** @type {IDBOpenDBRequest} */
        event.target.result;
        resolve(this.db);
      };
      request.onerror = (event) => {
        console.error(
          "IndexedDB error:",
          /** @type {IDBOpenDBRequest} */
          event.target.error
        );
        reject("Impossibile aprire il database offline");
      };
    });
  }
  /**
   * Aggiunge una mutazione alla coda offline
   * @param {Object} mutation - Oggetto contenente table, action, data, ecc.
   */
  async enqueue(mutation) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB non inizializzato");
      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store2 = transaction.objectStore(STORE_NAME);
      const item = {
        ...mutation,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        retryCount: 0
      };
      const request = store2.add(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Recupera tutte le mutazioni in attesa
   * @returns {Promise<Array<Object>>}
   */
  async getQueue() {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB non inizializzato");
      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store2 = transaction.objectStore(STORE_NAME);
      const request = store2.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Rimuove una mutazione dalla coda per ID
   * @param {number} id 
   */
  async dequeue(id) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB non inizializzato");
      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store2 = transaction.objectStore(STORE_NAME);
      const request = store2.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Conta quanti elementi sono in coda
   * @returns {Promise<number>}
   */
  async getQueueCount() {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(0);
      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store2 = transaction.objectStore(STORE_NAME);
      const request = store2.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }
}
const offlineDB = new OfflineDB();
const offlineDb = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  offlineDB
}, Symbol.toStringTag, { value: "Module" }));
class SyncManager {
  constructor() {
    this.isSyncing = false;
    this._init();
  }
  _init() {
    window.addEventListener("online", () => {
      console.log("Connessione ripristinata. Avvio sincronizzazione...");
      this.sync();
    });
    if (navigator.onLine) {
      this.sync();
    }
  }
  /**
   * Tenta di sincronizzare la coda offline
   */
  async sync() {
    if (this.isSyncing || !navigator.onLine) return;
    const count = await offlineDB.getQueueCount();
    if (count === 0) return;
    this.isSyncing = true;
    console.log(`Sincronizzazione di ${count} operazioni in corso...`);
    try {
      const queue = await offlineDB.getQueue();
      for (const item of queue) {
        try {
          await this._processItem(item);
          await offlineDB.dequeue(item.id);
        } catch (err) {
          console.error(`Errore sincronizzazione item ${item.id}:`, err);
        }
      }
      const remaining = await offlineDB.getQueueCount();
      if (remaining === 0) {
        Toast.show("Tutti i dati sono stati sincronizzati con successo!", "success");
      } else {
        Toast.show(`${remaining} operazioni non sono state ancora sincronizzate.`, "warning");
      }
      document.dispatchEvent(new CustomEvent("sync-status-changed", { detail: { count: remaining } }));
    } catch (err) {
      console.error("Errore critico durante la sincronizzazione:", err);
    } finally {
      this.isSyncing = false;
    }
  }
  /**
   * Elabora un singolo elemento della coda
   * @param {Object} item 
   */
  async _processItem(item) {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }
}
new SyncManager();
const customWindow = (
  /** @type {any} */
  window
);
customWindow.requestPasswordReset = requestPasswordReset;
async function initializeApp() {
  initAnalytics();
  initializeCalculationPresets();
  setOnLoginSuccess(async (user2) => {
    store.setUser(user2);
    trackLogin(user2.role);
    const isAdminRole = ["admin", "super_admin", "accounting", "billing"].includes(user2.role);
    if (isAdminRole) {
      showAdminArea();
    } else {
      let stId = user2.station_id;
      if (!stId) {
        const { data: us } = await supabase.from("user_stations").select("station_id").eq("user_id", user2.user_id).maybeSingle();
        stId = us?.station_id;
      }
      showOperatorMenu(user2.user_id, stId);
    }
  });
  const urlParams = new URLSearchParams(window.location.search);
  const tokenHash = urlParams.get("token_hash");
  const type = urlParams.get("type");
  if (tokenHash && type === "recovery") {
    await handlePasswordReset();
    return;
  }
  const user = await loadSession();
  if (user) {
    setLoggedUser(user);
    store.setUser(user);
    const loginContainer2 = document.getElementById("login-container");
    const appContainer2 = document.getElementById("app-container");
    if (loginContainer2) loginContainer2.style.display = "none";
    if (appContainer2) appContainer2.style.display = "block";
    const isAdminRole = ["admin", "super_admin", "accounting", "billing"].includes(user.role);
    if (isAdminRole) {
      document.body.classList.add("admin-layout", "desktop-layout");
      showAdminArea();
    } else {
      document.body.classList.remove("admin-layout", "desktop-layout");
      let stId = user.station_id;
      if (!stId) {
        const { data: us } = await supabase.from("user_stations").select("station_id").eq("user_id", user.user_id).maybeSingle();
        stId = us?.station_id;
      }
      showOperatorMenu(user.user_id, stId);
    }
  } else {
    initLoginElements();
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
const UI_FIELDS = [
  {
    key: "primary_color",
    label: "Colore primario",
    type: "color",
    cssVar: "--primary-color",
    defaultValue: "#0A2342",
    description: "Colore di pulsanti e link principali"
  },
  {
    key: "accent_color",
    label: "Colore accento",
    type: "color",
    cssVar: "--accent-color",
    defaultValue: "#8DC63F",
    description: "Colori di evidenza e stati positivi"
  },
  {
    key: "bg_body",
    label: "Sfondo pagina",
    type: "color",
    cssVar: "--bg-body",
    defaultValue: "#F4F6F8",
    description: "Background generale dell'app"
  },
  {
    key: "bg_sidebar",
    label: "Sfondo sidebar",
    type: "color",
    cssVar: "--bg-sidebar",
    defaultValue: "#0A2342",
    description: "Colonna di navigazione area admin"
  },
  {
    key: "sidebar_hover",
    label: "Hover sidebar",
    type: "color",
    cssVar: "--bg-sidebar-hover",
    defaultValue: "#123561",
    description: "Colore della voce attiva/hover"
  },
  {
    key: "text_main",
    label: "Colore testo",
    type: "color",
    cssVar: "--text-main",
    defaultValue: "#333333",
    description: "Testi principali in tutta l'app"
  },
  {
    key: "button_radius",
    label: "Raggio bordi pulsanti",
    type: "text",
    cssVar: "--radius-sm",
    defaultValue: "6px",
    description: "Esempio: 6px, 999px per pill, ecc."
  },
  {
    key: "font_family",
    label: "Font principale",
    type: "text",
    defaultValue: "'Inter', 'Segoe UI', Roboto, sans-serif",
    description: "Stack di caratteri per tutta l'app"
  },
  {
    key: "login_tagline",
    label: "Sottotitolo login",
    type: "text",
    defaultValue: "Portale Distributori",
    description: "Testo sotto il logo in schermata di login"
  },
  // Icone Admin
  {
    key: "admin_icon_dashboard",
    label: "Dashboard",
    type: "text",
    defaultValue: "fas fa-chart-line",
    description: "Icona menu Dashboard (es: fas fa-chart-line o codice SVG)",
    category: "icon_admin"
  },
  {
    key: "admin_icon_stations",
    label: "Distributori",
    type: "text",
    defaultValue: "fas fa-gas-pump",
    description: "Icona menu Distributori",
    category: "icon_admin"
  },
  {
    key: "admin_icon_operators",
    label: "Operatori",
    type: "text",
    defaultValue: "fas fa-users",
    description: "Icona menu Operatori",
    category: "icon_admin"
  },
  {
    key: "admin_icon_chiusure",
    label: "Chiusure",
    type: "text",
    defaultValue: "fas fa-file-invoice-dollar",
    description: "Icona menu Chiusure",
    category: "icon_admin"
  },
  {
    key: "admin_icon_crediti",
    label: "Crediti",
    type: "text",
    defaultValue: "fas fa-credit-card",
    description: "Icona menu Crediti",
    category: "icon_admin"
  },
  {
    key: "admin_icon_fatture",
    label: "Fatture",
    type: "text",
    defaultValue: "fas fa-file-invoice",
    description: "Icona menu Fatture",
    category: "icon_admin"
  },
  {
    key: "admin_icon_vouchers",
    label: "Voucher",
    type: "text",
    defaultValue: "fas fa-ticket-alt",
    description: "Icona menu Voucher",
    category: "icon_admin"
  },
  {
    key: "admin_icon_notifiche",
    label: "Notifiche",
    type: "text",
    defaultValue: "fas fa-bell",
    description: "Icona menu Notifiche",
    category: "icon_admin"
  },
  {
    key: "admin_icon_settings",
    label: "Impostazioni",
    type: "text",
    defaultValue: "fas fa-cog",
    description: "Icona menu Impostazioni",
    category: "icon_admin"
  },
  {
    key: "admin_icon_logout",
    label: "Esci",
    type: "text",
    defaultValue: "fas fa-sign-out-alt",
    description: "Icona bottone Esci",
    category: "icon_admin"
  },
  // Icone Operatore
  {
    key: "operator_icon_turno",
    label: "Apertura/Chiusura",
    type: "text",
    defaultValue: "fas fa-door-open",
    description: "Icona bottone Apertura/Chiusura",
    category: "icon_operator"
  },
  {
    key: "operator_icon_movimenti",
    label: "Movimenti",
    type: "text",
    defaultValue: "fas fa-exchange-alt",
    description: "Icona menu Movimenti",
    category: "icon_operator"
  },
  {
    key: "operator_icon_crediti",
    label: "Crediti",
    type: "text",
    defaultValue: "fas fa-credit-card",
    description: "Icona sottomenu Crediti",
    category: "icon_operator"
  },
  {
    key: "operator_icon_voucher",
    label: "Voucher",
    type: "text",
    defaultValue: "fas fa-ticket-alt",
    description: "Icona sottomenu Voucher",
    category: "icon_operator"
  },
  {
    key: "operator_icon_uscite",
    label: "Uscite",
    type: "text",
    defaultValue: "fas fa-hand-holding-usd",
    description: "Icona sottomenu Uscite",
    category: "icon_operator"
  },
  {
    key: "operator_icon_incassi",
    label: "Incassi",
    type: "text",
    defaultValue: "fas fa-cash-register",
    description: "Icona sottomenu Incassi",
    category: "icon_operator"
  },
  {
    key: "operator_icon_fatture",
    label: "Fatture",
    type: "text",
    defaultValue: "fas fa-file-invoice",
    description: "Icona menu Fatture",
    category: "icon_operator"
  },
  {
    key: "operator_icon_prezzi",
    label: "Prezzi",
    type: "text",
    defaultValue: "fas fa-tags",
    description: "Icona menu Prezzi",
    category: "icon_operator"
  },
  {
    key: "operator_icon_logout",
    label: "Esci",
    type: "text",
    defaultValue: "fas fa-sign-out-alt",
    description: "Icona bottone Esci",
    category: "icon_operator"
  },
  // Icone Azioni Distributori (Admin)
  {
    key: "station_action_icon_edit",
    label: "Modifica",
    type: "text",
    defaultValue: "fas fa-edit",
    description: "Icona azione Modifica distributore",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_prices",
    label: "Prezzi",
    type: "text",
    defaultValue: "fas fa-tag",
    description: "Icona azione Prezzi distributore",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_islands",
    label: "Isole e Pistole",
    type: "text",
    defaultValue: "fas fa-gas-pump",
    description: "Icona azione Isole e Pistole",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_tanks",
    label: "Cisterne",
    type: "text",
    defaultValue: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="1" y="7" width="22" height="11" rx="5.5" /><rect x="14" y="3" width="7" height="4" rx="1" /><rect x="4" y="18" width="3" height="3" rx="1" /><rect x="17" y="18" width="3" height="3" rx="1" /><path d="M9 15.5l2-3.5 2 3.5H9z" fill="white" /></svg>`,
    description: "Icona azione Cisterne distributore",
    category: "icon_station_actions"
  },
  {
    key: "station_action_icon_delete",
    label: "Elimina",
    type: "text",
    defaultValue: "fas fa-trash",
    description: "Icona azione Elimina distributore",
    category: "icon_station_actions"
  }
];
const DEFAULT_SETTINGS = UI_FIELDS.reduce((acc, field) => {
  acc[field.key] = field.defaultValue;
  return acc;
}, {});
let cachedSettings = null;
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function setupIconImageHandlers(form) {
  form.querySelectorAll("input[data-icon-image-input]").forEach((fileInput) => {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        Toast.show("Per favore seleziona un file immagine (PNG, JPG, SVG, ecc.).", "warning");
        e.target.value = "";
        return;
      }
      if (file.size > 500 * 1024) {
        Toast.show("L'immagine è troppo grande. Massimo 500KB.", "warning");
        e.target.value = "";
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        const fieldKey = fileInput.dataset.iconImageInput;
        const iconValue = `IMAGE_BASE64:${base64}`;
        const textInput = form.querySelector(`input[name="${fieldKey}"]`);
        if (textInput) {
          textInput.value = "";
        }
        const tempSettings = await fetchUiSettings();
        tempSettings[fieldKey] = iconValue;
        await applyIconsSettings(tempSettings);
        const panel = form.closest(".ui-appearance-panel");
        if (panel) {
          const currentSettings = await fetchUiSettings();
          const iconsSection = panel.querySelector('[data-appearance-section-content="icons"]');
          if (iconsSection) {
            iconsSection.innerHTML = renderIconsSection(currentSettings);
            setupIconImageHandlers(form);
          }
        }
      } catch (err) {
        console.error("Errore nel caricamento immagine:", err);
        Toast.show("Errore nel caricamento dell'immagine: " + err.message, "error");
        e.target.value = "";
      }
    });
  });
  form.querySelectorAll("button[data-icon-remove-image]").forEach((removeBtn) => {
    removeBtn.addEventListener("click", async (e) => {
      const fieldKey = removeBtn.dataset.iconRemoveImage;
      const field = UI_FIELDS.find((f) => f.key === fieldKey);
      const defaultValue = field?.defaultValue || "";
      const textInput = form.querySelector(`input[name="${fieldKey}"]`);
      if (textInput) {
        textInput.value = defaultValue;
      }
      const tempSettings = await fetchUiSettings();
      tempSettings[fieldKey] = defaultValue;
      await applyIconsSettings(tempSettings);
      const panel = form.closest(".ui-appearance-panel");
      if (panel) {
        const currentSettings = await fetchUiSettings();
        const iconsSection = panel.querySelector('[data-appearance-section-content="icons"]');
        if (iconsSection) {
          iconsSection.innerHTML = renderIconsSection(currentSettings);
          setupIconImageHandlers(form);
        }
      }
    });
  });
}
let settingsLoadPromise = null;
function preloadSettings() {
  if (settingsLoadPromise) return settingsLoadPromise;
  settingsLoadPromise = (async () => {
    if (cachedSettings) return cachedSettings;
    try {
      if (!cachedSettings) {
        cachedSettings = { ...DEFAULT_SETTINGS };
        applyDefaultsImmediately();
      }
      const { data, error } = await supabase.from("ui_settings").select("key,value");
      if (error) throw error;
      if (Array.isArray(data)) {
        data.forEach((row) => {
          if (row?.key && typeof row.value === "string") {
            cachedSettings[row.key] = row.value;
          }
        });
      }
      return cachedSettings;
    } catch (err) {
      console.warn("[UI Settings] Tabella mancante o non accessibile, uso defaults:", err.message);
      if (!cachedSettings) {
        cachedSettings = { ...DEFAULT_SETTINGS };
      }
      return cachedSettings;
    }
  })();
  return settingsLoadPromise;
}
function applyDefaultsImmediately() {
  const root = document.documentElement;
  UI_FIELDS.forEach((field) => {
    if (field.cssVar) {
      root.style.setProperty(field.cssVar, field.defaultValue);
    }
    if (field.key === "font_family") {
      document.body.style.fontFamily = field.defaultValue;
      root.style.setProperty("--app-font-family", field.defaultValue);
    }
  });
}
async function fetchUiSettings() {
  if (cachedSettings) return cachedSettings;
  return await preloadSettings();
}
async function saveUiSettings(values) {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  await safeSupabaseQuery(
    () => supabase.from("ui_settings").upsert(rows, { onConflict: "key" })
  );
  if (!cachedSettings) cachedSettings = { ...DEFAULT_SETTINGS };
  Object.assign(cachedSettings, values);
  await Promise.all([
    applyUiSettings(cachedSettings),
    applyLayoutSettings(cachedSettings),
    applyComponentsSettings(cachedSettings),
    applyFormsSettings(cachedSettings),
    applyIconsSettings(cachedSettings)
  ]);
}
async function applyUiSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;
  UI_FIELDS.forEach((field) => {
    const value = settings[field.key] ?? field.defaultValue;
    if (field.cssVar) {
      root.style.setProperty(field.cssVar, value);
    }
    if (field.key === "font_family") {
      document.body.style.fontFamily = value;
      root.style.setProperty("--app-font-family", value);
    }
  });
  document.querySelectorAll(".login-tagline").forEach((el) => {
    el.textContent = settings.login_tagline || DEFAULT_SETTINGS.login_tagline;
  });
}
function watchSettingsTab() {
  const observer = new MutationObserver(() => {
    const shell = document.querySelector(".settings-shell");
    const tabs = document.querySelector(".settings-tabs");
    if (shell && tabs && !shell.dataset.uiAppearanceReady) {
      shell.dataset.uiAppearanceReady = "true";
      injectAppearanceTab(shell, tabs);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
function injectAppearanceTab(shell, tabs) {
  const panelsWrapper = shell.querySelector(".content-box[data-settings-panel]");
  if (!tabs || !panelsWrapper) return;
  const tabBtn = document.createElement("button");
  tabBtn.className = "settings-tab";
  tabBtn.dataset.settingsTab = "appearance";
  tabBtn.innerHTML = `<i class="fas fa-palette"></i> Aspetto`;
  const panel = document.createElement("div");
  panel.className = "content-box settings-panel";
  panel.dataset.settingsPanel = "appearance";
  panel.innerHTML = `<div class="ui-appearance-panel"><p>Caricamento impostazioni...</p></div>`;
  tabs.appendChild(tabBtn);
  shell.appendChild(panel);
  tabBtn.addEventListener("click", () => activateSettingsTab("appearance", shell));
  renderAppearancePanel(panel);
  ensureTabSwitching(shell);
}
function ensureTabSwitching(shell) {
  shell.querySelectorAll(".settings-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.settingsTab;
      activateSettingsTab(target, shell);
    });
  });
}
function activateSettingsTab(targetKey, shell) {
  shell.querySelectorAll(".settings-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.settingsTab === targetKey);
  });
  shell.querySelectorAll(".settings-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsPanel === targetKey);
  });
}
async function renderAppearancePanel(panel) {
  const settings = await fetchUiSettings();
  const colorFields = UI_FIELDS.filter((f) => f.type === "color");
  const typographyFields = UI_FIELDS.filter((f) => f.key === "font_family" || f.key === "button_radius");
  const textFields = UI_FIELDS.filter((f) => f.key === "login_tagline");
  const renderColorField = (field) => {
    const value = settings[field.key] ?? field.defaultValue;
    const hexValue = value.toUpperCase();
    return `
      <div class="ui-color-field">
        <label class="ui-color-label">
          <span class="ui-color-label-text">${field.label}</span>
          <small class="ui-color-label-desc">${field.description}</small>
        </label>
        <div class="ui-color-controls">
          <input 
            type="color" 
            name="${field.key}" 
            value="${value}" 
            class="ui-color-picker" 
            title="Clicca per selezionare un colore"
          />
          <input 
            type="text" 
            name="${field.key}_hex" 
            value="${hexValue}" 
            class="ui-color-hex" 
            placeholder="#000000"
            maxlength="7"
            pattern="#[0-9A-Fa-f]{6}"
            title="Inserisci un codice colore esadecimale (es. #0A2342)"
          />
        </div>
      </div>
    `;
  };
  const renderTextField = (field) => {
    const value = settings[field.key] ?? field.defaultValue;
    return `
      <div class="ui-text-field">
        <label class="ui-text-label">
          <span>${field.label}</span>
          <small>${field.description}</small>
        </label>
        <input 
          type="text" 
          name="${field.key}" 
          value="${value}" 
          class="ui-text-input" 
        />
      </div>
    `;
  };
  panel.innerHTML = `
    <div class="ui-appearance-panel">
      <div class="ui-header-box">
        <h3 class="ui-header-title">Personalizza aspetto grafico</h3>
        <p class="ui-header-desc">
          Configura colori, tipografia, layout e struttura dell'interfaccia. Le modifiche hanno effetto immediato.
        </p>
      </div>

      <!-- Tab interni per organizzare le sezioni -->
      <div class="ui-appearance-tabs">
        <button class="ui-appearance-tab active" data-appearance-section="colors">
          <i class="fas fa-palette"></i>
          <span>Colori</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="typography">
          <i class="fas fa-font"></i>
          <span>Tipografia</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="components">
          <i class="fas fa-cube"></i>
          <span>Componenti</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="layout-admin">
          <i class="fas fa-user-shield"></i>
          <span>Layout Admin</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="layout-operator">
          <i class="fas fa-user"></i>
          <span>Layout Operatore</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="forms">
          <i class="fas fa-edit"></i>
          <span>Form</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="themes">
          <i class="fas fa-paint-brush"></i>
          <span>Temi</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="icons">
          <i class="fas fa-icons"></i>
          <span>Icone</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="dashboard">
          <i class="fas fa-chart-line"></i>
          <span>Dashboard</span>
        </button>
        <button class="ui-appearance-tab" data-appearance-section="advanced">
          <i class="fas fa-cog"></i>
          <span>Avanzate</span>
        </button>
      </div>

      <form id="ui-appearance-form" class="ui-appearance-form">
        <!-- Sezione Colori -->
        <div class="ui-appearance-section active" data-appearance-section-content="colors">
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-palette"></i>
              <span>Palette Colori</span>
            </h4>
            <p class="ui-section-hint">Personalizza i colori principali dell'applicazione</p>
            <div class="ui-colors-grid">
              ${colorFields.map(renderColorField).join("")}
            </div>
          </div>
        </div>

        <!-- Sezione Tipografia -->
        <div class="ui-appearance-section" data-appearance-section-content="typography">
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-font"></i>
              <span>Tipografia e Stile</span>
            </h4>
            <div class="ui-typography-grid">
              ${typographyFields.map(renderTextField).join("")}
            </div>
          </div>
          <div class="ui-section-box">
            <h4 class="ui-section-title">
              <i class="fas fa-text-height"></i>
              <span>Testi Interfaccia</span>
            </h4>
            <div class="ui-text-fields-wrapper">
              ${textFields.map(renderTextField).join("")}
            </div>
          </div>
        </div>

        <!-- Sezione Componenti -->
        <div class="ui-appearance-section" data-appearance-section-content="components">
          ${renderComponentsSection(settings)}
        </div>

        <!-- Sezione Layout Admin -->
        <div class="ui-appearance-section" data-appearance-section-content="layout-admin">
          ${renderAdminLayoutSection(settings)}
        </div>

        <!-- Sezione Layout Operatore -->
        <div class="ui-appearance-section" data-appearance-section-content="layout-operator">
          ${renderOperatorLayoutSection(settings)}
        </div>

        <!-- Sezione Form -->
        <div class="ui-appearance-section" data-appearance-section-content="forms">
          ${renderFormsSection(settings)}
        </div>

        <!-- Sezione Temi -->
        <div class="ui-appearance-section" data-appearance-section-content="themes">
          ${renderThemesSection()}
        </div>

        <!-- Sezione Icone -->
        <div class="ui-appearance-section" data-appearance-section-content="icons">
          ${renderIconsSection(settings)}
        </div>

        <!-- Sezione Dashboard Config -->
        <div class="ui-appearance-section" data-appearance-section-content="dashboard">
          <!-- Will be populated by renderConfigPanel -->
        </div>

        <!-- Sezione Avanzate -->
        <div class="ui-appearance-section" data-appearance-section-content="advanced">
          ${renderAdvancedSection(settings)}
        </div>

        <!-- Azioni -->
        <div class="ui-actions-box">
          <p class="ui-actions-info">
            <i class="fas fa-info-circle"></i>
            Le modifiche sono visibili immediatamente. Salva per applicarle a tutti gli utenti.
          </p>
          <div class="ui-actions-buttons">
            <button type="button" class="menu-button secondary" data-ui-reset>
              <i class="fas fa-undo"></i> 
              <span>Ripristina default</span>
            </button>
            <button type="submit" class="menu-button primary">
              <i class="fas fa-save"></i> 
              <span>Salva impostazioni</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  `;
  const form = panel.querySelector("#ui-appearance-form");
  const resetBtn2 = panel.querySelector("[data-ui-reset]");
  panel.querySelectorAll(".ui-appearance-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const section = tab.dataset.appearanceSection;
      panel.querySelectorAll(".ui-appearance-tab").forEach((t) => t.classList.remove("active"));
      panel.querySelectorAll(".ui-appearance-section").forEach((s) => s.classList.remove("active"));
      tab.classList.add("active");
      panel.querySelector(`[data-appearance-section-content="${section}"]`)?.classList.add("active");
    });
  });
  form.querySelectorAll(".ui-color-picker").forEach((picker) => {
    const fieldKey = picker.name;
    const hexInput = form.querySelector(`input[name="${fieldKey}_hex"]`);
    picker.addEventListener("input", (e) => {
      const value = e.target.value.toUpperCase();
      if (hexInput) hexInput.value = value;
      const field = UI_FIELDS.find((f) => f.key === fieldKey);
      if (field?.cssVar) {
        document.documentElement.style.setProperty(field.cssVar, value);
      }
    });
  });
  form.querySelectorAll(".ui-color-hex").forEach((hexInput) => {
    const fieldKey = hexInput.name.replace("_hex", "");
    const picker = form.querySelector(`input[name="${fieldKey}"]`);
    if (picker) {
      hexInput.addEventListener("input", (e) => {
        const hex = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          picker.value = hex;
          picker.dispatchEvent(new Event("input"));
        }
      });
    }
  });
  const dashboardContainer = panel.querySelector('[data-appearance-section-content="dashboard"]');
  if (dashboardContainer) {
    renderConfigPanel(dashboardContainer);
  }
  form.addEventListener("input", (event) => {
    const { name, value } = event.target;
    if (name.endsWith("_hex")) return;
    const field = UI_FIELDS.find((f) => f.key === name);
    if (field?.cssVar) {
      document.documentElement.style.setProperty(field.cssVar, value);
    }
    if (name === "font_family") {
      document.body.style.fontFamily = value;
    }
    if (name === "login_tagline") {
      document.querySelectorAll(".login-tagline").forEach((el) => {
        el.textContent = value;
      });
    }
    applyComponentsSettings({ [name]: value });
    applyFormsSettings({ [name]: value });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {};
    UI_FIELDS.forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });
    [
      ...COMPONENTS_FIELDS.buttons,
      ...COMPONENTS_FIELDS.tables,
      ...COMPONENTS_FIELDS.cards,
      ...COMPONENTS_FIELDS.modals
    ].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });
    [...FORMS_FIELDS.inputs, ...FORMS_FIELDS.layout].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });
    const responsiveBreakpoint = formData.get("responsive_mobile_breakpoint");
    const responsiveCollapse = formData.get("responsive_sidebar_collapse");
    if (responsiveBreakpoint) payload.responsive_mobile_breakpoint = responsiveBreakpoint;
    if (responsiveCollapse) payload.responsive_sidebar_collapse = responsiveCollapse;
    [
      ...ADMIN_LAYOUT_FIELDS.sidebar,
      ...ADMIN_LAYOUT_FIELDS.header,
      ...ADMIN_LAYOUT_FIELDS.menu,
      ...ADMIN_LAYOUT_FIELDS.spacing
    ].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });
    [...OPERATOR_LAYOUT_FIELDS.header, ...OPERATOR_LAYOUT_FIELDS.menu].forEach((field) => {
      const value = formData.get(field.key);
      payload[field.key] = value || field.defaultValue;
    });
    try {
      form.classList.add("pending");
      await saveUiSettings(payload);
      const successMsg = document.createElement("div");
      successMsg.className = "ui-success-message";
      successMsg.innerHTML = '<i class="fas fa-check-circle"></i> Impostazioni salvate con successo!';
      form.parentElement.insertBefore(successMsg, form);
      setTimeout(() => successMsg.remove(), 3e3);
    } catch (err) {
      console.error("[UI Settings] Errore salvataggio:", err);
      Toast.show("Errore nel salvataggio delle impostazioni: " + err.message, "error");
    } finally {
      form.classList.remove("pending");
    }
  });
  resetBtn2.addEventListener("click", async () => {
    const confirmed = await openConfirmModal("Ripristinare tutti i valori di default (colori, layout, ecc.)?");
    if (!confirmed) return;
    try {
      form.classList.add("pending");
      const defaults = { ...DEFAULT_SETTINGS };
      [
        ...COMPONENTS_FIELDS.buttons,
        ...COMPONENTS_FIELDS.tables,
        ...COMPONENTS_FIELDS.cards,
        ...COMPONENTS_FIELDS.modals
      ].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...FORMS_FIELDS.inputs, ...FORMS_FIELDS.layout].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [
        ...ADMIN_LAYOUT_FIELDS.sidebar,
        ...ADMIN_LAYOUT_FIELDS.header,
        ...ADMIN_LAYOUT_FIELDS.menu,
        ...ADMIN_LAYOUT_FIELDS.spacing
      ].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      [...OPERATOR_LAYOUT_FIELDS.header, ...OPERATOR_LAYOUT_FIELDS.menu].forEach((f) => {
        defaults[f.key] = f.defaultValue;
      });
      await saveUiSettings(defaults);
      renderAppearancePanel(panel);
      Toast.show("Impostazioni ripristinate.", "success");
    } catch (err) {
      console.error(err);
      Toast.show("Impossibile ripristinare: " + err.message, "error");
    } finally {
      form.classList.remove("pending");
    }
  });
  form.querySelectorAll(".ui-color-picker").forEach((picker) => {
    const fieldKey = picker.name;
    if (fieldKey.includes("component_")) {
      const hexInput = form.querySelector(`input[name="${fieldKey}_hex"]`);
      picker.addEventListener("input", (e) => {
        const value = e.target.value.toUpperCase();
        if (hexInput) hexInput.value = value;
        applyComponentsSettings({ [fieldKey]: value });
      });
    }
  });
  form.querySelectorAll(".ui-color-hex").forEach((hexInput) => {
    const fieldKey = hexInput.name.replace("_hex", "");
    if (fieldKey.includes("component_")) {
      const picker = form.querySelector(`input[name="${fieldKey}"]`);
      hexInput.addEventListener("input", (e) => {
        let value = e.target.value.trim().replace("#", "").toUpperCase();
        if (/^[0-9A-F]{6}$/i.test(value)) {
          value = "#" + value;
          if (picker) picker.value = value;
          applyComponentsSettings({ [fieldKey]: value });
        }
      });
      hexInput.addEventListener("blur", (e) => {
        let value = e.target.value.trim().replace("#", "").toUpperCase();
        if (!/^[0-9A-F]{6}$/i.test(value)) {
          const pickerValue = picker?.value || "#000000";
          e.target.value = pickerValue.toUpperCase();
        }
      });
    }
  });
  form.addEventListener("change", () => {
    applyLayoutSettings();
    applyComponentsSettings();
    applyFormsSettings();
    applyIconsSettings();
  });
  form.querySelectorAll("input[data-icon-image-input]").forEach((fileInput) => {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        Toast.show("Per favore seleziona un file immagine (PNG, JPG, SVG, ecc.).", "warning");
        e.target.value = "";
        return;
      }
      if (file.size > 500 * 1024) {
        Toast.show("L'immagine è troppo grande. Massimo 500KB.", "warning");
        e.target.value = "";
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        const fieldKey = fileInput.dataset.iconImageInput;
        const iconValue = `IMAGE_BASE64:${base64}`;
        const textInput = form.querySelector(`input[name="${fieldKey}"]`);
        if (textInput) {
          textInput.value = "";
        }
        const tempSettings = await fetchUiSettings();
        tempSettings[fieldKey] = iconValue;
        await applyIconsSettings(tempSettings);
        const panel2 = form.closest(".ui-appearance-panel");
        if (panel2) {
          const currentSettings = await fetchUiSettings();
          const iconsSection = panel2.querySelector('[data-appearance-section-content="icons"]');
          if (iconsSection) {
            iconsSection.innerHTML = renderIconsSection(currentSettings);
            setupIconImageHandlers(form);
          }
        }
      } catch (err) {
        console.error("Errore nel caricamento immagine:", err);
        Toast.show("Errore nel caricamento dell'immagine: " + err.message, "error");
        e.target.value = "";
      }
    });
  });
  form.querySelectorAll("button[data-icon-remove-image]").forEach((removeBtn) => {
    removeBtn.addEventListener("click", async (e) => {
      const fieldKey = removeBtn.dataset.iconRemoveImage;
      const field = UI_FIELDS.find((f) => f.key === fieldKey);
      const defaultValue = field?.defaultValue || "";
      const textInput = form.querySelector(`input[name="${fieldKey}"]`);
      if (textInput) {
        textInput.value = defaultValue;
      }
      const tempSettings = await fetchUiSettings();
      tempSettings[fieldKey] = defaultValue;
      await applyIconsSettings(tempSettings);
      const panel2 = form.closest(".ui-appearance-panel");
      if (panel2) {
        const currentSettings = await fetchUiSettings();
        const iconsSection = panel2.querySelector('[data-appearance-section-content="icons"]');
        if (iconsSection) {
          iconsSection.innerHTML = renderIconsSection(currentSettings);
          setupIconImageHandlers(form);
        }
      }
    });
  });
  form.querySelectorAll("input[data-icon-field]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value.trim();
      const field = e.target.closest(".ui-layout-field");
      if (!field) return;
      const fieldKey = field.dataset.iconFieldKey;
      const currentSettings = cachedSettings || {};
      if (currentSettings[fieldKey] && currentSettings[fieldKey].startsWith("IMAGE_BASE64:")) {
        return;
      }
      const existingPreview = field.querySelector(".ui-icon-preview");
      if (existingPreview) existingPreview.remove();
      if (value) {
        const isSvg = value.startsWith("<svg") || value.startsWith("<?xml");
        const preview = document.createElement("div");
        preview.className = "ui-icon-preview";
        preview.style.cssText = "margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);";
        if (isSvg) {
          preview.innerHTML = `
            <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
            <div style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">
              ${value}
            </div>
          `;
        } else {
          preview.innerHTML = `
            <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
            <i class="${value}" style="font-size: 20px; color: var(--primary-color);"></i>
          `;
        }
        field.appendChild(preview);
      }
      applyIconsSettings({ [e.target.name]: value });
    });
  });
  panel.querySelectorAll(".ui-theme-apply").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const themeKey = btn.dataset.themeKey;
      const theme = PREDEFINED_THEMES[themeKey];
      if (!theme) return;
      const confirmed = await openConfirmModal(`Applicare il tema "${theme.name}"? I colori attuali verranno sostituiti.`);
      if (!confirmed) return;
      try {
        form.classList.add("pending");
        const themePayload = {};
        Object.entries(theme).forEach(([key, value]) => {
          if (key !== "name") {
            themePayload[key] = value;
          }
        });
        await saveUiSettings(themePayload);
        renderAppearancePanel(panel);
        Toast.show(`Tema "${theme.name}" applicato con successo!`, "success");
      } catch (err) {
        Toast.show("Errore nell'applicazione del tema: " + err.message, "error");
      } finally {
        form.classList.remove("pending");
      }
    });
  });
  const exportBtn = panel.querySelector("#export-config-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      try {
        const allSettings = await fetchUiSettings();
        const config = {
          version: "1.0",
          exported_at: (/* @__PURE__ */ new Date()).toISOString(),
          settings: allSettings
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `neofuel-ui-config-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Toast.show("Configurazione esportata con successo!", "success");
      } catch (err) {
        Toast.show("Errore nell'export: " + err.message, "error");
      }
    });
  }
  const importInput = panel.querySelector("#import-config-input");
  if (importInput) {
    importInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text);
        if (!config.settings || typeof config.settings !== "object") {
          throw new Error("Formato file non valido");
        }
        const confirmed = await openConfirmModal(`Importare la configurazione? Tutte le impostazioni attuali verranno sostituite.`);
        if (!confirmed) {
          e.target.value = "";
          return;
        }
        form.classList.add("pending");
        await saveUiSettings(config.settings);
        renderAppearancePanel(panel);
        Toast.show("Configurazione importata con successo!", "success");
      } catch (err) {
        Toast.show("Errore nell'import: " + err.message, "error");
      } finally {
        form.classList.remove("pending");
        e.target.value = "";
      }
    });
  }
  const appearanceForm = panel.querySelector("#ui-appearance-form");
  if (appearanceForm) {
    setupIconImageHandlers(appearanceForm);
  }
}
const ADMIN_LAYOUT_FIELDS = {
  sidebar: [
    {
      key: "admin_sidebar_width",
      label: "Larghezza Sidebar",
      type: "text",
      defaultValue: "280px",
      description: "Larghezza della sidebar (es. 280px, 20rem)"
    },
    {
      key: "admin_sidebar_show_header",
      label: "Mostra Header Sidebar",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi l'header della sidebar"
    },
    {
      key: "admin_sidebar_show_footer",
      label: "Mostra Footer Sidebar",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il footer con info utente"
    }
  ],
  header: [
    {
      key: "admin_header_show_logo",
      label: "Mostra Logo Header",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il logo nell'header"
    },
    {
      key: "admin_header_logo_height",
      label: "Altezza Logo",
      type: "text",
      defaultValue: "50px",
      description: "Altezza del logo (es. 50px, 3rem)"
    }
  ],
  menu: [
    {
      key: "admin_menu_show_dashboard",
      label: "Mostra Dashboard",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Dashboard"
    },
    {
      key: "admin_menu_show_stations",
      label: "Mostra Distributori",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Distributori"
    },
    {
      key: "admin_menu_show_operators",
      label: "Mostra Operatori",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Operatori"
    },
    {
      key: "admin_menu_show_chiusure",
      label: "Mostra Chiusure",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Chiusure"
    },
    {
      key: "admin_menu_show_crediti",
      label: "Mostra Crediti",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Crediti"
    },
    {
      key: "admin_menu_show_fatture",
      label: "Mostra Fatture",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Fatture"
    },
    {
      key: "admin_menu_show_vouchers",
      label: "Mostra Voucher",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Voucher"
    },
    {
      key: "admin_menu_show_notifiche",
      label: "Mostra Notifiche",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Notifiche"
    }
  ],
  spacing: [
    {
      key: "admin_content_padding",
      label: "Padding Contenuto",
      type: "text",
      defaultValue: "24px",
      description: "Spaziatura interna del contenuto principale (es. 24px, 1.5rem)"
    },
    {
      key: "admin_section_gap",
      label: "Spaziatura Sezioni",
      type: "text",
      defaultValue: "24px",
      description: "Spazio tra le sezioni (es. 24px, 1.5rem)"
    }
  ]
};
const COMPONENTS_FIELDS = {
  buttons: [
    {
      key: "component_button_padding",
      label: "Padding Bottoni",
      type: "text",
      defaultValue: "12px 24px",
      description: "Spaziatura interna bottoni (es. 12px 24px, 10px 20px)"
    },
    {
      key: "component_button_radius",
      label: "Raggio Bordi Bottoni",
      type: "text",
      defaultValue: "6px",
      description: "Bordi arrotondati bottoni (es. 6px, 999px per pill)"
    },
    {
      key: "component_button_font_size",
      label: "Dimensione Font Bottoni",
      type: "text",
      defaultValue: "1rem",
      description: "Dimensione testo bottoni (es. 1rem, 0.95rem)"
    },
    {
      key: "component_button_font_weight",
      label: "Spessore Font Bottoni",
      type: "select",
      defaultValue: "600",
      options: [
        { value: "400", label: "Normale (400)" },
        { value: "500", label: "Medio (500)" },
        { value: "600", label: "Semi-bold (600)" },
        { value: "700", label: "Bold (700)" }
      ],
      description: "Spessore del testo nei bottoni"
    }
  ],
  tables: [
    {
      key: "component_table_header_bg",
      label: "Sfondo Header Tabelle",
      type: "color",
      cssVar: "--table-header-bg",
      defaultValue: "#F4F6F8",
      description: "Colore di sfondo dell'header delle tabelle"
    },
    {
      key: "component_table_header_color",
      label: "Colore Testo Header",
      type: "color",
      cssVar: "--table-header-color",
      defaultValue: "#333333",
      description: "Colore del testo nell'header delle tabelle"
    },
    {
      key: "component_table_hover_bg",
      label: "Sfondo Hover Righe",
      type: "color",
      cssVar: "--table-hover-bg",
      defaultValue: "#F8FAFC",
      description: "Colore di sfondo al passaggio del mouse sulle righe"
    },
    {
      key: "component_table_padding",
      label: "Padding Celle",
      type: "text",
      defaultValue: "16px 24px",
      description: "Spaziatura interna celle (es. 16px 24px)"
    }
  ],
  cards: [
    {
      key: "component_card_padding",
      label: "Padding Card",
      type: "text",
      defaultValue: "24px",
      description: "Spaziatura interna card/box (es. 24px, 20px)"
    },
    {
      key: "component_card_radius",
      label: "Raggio Bordi Card",
      type: "text",
      defaultValue: "16px",
      description: "Bordi arrotondati card (es. 16px, 12px)"
    },
    {
      key: "component_card_shadow",
      label: "Intensità Ombra",
      type: "select",
      defaultValue: "md",
      options: [
        { value: "none", label: "Nessuna" },
        { value: "sm", label: "Piccola" },
        { value: "md", label: "Media (default)" },
        { value: "lg", label: "Grande" }
      ],
      description: "Intensità dell'ombra delle card"
    }
  ],
  modals: [
    {
      key: "component_modal_max_width",
      label: "Larghezza Massima Modali",
      type: "text",
      defaultValue: "1100px",
      description: "Larghezza massima modali (es. 1100px, 90vw)"
    },
    {
      key: "component_modal_padding",
      label: "Padding Modali",
      type: "text",
      defaultValue: "24px",
      description: "Spaziatura interna modali (es. 24px, 20px)"
    },
    {
      key: "component_modal_radius",
      label: "Raggio Bordi Modali",
      type: "text",
      defaultValue: "16px",
      description: "Bordi arrotondati modali (es. 16px, 12px)"
    },
    {
      key: "component_modal_overlay_opacity",
      label: "Opacità Sfondo Modale",
      type: "text",
      defaultValue: "0.6",
      description: "Opacità dello sfondo scuro (0-1, es. 0.6)"
    }
  ]
};
const FORMS_FIELDS = {
  inputs: [
    {
      key: "form_input_padding",
      label: "Padding Input",
      type: "text",
      defaultValue: "12px 16px",
      description: "Spaziatura interna campi input (es. 12px 16px)"
    },
    {
      key: "form_input_radius",
      label: "Raggio Bordi Input",
      type: "text",
      defaultValue: "6px",
      description: "Bordi arrotondati campi input"
    },
    {
      key: "form_input_border_width",
      label: "Spessore Bordo Input",
      type: "text",
      defaultValue: "2px",
      description: "Spessore del bordo (es. 2px, 1px)"
    },
    {
      key: "form_input_font_size",
      label: "Dimensione Font Input",
      type: "text",
      defaultValue: "1rem",
      description: "Dimensione testo campi input"
    },
    {
      key: "form_label_font_size",
      label: "Dimensione Font Label",
      type: "text",
      defaultValue: "0.95rem",
      description: "Dimensione testo etichette"
    },
    {
      key: "form_label_font_weight",
      label: "Spessore Font Label",
      type: "select",
      defaultValue: "600",
      options: [
        { value: "400", label: "Normale (400)" },
        { value: "500", label: "Medio (500)" },
        { value: "600", label: "Semi-bold (600)" },
        { value: "700", label: "Bold (700)" }
      ],
      description: "Spessore del testo delle etichette"
    }
  ],
  layout: [
    {
      key: "form_group_gap",
      label: "Spaziatura Gruppi Form",
      type: "text",
      defaultValue: "20px",
      description: "Spazio tra i gruppi di campi (es. 20px)"
    },
    {
      key: "form_row_gap",
      label: "Spaziatura Righe Form",
      type: "text",
      defaultValue: "16px",
      description: "Spazio tra le righe nei form a griglia"
    }
  ]
};
const PREDEFINED_THEMES = {
  light: {
    name: "Chiaro (Default)",
    primary_color: "#0A2342",
    accent_color: "#8DC63F",
    bg_body: "#F4F6F8",
    bg_sidebar: "#0A2342",
    sidebar_hover: "#123561",
    text_main: "#333333"
  },
  dark: {
    name: "Scuro",
    primary_color: "#8DC63F",
    accent_color: "#8DC63F",
    bg_body: "#1a1a1a",
    bg_sidebar: "#0d1117",
    sidebar_hover: "#161b22",
    text_main: "#e6edf3"
  },
  blue: {
    name: "Blu Professionale",
    primary_color: "#1e40af",
    accent_color: "#3b82f6",
    bg_body: "#f0f9ff",
    bg_sidebar: "#1e40af",
    sidebar_hover: "#2563eb",
    text_main: "#1e293b"
  },
  green: {
    name: "Verde Naturale",
    primary_color: "#059669",
    accent_color: "#10b981",
    bg_body: "#f0fdf4",
    bg_sidebar: "#059669",
    sidebar_hover: "#047857",
    text_main: "#064e3b"
  }
};
const OPERATOR_LAYOUT_FIELDS = {
  header: [
    {
      key: "operator_header_show_logo",
      label: "Mostra Logo Header",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il logo nell'header operatore"
    },
    {
      key: "operator_header_logo_height",
      label: "Altezza Logo",
      type: "text",
      defaultValue: "40px",
      description: "Altezza del logo (es. 40px, 2.5rem)"
    },
    {
      key: "operator_header_show_station_badge",
      label: "Mostra Badge Stazione",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il badge con il nome della stazione"
    },
    {
      key: "operator_header_show_logout",
      label: "Mostra Bottone Logout",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il bottone di logout nell'header"
    }
  ],
  menu: [
    {
      key: "operator_menu_show_turno",
      label: "Mostra Apertura/Chiusura",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi il bottone principale Apertura/Chiusura turno"
    },
    {
      key: "operator_menu_show_movimenti",
      label: "Mostra Movimenti",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la sezione Movimenti (accordion)"
    },
    {
      key: "operator_menu_show_crediti",
      label: "Mostra Crediti",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Crediti nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_voucher",
      label: "Mostra Voucher",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Voucher nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_uscite",
      label: "Mostra Uscite",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Uscite nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_incassi",
      label: "Mostra Incassi",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce Incassi nel sottomenu Movimenti"
    },
    {
      key: "operator_menu_show_fatture",
      label: "Mostra Fatture",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Fatture"
    },
    {
      key: "operator_menu_show_prezzi",
      label: "Mostra Prezzi",
      type: "checkbox",
      defaultValue: "true",
      description: "Mostra/nascondi la voce menu Prezzi"
    }
  ]
};
function renderAdminLayoutSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-bars"></i>
          <span>Sidebar</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.sidebar.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-heading"></i>
          <span>Header</span>
        </h4>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.header.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list"></i>
          <span>Menu di Navigazione</span>
        </h4>
        <p class="ui-section-hint">Seleziona quali voci del menu mostrare nella sidebar admin</p>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.menu.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>



      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-arrows-alt"></i>
          <span>Spaziature</span>
        </h4>
        <p class="ui-section-hint">Personalizza padding e margini dell'area admin</p>
        <div class="ui-layout-fields">
          ${ADMIN_LAYOUT_FIELDS.spacing.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}
function renderComponentsSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-mouse-pointer"></i>
          <span>Bottoni</span>
        </h4>
        <p class="ui-section-hint">Personalizza stile e dimensioni dei bottoni</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.buttons.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-table"></i>
          <span>Tabelle</span>
        </h4>
        <p class="ui-section-hint">Configura colori e stile delle tabelle</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.tables.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-square"></i>
          <span>Card e Box</span>
        </h4>
        <p class="ui-section-hint">Personalizza card, box e contenitori</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.cards.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-window-maximize"></i>
          <span>Modali</span>
        </h4>
        <p class="ui-section-hint">Configura dimensioni e stile delle finestre modali</p>
        <div class="ui-layout-fields">
          ${COMPONENTS_FIELDS.modals.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}
function renderFormsSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-keyboard"></i>
          <span>Campi Input</span>
        </h4>
        <p class="ui-section-hint">Personalizza stile e dimensioni dei campi di input</p>
        <div class="ui-layout-fields">
          ${FORMS_FIELDS.inputs.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-th"></i>
          <span>Layout Form</span>
        </h4>
        <p class="ui-section-hint">Configura spaziature e layout dei form</p>
        <div class="ui-layout-fields">
          ${FORMS_FIELDS.layout.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}
function renderThemesSection(settings) {
  const themesList = Object.entries(PREDEFINED_THEMES).map(([key, theme]) => `
    <div class="ui-theme-card" data-theme-key="${key}">
      <div class="ui-theme-preview">
        <div class="ui-theme-preview-sidebar" style="background: ${theme.bg_sidebar};"></div>
        <div class="ui-theme-preview-main" style="background: ${theme.bg_body};">
          <div class="ui-theme-preview-header" style="background: ${theme.primary_color};"></div>
          <div class="ui-theme-preview-card" style="background: white; border-left: 4px solid ${theme.accent_color};"></div>
        </div>
      </div>
      <h5 class="ui-theme-name">${theme.name}</h5>
      <button type="button" class="menu-button secondary ui-theme-apply" data-theme-key="${key}">
        <i class="fas fa-check"></i> Applica Tema
      </button>
    </div>
  `).join("");
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-paint-brush"></i>
          <span>Temi Predefiniti</span>
        </h4>
        <p class="ui-section-hint">Scegli un tema predefinito per applicare rapidamente una combinazione di colori</p>
        <div class="ui-themes-grid">
          ${themesList}
        </div>
      </div>

      <div class="ui-section-box" style="background: var(--bg-body); border: 1px dashed var(--border-color);">
        <p style="margin: 0; color: var(--text-secondary); text-align: center; font-style: italic;">
          <i class="fas fa-info-circle"></i>
          I temi applicano solo i colori. Layout e componenti rimangono invariati.
        </p>
      </div>
    </div>
  `;
}
function renderIconsSection(settings) {
  const adminIconFields = UI_FIELDS.filter((f) => f.category === "icon_admin");
  const operatorIconFields = UI_FIELDS.filter((f) => f.category === "icon_operator");
  const stationActionIconFields = UI_FIELDS.filter((f) => f.category === "icon_station_actions");
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-shield-alt"></i>
          <span>Icone Menu Admin</span>
        </h4>
        <p class="ui-section-hint">Personalizza le icone dei menu nella sidebar admin. Inserisci una classe Font Awesome (es: "fas fa-chart-line") o codice SVG inline.</p>
        <div class="ui-layout-fields">
          ${adminIconFields.map((f) => renderIconField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-user"></i>
          <span>Icone Menu Operatore</span>
        </h4>
        <p class="ui-section-hint">Personalizza le icone dei menu nell'area operatore. Inserisci una classe Font Awesome (es: "fas fa-door-open") o codice SVG inline.</p>
        <div class="ui-layout-fields">
          ${operatorIconFields.map((f) => renderIconField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-gas-pump"></i>
          <span>Icone Azioni Distributori</span>
        </h4>
        <p class="ui-section-hint">Personalizza le icone delle azioni nella sezione Distributori (Modifica, Prezzi, Isole e Pistole, Cisterne, Elimina).</p>
        <div class="ui-layout-fields">
          ${stationActionIconFields.map((f) => renderIconField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}
function renderIconField(field, settings) {
  const value = settings[field.key] || field.defaultValue || "";
  const isSvg = value.trim().startsWith("<svg") || value.trim().startsWith("<?xml");
  const isImage = value.trim().startsWith("IMAGE_BASE64:");
  const imageBase64 = isImage ? value.replace("IMAGE_BASE64:", "") : "";
  const displayValue = isImage ? "" : value;
  return `
    <div class="ui-layout-field" data-icon-field-key="${field.key}">
      <label class="ui-text-label">
        <span>${field.label}</span>
        <small>${field.description}</small>
      </label>
      <div style="display: flex; gap: 8px; align-items: flex-start;">
        <input 
          type="text" 
          name="${field.key}" 
          value="${escapeHtml(displayValue)}" 
          class="ui-text-input" 
          style="flex: 1;"
          placeholder="${field.defaultValue || ""}"
          data-icon-field="true"
        />
        <label class="menu-button secondary" style="cursor: pointer; margin: 0; white-space: nowrap; padding: 8px 16px;">
          <i class="fas fa-image"></i> Carica Immagine
          <input 
            type="file" 
            accept="image/*" 
            style="display: none;" 
            data-icon-image-input="${field.key}"
          />
        </label>
        ${isImage ? `
          <button type="button" class="menu-button secondary" style="margin: 0; padding: 8px 16px;" data-icon-remove-image="${field.key}">
            <i class="fas fa-times"></i> Rimuovi
          </button>
        ` : ""}
      </div>
      ${isImage ? `
        <div class="ui-icon-preview" style="margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima Immagine:</small>
          <img src="data:image/png;base64,${imageBase64}" style="max-width: 40px; max-height: 40px; object-fit: contain;" alt="Icona" />
        </div>
      ` : isSvg ? `
        <div class="ui-icon-preview" style="margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
          <div style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">
            ${value}
          </div>
        </div>
      ` : value ? `
        <div class="ui-icon-preview" style="margin-top: 8px; padding: 8px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <small style="display: block; margin-bottom: 4px; color: var(--text-secondary);">Anteprima:</small>
          <i class="${value}" style="font-size: 20px; color: var(--primary-color);"></i>
        </div>
      ` : ""}
    </div>
  `;
}
function renderAdvancedSection(settings) {
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-download"></i>
          <span>Export / Import Configurazione</span>
        </h4>
        <p class="ui-section-hint">Salva o carica la configurazione completa dell'interfaccia</p>
        <div class="ui-advanced-actions">
          <button type="button" class="menu-button primary" id="export-config-btn">
            <i class="fas fa-download"></i> Esporta Configurazione
          </button>
          <label class="menu-button secondary" style="cursor: pointer; margin: 0;">
            <i class="fas fa-upload"></i> Importa Configurazione
            <input type="file" id="import-config-input" accept=".json" style="display: none;" />
          </label>
        </div>
        <p style="margin-top: 16px; color: var(--text-secondary); font-size: 0.9rem;">
          <i class="fas fa-info-circle"></i>
          Il file JSON contiene tutte le impostazioni (colori, layout, componenti, ecc.)
        </p>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-mobile-alt"></i>
          <span>Responsive e Mobile</span>
        </h4>
        <p class="ui-section-hint">Configura breakpoint e comportamento su dispositivi mobili</p>
        <div class="ui-layout-fields">
          <div class="ui-layout-field">
            <label class="ui-text-label">
              <span>Breakpoint Mobile</span>
              <small>Larghezza massima per considerare un dispositivo "mobile" (es. 768px)</small>
            </label>
            <input 
              type="text" 
              name="responsive_mobile_breakpoint" 
              value="${settings.responsive_mobile_breakpoint || "768px"}" 
              class="ui-text-input" 
            />
          </div>
          <div class="ui-layout-field">
            <label class="ui-checkbox-label">
              <input 
                type="checkbox" 
                name="responsive_sidebar_collapse" 
                ${settings.responsive_sidebar_collapse === "true" ? "checked" : ""}
                value="true"
              />
              <span class="ui-checkbox-label-text">Sidebar collassabile su mobile</span>
            </label>
            <small class="ui-field-desc">La sidebar si nasconde automaticamente su schermi piccoli</small>
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderOperatorLayoutSection(settings) {
  const menuMainItems = OPERATOR_LAYOUT_FIELDS.menu.filter(
    (f) => f.key === "operator_menu_show_turno" || f.key === "operator_menu_show_movimenti" || f.key === "operator_menu_show_fatture" || f.key === "operator_menu_show_prezzi"
  );
  const menuSubItems = OPERATOR_LAYOUT_FIELDS.menu.filter(
    (f) => f.key === "operator_menu_show_crediti" || f.key === "operator_menu_show_voucher" || f.key === "operator_menu_show_uscite" || f.key === "operator_menu_show_incassi"
  );
  return `
    <div class="ui-layout-section">
      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-heading"></i>
          <span>Header</span>
        </h4>
        <p class="ui-section-hint">Configura gli elementi dell'header dell'area operatore</p>
        <div class="ui-layout-fields">
          ${OPERATOR_LAYOUT_FIELDS.header.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list"></i>
          <span>Menu Principale</span>
        </h4>
        <p class="ui-section-hint">Seleziona quali voci principali del menu mostrare</p>
        <div class="ui-layout-fields">
          ${menuMainItems.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>

      <div class="ui-section-box">
        <h4 class="ui-section-title">
          <i class="fas fa-list-ul"></i>
          <span>Sottomenu Movimenti</span>
        </h4>
        <p class="ui-section-hint">Configura le voci del sottomenu Movimenti (visibili solo se Movimenti è attivo)</p>
        <div class="ui-layout-fields">
          ${menuSubItems.map((f) => renderLayoutField(f, settings)).join("")}
        </div>
      </div>
    </div>
  `;
}
function renderLayoutField(field, settings) {
  const value = settings[field.key] ?? field.defaultValue;
  if (field.type === "checkbox") {
    const checked = value === "true" || value === true;
    return `
      <div class="ui-layout-field">
        <label class="ui-checkbox-label">
          <input 
            type="checkbox" 
            name="${field.key}" 
            ${checked ? "checked" : ""}
            value="true"
          />
          <span class="ui-checkbox-label-text">${field.label}</span>
        </label>
        <small class="ui-field-desc">${field.description}</small>
      </div>
    `;
  } else if (field.type === "select") {
    return `
      <div class="ui-layout-field">
        <label class="ui-text-label">
          <span>${field.label}</span>
          <small>${field.description}</small>
        </label>
        <select name="${field.key}" class="ui-text-input">
          ${field.options.map(
      (opt) => `<option value="${opt.value}" ${value === opt.value ? "selected" : ""}>${opt.label}</option>`
    ).join("")}
        </select>
      </div>
    `;
  } else if (field.type === "color") {
    const hexValue = value.toUpperCase();
    return `
      <div class="ui-layout-field">
        <label class="ui-color-label">
          <span class="ui-color-label-text">${field.label}</span>
          <small class="ui-color-label-desc">${field.description}</small>
        </label>
        <div class="ui-color-controls">
          <input 
            type="color" 
            name="${field.key}" 
            value="${value}" 
            class="ui-color-picker" 
            title="Clicca per selezionare un colore"
          />
          <input 
            type="text" 
            name="${field.key}_hex" 
            value="${hexValue}" 
            class="ui-color-hex" 
            placeholder="#000000"
            maxlength="7"
            pattern="#[0-9A-Fa-f]{6}"
            title="Inserisci un codice colore esadecimale"
          />
        </div>
      </div>
    `;
  } else {
    return `
      <div class="ui-layout-field">
        <label class="ui-text-label">
          <span>${field.label}</span>
          <small>${field.description}</small>
        </label>
        <input 
          type="text" 
          name="${field.key}" 
          value="${value}" 
          class="ui-text-input" 
        />
      </div>
    `;
  }
}
async function applyFormsSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const inputPadding = settings.form_input_padding || "12px 16px";
  const inputRadius = settings.form_input_radius || "6px";
  const inputBorderWidth = settings.form_input_border_width || "2px";
  const inputFontSize = settings.form_input_font_size || "1rem";
  const labelFontSize = settings.form_label_font_size || "0.95rem";
  const labelFontWeight = settings.form_label_font_weight || "600";
  const formInputs = (
    /** @type {NodeListOf<HTMLElement>} */
    document.querySelectorAll(".form-group input, .form-group select, .form-group textarea, .big-input, .form-input")
  );
  formInputs.forEach((input) => {
    input.style.padding = inputPadding;
    input.style.borderRadius = inputRadius;
    input.style.borderWidth = inputBorderWidth;
    input.style.fontSize = inputFontSize;
  });
  const formLabels = (
    /** @type {NodeListOf<HTMLElement>} */
    document.querySelectorAll(".form-group label, .form-field label")
  );
  formLabels.forEach((label) => {
    label.style.fontSize = labelFontSize;
    label.style.fontWeight = labelFontWeight;
  });
  const formGroupGap = settings.form_group_gap || "20px";
  const formRowGap = settings.form_row_gap || "16px";
  const formGroups = (
    /** @type {NodeListOf<HTMLElement>} */
    document.querySelectorAll(".form-group")
  );
  formGroups.forEach((group) => {
    group.style.marginBottom = formGroupGap;
  });
  const formRows = (
    /** @type {NodeListOf<HTMLElement>} */
    document.querySelectorAll(".form-row")
  );
  formRows.forEach((row) => {
    row.style.gap = formRowGap;
  });
}
async function applyIconsSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const adminIconMap = {
    dashboard: settings.admin_icon_dashboard || "fas fa-chart-line",
    stations: settings.admin_icon_stations || "fas fa-gas-pump",
    operators: settings.admin_icon_operators || "fas fa-users",
    chiusure: settings.admin_icon_chiusure || "fas fa-file-invoice-dollar",
    crediti: settings.admin_icon_crediti || "fas fa-credit-card",
    fatture: settings.admin_icon_fatture || "fas fa-file-invoice",
    vouchers: settings.admin_icon_vouchers || "fas fa-ticket-alt",
    notifiche: settings.admin_icon_notifiche || "fas fa-bell",
    settings: settings.admin_icon_settings || "fas fa-cog"
  };
  Object.entries(adminIconMap).forEach(([tab, iconValue]) => {
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) {
      const iconEl = btn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
      if (iconEl) {
        if (iconValue.trim().startsWith("IMAGE_BASE64:")) {
          const base64 = iconValue.replace("IMAGE_BASE64:", "");
          iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 16px; height: 16px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
        } else if (iconValue.trim().startsWith("<svg") || iconValue.trim().startsWith("<?xml")) {
          iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 16px; height: 16px; vertical-align: middle;">${iconValue}</span>`;
        } else {
          if (iconEl.tagName === "I") {
            iconEl.className = iconValue;
          } else {
            iconEl.outerHTML = `<i class="${iconValue}"></i>`;
          }
        }
      }
    }
  });
  const adminLogoutIcon = settings.admin_icon_logout || "fas fa-sign-out-alt";
  const adminLogoutBtn = document.querySelector("#admin-logout");
  if (adminLogoutBtn) {
    const iconEl = adminLogoutBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (adminLogoutIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = adminLogoutIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 16px; height: 16px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (adminLogoutIcon.trim().startsWith("<svg") || adminLogoutIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 16px; height: 16px; vertical-align: middle;">${adminLogoutIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = adminLogoutIcon;
        } else {
          iconEl.outerHTML = `<i class="${adminLogoutIcon}"></i>`;
        }
      }
    }
  }
  const operatorIconMap = {
    turno: settings.operator_icon_turno || "fas fa-door-open",
    movimenti: settings.operator_icon_movimenti || "fas fa-exchange-alt",
    crediti: settings.operator_icon_crediti || "fas fa-credit-card",
    voucher: settings.operator_icon_voucher || "fas fa-ticket-alt",
    uscite: settings.operator_icon_uscite || "fas fa-hand-holding-usd",
    incassi: settings.operator_icon_incassi || "fas fa-cash-register",
    fatture: settings.operator_icon_fatture || "fas fa-file-invoice",
    prezzi: settings.operator_icon_prezzi || "fas fa-tags"
  };
  const turnoIcon = operatorIconMap.turno;
  const turnoIconEl = document.querySelector("#turno-icon");
  if (turnoIconEl) {
    if (turnoIcon.trim().startsWith("IMAGE_BASE64:")) {
      const base64 = turnoIcon.replace("IMAGE_BASE64:", "");
      turnoIconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
    } else if (turnoIcon.trim().startsWith("<svg") || turnoIcon.trim().startsWith("<?xml")) {
      turnoIconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${turnoIcon}</span>`;
    } else {
      if (turnoIconEl.tagName === "I") {
        turnoIconEl.className = turnoIcon;
      } else {
        turnoIconEl.outerHTML = `<i class="${turnoIcon}"></i>`;
      }
    }
  }
  const movimentiIcon = operatorIconMap.movimenti;
  const movimentiBtn = document.querySelector("#btn-movimenti");
  if (movimentiBtn) {
    const iconEl = movimentiBtn.querySelector("i:not(.accordion-icon), img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (movimentiIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = movimentiIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (movimentiIcon.trim().startsWith("<svg") || movimentiIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${movimentiIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = movimentiIcon;
        } else {
          iconEl.outerHTML = `<i class="${movimentiIcon}"></i>`;
        }
      }
    }
  }
  const submenuIcons = {
    "#btn-crediti": operatorIconMap.crediti,
    "#btn-voucher": operatorIconMap.voucher,
    "#btn-uscite": operatorIconMap.uscite,
    "#btn-incassi": operatorIconMap.incassi
  };
  Object.entries(submenuIcons).forEach(([selector, iconValue]) => {
    const btn = document.querySelector(selector);
    if (btn) {
      const iconEl = btn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
      if (iconEl) {
        if (iconValue.trim().startsWith("IMAGE_BASE64:")) {
          const base64 = iconValue.replace("IMAGE_BASE64:", "");
          iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 18px; height: 18px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
        } else if (iconValue.trim().startsWith("<svg") || iconValue.trim().startsWith("<?xml")) {
          iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 18px; height: 18px; vertical-align: middle;">${iconValue}</span>`;
        } else {
          if (iconEl.tagName === "I") {
            iconEl.className = iconValue;
          } else {
            iconEl.outerHTML = `<i class="${iconValue}"></i>`;
          }
        }
      }
    }
  });
  const fattureIcon = operatorIconMap.fatture;
  const fattureBtn = document.querySelector("#btn-fatture");
  if (fattureBtn) {
    const iconEl = fattureBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (fattureIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = fattureIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (fattureIcon.trim().startsWith("<svg") || fattureIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${fattureIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = fattureIcon;
        } else {
          iconEl.outerHTML = `<i class="${fattureIcon}"></i>`;
        }
      }
    }
  }
  const prezziIcon = operatorIconMap.prezzi;
  const prezziBtn = document.querySelector("#btn-prezzi");
  if (prezziBtn) {
    const iconEl = prezziBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (prezziIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = prezziIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (prezziIcon.trim().startsWith("<svg") || prezziIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 20px; height: 20px; vertical-align: middle;">${prezziIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = prezziIcon;
        } else {
          iconEl.outerHTML = `<i class="${prezziIcon}"></i>`;
        }
      }
    }
  }
  const operatorLogoutIcon = settings.operator_icon_logout || "fas fa-sign-out-alt";
  const operatorLogoutBtn = document.querySelector("#op-logout-btn");
  if (operatorLogoutBtn) {
    const iconEl = operatorLogoutBtn.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (iconEl) {
      if (operatorLogoutIcon.trim().startsWith("IMAGE_BASE64:")) {
        const base64 = operatorLogoutIcon.replace("IMAGE_BASE64:", "");
        iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 18px; height: 18px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
      } else if (operatorLogoutIcon.trim().startsWith("<svg") || operatorLogoutIcon.trim().startsWith("<?xml")) {
        iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 18px; height: 18px; vertical-align: middle;">${operatorLogoutIcon}</span>`;
      } else {
        if (iconEl.tagName === "I") {
          iconEl.className = operatorLogoutIcon;
        } else {
          iconEl.outerHTML = `<i class="${operatorLogoutIcon}"></i>`;
        }
      }
    }
  }
  const stationActionIcons = {
    edit: settings.station_action_icon_edit || "fas fa-edit",
    prices: settings.station_action_icon_prices || "fas fa-tag",
    islands: settings.station_action_icon_islands || "fas fa-gas-pump",
    tanks: settings.station_action_icon_tanks && settings.station_action_icon_tanks.includes('fill="white"') ? settings.station_action_icon_tanks : `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="1" y="7" width="22" height="11" rx="5.5" /><rect x="14" y="3" width="7" height="4" rx="1" /><rect x="4" y="18" width="3" height="3" rx="1" /><rect x="17" y="18" width="3" height="3" rx="1" /><path d="M9 15.5l2-3.5 2 3.5H9z" fill="white" /></svg>`,
    delete: settings.station_action_icon_delete || "fas fa-trash"
  };
  const applyStationActionIcon = (button, iconValue) => {
    if (!button) return;
    const iconEl = button.querySelector("i, img, span.icon-svg-wrapper, span.icon-img-wrapper");
    if (!iconEl) return;
    if (iconValue.trim().startsWith("IMAGE_BASE64:")) {
      const base64 = iconValue.replace("IMAGE_BASE64:", "");
      iconEl.outerHTML = `<img src="data:image/png;base64,${base64}" class="icon-img-wrapper" style="display: inline-block; width: 16px; height: 16px; object-fit: contain; vertical-align: middle;" alt="Icona" />`;
    } else if (iconValue.trim().startsWith("<svg") || iconValue.trim().startsWith("<?xml")) {
      iconEl.outerHTML = `<span class="icon-svg-wrapper" style="display: inline-block; width: 16px; height: 16px; vertical-align: middle;">${iconValue}</span>`;
    } else {
      if (iconEl.tagName === "I") {
        iconEl.className = iconValue;
      } else {
        iconEl.outerHTML = `<i class="${iconValue}"></i>`;
      }
    }
  };
  document.querySelectorAll(".edit-station").forEach((btn) => applyStationActionIcon(btn, stationActionIcons.edit));
  document.querySelectorAll(".prices-station").forEach((btn) => applyStationActionIcon(btn, stationActionIcons.prices));
  document.querySelectorAll(".islands-station").forEach((btn) => applyStationActionIcon(btn, stationActionIcons.islands));
  document.querySelectorAll(".tanks-station").forEach((btn) => applyStationActionIcon(btn, stationActionIcons.tanks));
  document.querySelectorAll(".delete-station").forEach((btn) => applyStationActionIcon(btn, stationActionIcons.delete));
}
window.refreshUiIcons = () => {
  if (cachedSettings) {
    applyIconsSettings(cachedSettings);
  } else {
    fetchUiSettings().then((settings) => applyIconsSettings(settings));
  }
};
async function applyComponentsSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;
  const buttonPadding = settings.component_button_padding || "12px 24px";
  const buttonRadius = settings.component_button_radius || "6px";
  const buttonFontSize = settings.component_button_font_size || "1rem";
  const buttonFontWeight = settings.component_button_font_weight || "600";
  document.querySelectorAll(".menu-button").forEach((btn) => {
    btn.style.padding = buttonPadding;
    btn.style.borderRadius = buttonRadius;
    btn.style.fontSize = buttonFontSize;
    btn.style.fontWeight = buttonFontWeight;
  });
  const tableHeaderBg = settings.component_table_header_bg || "#F4F6F8";
  const tableHeaderColor = settings.component_table_header_color || "#333333";
  const tableHoverBg = settings.component_table_hover_bg || "#F8FAFC";
  const tablePadding = settings.component_table_padding || "16px 24px";
  root.style.setProperty("--table-header-bg", tableHeaderBg);
  root.style.setProperty("--table-header-color", tableHeaderColor);
  root.style.setProperty("--table-hover-bg", tableHoverBg);
  document.querySelectorAll(".admin-table th").forEach((th) => {
    th.style.backgroundColor = tableHeaderBg;
    th.style.color = tableHeaderColor;
    th.style.padding = tablePadding;
  });
  document.querySelectorAll(".admin-table td").forEach((td) => {
    td.style.padding = tablePadding;
  });
  const styleId = "component-table-hover-style";
  let hoverStyle = document.getElementById(styleId);
  if (!hoverStyle) {
    hoverStyle = document.createElement("style");
    hoverStyle.id = styleId;
    document.head.appendChild(hoverStyle);
  }
  hoverStyle.textContent = `
    .admin-table tr:hover td {
      background-color: ${tableHoverBg} !important;
    }
  `;
  const cardPadding = settings.component_card_padding || "24px";
  const cardRadius = settings.component_card_radius || "16px";
  const cardShadow = settings.component_card_shadow || "md";
  const shadowMap = {
    none: "none",
    sm: "0 1px 3px rgba(15, 23, 42, 0.08)",
    md: "0 4px 10px rgba(15, 23, 42, 0.12)",
    lg: "0 12px 30px rgba(15, 23, 42, 0.18)"
  };
  document.querySelectorAll(".content-box, .kpi-card, .panel-card").forEach((card) => {
    card.style.padding = cardPadding;
    card.style.borderRadius = cardRadius;
    if (cardShadow !== "none") {
      card.style.boxShadow = shadowMap[cardShadow] || shadowMap.md;
    } else {
      card.style.boxShadow = "none";
    }
  });
  const modalMaxWidth = settings.component_modal_max_width || "1100px";
  const modalPadding = settings.component_modal_padding || "24px";
  const modalRadius = settings.component_modal_radius || "16px";
  const modalOverlayOpacity = settings.component_modal_overlay_opacity || "0.6";
  document.querySelectorAll(".modal-content").forEach((modal) => {
    modal.style.maxWidth = modalMaxWidth;
    modal.style.borderRadius = modalRadius;
  });
  document.querySelectorAll(".modal-body").forEach((body) => {
    body.style.padding = modalPadding;
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.style.backgroundColor = `rgba(15, 23, 42, ${modalOverlayOpacity})`;
  });
}
async function applyLayoutSettings(overrideSettings = null) {
  const settings = overrideSettings || await fetchUiSettings();
  const root = document.documentElement;
  if (settings.admin_sidebar_width) {
    root.style.setProperty("--admin-sidebar-width", settings.admin_sidebar_width);
    const sidebar = document.querySelector(".admin-sidebar");
    if (sidebar) sidebar.style.width = settings.admin_sidebar_width;
  }
  const sidebarHeader = document.querySelector(".admin-sidebar .sidebar-header");
  const sidebarFooter = document.querySelector(".admin-sidebar .sidebar-footer");
  if (sidebarHeader) {
    sidebarHeader.style.display = settings.admin_sidebar_show_header === "false" ? "none" : "";
  }
  if (sidebarFooter) {
    sidebarFooter.style.display = settings.admin_sidebar_show_footer === "false" ? "none" : "";
  }
  const headerLogo = document.querySelector(".admin-header-logo");
  if (headerLogo) {
    headerLogo.style.display = settings.admin_header_show_logo === "false" ? "none" : "";
    if (settings.admin_header_logo_height) {
      headerLogo.style.height = settings.admin_header_logo_height;
    }
  }
  const menuItems = {
    dashboard: settings.admin_menu_show_dashboard,
    stations: settings.admin_menu_show_stations,
    operators: settings.admin_menu_show_operators,
    chiusure: settings.admin_menu_show_chiusure,
    crediti: settings.admin_menu_show_crediti,
    fatture: settings.admin_menu_show_fatture,
    vouchers: settings.admin_menu_show_vouchers,
    notifiche: settings.admin_menu_show_notifiche
  };
  Object.entries(menuItems).forEach(([tab, visible]) => {
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) {
      btn.style.display = visible === "false" ? "none" : "";
    }
  });
  const kpiLayout = settings.admin_dashboard_kpi_layout || "4";
  const dashboardGrid = document.querySelector(".dashboard-grid");
  if (dashboardGrid) {
    const cols = parseInt(kpiLayout) || 4;
    dashboardGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  }
  const kpiItems = {
    venduto: settings.admin_dashboard_show_kpi_venduto,
    erogato: settings.admin_dashboard_show_kpi_erogato,
    stazioni: settings.admin_dashboard_show_kpi_stazioni,
    alert: settings.admin_dashboard_show_kpi_alert
  };
  const kpiCards = document.querySelectorAll(".kpi-card");
  if (kpiCards.length >= 4) {
    const kpiOrder = ["venduto", "erogato", "stazioni", "alert"];
    kpiOrder.forEach((kpi, idx) => {
      if (kpiCards[idx]) {
        kpiCards[idx].style.display = kpiItems[kpi] === "false" ? "none" : "";
      }
    });
  }
  const tanksPanel = document.querySelector(".dashboard-panels .panel-card");
  if (tanksPanel) {
    tanksPanel.style.display = settings.admin_dashboard_show_tanks === "false" ? "none" : "";
  }
  const contentArea = document.querySelector(".admin-content-area");
  if (contentArea && settings.admin_content_padding) {
    contentArea.style.padding = settings.admin_content_padding;
  }
  const sections = document.querySelectorAll(".dashboard-grid, .dashboard-panels");
  if (settings.admin_section_gap) {
    sections.forEach((section) => {
      section.style.marginBottom = settings.admin_section_gap;
    });
  }
  const opHeaderLogo = document.querySelector(".operator-header img");
  if (opHeaderLogo) {
    opHeaderLogo.style.display = settings.operator_header_show_logo === "false" ? "none" : "";
    if (settings.operator_header_logo_height) {
      opHeaderLogo.style.height = settings.operator_header_logo_height;
    }
  }
  const opStationBadge = document.getElementById("station-badge");
  if (opStationBadge) {
    opStationBadge.style.display = settings.operator_header_show_station_badge === "false" ? "none" : "";
  }
  const opLogoutBtn = document.getElementById("op-logout-btn");
  if (opLogoutBtn) {
    opLogoutBtn.style.display = settings.operator_header_show_logout === "false" ? "none" : "";
  }
  const opMainMenuItems = {
    turno: settings.operator_menu_show_turno,
    movimenti: settings.operator_menu_show_movimenti,
    fatture: settings.operator_menu_show_fatture,
    prezzi: settings.operator_menu_show_prezzi
  };
  Object.entries(opMainMenuItems).forEach(([id, visible]) => {
    if (id === "movimenti") {
      const accordion = document.querySelector(".op-menu-accordion");
      if (accordion) {
        accordion.style.display = visible === "false" ? "none" : "";
      }
    } else {
      const btn = document.getElementById(`btn-${id}`);
      if (btn) {
        btn.style.display = visible === "false" ? "none" : "";
      }
    }
  });
  if (settings.operator_menu_show_movimenti !== "false") {
    const opSubMenuItems = {
      crediti: settings.operator_menu_show_crediti,
      voucher: settings.operator_menu_show_voucher,
      uscite: settings.operator_menu_show_uscite,
      incassi: settings.operator_menu_show_incassi
    };
    Object.entries(opSubMenuItems).forEach(([id, visible]) => {
      const btn = document.getElementById(`btn-${id}`);
      if (btn) {
        btn.style.display = visible === "false" ? "none" : "";
      }
    });
  } else {
    ["crediti", "voucher", "uscite", "incassi"].forEach((id) => {
      const btn = document.getElementById(`btn-${id}`);
      if (btn) {
        btn.style.display = "none";
      }
    });
  }
}
function injectStyles() {
  if (document.getElementById("ui-appearance-style")) return;
  const style = document.createElement("style");
  style.id = "ui-appearance-style";
  style.textContent = `
    /* Container principale - Layout a Griglia */
    .ui-appearance-panel {
      display: grid;
      grid-template-columns: 260px 1fr; /* Sidebar fissa + Contenuto fluido */
      grid-template-rows: auto 1fr;
      gap: 24px;
      align-items: start;
    }

    /* Header - Full Width */
    .ui-header-box {
      grid-column: 1 / -1;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      padding: 24px 28px;
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ui-header-title {
      margin: 0 0 4px 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-color);
    }
    .ui-header-desc {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
      line-height: 1.5;
    }

    /* Sezioni Contenuto */
    .ui-section-box {
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      padding: 32px;
      border: 1px solid var(--border-color);
      margin-bottom: 24px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ui-section-title {
      margin: 0 0 24px 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--primary-color);
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }
    .ui-section-title i {
      color: var(--accent-color);
      background: rgba(var(--accent-rgb, 141, 198, 63), 0.1);
      padding: 8px;
      border-radius: 8px;
      font-size: 1.1rem;
    }

    /* Griglia colori */
    .ui-colors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    /* Campo colore */
    .ui-color-field {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-body);
      transition: border-color 0.2s;
    }
    .ui-color-field:hover {
      border-color: var(--accent-color);
    }
    .ui-color-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ui-color-label-text {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
    }
    .ui-color-label-desc {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .ui-color-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .ui-color-picker {
      width: 48px;
      height: 48px;
      border: 2px solid var(--border-color);
      border-radius: 50%; /* Circolare */
      cursor: pointer;
      flex-shrink: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .ui-color-picker:hover {
      transform: scale(1.1);
      box-shadow: var(--shadow-sm);
      border-color: var(--accent-color);
    }
    .ui-color-picker::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    .ui-color-picker::-webkit-color-swatch {
      border: none;
      border-radius: 50%;
    }
    .ui-color-hex {
      flex: 1;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      font-weight: 600;
      text-transform: uppercase;
      background: var(--bg-surface);
      color: var(--text-main);
      transition: all 0.2s ease;
    }
    .ui-color-hex:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }

    /* Griglia tipografia */
    .ui-typography-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    /* Campi testo */
    .ui-text-fields-wrapper {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .ui-text-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ui-text-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ui-text-label span {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
    }
    .ui-text-label small {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .ui-text-input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.95rem;
      transition: all 0.2s ease;
      background: var(--bg-surface);
      color: var(--text-main);
      font-family: inherit;
    }
    .ui-text-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }

    /* Box azioni */
    .ui-actions-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      box-shadow: var(--shadow-md);
      position: sticky;
      bottom: 20px;
      z-index: 10;
    }
    .ui-actions-info {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 200px;
    }
    .ui-actions-info i {
      color: var(--accent-color);
      font-size: 1.1rem;
    }
    .ui-actions-buttons {
      display: flex;
      gap: 12px;
    }

    /* Form pending */
    .ui-appearance-form.pending {
      opacity: 0.6;
      pointer-events: none;
      filter: grayscale(0.5);
    }

    /* Messaggio successo */
    .ui-success-message {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
      padding: 16px 20px;
      border-radius: var(--radius-md);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      box-shadow: var(--shadow-sm);
      animation: slideIn 0.3s ease;
    }
    .ui-success-message i {
      font-size: 1.2rem;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ============================================
       SIDEBAR TABS (Nuovo Layout)
       ============================================ */
    .ui-appearance-tabs {
      grid-column: 1;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--bg-surface);
      padding: 16px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      position: sticky;
      top: 20px;
      max-height: calc(100vh - 40px);
      overflow-y: auto;
    }

    .ui-appearance-tab {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 0.95rem;
      cursor: pointer;
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
      text-align: left;
      width: 100%;
    }

    .ui-appearance-tab:hover {
      color: var(--primary-color);
      background: var(--bg-body);
    }

    .ui-appearance-tab.active {
      color: var(--primary-color);
      background: var(--bg-body);
      border-color: var(--border-color);
      border-left: 4px solid var(--accent-color);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }

    .ui-appearance-tab i {
      font-size: 1.1rem;
      width: 20px;
      text-align: center;
    }

    /* Form Content Area */
    .ui-appearance-form {
      grid-column: 2;
      grid-row: 2;
      min-width: 0;
    }

    .ui-appearance-section {
      display: none;
    }

    .ui-appearance-section.active {
      display: block;
    }

    /* Layout fields styles */
    .ui-layout-fields {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .ui-layout-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      background: var(--bg-body);
      border-radius: var(--radius-md);
      border: 1px solid transparent;
    }
    .ui-layout-field:hover {
      border-color: var(--border-color);
    }

    .ui-checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: pointer;
      padding: 12px;
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      transition: all 0.2s ease;
    }

    .ui-checkbox-label:hover {
      border-color: var(--primary-color);
    }

    .ui-checkbox-label input[type="checkbox"] {
      width: 20px;
      height: 20px;
      margin-top: 2px;
      cursor: pointer;
      accent-color: var(--primary-color);
      flex-shrink: 0;
    }

    .ui-checkbox-label-text {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
      flex: 1;
    }

    .ui-field-desc {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
      margin-left: 32px;
    }

    .ui-section-hint {
      margin: -12px 0 24px 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
      background: var(--bg-body);
      padding: 12px 16px;
      border-radius: var(--radius-md);
      border-left: 3px solid var(--accent-color);
    }

    /* Temi predefiniti */
    .ui-themes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 24px;
      margin-top: 20px;
    }

    .ui-theme-card {
      background: var(--bg-body);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      text-align: center;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .ui-theme-card:hover {
      border-color: var(--primary-color);
      box-shadow: var(--shadow-md);
      transform: translateY(-4px);
    }
    
    .ui-theme-card.active {
      border-color: var(--accent-color);
      background: var(--bg-surface);
      box-shadow: 0 0 0 2px var(--accent-color);
    }

    .ui-theme-preview {
      display: flex;
      height: 120px;
      border-radius: var(--radius-md);
      overflow: hidden;
      margin-bottom: 16px;
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border-color);
    }

    .ui-theme-preview-sidebar {
      width: 30%;
      background: var(--bg-sidebar);
    }

    .ui-theme-preview-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--bg-body);
    }

    .ui-theme-preview-header {
      height: 12px;
      background: var(--primary-color);
      border-radius: 4px;
      opacity: 0.2;
    }

    .ui-theme-preview-content {
      flex: 1;
      background: var(--bg-surface);
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .ui-theme-name {
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 4px;
    }

    .ui-theme-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    /* Sezione avanzate */
    .ui-advanced-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }

    .ui-advanced-actions .menu-button {
      flex: 1;
      min-width: 200px;
    }

    /* Responsive Mobile */
    @media (max-width: 992px) {
      .ui-appearance-panel {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .ui-header-box {
        grid-column: 1;
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }
      .ui-appearance-tabs {
        grid-column: 1;
        grid-row: auto;
        flex-direction: row;
        overflow-x: auto;
        padding: 8px;
        position: static;
        white-space: nowrap;
        border-radius: var(--radius-md);
        max-height: none;
        box-shadow: none;
        background: transparent;
        border: none;
      }
      .ui-appearance-tab {
        width: auto;
        border-radius: 20px;
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
        padding: 8px 16px;
        flex-shrink: 0;
      }
      .ui-appearance-tab.active {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
        border-left: 1px solid var(--primary-color);
      }
      .ui-appearance-tab.active i {
        color: white;
      }
      .ui-appearance-form {
        grid-column: 1;
        grid-row: auto;
      }
      .ui-colors-grid,
      .ui-typography-grid {
        grid-template-columns: 1fr;
      }
      .ui-actions-box {
        position: static;
        flex-direction: column;
        align-items: stretch;
      }
      .ui-actions-buttons {
        flex-direction: column;
      }
      .ui-actions-buttons .menu-button {
        width: 100%;
      }
    }

  `;
  document.head.appendChild(style);
}
let isInitializing = false;
let observerDebounceTimer = null;
if (document.readyState === "loading") {
  preloadSettings();
}
document.addEventListener("DOMContentLoaded", async () => {
  injectStyles();
  isInitializing = true;
  const settings = await fetchUiSettings();
  await Promise.all([
    applyUiSettings(settings),
    applyLayoutSettings(settings),
    applyComponentsSettings(settings),
    applyFormsSettings(settings),
    applyIconsSettings(settings)
  ]);
  isInitializing = false;
  watchSettingsTab();
  const observer = new MutationObserver(() => {
    if (isInitializing) return;
    if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
    observerDebounceTimer = setTimeout(async () => {
      const currentSettings = await fetchUiSettings();
      applyLayoutSettings(currentSettings);
      applyComponentsSettings(currentSettings);
      applyFormsSettings(currentSettings);
      applyIconsSettings(currentSettings);
    }, 100);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
});
export {
  Toast as T,
  supabase as a,
  openModal as b,
  formatDate as c,
  closeModal as d,
  escapeHtml$2 as e,
  formatEuro as f,
  showInfoModal as g,
  handleError as h,
  showErrorMessage as i,
  openConfirmModal as o,
  showLoadingMessage as s
};
