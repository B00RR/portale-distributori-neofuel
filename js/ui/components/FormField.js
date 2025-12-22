/**
 * FormField Component
 * Componente riusabile per campi form con label e validazione
 * 
 * @example
 * <form-field 
 *   label="Nome" 
 *   name="nome" 
 *   type="text"
 *   required
 *   value="Mario">
 * </form-field>
 */

import { html, css } from 'lit';
import { BaseComponent } from './BaseComponent.js';

export class FormField extends BaseComponent {
    static properties = {
        label: { type: String },
        name: { type: String },
        type: { type: String },
        value: { type: String },
        placeholder: { type: String },
        required: { type: Boolean },
        disabled: { type: Boolean },
        error: { type: String },
        options: { type: Array }, // Per select
        rows: { type: Number }, // Per textarea
        step: { type: String }, // Per input number
        min: { type: String },
        max: { type: String },
    };

    static styles = [
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
        this.label = '';
        this.name = '';
        this.type = 'text';
        this.value = '';
        this.placeholder = '';
        this.required = false;
        this.disabled = false;
        this.error = '';
        this.options = [];
        this.rows = 3;
        this.step = 'any';
        this.min = '';
        this.max = '';
    }

    render() {
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

    _renderInput() {
        const commonAttrs = {
            name: this.name,
      ? required : this.required,
      ?disabled: this.disabled,
            class: this.error ? 'error' : '',
                @input: this._handleInput,
                    @change: this._handleChange,
    };

    switch(this.type) {
      case 'select':
        return html`
          <select .value=${this.value} ...${commonAttrs}>
            ${!this.required ? html`<option value="">Seleziona...</option>` : ''}
            ${this.options.map(opt => html`
              <option value="${opt.value || opt}" ?selected="${this.value === (opt.value || opt)}">
                ${opt.label || opt}
              </option>
            `)}
          </select>
        `;

      case 'textarea':
        return html`
          <textarea
            .value=${this.value}
            placeholder="${this.placeholder}"
            rows="${this.rows}"
            ...${commonAttrs}
          ></textarea>
        `;

      case 'number':
        return html`
          <input
            type="number"
            .value=${this.value}
            placeholder="${this.placeholder}"
            step="${this.step}"
            min="${this.min}"
            max="${this.max}"
            ...${commonAttrs}
          />
        `;

      case 'checkbox':
        return html`
          <label class="checkbox-label">
            <input
              type="checkbox"
              ?checked=${this.value === 'true' || this.value === true}
              ...${commonAttrs}
            />
            ${this.placeholder}
          </label>
        `;

      default:
        return html`
          <input
            type="${this.type}"
            .value=${this.value}
            placeholder="${this.placeholder}"
            ...${commonAttrs}
          />
        `;
    }
  }

_handleInput(e) {
    this.value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    this.emit('input', { name: this.name, value: this.value });
}

_handleChange(e) {
    this.value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    this.emit('change', { name: this.name, value: this.value });
}

/**
 * Ottiene il valore corrente del campo
 */
getValue() {
    const input = this.shadowRoot.querySelector('input, select, textarea');
    if (input.type === 'checkbox') return input.checked;
    return input.value;
}

/**
 * Imposta un errore di validazione
 */
setError(message) {
    this.error = message;
}

/**
 * Rimuove l'errore di validazione
 */
clearError() {
    this.error = '';
}
}

customElements.define('form-field', FormField);
