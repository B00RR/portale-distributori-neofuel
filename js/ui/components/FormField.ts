/**
 * FormField Component
 * Componente riusabile per campi form con label e validazione
 */

import { html, css, CSSResultGroup, TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

import { BaseComponent } from './BaseComponent.js';

export interface FormFieldOption {
  value: string | number;
  label: string;
}

export class FormField extends BaseComponent {
  @property({ type: String }) label: string = '';
  @property({ type: String }) name: string = '';
  @property({ type: String }) type: string = 'text';
  @property({ type: String }) value: string | number | boolean = '';
  @property({ type: String }) placeholder: string = '';
  @property({ type: Boolean }) required: boolean = false;
  @property({ type: Boolean }) disabled: boolean = false;
  @property({ type: String }) error: string = '';
  @property({ type: Array }) options: (FormFieldOption | string)[] = [];
  @property({ type: Number }) rows: number = 3;
  @property({ type: String }) step: string = 'any';
  @property({ type: String }) min: string = '';
  @property({ type: String }) max: string = '';

  static override styles: CSSResultGroup = [
    BaseComponent.styles,
    css`
      .form-group {
        margin-bottom: 1rem;
      }

      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: var(--text-primary, #333);
      }

      label.required::after {
        content: ' *';
        color: var(--danger-color, #dc3545);
      }

      input,
      select,
      textarea {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid var(--border-color, #ddd);
        border-radius: 4px;
        font-size: 1rem;
        font-family: inherit;
        transition: border-color 0.2s;
      }

      input:focus,
      select:focus,
      textarea:focus {
        outline: none;
        border-color: var(--primary-color, #007bff);
        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
      }

      input:disabled,
      select:disabled,
      textarea:disabled {
        background-color: #f5f5f5;
        cursor: not-allowed;
      }

      input.error,
      select.error,
      textarea.error {
        border-color: var(--danger-color, #dc3545);
      }

      .error-message {
        margin-top: 0.25rem;
        font-size: 0.875rem;
        color: var(--danger-color, #dc3545);
      }
    `
  ];

  constructor() {
    super();
  }

  override render(): TemplateResult {
    return html`
      <div class="form-group">
        ${this.label ? html`
          <label class="${this.required ? 'required' : ''}">
            ${this.label}
          </label>
        ` : ''}
        
        ${this._renderInput()}
        
        ${this.error ? html`
          <div class="error-message">${this.error}</div>
        ` : ''}
      </div>
    `;
  }

  private _renderInput(): TemplateResult {
    const errorClass = this.error ? 'error' : '';

    switch (this.type) {
      case 'select':
        return html`
          <select
            name="${this.name}"
            class="${errorClass}"
            ?required="${this.required}"
            ?disabled="${this.disabled}"
            .value="${this.value}"
            @input="${this._handleInput}"
            @change="${this._handleChange}"
          >
            ${!this.required ? html`<option value="">Seleziona...</option>` : ''}
            ${this.options.map((opt: FormFieldOption | string) => {
    const val = typeof opt === 'object' ? opt.value : opt;
    const label = typeof opt === 'object' ? opt.label : opt;
    return html`
                <option value="${val}" ?selected="${this.value === val}">
                  ${label}
                </option>
              `;
  })}
          </select>
        `;

      case 'textarea':
        return html`
          <textarea
            name="${this.name}"
            class="${errorClass}"
            ?required="${this.required}"
            ?disabled="${this.disabled}"
            .value="${this.value}"
            placeholder="${this.placeholder}"
            rows="${this.rows}"
            @input="${this._handleInput}"
            @change="${this._handleChange}"
          ></textarea>
        `;

      case 'number':
        return html`
          <input
            type="number"
            name="${this.name}"
            class="${errorClass}"
            ?required="${this.required}"
            ?disabled="${this.disabled}"
            .value="${this.value}"
            placeholder="${this.placeholder}"
            step="${this.step}"
            min="${this.min}"
            max="${this.max}"
            @input="${this._handleInput}"
            @change="${this._handleChange}"
          />
        `;

      case 'checkbox':
        return html`
          <label class="checkbox-label">
            <input
              type="checkbox"
              name="${this.name}"
              ?required="${this.required}"
              ?disabled="${this.disabled}"
              ?checked="${this.value === 'true' || this.value === true}"
              @input="${this._handleInput}"
              @change="${this._handleChange}"
            />
            ${this.placeholder}
          </label>
        `;

      default:
        return html`
          <input
            type="${this.type}"
            name="${this.name}"
            class="${errorClass}"
            ?required="${this.required}"
            ?disabled="${this.disabled}"
            .value="${this.value}"
            placeholder="${this.placeholder}"
            @input="${this._handleInput}"
            @change="${this._handleChange}"
          />
        `;
    }
  }

  private _handleInput(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    this.value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
    this.emit('input', { name: this.name, value: this.value });
  }

  private _handleChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    this.value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
    this.emit('change', { name: this.name, value: this.value });
  }

  public getValue(): string | number | boolean {
    const input = this.shadowRoot?.querySelector('input, select, textarea');
    if (!input) { return this.value; }
    if ((input as HTMLInputElement).type === 'checkbox') { return (input as HTMLInputElement).checked; }
    return (input as HTMLInputElement).value;
  }

  public setError(message: string): void {
    this.error = message;
  }

  public clearError(): void {
    this.error = '';
  }
}

if (!customElements.get('form-field')) {
  customElements.define('form-field', FormField);
}
