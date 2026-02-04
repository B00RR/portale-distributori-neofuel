import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStore } = vi.hoisted(() => ({
    mockStore: {
        getPagination: vi.fn(() => ({ page: 0, pageSize: 25, totalCount: 100 })),
        setPagination: vi.fn()
    }
}));

vi.mock('../../shared/state.js', () => ({ store: mockStore }));

import { Pagination } from '../../js/admin/components/Pagination.js';

describe('Pagination Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="pagination-container"></div>';
    });

    it('should create pagination instance', () => {
        const pagination = new Pagination('pagination-container');
        expect(pagination).toBeDefined();
    });

    it('should render pagination', () => {
        const pagination = new Pagination('pagination-container');
        pagination.render();
        const container = document.getElementById('pagination-container');
        expect(container?.innerHTML).toContain('pagination-bar');
    });

    it('should display pagination info', () => {
        const pagination = new Pagination('pagination-container');
        pagination.render();
        const container = document.getElementById('pagination-container');
        expect(container?.innerHTML).toContain('1-25 di 100');
    });

    it('should disable prev button on first page', () => {
        const pagination = new Pagination('pagination-container');
        pagination.render();
        const btnPrev = document.querySelector('.btn-prev') as HTMLButtonElement;
        expect(btnPrev?.disabled).toBe(true);
    });

    it('should enable next button when more pages exist', () => {
        const pagination = new Pagination('pagination-container');
        pagination.render();
        const btnNext = document.querySelector('.btn-next') as HTMLButtonElement;
        expect(btnNext?.disabled).toBe(false);
    });
});
