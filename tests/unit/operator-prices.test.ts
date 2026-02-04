import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        })),
        functions: {
            invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null })
        }
    },
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showInfoModal: vi.fn(),
        showErrorMessage: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str)
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showPrezziEditForm } from '../../js/operator/prices.js';

describe('Operator Prices Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div>';
    });

    it('should display price edit form', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    id: 1,
                    prezzo_benzina: 1.789,
                    prezzo_gasolio: 1.549
                },
                error: null
            })
        });

        await showPrezziEditForm(123);

        expect(mockUI.openModal).toHaveBeenCalledWith('Modifica Prezzi');
        expect(document.getElementById('modal-body')?.innerHTML).toContain('1.789');
    });

    it('should handle price form submission', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        });

        await showPrezziEditForm(123);

        const form = document.getElementById('op-prezzi-form') as HTMLFormElement;
        expect(form).not.toBeNull();
    });

    it('should display 3 decimal precision inputs', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { prezzo_benzina: 1.549, prezzo_gasolio: 1.329 },
                error: null
            })
        });

        await showPrezziEditForm(123);

        const html = document.getElementById('modal-body')?.innerHTML || '';
        expect(html).toContain('step="0.001"');
    });
});
