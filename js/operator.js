// ==========================================
// OPERATOR AREA - MAIN ENTRY POINT
// Refactored to use modular architecture
// ==========================================
import { getStationName } from "./api.js";
import { escapeHtml } from "./utils.js";
import { loggedUser, clearSession } from "./auth.js";

// Import moduli specializzati
import { showAperturaForm, updateOpeningStatus } from "./operator-opening.js";
import { startClosureWizard } from "./operator-closure.js";
import { showPrezziEditForm } from "./operator-prices.js";
import { showCreditsMenu } from "./operator-credits.js";
import { showOutflowMenu } from "./operator-outflows.js";
import { showExtraIncomeMenu } from "./operator-extra-income.js";

/**
 * Mostra il menu principale dell'operatore
 * @param {number} userId - ID dell'operatore
 * @param {number} stationId - ID della stazione
 */
export async function showInvoiceMenu(userId, stationId) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Layout operatore
  // Stili inline per le nuove funzionalità (da spostare in style.css in Fase 2)
  const style = document.createElement('style');
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
  `;
  document.head.appendChild(style);

  mainContent.innerHTML = `
    <div class="operator-container">
      <header class="operator-header">
        <div class="header-left">
          <h2>Neofuel</h2>
          <span class="station-badge" id="station-badge">Caricamento...</span>
        </div>
        <div class="header-right">
          <button id="op-logout-btn" class="icon-btn"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      </header>
      
      <div class="operator-grid">
        <button class="op-card" id="btn-apertura">
          <i class="fas fa-door-open"></i>
          <span>Apertura</span>
          <span class="status-badge" id="opening-status"></span>
        </button>
        <button class="op-card" id="btn-chiusura">
          <i class="fas fa-door-closed"></i>
          <span>Chiusura</span>
        </button>
        <button class="op-card" id="btn-prezzi">
          <i class="fas fa-tags"></i>
          <span>Prezzi</span>
        </button>
        <button class="op-card" id="btn-crediti">
          <i class="fas fa-credit-card"></i>
          <span>Crediti</span>
        </button>
        <button class="op-card" id="btn-voucher">
          <i class="fas fa-ticket-alt"></i>
          <span>Voucher</span>
        </button>
        <button class="op-card" id="btn-uscite">
          <i class="fas fa-hand-holding-usd"></i>
          <span>Uscite</span>
        </button>
        <button class="op-card" id="btn-incassi">
          <i class="fas fa-cash-register"></i>
          <span>Incassi</span>
        </button>
      </div>
      
      <div id="operator-content" class="operator-content">
        <div class="welcome-message">
            <p>Seleziona un'attività dal menu in alto.</p>
        </div>
      </div>
    </div>
  `;

  // Carica nome stazione
  getStationName(stationId).then(name => {
    const badge = document.getElementById('station-badge');
    if (badge) badge.textContent = name;
  });

  // Event listeners
  document.getElementById('op-logout-btn').addEventListener('click', async () => {
    if (confirm('Vuoi uscire?')) {
      await clearSession();
      // Attendi un momento per assicurarsi che la sessione sia stata pulita
      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.href = window.location.pathname;
    }
  });

  document.getElementById('btn-apertura').addEventListener('click', () => showAperturaForm(stationId, userId));
  document.getElementById('btn-chiusura').addEventListener('click', () => startClosureWizard(stationId, userId));
  document.getElementById('btn-prezzi').addEventListener('click', () => showPrezziEditForm(stationId));
  document.getElementById('btn-crediti').addEventListener('click', () => showCreditsMenu(stationId, userId));
  document.getElementById('btn-voucher').addEventListener('click', () => showVoucherMenu(stationId, userId));
  document.getElementById('btn-uscite').addEventListener('click', () => showOutflowMenu(stationId, userId));
  document.getElementById('btn-incassi').addEventListener('click', () => showExtraIncomeMenu(stationId, userId));

  // Controlla e mostra stato apertura
  updateOpeningStatus(stationId);
}
