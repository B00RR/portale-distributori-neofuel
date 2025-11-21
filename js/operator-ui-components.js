// ==========================================
// OPERATOR UI COMPONENTS
// Componenti riutilizzabili per eliminare duplicazione codice
// ==========================================
import { escapeHtml, formatLitri, formatEuro } from "./utils.js";

/**
 * Crea un messaggio di warning standardizzato
 * @param {string} title - Titolo del messaggio
 * @param {string} message - Messaggio principale
 * @param {string} [details] - Dettagli aggiuntivi (opzionale)
 * @returns {string} HTML del messaggio warning
 */
export function createWarningMessage(title, message, details = '') {
    return `
    <div class="warning-message">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${details ? `<p>${escapeHtml(details)}</p>` : ''}
    </div>
  `;
}

/**
 * Crea un messaggio di successo standardizzato
 * @param {string} title - Titolo del messaggio
 * @param {string} message - Messaggio principale
 * @param {string} [details] - Dettagli aggiuntivi (opzionale)
 * @returns {string} HTML del messaggio successo
 */
export function createSuccessMessage(title, message, details = '') {
    return `
    <div class="success-message">
      <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 20px;"></i>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${details ? `<p class="small-text">${escapeHtml(details)}</p>` : ''}
    </div>
  `;
}

/**
 * Crea un messaggio di errore standardizzato
 * @param {string} title - Titolo dell'errore
 * @param {Object} error - Oggetto errore
 * @returns {string} HTML del messaggio errore
 */
export function createErrorMessage(title, error) {
    return `
    <div class="warning-message">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>${escapeHtml(title)}</h3>
      <p><strong>Errore:</strong> ${escapeHtml(error.message || 'Errore sconosciuto')}</p>
      ${error.code ? `<p><strong>Codice:</strong> ${escapeHtml(error.code)}</p>` : ''}
      ${error.details ? `<p class="small-text">Dettagli: ${escapeHtml(error.details)}</p>` : ''}
      ${error.hint ? `<p class="small-text">Hint: ${escapeHtml(error.hint)}</p>` : ''}
    </div>
  `;
}

/**
 * Crea un pulsante "Torna al Menu"
 * @param {string} [id='btn-back-menu'] - ID del pulsante
 * @returns {string} HTML del pulsante
 */
export function createBackButton(id = 'btn-back-menu') {
    return `
    <button class="menu-button secondary full-width" id="${id}">
      <i class="fas fa-arrow-left"></i> Torna al Menu
    </button>
  `;
}

/**
 * Crea pulsanti azione standard (Annulla/Conferma)
 * @param {Object} options - Opzioni per i pulsanti
 * @param {string} [options.cancelId='btn-cancel'] - ID pulsante annulla
 * @param {string} [options.confirmId='btn-confirm'] - ID pulsante conferma
 * @param {string} [options.cancelText='Annulla'] - Testo pulsante annulla
 * @param {string} [options.confirmText='Conferma'] - Testo pulsante conferma
 * @param {string} [options.confirmClass='success'] - Classe CSS pulsante conferma
 * @returns {string} HTML dei pulsanti azione
 */
export function createFormActions(options = {}) {
    const {
        cancelId = 'btn-cancel',
        confirmId = 'btn-confirm',
        cancelText = 'Annulla',
        confirmText = 'Conferma',
        confirmClass = 'success'
    } = options;

    return `
    <div class="form-actions">
      <button type="button" class="menu-button secondary" id="${cancelId}">
        <i class="fas fa-times"></i> ${escapeHtml(cancelText)}
      </button>
      <button type="submit" class="menu-button ${confirmClass}" id="${confirmId}">
        <i class="fas fa-check"></i> ${escapeHtml(confirmText)}
      </button>
    </div>
  `;
}

/**
 * Crea una card per visualizzare una pistola con contatori
 * @param {Object} pistola - Dati della pistola
 * @param {number} pistola.id - ID pistola
 * @param {string} pistola.nome - Nome pistola
 * @param {Object} pistola.islands - Dati isola
 * @param {number} openingCounter - Contatore apertura
 * @param {number} [closingCounter] - Contatore chiusura (opzionale)
 * @param {boolean} [readonly=false] - Se true, mostra solo lettura
 * @returns {string} HTML della card pistola
 */
export function createPistolaCard(pistola, openingCounter, closingCounter = null, readonly = false) {
    const islandName = pistola.islands?.nome || 'Isola';
    const pistolaName = pistola.nome || `Pistola #${pistola.id}`;

    return `
    <div class="pistola-card">
      <div class="pistola-header">
        <span class="pistola-name">${escapeHtml(pistolaName)}</span>
        <span class="pistola-island">${escapeHtml(islandName)}</span>
      </div>
      <div class="form-group ${readonly ? 'readonly-field' : ''}">
        <label>Contatore ${closingCounter !== null ? 'Apertura' : 'Iniziale'} (litri)</label>
        ${readonly
            ? `<div class="readonly-value">${formatLitri(openingCounter)}</div>`
            : `<input type="number" value="${openingCounter}" class="big-input" disabled>`
        }
      </div>
      ${closingCounter !== null ? `
        <div class="form-group">
          <label>Contatore Chiusura</label>
          <input 
            type="number" 
            name="counter_${pistola.id}" 
            value="${closingCounter}"
            step="1"
            min="${openingCounter}"
            class="big-input"
            required
          >
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Crea un box riepilogo con righe di dati
 * @param {string} title - Titolo del box
 * @param {Array<Object>} rows - Array di righe {label, value, class}
 * @returns {string} HTML del summary box
 */
export function createSummaryBox(title, rows) {
    return `
    <div class="summary-box">
      <h4>${escapeHtml(title)}</h4>
      ${rows.map(row => `
        <div class="summary-row ${row.class || ''}">
          <span>${escapeHtml(row.label)}</span>
          <strong>${row.value}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Crea una riga di riepilogo
 * @param {string} label - Etichetta
 * @param {string} value - Valore
 * @param {string} [className=''] - Classe CSS aggiuntiva
 * @returns {Object} Oggetto riga per createSummaryBox
 */
export function createSummaryRow(label, value, className = '') {
    return { label, value, class: className };
}

/**
 * Crea un contenitore con content-box
 * @param {string} content - Contenuto HTML interno
 * @returns {string} HTML del contenitore
 */
export function createContentBox(content) {
    return `<div class="content-box">${content}</div>`;
}

/**
 * Crea un divider per separare sezioni
 * @returns {string} HTML del divider
 */
export function createDivider() {
    return '<div class="section-divider"></div>';
}

/**
 * Attacca event listener per pulsante "Torna al Menu"
 * @param {string} [buttonId='btn-back-menu'] - ID del pulsante
 * @param {HTMLElement} container - Container da resettare
 */
export function attachBackButtonListener(buttonId = 'btn-back-menu', container) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.addEventListener('click', () => {
            container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
        });
    }
}

/**
 * Attacca event listener per pulsante annulla
 * @param {string} buttonId - ID del pulsante
 * @param {HTMLElement} container - Container da resettare
 */
export function attachCancelButtonListener(buttonId, container) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.addEventListener('click', () => {
            container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
        });
    }
}
