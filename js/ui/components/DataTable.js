/**
 * DataTable Component
 * Tabella riusabile con sorting e selezione
 * 
 * @example
 * <data-table
 *   .columns=${[
 *     { key: 'id', label: 'ID', sortable: true },
 *     { key: 'name', label: 'Nome', sortable: true },
 *     { key: 'actions', label: 'Azioni', render: (row) => html`<button>Edit</button>` }
 *   ]}
 *   .data=${rows}>
 * </data-table>
 */

import { html, css } from 'lit';
import { BaseComponent } from './BaseComponent.js';

export class DataTable extends BaseComponent {
    static properties = {
        columns: { type: Array },
        data: { type: Array },
        sortColumn: { type: String },
        sortDirection: { type: String },
        loading: { type: Boolean },
        emptyMessage: { type: String },
    };

    static styles = [
        BaseComponent.styles,
        css`
      table {
        width: 100%;
        border-collapse: collapse;
        background: white;
      }

      thead {
        background: var(--table-header-bg, #f8f9fa);
        border-bottom: 2px solid var(--border-color, #dee2e6);
      }

      th {
        padding: 0.75rem;
        text-align: left;
        font-weight: 600;
        color: var(--text-primary, #333);
        white-space: nowrap;
      }

      th.sortable {
        cursor: pointer;
        user-select: none;
      }

      th.sortable:hover {
        background: var(--table-hover-bg, #e9ecef);
      }

      th .sort-icon {
        margin-left: 0.5rem;
        opacity: 0.5;
        font-size: 0.75rem;
      }

      th.sorted .sort-icon {
        opacity: 1;
      }

      td {
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color, #dee2e6);
      }

      tbody tr:hover {
        background: var(--table-hover-bg, #f8f9fa);
      }

      .loading-state,
      .empty-state {
        text-align: center;
        padding: 3rem;
        color: var(--text-secondary, #6c757d);
      }

      .loading-spinner {
        font-size: 2rem;
        color: var(--primary-color, #007bff);
      }
    `
    ];

    constructor() {
        super();
        this.columns = [];
        this.data = [];
        this.sortColumn = '';
        this.sortDirection = 'asc';
        this.loading = false;
        this.emptyMessage = 'Nessun dato disponibile';
    }

    render() {
        if (this.loading) {
            return html`
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin loading-spinner"></i>
          <p>Caricamento...</p>
        </div>
      `;
        }

        if (!this.data || this.data.length === 0) {
            return html`
        <div class="empty-state">
          <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
          <p>${this.emptyMessage}</p>
        </div>
      `;
        }

        return html`
      <table>
        <thead>
          <tr>
            ${this.columns.map(col => html`
              <th 
                class="${col.sortable ? 'sortable' : ''} ${this.sortColumn === col.key ? 'sorted' : ''}"
                @click="${col.sortable ? () => this._handleSort(col.key) : null}">
                ${col.label}
                ${col.sortable ? this._renderSortIcon(col.key) : ''}
              </th>
            `)}
          </tr>
        </thead>
        <tbody>
          ${this._getSortedData().map(row => html`
            <tr @click="${() => this._handleRowClick(row)}">
              ${this.columns.map(col => html`
                <td>${this._renderCell(row, col)}</td>
              `)}
            </tr>
          `)}
        </tbody>
      </table>
    `;
    }

    _renderSortIcon(columnKey) {
        if (this.sortColumn !== columnKey) {
            return html`<i class="fas fa-sort sort-icon"></i>`;
        }
        return this.sortDirection === 'asc'
            ? html`<i class="fas fa-sort-up sort-icon"></i>`
            : html`<i class="fas fa-sort-down sort-icon"></i>`;
    }

    _renderCell(row, column) {
        if (column.render) {
            return column.render(row);
        }
        return row[column.key] || '-';
    }

    _handleSort(columnKey) {
        if (this.sortColumn === columnKey) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = columnKey;
            this.sortDirection = 'asc';
        }
        this.emit('sort', { column: this.sortColumn, direction: this.sortDirection });
    }

    _handleRowClick(row) {
        this.emit('row-click', { row });
    }

    _getSortedData() {
        if (!this.sortColumn) return this.data;

        return [...this.data].sort((a, b) => {
            const aVal = a[this.sortColumn];
            const bVal = b[this.sortColumn];

            if (aVal === bVal) return 0;

            const comparison = aVal < bVal ? -1 : 1;
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });
    }
}

customElements.define('data-table', DataTable);
