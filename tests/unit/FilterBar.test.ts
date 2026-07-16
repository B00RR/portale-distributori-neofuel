import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// I chip data (#290) devono produrre la data LOCALE: pinniamo il fuso su
// Europe/Rome così i test coprono il caso limite anche quando la CI gira in UTC.
process.env.TZ = 'Europe/Rome';

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

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));
vi.mock('../../js/ui/ui.js', () => mockUI);

import { FilterBar } from '../../js/admin/components/FilterBar.js';

describe('FilterBar Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStore.getFilters.mockReturnValue({ rangeLabel: 'all', dateFrom: null, dateTo: null });
        mockStore.getStations.mockReturnValue([{ station_id: 1, station_name: 'Station 1' }]);
        mockStore.getFilter.mockReturnValue(null);
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

    describe('date range chips use the local date, not UTC (#290)', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            // 22:30 UTC = 00:30 del 16/07/2026 a Roma (UTC+2): la data UTC è
            // ancora il 15/07, quindi un calcolo basato su toISOString()
            // produrrebbe il giorno sbagliato.
            vi.setSystemTime(new Date('2026-07-15T22:30:00Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        const clickChip = (value: string): void => {
            const filterBar = new FilterBar('filter-bar-container');
            filterBar.render();
            const chip = document.querySelector(`.chip[data-value="${value}"]`) as HTMLElement;
            expect(chip).not.toBeNull();
            chip.click();
        };

        it("'Oggi' filters on the local day (16/07), not the UTC day (15/07)", () => {
            clickChip('today');
            expect(mockStore.setFilters).toHaveBeenCalledWith({
                rangeLabel: 'today',
                dateFrom: '2026-07-16',
                dateTo: '2026-07-17'
            });
        });

        it("'Settimana' starts from the local Monday (13/07)", () => {
            clickChip('week');
            expect(mockStore.setFilters).toHaveBeenCalledWith({
                rangeLabel: 'week',
                dateFrom: '2026-07-13',
                dateTo: null
            });
        });

        it("'Mese' starts from the 1st of the local month (01/07)", () => {
            clickChip('month');
            expect(mockStore.setFilters).toHaveBeenCalledWith({
                rangeLabel: 'month',
                dateFrom: '2026-07-01',
                dateTo: null
            });
        });
    });
});
