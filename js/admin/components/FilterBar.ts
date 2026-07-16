import { logger } from '../../core/logger.js';
import { store } from '../../shared/state.js';
import { Station } from '../../shared/state.js';
import { openModal, closeModal } from '../../ui/ui.js';
import { setSafeHTML } from '../../utils/sanitizer.js';
import { getISODate } from '../../utils/utils.js';

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
    if (!container) {
      return;
    }

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

    container.replaceChildren();

    const bar = document.createElement('div');
    bar.className = 'filter-bar';

    const stationWrapper = document.createElement('div');
    stationWrapper.className = 'station-filter-wrapper';
    stationWrapper.style.flex = '1';
    stationWrapper.style.minWidth = '200px';

    const stationSelect = document.createElement('select');
    stationSelect.id = 'station-filter-select';
    stationSelect.className = 'search-input';
    stationSelect.style.appearance = 'auto';
    stationSelect.style.paddingLeft = '12px';
    stationSelect.style.cursor = 'pointer';

    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'Tutte le Stazioni';
    stationSelect.appendChild(allOpt);

    stations.forEach((s: Station) => {
      const opt = document.createElement('option');
      opt.value = String(s.station_id ?? s.id ?? '');
      opt.textContent = s.station_name || s.name || '';
      if (currentStation === String(s.station_id ?? s.id)) {
        opt.selected = true;
      }
      stationSelect.appendChild(opt);
    });

    stationWrapper.appendChild(stationSelect);
    bar.appendChild(stationWrapper);

    const chipContainer = document.createElement('div');
    chipContainer.className = 'filter-chips';

    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'chip ' + (activeChip === chip.value ? 'active' : '');
      btn.dataset.value = chip.value;
      btn.textContent = chip.label;
      chipContainer.appendChild(btn);
    });

    const customBtn = document.createElement('button');
    customBtn.className = 'chip ' + (activeChip === 'custom' ? 'active' : '');
    customBtn.id = 'btn-custom-range';
    customBtn.title = 'Date personalizzate';
    setSafeHTML(customBtn, '<i class="fas fa-calendar-alt"></i>');
    chipContainer.appendChild(customBtn);

    bar.appendChild(chipContainer);
    container.appendChild(bar);

    this.bindEvents();
  }

  private bindEvents(): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    // Station Select
    const stationSelect = container.querySelector('#station-filter-select') as HTMLSelectElement;
    if (stationSelect) {
      stationSelect.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        const val = target.value;
        const stationId = val ? parseInt(val, 10) : null;
        logger.debug('FilterBar', 'station filter changed: ' + String(stationId));
        store.setStationFilter(stationId);
      });
    }

    // Chips
    container.querySelectorAll('.chip[data-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = (btn as HTMLElement).dataset.value;
        if (value) {
          this.handleChipClick(value);
        }
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

    // NB: getISODate() produce la data LOCALE; toISOString() darebbe la data
    // UTC, che a mezzanotte locale in Europe/Rome è ancora il giorno prima (#290)
    switch (rangeValue) {
      case 'today':
        from = getISODate(today) || null;
        to = getISODate(tomorrow) || null; // Query usually < to
        break;
      case 'week': {
        // Inizio settimana (Lunedì)
        const day = today.getDay() || 7; // Dom=0 -> 7
        if (day !== 1) {
          today.setDate(today.getDate() - (day - 1));
        }
        from = getISODate(today) || null;
        to = null; // Fine al futuro
        break;
      }
      case 'month':
        today.setDate(1);
        from = getISODate(today) || null;
        to = null;
        break;
      case 'all':
      default:
        from = null;
        to = null;
        break;
    }

    store.setFilters({
      rangeLabel: rangeValue as 'today' | 'week' | 'month' | 'custom' | 'all',
      dateFrom: from,
      dateTo: to
    });
    this.render(); // Re-render to update active chip
  }

  private openDateModal(): void {
    openModal('Filtri Personalizzati');
    const target = document.getElementById('modal-body');
    if (!target) {
      return;
    }
    const current = store.getFilters();

    target.replaceChildren();

    const form = document.createElement('form');
    form.id = 'filters-form';

    const row = document.createElement('div');
    row.className = 'form-row';

    const fromGroup = document.createElement('div');
    fromGroup.className = 'form-group';
    const fromLabel = document.createElement('label');
    fromLabel.textContent = 'Da:';
    const fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.name = 'dateFrom';
    fromInput.value = current.dateFrom || '';
    fromGroup.appendChild(fromLabel);
    fromGroup.appendChild(fromInput);

    const toGroup = document.createElement('div');
    toGroup.className = 'form-group';
    const toLabel = document.createElement('label');
    toLabel.textContent = 'A:';
    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.name = 'dateTo';
    toInput.value = current.dateTo || '';
    toGroup.appendChild(toLabel);
    toGroup.appendChild(toInput);

    row.appendChild(fromGroup);
    row.appendChild(toGroup);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'menu-button primary';
    submitBtn.textContent = 'Applica';

    form.appendChild(row);
    form.appendChild(submitBtn);
    target.appendChild(form);

    form.addEventListener('submit', (e: Event) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const dateFrom = fd.get('dateFrom') as string;
      const dateTo = fd.get('dateTo') as string;

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
