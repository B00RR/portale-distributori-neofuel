/**
 * Base Component Class
 * Classe base per tutti i componenti Lit dell'applicazione
 */

import { LitElement, CSSResultGroup, css } from 'lit';

import { logger } from '../../core/logger.js';

export class BaseComponent extends LitElement {
  /**
   * Stili comuni a tutti i componenti
   */
  static override styles: CSSResultGroup = [css`
    * {
      box-sizing: border-box;
    }

    :host {
      display: block;
    }

    /* Utility classes */
    .hidden {
      display: none !important;
    }

    .error {
      color: var(--danger-color, #dc3545);
    }

    .success {
      color: var(--success-color, #28a745);
    }

    .warning {
      color: var(--warning-color, #ffc107);
    }
  `];

  /**
   * Emette un evento personalizzato
   * @param {string} eventName - Nome dell'evento
   * @param {unknown} detail - Dettagli dell'evento
   */
  public emit(eventName: string, detail: unknown = {}): void {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Helper per gestire errori nei componenti
   * @param {Error} error - Errore catturato
   * @param {string} context - Contesto dell'errore
   */
  public handleComponentError(error: Error | unknown, context: string = ''): void {
    const componentName = this.constructor.name || 'BaseComponent';
    logger.error(`[${componentName}${context ? ':' + context : ''}]`, error);
    this.emit('component-error', { error, context });
  }
}
