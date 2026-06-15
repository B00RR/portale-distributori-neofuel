import { store } from '../../shared/state.js';
import { openModal, closeModal } from '../../ui/ui.js';

/**
 * Componente riutilizzabile per la barra dei filtri (Ricerca, Date, ecc.)
 */
export class FilterBar {
  private containerId: string;

  constructor(containerId: string) {
    this.containerId = containerId;
  }

  public render(): void {
    const container = document.getElementById(this.containerId);
    if (!container) { return; }

    const currentFilters = store.getFilters();
    const activeChip = currentFilters.rangeLabel || 'all';

    const chips = [
      { label: 'Tutto', value: 'all' },
      { label: 'Oggi', value: 'today' },
      { label: 'Settimana', value: 'week' },
      { label: 'Mese', value: 'month' }
    ];

    const stations = store.getStations() || [];
    const currentStation = store.getFilter();

    container.innerHTML = `
            <div class="filter-bar">
                <div class="station-filter-wrapper" style="flex: 1; min-width: 200px;">
                    <select id="station-filter-select" class="search-input" style="appearance: auto; padding-left: 12px; cursor: pointer;">
                        <option value="">Tutte le Stazioni</option>
                        ${stations.map((s: any) => `
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

  private bindEvents(): void {
    const container = document.getElementById(this.containerId);
    if (!container) { return; }

    // Station Select
    const stationSelect = container.querySelector('#station-filter-select') as HTMLSelectElement;
    if (stationSelect) {
      stationSelect.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        const val = target.value;
        store.setStationFilter(val ? parseInt(val) as any : null);
      });
    }

    // Chips
    container.querySelectorAll('.chip[data-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = (btn as HTMLElement).dataset.value;
        if (value) { this.handleChipClick(value); }
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

  private handleChipClick(rangeValue: string): void {
    const today = new Date();
    let from: string | null = null;
    let to: string | null = null;

    // Reset hours
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    switch (rangeValue) {
      case 'today':
        from = today.toISOString().split('T')[0] ?? null;
        to = tomorrow.toISOString().split('T')[0] ?? null; // Query usually < to
        break;
      case 'week':
        // Inizio settimana (Lunedì)
        const day = today.getDay() || 7; // Dom=0 -> 7
        if (day !== 1) { today.setHours(-24 * (day - 1)); }
        from = today.toISOString().split('T')[0] ?? null;
        to = null; // Fine al futuro
        break;
      case 'month':
        today.setDate(1);
        from = today.toISOString().split('T')[0] ?? null;
        to = null;
        break;
      case 'all':
      default:
        from = null;
        to = null;
        break;
    }

    (store as any).setFilters({
      rangeLabel: rangeValue,
      dateFrom: from,
      dateTo: to
    });
    this.render(); // Re-render to update active chip
  }

  private openDateModal(): void {
    openModal('Filtri Personalizzati');
    const target = document.getElementById('modal-body');
    if (!target) { return; }
    const current = (store as any).getFilters();

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

    const filtersForm = document.getElementById('filters-form');
    if (filtersForm) {
      filtersForm.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const dateFrom = fd.get('dateFrom') as string;
        const dateTo = fd.get('dateTo') as string;

        (store as any).setFilters({
          rangeLabel: 'custom',
          dateFrom: dateFrom || null,
          dateTo: dateTo || null
        });

        closeModal();
        this.render();
      });
    }
  }
}
