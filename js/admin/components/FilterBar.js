
import { store } from "../../shared/state.js";
import { openModal, closeModal } from "../../ui/ui.js";

/**
 * Componente riutilizzabile per la barra dei filtri (Ricerca, Date, ecc.)
 */
export class FilterBar {
    constructor(containerId) {
        this.containerId = containerId;
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const currentFilters = store.getFilters();
        const activeChip = currentFilters.rangeLabel || 'all';

        const chips = [
            { label: 'Tutto', value: 'all' },
            { label: 'Oggi', value: 'today' },
            { label: 'Settimana', value: 'week' },
            { label: 'Mese', value: 'month' }
        ];

        const stations = store.state.stations || [];
        const currentStation = store.getFilter();

        container.innerHTML = `
            <div class="filter-bar">
                <div class="station-filter-wrapper" style="flex: 1; min-width: 200px;">
                    <select id="station-filter-select" class="search-input" style="appearance: auto; padding-left: 12px; cursor: pointer;">
                        <option value="">Tutte le Stazioni</option>
                        ${stations.map(s => `
                            <option value="${s.station_id}" ${currentStation == s.station_id ? 'selected' : ''}>
                                ${s.station_name}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="filter-chips">
                    ${chips.map(chip => `
                        <button class="chip ${activeChip === chip.value ? 'active' : ''}" data-value="${chip.value}">
                            ${chip.label}
                        </button>
                    `).join('')}
                    <button class="chip ${activeChip === 'custom' ? 'active' : ''}" id="btn-custom-range" title="Date personalizzate">
                        <i class="fas fa-calendar-alt"></i>
                    </button>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Station Select
        const stationSelect = container.querySelector('#station-filter-select');
        if (stationSelect) {
            stationSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                store.setStationFilter(val ? parseInt(val) : null);
            });
        }

        // Chips
        container.querySelectorAll('.chip[data-value]').forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.value;
                this.handleChipClick(value);
            });
        });

        // Custom Range Button
        const customBtn = container.querySelector('#btn-custom-range');
        if (customBtn) {
            customBtn.addEventListener('click', () => {
                this.openDateModal();
            });
        }

        // Advanced Filters Button (same as custom for now, or more complex)
        const advancedBtn = container.querySelector('#btn-advanced-filters');
        if (advancedBtn) {
            advancedBtn.addEventListener('click', () => {
                this.openDateModal();
            });
        }
    }

    handleChipClick(rangeValue) {
        const today = new Date();
        let from = null;
        let to = null;

        // Reset hours
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        switch (rangeValue) {
            case 'today':
                from = today.toISOString().split('T')[0];
                to = tomorrow.toISOString().split('T')[0]; // Query usually < to
                break;
            case 'week':
                // Inizio settimana (Lunedì)
                const day = today.getDay() || 7; // Dom=0 -> 7
                if (day !== 1) today.setHours(-24 * (day - 1));
                from = today.toISOString().split('T')[0];
                to = null; // Fine al futuro
                break;
            case 'month':
                today.setDate(1);
                from = today.toISOString().split('T')[0];
                to = null;
                break;
            case 'all':
            default:
                from = null;
                to = null;
                break;
        }

        store.setFilters({
            rangeLabel: rangeValue,
            dateFrom: from,
            dateTo: to
        });
        this.render(); // Re-render to update active chip
    }

    openDateModal() {
        openModal('Filtri Personalizzati');
        const target = document.getElementById('modal-body');
        const current = store.getFilters();

        target.innerHTML = `
            <form id="filters-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Da:</label>
                        <input type="date" name="dateFrom" value="${current.dateFrom || ''}">
                    </div>
                    <div class="form-group">
                        <label>A:</label>
                        <input type="date" name="dateTo" value="${current.dateTo || ''}">
                    </div>
                </div>
                <!-- Future: Station Select here if needed -->
                <button type="submit" class="menu-button primary">Applica</button>
            </form>
        `;

        document.getElementById('filters-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const dateFrom = fd.get('dateFrom');
            const dateTo = fd.get('dateTo');

            store.setFilters({
                rangeLabel: 'custom',
                dateFrom: dateFrom || null,
                dateTo: dateTo || null
            });

            closeModal();
            this.render();
        });
    }
}
