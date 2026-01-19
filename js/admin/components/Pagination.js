
import { store } from '../../shared/state.js';

export class Pagination {
  constructor(containerId) {
    this.containerId = containerId;
  }

  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {return;}

    const { page, pageSize, totalCount } = store.getPagination();
    // Supabase counts might be approximate if we don't ask for exact, 
    // but here we asked for exact or we simply disable "Next" if current fetch < pageSize.
    // Let's assume we update totalCount correctly.

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

  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) {return;}

    const btnPrev = container.querySelector('.btn-prev');
    const btnNext = container.querySelector('.btn-next');

    if (btnPrev && !btnPrev.disabled) {
      btnPrev.addEventListener('click', () => {
        const { page } = store.getPagination();
        store.setPagination({ page: Math.max(0, page - 1) });
      });
    }

    if (btnNext && !btnNext.disabled) {
      btnNext.addEventListener('click', () => {
        const { page } = store.getPagination();
        store.setPagination({ page: page + 1 });
      });
    }
  }
}
