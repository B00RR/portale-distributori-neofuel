/**
 * CardBox Component  
 * Container riusabile con header e footer opzionali
 *
 * @example
 * <card-box title="Statistiche">
 *   <p slot="body">Contenuto principale</p>
 *   <button slot="footer">Azione</button>
 * </card-box>
 */

import { html, css, CSSResultGroup, TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

import { BaseComponent } from './BaseComponent.js';

export class CardBox extends BaseComponent {
  @property({ type: String }) override title: string = '';
  @property({ type: String }) subtitle: string = '';
  @property({ type: String }) variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' =
    'default';

  static override styles: CSSResultGroup = [
    BaseComponent.styles,
    css`
      .card {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        transition: box-shadow 0.2s;
      }

      .card:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
      }

      .card-header {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border-color, #dee2e6);
        background: var(--card-header-bg, #f8f9fa);
      }

      .card-header h3 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--text-primary, #333);
      }

      .card-header .subtitle {
        margin-top: 0.25rem;
        font-size: 0.875rem;
        color: var(--text-secondary, #6c757d);
      }

      .card-body {
        padding: 1.5rem;
      }

      .card-footer {
        padding: 1rem 1.5rem;
        background: var(--card-footer-bg, #f8f9fa);
        border-top: 1px solid var(--border-color, #dee2e6);
      }

      /* Variants */
      .card.primary .card-header {
        background: var(--primary-color, #007bff);
        color: white;
        border-bottom-color: rgba(255, 255, 255, 0.2);
      }

      .card.primary h3 {
        color: white;
      }

      .card.success .card-header {
        background: var(--success-color, #28a745);
        color: white;
        border-bottom-color: rgba(255, 255, 255, 0.2);
      }

      .card.success h3 {
        color: white;
      }

      .card.warning .card-header {
        background: var(--warning-color, #ffc107);
        color: #333;
        border-bottom-color: rgba(0, 0, 0, 0.1);
      }

      .card.danger .card-header {
        background: var(--danger-color, #dc3545);
        color: white;
        border-bottom-color: rgba(255, 255, 255, 0.2);
      }

      .card.danger h3 {
        color: white;
      }
    `
  ];

  constructor() {
    super();
  }

  override render(): TemplateResult {
    return html`
      <div class="card ${this.variant}">
        ${
          this.title || this._hasHeaderSlot()
            ? html`
                <div class="card-header">
                  ${
                    this.title
                      ? html`
                    <h3>${this.title}</h3>
                    ${this.subtitle ? html`<div class="subtitle">${this.subtitle}</div>` : ''}
                  `
                      : html` <slot name="header"></slot> `
                  }
                </div>
              `
            : ''
        }

        <div class="card-body">
          <slot></slot>
        </div>

        ${
          this._hasFooterSlot()
            ? html`
                <div class="card-footer">
                  <slot name="footer"></slot>
                </div>
              `
            : ''
        }
      </div>
    `;
  }

  private _hasHeaderSlot(): boolean {
    return this.querySelector('[slot="header"]') !== null;
  }

  private _hasFooterSlot(): boolean {
    return this.querySelector('[slot="footer"]') !== null;
  }
}

if (!customElements.get('card-box')) {
  customElements.define('card-box', CardBox);
}
