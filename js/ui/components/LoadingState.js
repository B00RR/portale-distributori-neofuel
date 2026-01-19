/**
 * LoadingState Component
 * Spinner di caricamento riusabile
 * 
 * @example
 * <loading-state message="Caricamento dati..."></loading-state>
 */

import { html, css } from 'lit';

import { BaseComponent } from './BaseComponent.js';

export class LoadingState extends BaseComponent {
  static properties = {
    message: { type: String },
    size: { type: String } // small, medium, large
  };

  static styles = [
    BaseComponent.styles,
    css`
      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        text-align: center;
      }

      .spinner {
        display: inline-block;
        animation: spin 1s linear infinite;
        color: var(--primary-color, #007bff);
      }

      .spinner.small {
        font-size: 1.5rem;
      }

      .spinner.medium {
        font-size: 2.5rem;
      }

      .spinner.large {
        font-size: 4rem;
      }

      .message {
        margin-top: 1rem;
        color: var(--text-secondary, #6c757d);
        font-size: 0.875rem;
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    `
  ];

  constructor() {
    super();
    this.message = 'Caricamento...';
    this.size = 'medium';
  }

  render() {
    return html`
      <div class="loading-container">
        <i class="fas fa-spinner spinner ${this.size}"></i>
        ${this.message ? html`<div class="message">${this.message}</div>` : ''}
      </div>
    `;
  }
}

customElements.define('loading-state', LoadingState);
