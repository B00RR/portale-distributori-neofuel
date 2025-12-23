// ==========================================
// OPERATOR AREA - MAIN ENTRY POINT
// Refactored to use modular architecture
// ==========================================
import { getStationName } from "./core/api.js";
import { escapeHtml } from "./utils/utils.js";
import { loggedUser, clearSession } from "./core/auth.js";
import { openConfirmModal } from "./ui/ui.js";

// Import moduli specializzati
import { showAperturaForm, updateOpeningStatus, checkOpeningStatus } from "./operator/opening.js";
import { startClosureWizard } from "./operator/closure.js";
import { showPrezziEditForm } from "./operator/prices.js";
import { showCreditsMenu } from "./operator/credits.js";
import { showOutflowMenu } from "./operator/outflows.js";
import { showExtraIncomeMenu } from "./operator/extra-income.js";
import { showVoucherMenu } from "./operator/vouchers.js";
import { showInvoiceMenu } from "./operator/invoices.js";

/**
 * Mostra il menu principale dell'operatore
 * @param {number} userId - ID dell'operatore
 * @param {number} stationId - ID della stazione
 */
export async function showOperatorMenu(userId, stationId) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Layout operatore
  // Stili inline per le nuove funzionalità (iniettati una sola volta)
  if (!document.getElementById('operator-custom-styles')) {
    const style = document.createElement('style');
    style.id = 'operator-custom-styles';
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
  }

  mainContent.innerHTML = `
    <div class="operator-container">
      <header class="operator-header">
        <div class="header-left">
          <img src="/assets/images/logo-svg.svg" alt="Neofuel" style="height: 40px; vertical-align: middle;">
          <span class="station-badge" id="station-badge">Caricamento...</span>
        </div>
        <div class="header-right">
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

  // Carica nome stazione
  getStationName(stationId).then(name => {
    const badge = document.getElementById('station-badge');
    if (badge) badge.textContent = name;
  });

  // Event listeners
  document.getElementById('op-logout-btn').addEventListener('click', async () => {
    const confirmed = await openConfirmModal('Vuoi uscire dal portale operatore?');
    if (confirmed) {
      await clearSession();
      // Attendi un momento per assicurarsi che la sessione sia stata pulita
      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.href = window.location.pathname;
    }
  });

  // Accordion toggle
  const btnMovimenti = document.getElementById('btn-movimenti');
  const movimentiContent = document.getElementById('movimenti-content');
  btnMovimenti.addEventListener('click', () => {
    const isOpen = movimentiContent.classList.contains('open');
    movimentiContent.classList.toggle('open');
    (/** @type {HTMLElement} */(btnMovimenti.querySelector('.accordion-icon'))).style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  // Gestione tasto turno dinamico (Apertura/Chiusura)
  const btnTurno = document.getElementById('btn-turno');
  const turnoIcon = document.getElementById('turno-icon');
  const turnoText = document.getElementById('turno-text');

  // Check dello stato apertura e update del pulsante
  checkOpeningStatus(stationId).then(opening => {
    // Rimuovi tutti gli event listener precedenti clonando e sostituendo il pulsante
    const newBtnTurno = /** @type {HTMLElement} */(btnTurno.cloneNode(true));
    btnTurno.parentNode.replaceChild(newBtnTurno, btnTurno);

    // Aggiorna i riferimenti agli elementi interni dopo la clonazione
    const newTurnoIcon = /** @type {HTMLElement} */(newBtnTurno.querySelector('#turno-icon'));
    const newTurnoText = /** @type {HTMLElement} */(newBtnTurno.querySelector('#turno-text'));

    if (opening) {
      newTurnoIcon.className = 'fas fa-door-closed';
      newTurnoText.textContent = 'Chiusura';
      newBtnTurno.addEventListener('click', () => startClosureWizard(stationId, userId));
    } else {
      newTurnoIcon.className = 'fas fa-door-open';
      newTurnoText.textContent = 'Apertura';
      newBtnTurno.addEventListener('click', () => showAperturaForm(stationId, userId));
    }

    // Aggiorna lo stato del badge DOPO aver sostituito il pulsante nel DOM
    // Passiamo direttamente i dati per evitare una seconda chiamata di rete
    const badge = document.getElementById('opening-status');
    if (badge) {
      if (opening) {
        const hasPartial = opening.closing_data?.closure_stage === 'partial';
        badge.textContent = hasPartial ? 'Parziale' : 'Aperto';
        badge.className = `status-badge ${hasPartial ? 'status-partial' : 'status-open'}`;
        badge.title = `Aperto da ${opening.users?.full_name || 'Operatore'} il ${new Date(opening.date_time).toLocaleString('it-IT')}`;
      } else {
        badge.textContent = 'Chiuso';
        badge.className = 'status-badge status-closed';
        badge.title = 'Nessuna apertura attiva';
      }
    }
  });

  // Altri event listeners (funzioni invariate)
  document.getElementById('btn-prezzi').addEventListener('click', () => showPrezziEditForm(stationId));
  document.getElementById('btn-crediti').addEventListener('click', () => showCreditsMenu(stationId, userId));

  document.getElementById('btn-fatture').addEventListener('click', () => showInvoiceMenu(stationId, userId)); // Corrected button ID and function call
  document.getElementById('btn-voucher').addEventListener('click', () => showVoucherMenu(stationId, userId));
  document.getElementById('btn-uscite').addEventListener('click', () => showOutflowMenu(stationId, userId));
  document.getElementById('btn-incassi').addEventListener('click', () => showExtraIncomeMenu(stationId, userId));
}
