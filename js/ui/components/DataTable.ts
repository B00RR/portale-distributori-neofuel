/**
 * DataTable Component
 * Tabella riusabile con sorting e selezione
 */

import { html, css, TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

import { BaseComponent } from './BaseComponent.js';

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: Record<string, unknown>) => TemplateResult | string;
}

export class DataTable extends BaseComponent {
  @property({ type: Array }) columns: DataTableColumn[] = [];
  @property({ type: Array }) data: Record<string, unknown>[] = [];
  @property({ type: String }) sortColumn: string = '';
  @property({ type: String }) sortDirection: 'asc' | 'desc' = 'asc';
  @property({ type: Boolean }) loading: boolean = false;
  @property({ type: String }) emptyMessage: string = 'Nessun dato disponibile';

  static override styles = [
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
  }

  override render(): TemplateResult {
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

  private _renderSortIcon(columnKey: string): TemplateResult {
    if (this.sortColumn !== columnKey) {
      return html`<i class="fas fa-sort sort-icon"></i>`;
    }
    return this.sortDirection === 'asc'
      ? html`<i class="fas fa-sort-up sort-icon"></i>`
      : html`<i class="fas fa-sort-down sort-icon"></i>`;
  }

  private _renderCell(row: Record<string, unknown>, column: DataTableColumn): TemplateResult | string {
    if (column.render) {
      return column.render(row);
    }
    const value = row[column.key];
    return value === undefined || value === null ? '-' : String(value);
  }

  private _handleSort(columnKey: string): void {
    if (this.sortColumn === columnKey) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = columnKey;
      this.sortDirection = 'asc';
    }
    this.emit('sort', { column: this.sortColumn, direction: this.sortDirection });
  }

  private _handleRowClick(row: Record<string, unknown>): void {
    this.emit('row-click', { row });
  }

  private _getSortedData(): Record<string, unknown>[] {
    if (!this.sortColumn) { return this.data; }

    return [...this.data].sort((a, b) => {
      const aVal = a[this.sortColumn];
      const bVal = b[this.sortColumn];

      if (aVal === bVal) { return 0; }
      if (aVal === null || aVal === undefined) { return 1; }
      if (bVal === null || bVal === undefined) { return -1; }

      const comparison = aVal < bVal ? -1 : 1;
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }
}

if (!customElements.get('data-table')) {
  customElements.define('data-table', DataTable);
}
