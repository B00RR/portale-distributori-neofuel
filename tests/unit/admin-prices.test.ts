import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockHandleError, mockUtils, mockBusinessLogic } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { prezzo_benzina: 1.5, prezzo_gasolio: 1.3 }, error: null })
        })),
        rpc: vi.fn().mockResolvedValue({ error: null })
    },
    mockToast: { show: vi.fn() },
    mockUI: { openModal: vi.fn(), closeModal: vi.fn() },
    mockHandleError: vi.fn(),
    mockUtils: {
        escapeHtml: vi.fn((str) => str),
        escapeNumber: vi.fn((n) => n?.toString() || '0')
    },
    mockBusinessLogic: {
        loadRules: vi.fn().mockResolvedValue({ max_price_limit: 5.0 })
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase, safeSupabaseQuery: vi.fn(), getStationName: vi.fn(() => 'Test Station') }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: mockHandleError }));
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/core/business-logic-manager.js', () => ({ BusinessLogicManager: mockBusinessLogic }));

import { showPrezziAdminModal, showPricesTab } from '../../js/admin/prices.js';

describe('Admin Prices Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div><div id="prices-container"></div>';
    });

    it('should show prices modal', async () => {
        await showPrezziAdminModal(1);
        expect(mockUI.openModal).toHaveBeenCalled();
    });

    it('should show prices tab', async () => {
        const container = document.getElementById('prices-container')!;
        await showPricesTab(container, null);
        expect(container.innerHTML).toContain('Gestione Prezzi');
    });

    it('disables the "prossima chiusura" validity option pending backend support (#67)', async () => {
        await showPrezziAdminModal(1);
        const prossima = document.querySelector('input[name="validita"][value="prossima"]') as HTMLInputElement | null;
        const ora = document.querySelector('input[name="validita"][value="ora"]') as HTMLInputElement | null;
        expect(prossima).not.toBeNull();
        expect(prossima!.disabled).toBe(true);
        expect(ora!.disabled).toBe(false);
        expect(ora!.checked).toBe(true);
    });
});
