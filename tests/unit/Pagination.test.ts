import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pagination } from '../../js/admin/components/Pagination.js';
import { store } from '../../js/shared/state.js';

// Mock store
vi.mock('../../js/shared/state.js', () => ({
    store: {
        getPagination: vi.fn(() => ({ page: 0, pageSize: 10, totalCount: 50 })),
        setPagination: vi.fn()
    }
}));

describe('Pagination Component', () => {

    beforeEach(() => {
        document.body.innerHTML = '<div id="test-pagination"></div>';
        vi.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should create pagination instance', () => {
            const pagination = new Pagination('test-pagination');
            expect(pagination).toBeDefined();
        });
    });

    describe('render', () => {
        it('should render pagination controls', () => {
            const pagination = new Pagination('test-pagination');
            pagination.render();

            const container = document.getElementById('test-pagination');
            expect(container?.innerHTML).toContain('pagination-bar');
        });

        it('should show correct page info', () => {
            vi.mocked(store.getPagination).mockReturnValue({
                page: 0,
                pageSize: 10,
                totalCount: 50
            });

            const pagination = new Pagination('test-pagination');
            pagination.render();

            const container = document.getElementById('test-pagination');
            expect(container?.textContent).toContain('1-10');
            expect(container?.textContent).toContain('50');
        });

        it('should disable prev button on first page', () => {
            vi.mocked(store.getPagination).mockReturnValue({
                page: 0,
                pageSize: 10,
                totalCount: 50
            });

            const pagination = new Pagination('test-pagination');
            pagination.render();

            const prevBtn = document.querySelector('.btn-prev') as HTMLButtonElement;
            expect(prevBtn?.disabled).toBe(true);
        });

        it('should enable next button when more pages exist', () => {
            vi.mocked(store.getPagination).mockReturnValue({
                page: 0,
                pageSize: 10,
                totalCount: 50
            });

            const pagination = new Pagination('test-pagination');
            pagination.render();

            const nextBtn = document.querySelector('.btn-next') as HTMLButtonElement;
            expect(nextBtn?.disabled).toBe(false);
        });

        it('should disable next button on last page', () => {
            vi.mocked(store.getPagination).mockReturnValue({
                page: 4,
                pageSize: 10,
                totalCount: 50
            });

            const pagination = new Pagination('test-pagination');
            pagination.render();

            const nextBtn = document.querySelector('.btn-next') as HTMLButtonElement;
            expect(nextBtn?.disabled).toBe(true);
        });

        it('should show "Nessun risultato" when totalCount is 0', () => {
            vi.mocked(store.getPagination).mockReturnValue({
                page: 0,
                pageSize: 10,
                totalCount: 0
            });

            const pagination = new Pagination('test-pagination');
            pagination.render();

            const container = document.getElementById('test-pagination');
            expect(container?.textContent).toContain('Nessun risultato');
        });

        it('should handle non-existent container', () => {
            const pagination = new Pagination('non-existent');
            expect(() => pagination.render()).not.toThrow();
        });

        it('should calculate total pages correctly', () => {
            vi.mocked(store.getPagination).mockReturnValue({
                page: 1,
                pageSize: 10,
                totalCount: 25
            });

            const pagination = new Pagination('test-pagination');
            pagination.render();

            const container = document.getElementById('test-pagination');
            expect(container?.textContent).toContain('11-20');
        });

        it('should show correct end range on last page', () => {
            vi.mocked(store.getPagination).mockReturnValue({
                page: 2, // Last page (20-25)
                pageSize: 10,
                totalCount: 25
            });

            const pagination = new Pagination('test-pagination');
            pagination.render();

            const container = document.getElementById('test-pagination');
            expect(container?.textContent).toContain('21-25');
        });
    });
});
