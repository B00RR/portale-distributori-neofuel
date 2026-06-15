/**
 * AlertBox Component
 * Box di alert/notifica riusabile
 * 
 * @example
 * <alert-box type="success" dismissible>
 *   <strong>Successo!</strong> Operazione completata.
 * </alert-box>
 */

import { html, css, TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

import { BaseComponent } from './BaseComponent.js';

export class AlertBox extends BaseComponent {
  @property({ type: String }) type: 'info' | 'success' | 'warning' | 'danger' = 'info';
  @property({ type: Boolean }) dismissible: boolean = false;
  @property({ type: String }) icon: string = '';
  @property({ type: Boolean }) visible: boolean = true;

  static override styles = [
    BaseComponent.styles,
    css`
      .alert {
        padding: 1rem 1.25rem;
        margin-bottom: 1rem;
        border-radius: 4px;
        border: 1px solid transparent;
        display: flex;
        align-items: start;
        gap: 0.75rem;
      }

      .alert.hidden {
        display: none;
      }

      .alert-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
      }

      .alert-content {
        flex: 1;
      }

      .alert-close {
        background: none;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0;
        margin-left: auto;
        opacity: 0.6;
        transition: opacity 0.2s;
      }

      .alert-close:hover {
        opacity: 1;
      }

      /* Variants */
      .alert.info {
        background-color: #d1ecf1;
        border-color: #bee5eb;
        color: #0c5460;
      }

      .alert.success {
        background-color: #d4edda;
        border-color: #c3e6cb;
        color: #155724;
      }

      .alert.warning {
        background-color: #fff3cd;
        border-color: #ffeeba;
        color: #856404;
      }

      .alert.danger {
        background-color: #f8d7da;
        border-color: #f5c6cb;
        color: #721c24;
      }
    `
  ];

  constructor() {
    super();
  }

  override render(): TemplateResult | typeof html | any {
    if (!this.visible) { return html``; }

    const defaultIcons: Record<string, string> = {
      info: 'fa-info-circle',
      success: 'fa-check-circle',
      warning: 'fa-exclamation-triangle',
      danger: 'fa-times-circle'
    };

    const iconClass = this.icon || defaultIcons[this.type] || 'fa-info-circle';

    return html`
      <div class="alert ${this.type} ${this.visible ? '' : 'hidden'}" role="alert">
        <i class="fas ${iconClass} alert-icon"></i>
        <div class="alert-content">
          <slot></slot>
        </div>
        ${this.dismissible ? html`
          <button class="alert-close" @click="${this._handleDismiss}" type="button" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        ` : ''}
      </div>
    `;
  }

  private _handleDismiss(): void {
    this.visible = false;
    this.emit('dismissed');
  }

  public show(): void {
    this.visible = true;
  }

  public hide(): void {
    this.visible = false;
  }
}

if (!customElements.get('alert-box')) {
  customElements.define('alert-box', AlertBox);
}
