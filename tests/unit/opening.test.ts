import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils, mockToast, mockErrorHandler } = vi.hoisted(() => {
    const queryBuilder: any = {};
    const chain = vi.fn((...args) => queryBuilder);

    const maybeSingleResult = { data: null, error: null };

    Object.assign(queryBuilder, {
        select: chain,
        eq: chain,
        is: chain,
        limit: chain,
        gte: chain,
        lte: chain,
        order: chain,
        in: chain,
        maybeSingle: vi.fn(() => ({
            then: (resolve: any) => resolve(maybeSingleResult)
        })),
        then: (resolve: any) => resolve({ data: [], error: null }),
        insert: vi.fn(() => ({
            select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null }))
            }))
        }))
    });

    return {
        mockSupabase: {
            from: vi.fn(() => queryBuilder),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null })
        },
        mockUI: {
            showLoadingMessage: vi.fn(),
            showErrorMessage: vi.fn(),
            showInfoModal: vi.fn(),
            openConfirmModal: vi.fn().mockResolvedValue(true),
            openModal: vi.fn(),
            closeModal: vi.fn()
        },
        mockUtils: {
            formatEuro: vi.fn(v => `€${v}`),
            getISODate: vi.fn(() => '2024-01-01'),
            escapeHtml: vi.fn(v => v)
        },
        mockToast: { show: vi.fn() },
        mockErrorHandler: { handleError: vi.fn() }
    };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/shared/error-handler.js', () => mockErrorHandler);
vi.mock('../../js/ui/components/ShiftOpener.js', () => ({})); // Mock web component

import { showAperturaForm } from '../../js/operator/opening.js';

describe('Operator Opening Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        document.body.innerHTML = `
            <div id="main-content"></div>
            <div id="modal-body"></div>
        `;
    });

    it('should render opening form', async () => {
        const container = document.getElementById('main-content')!;
        await showAperturaForm(1, 'user-1');

        await new Promise(r => setTimeout(r, 10));

        expect(mockSupabase.from).toHaveBeenCalledWith('shifts');
        // showAperturaForm opens modal and appends component to modal-body
        const modalBody = document.getElementById('modal-body');
        expect(modalBody?.innerHTML).toContain('shift-opener');
    });

    it('should handle existing open shift', async () => {
        // override mock result
        mockSupabase.from().maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 123, status: 'open', users: { full_name: 'Test' }, opened_at: new Date().toISOString() },
            error: null
        }) as any;

        const container = document.getElementById('main-content')!;
        await showAperturaForm(1, 'user-1');

        await new Promise(r => setTimeout(r, 10));

        expect(mockSupabase.from().maybeSingle).toHaveBeenCalled();
        const modalBody = document.getElementById('modal-body');
        // Expect warning message
        expect(modalBody?.innerHTML).toContain('Apertura Già Effettuata');
    });
});
