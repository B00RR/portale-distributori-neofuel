import { logger } from '../../core/logger.js';
import { store } from '../../shared/state.js';

export class Pagination {
  private containerId: string;

  constructor(containerId: string) {
    this.containerId = containerId;
  }

  public render(): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    const { page, pageSize, totalCount } = store.getPagination();

    const totalPages = Math.ceil(totalCount / pageSize);
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, totalCount);

    const canPrev = page > 0;
    const canNext = page + 1 < totalPages;

    container.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'pagination-bar';

    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = totalCount > 0 ? `${start}-${end} di ${totalCount}` : 'Nessun risultato';
    bar.appendChild(info);

    const controls = document.createElement('div');
    controls.className = 'pagination-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'menu-button secondary small btn-prev';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>'; // safe static icon
    prevBtn.disabled = !canPrev;
    controls.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'menu-button secondary small btn-next';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>'; // safe static icon
    nextBtn.disabled = !canNext;
    controls.appendChild(nextBtn);

    bar.appendChild(controls);
    container.appendChild(bar);

    this.bindEvents();
  }

  private bindEvents(): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    const btnPrev = container.querySelector('.btn-prev') as HTMLButtonElement;
    const btnNext = container.querySelector('.btn-next') as HTMLButtonElement;

    if (btnPrev && !btnPrev.disabled) {
      btnPrev.addEventListener('click', () => {
        const { page } = store.getPagination();
        const newPage = Math.max(0, page - 1);
        logger.debug('Pagination', 'prev to page ' + newPage);
        store.setPagination({ page: newPage });
      });
    }

    if (btnNext && !btnNext.disabled) {
      btnNext.addEventListener('click', () => {
        const { page } = store.getPagination();
        const newPage = page + 1;
        logger.debug('Pagination', 'next to page ' + newPage);
        store.setPagination({ page: newPage });
      });
    }
  }
}
