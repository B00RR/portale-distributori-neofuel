import { describe, it, expect, beforeEach } from 'vitest';
import { DataTable, DataTableColumn } from '../../js/ui/components/DataTable.js';
import { html } from 'lit';

describe('DataTable Component', () => {

    beforeEach(() => {
        // Ensure component is registered
        if (!customElements.get('data-table')) {
            customElements.define('data-table', DataTable);
        }
    });

    describe('Component Structure', () => {
        it('should be defined as a custom element', () => {
            const element = document.createElement('data-table') as DataTable;
            expect(element).toBeInstanceOf(DataTable);
        });

        it('should have default properties', () => {
            const element = new DataTable();
            expect(element.columns).toEqual([]);
            expect(element.data).toEqual([]);
            expect(element.sortColumn).toBe('');
            expect(element.sortDirection).toBe('asc');
            expect(element.loading).toBe(false);
            expect(element.emptyMessage).toBe('Nessun dato disponibile');
        });
    });

    describe('Data Handling', () => {
        it('should accept columns configuration', () => {
            const element = new DataTable();
            const columns: DataTableColumn[] = [
                { key: 'id', label: 'ID', sortable: true },
                { key: 'name', label: 'Name' }
            ];

            element.columns = columns;
            expect(element.columns).toEqual(columns);
        });

        it('should accept data array', () => {
            const element = new DataTable();
            const data = [
                { id: 1, name: 'John' },
                { id: 2, name: 'Jane' }
            ];

            element.data = data;
            expect(element.data).toEqual(data);
        });
    });

    describe('Loading State', () => {
        it('should show loading state when loading is true', () => {
            const element = new DataTable();
            element.loading = true;

            expect(() => element.render()).not.toThrow();
        });

        it('should not be loading by default', () => {
            const element = new DataTable();
            expect(element.loading).toBe(false);
        });

        it('should render loading spinner', () => {
            const element = new DataTable();
            element.loading = true;

            const result = element.render();
            expect(result).toBeDefined();
        });
    });

    describe('Empty State', () => {
        it('should show empty state when no data', () => {
            const element = new DataTable();
            element.data = [];
            element.loading = false;

            expect(() => element.render()).not.toThrow();
        });

        it('should display custom empty message', () => {
            const element = new DataTable();
            element.data = [];
            element.emptyMessage = 'No records found';

            expect(element.emptyMessage).toBe('No records found');
        });

        it('should render empty state with custom message', () => {
            const element = new DataTable();
            element.data = [];
            element.emptyMessage = 'Custom empty message';

            const result = element.render();
            expect(result).toBeDefined();
        });
    });

    describe('Sorting', () => {
        it('should support sortable columns', () => {
            const element = new DataTable();
            const columns: DataTableColumn[] = [
                { key: 'name', label: 'Name', sortable: true },
                { key: 'age', label: 'Age', sortable: true }
            ];

            element.columns = columns;
            expect(element.columns[0].sortable).toBe(true);
        });

        it('should track sort column and direction', () => {
            const element = new DataTable();
            element.sortColumn = 'name';
            element.sortDirection = 'desc';

            expect(element.sortColumn).toBe('name');
            expect(element.sortDirection).toBe('desc');
        });

        it('should default to ascending sort', () => {
            const element = new DataTable();
            expect(element.sortDirection).toBe('asc');
        });

        it('should support descending sort', () => {
            const element = new DataTable();
            element.sortDirection = 'desc';
            expect(element.sortDirection).toBe('desc');
        });
    });

    describe('Render Method', () => {
        it('should render without throwing', () => {
            const element = new DataTable();
            expect(() => element.render()).not.toThrow();
        });

        it('should render with columns and data', () => {
            const element = new DataTable();
            element.columns = [
                { key: 'id', label: 'ID' },
                { key: 'name', label: 'Name' }
            ];
            element.data = [
                { id: 1, name: 'Test' }
            ];

            expect(() => element.render()).not.toThrow();
        });

        it('should render with sortable columns', () => {
            const element = new DataTable();
            element.columns = [
                { key: 'name', label: 'Name', sortable: true }
            ];
            element.data = [
                { name: 'Alice' },
                { name: 'Bob' }
            ];

            expect(() => element.render()).not.toThrow();
        });

        it('should render with custom cell renderer', () => {
            const element = new DataTable();
            element.columns = [
                {
                    key: 'status',
                    label: 'Status',
                    render: (row) => html`<span>${row.status.toUpperCase()}</span>`
                }
            ];
            element.data = [
                { status: 'active' }
            ];

            expect(() => element.render()).not.toThrow();
        });
    });

    describe('Event Emission', () => {
        it('should have emit method from BaseComponent', () => {
            const element = new DataTable();
            expect(element.emit).toBeDefined();
            expect(typeof element.emit).toBe('function');
        });
    });
});
