import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStore } = vi.hoisted(() => ({
    mockStore: {
        getPagination: vi.fn(() => ({ page: 0, pageSize: 25, totalCount: 100 })),
        setPagination: vi.fn()
    }
}));

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));

import { Pagination } from '../../js/admin/components/Pagination.js';

describe('Pagination Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="pagination-container"></div>'; // Correct ID
    });

    it('should create pagination instance', () => {
        const pagination = new Pagination('pagination-container');
        expect(pagination).toBeDefined();
    });

    it('should render pagination info', () => {
        const pagination = new Pagination('pagination-container');
        pagination.render();
        const container = document.getElementById('pagination-container');
        expect(container?.innerHTML).toContain('pagination-bar');
        expect(container?.innerHTML).toContain('1-25 di 100');
    });

    it('should enable next button', () => {
        const pagination = new Pagination('pagination-container');
        pagination.render();
        const btnNext = document.querySelector('.btn-next') as HTMLButtonElement;
        expect(btnNext.disabled).toBe(false);
    });
});
