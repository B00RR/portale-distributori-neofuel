import { describe, it, expect, beforeEach } from 'vitest';

import { FilterBar } from '../../js/admin/components/FilterBar.js';

describe('FilterBar Component', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="filter-container"></div>';
    });

    describe('THE SPECIALIST - Component Rendering', () => {
        it('should render filter bar in DOM', () => {
            const container = document.getElementById('filter-container')!;

            const filterBar = new FilterBar({
                filters: ['date', 'station', 'status'],
                onFilterChange: () => { }
            });

            filterBar.render(container);

            expect(container.querySelector('.filter-bar')).not.toBeNull();
        });

        it('should render date filter', () => {
            const container = document.getElementById('filter-container')!;

            const filterBar = new FilterBar({
                filters: ['date'],
                onFilterChange: () => { }
            });

            filterBar.render(container);

            const dateInput = container.querySelector('input[type="date"]');
            expect(dateInput).not.toBeNull();
        });

        it('should render station filter dropdown', () => {
            const container = document.getElementById('filter-container')!;

            const filterBar = new FilterBar({
                filters: ['station'],
                stations: [
                    { id: 1, name: 'Station 1' },
                    { id: 2, name: 'Station 2' }
                ],
                onFilterChange: () => { }
            });

            filterBar.render(container);

            const select = container.querySelector('select');
            expect(select).not.toBeNull();
            expect(container.innerHTML).toContain('Station 1');
        });

        it('should render status filter', () => {
            const container = document.getElementById('filter-container')!;

            const filterBar = new FilterBar({
                filters: ['status'],
                onFilterChange: () => { }
            });

            filterBar.render(container);

            expect(container.innerHTML).toContain('Status');
        });
    });
});
