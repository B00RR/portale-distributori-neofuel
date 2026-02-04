import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUtils, mockOpening } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn(),
            maybeSingle: vi.fn(),
            single: vi.fn(),
            insert: vi.fn(),
            update: vi.fn()
        }))
    },
    mockToast: { show: vi.fn() },
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showInfoModal: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str),
        formatEuro: vi.fn((val) => `€${val.toFixed(2)}`)
    },
    mockOpening: {
        checkOpeningStatus: vi.fn()
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/operator/opening.js', () => mockOpening);

import { showCreditsMenu } from '../../js/operator/credits.js';

describe('Credits Module - 572 Lines Coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div>';
    });

    it('should warn if no shift open', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue(null);
        await showCreditsMenu('ST-123', 'user-456');
        const modalBody = document.getElementById('modal-body');
        expect(modalBody?.innerHTML).toContain('Nessun Turno Aperto');
    });

    it('should render credits menu', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
        await showCreditsMenu('ST-123', 'user-456');
        const modalBody = document.getElementById('modal-body');
        expect(modalBody?.innerHTML).toContain('Nuovo Credito');
        expect(modalBody?.innerHTML).toContain('Pagamento');
    });

    it('should render new credit form on button click', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
        await showCreditsMenu('ST-123', 'user-456');
        document.getElementById('btn-new-credit')?.click();
        await new Promise(resolve => setTimeout(resolve, 10));
        const form = document.getElementById('new-credit-form');
        expect(form).not.toBeNull();
    });

    it('should search customers', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
        await showCreditsMenu('ST-123', 'user-456');
        document.getElementById('btn-new-credit')?.click();
        await new Promise(resolve => setTimeout(resolve, 10));

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ cliente: 'Test' }], error: null })
        });

        const nameInput = document.getElementById('customer-name') as HTMLInputElement;
        nameInput.value = 'Test';
        nameInput.dispatchEvent(new Event('input'));
        await new Promise(resolve => setTimeout(resolve, 350));
        expect(mockSupabase.from).toHaveBeenCalledWith('crediti_clienti');
    });

    it('should show payment selection', async () => {
        mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null })
        });

        await showCreditsMenu('ST-123', 'user-456');
        document.getElementById('btn-payment-credit')?.click();
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockSupabase.from).toHaveBeenCalledWith('crediti_clienti');
    });
});
