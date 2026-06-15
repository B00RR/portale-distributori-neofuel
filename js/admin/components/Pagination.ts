import { store } from '../../shared/state.js';

export class Pagination {
  private containerId: string;

  constructor(containerId: string) {
    this.containerId = containerId;
  }

  public render(): void {
    const container = document.getElementById(this.containerId);
    if (!container) { return; }

    const { page, pageSize, totalCount } = (store as any).getPagination();

    const totalPages = Math.ceil(totalCount / pageSize);
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, totalCount);

    const canPrev = page > 0;
    const canNext = (page + 1) < totalPages;

    container.innerHTML = `
            <div class="pagination-bar">
                <span class="pagination-info">
                    ${totalCount > 0
    ? `${start}-${end} di ${totalCount}`
    : 'Nessun risultato'}
                </span>
                <div class="pagination-controls">
                    <button class="menu-button secondary small btn-prev" ${!canPrev ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="menu-button secondary small btn-next" ${!canNext ? 'disabled' : ''}>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const container = document.getElementById(this.containerId);
    if (!container) { return; }

    const btnPrev = container.querySelector('.btn-prev') as HTMLButtonElement;
    const btnNext = container.querySelector('.btn-next') as HTMLButtonElement;

    if (btnPrev && !btnPrev.disabled) {
      btnPrev.addEventListener('click', () => {
        const { page } = (store as any).getPagination();
        (store as any).setPagination({ page: Math.max(0, page - 1) });
      });
    }

    if (btnNext && !btnNext.disabled) {
      btnNext.addEventListener('click', () => {
        const { page } = (store as any).getPagination();
        (store as any).setPagination({ page: page + 1 });
      });
    }
  }
}
