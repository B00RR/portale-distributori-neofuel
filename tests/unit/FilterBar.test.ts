import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStore, mockUI } = vi.hoisted(() => ({
    mockStore: {
        getFilters: vi.fn(() => ({ rangeLabel: 'all', dateFrom: null, dateTo: null })),
        getStations: vi.fn(() => [{ station_id: 1, station_name: 'Station 1' }]),
        getFilter: vi.fn(() => null),
        setStationFilter: vi.fn(),
        setFilters: vi.fn()
    },
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn()
    }
}));

vi.mock('../../shared/state.js', () => ({ store: mockStore }));
vi.mock('../../ui/ui.js', () => mockUI);

import { FilterBar } from '../../js/admin/components/FilterBar.js';

describe('FilterBar Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="filter-bar-container"></div>';
    });

    it('should create FilterBar instance', () => {
        const filterBar = new FilterBar('filter-bar-container');
        expect(filterBar).toBeDefined();
    });

    it('should render filter bar', () => {
        const filterBar = new FilterBar('filter-bar-container');
        filterBar.render();

        const container = document.getElementById('filter-bar-container');
        expect(container?.innerHTML).toContain('filter-bar');
    });

    it('should render station select', () => {
        const filterBar = new FilterBar('filter-bar-container');
        filterBar.render();

        const select = document.getElementById('station-filter-select');
        expect(select).not.toBeNull();
    });

    it('should render date chips', () => {
        const filterBar = new FilterBar('filter-bar-container');
        filterBar.render();

        const container = document.getElementById('filter-bar-container');
        expect(container?.innerHTML).toContain('Oggi');
        expect(container?.innerHTML).toContain('Settimana');
    });
});
