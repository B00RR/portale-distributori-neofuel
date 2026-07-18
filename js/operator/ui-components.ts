// ==========================================
// OPERATOR UI COMPONENTS
// Componenti riutilizzabili per eliminare duplicazione codice
// ==========================================
import { Pistola } from '../types.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml, formatLitri } from '../utils/utils.js';

/**
 * Crea un messaggio di warning standardizzato
 */
export function createWarningMessage(title: string, message: string, details: string = ''): string {
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
 */
export function createSuccessMessage(title: string, message: string, details: string = ''): string {
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
 */
export function createErrorMessage(title: string, error: unknown): string {
  const e = (error ?? {}) as { message?: string; code?: string; details?: string; hint?: string };
  return `
    <div class="warning-message">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>${escapeHtml(title)}</h3>
      <p><strong>Errore:</strong> ${escapeHtml(e.message || 'Errore sconosciuto')}</p>
      ${e.code ? `<p><strong>Codice:</strong> ${escapeHtml(e.code)}</p>` : ''}
      ${e.details ? `<p class="small-text">Dettagli: ${escapeHtml(e.details)}</p>` : ''}
      ${e.hint ? `<p class="small-text">Hint: ${escapeHtml(e.hint)}</p>` : ''}
    </div>
  `;
}

/**
 * Crea un pulsante "Torna al Menu"
 */
export function createBackButton(id: string = 'btn-back-menu'): string {
  return `
    <button class="menu-button secondary full-width" id="${id}">
      <i class="fas fa-arrow-left"></i> Torna al Menu
    </button>
  `;
}

interface FormActionsOptions {
  cancelId?: string;
  confirmId?: string;
  cancelText?: string;
  confirmText?: string;
  confirmClass?: string;
}

export function createEmptyStateMessage(title: string, message: string): string {
  return `
    <div class="empty-state">
      <i class="fas fa-inbox" style="font-size: 48px; color: var(--text-muted, #9ca3af); margin-bottom: 20px;"></i>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Crea pulsanti azione standard (Annulla/Conferma)
 */
export function createFormActions(options: FormActionsOptions = {}): string {
  const {
    cancelId = 'btn-cancel',
    confirmId = 'btn-confirm',
    cancelText = 'Annulla',
    confirmText = 'Conferma',
    confirmClass = 'success'
  } = options;

  return `
    <div class="form-actions">
      <button type="button" class="menu-button danger" id="${cancelId}">
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
 */
export function createPistolaCard(
  pistola: Pistola,
  openingCounter: number,
  closingCounter: number | null = null,
  readonly: boolean = false
): string {
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
        ${
          readonly
            ? `<div class="readonly-value">${formatLitri(openingCounter)}</div>`
            : `<input type="number" value="${openingCounter}" class="big-input" disabled>`
        }
      </div>
      ${
        closingCounter !== null
          ? `
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
      `
          : ''
      }
    </div>
  `;
}

interface SummaryRow {
  label: string;
  value: string;
  class?: string;
}

/**
 * Crea un box riepilogo con righe di dati
 */
export function createSummaryBox(title: string, rows: SummaryRow[]): string {
  return `
    <div class="summary-box">
      <h4>${escapeHtml(title)}</h4>
      ${rows
        .map(
          row => `
        <div class="summary-row ${row.class || ''}">
          <span>${escapeHtml(row.label)}</span>
          <strong>${row.value}</strong>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

/**
 * Crea una riga di riepilogo
 */
export function createSummaryRow(label: string, value: string, className: string = ''): SummaryRow {
  return { label, value, class: className };
}

/**
 * Crea un contenitore con content-box
 */
export function createContentBox(content: string): string {
  return `<div class="content-box">${content}</div>`;
}

/**
 * Crea un divider per separare sezioni
 */
export function createDivider(): string {
  return '<div class="section-divider"></div>';
}

/**
 * Attacca event listener per pulsante "Torna al Menu"
 */
export function attachBackButtonListener(
  buttonId: string = 'btn-back-menu',
  container: HTMLElement
): void {
  const button = document.getElementById(buttonId);
  if (button) {
    button.addEventListener('click', () => {
      setSafeHTML(
        container,
        '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>'
      );
    });
  }
}

/**
 * Attacca event listener per pulsante annulla
 */
export function attachCancelButtonListener(buttonId: string, container: HTMLElement): void {
  const button = document.getElementById(buttonId);
  if (button) {
    button.addEventListener('click', () => {
      setSafeHTML(
        container,
        '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>'
      );
    });
  }
}
