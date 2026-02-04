import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null })
        })),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null })
    },
    mockUI: {
        showLoadingMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showInfoModal: vi.fn(),
        Toast: { show: vi.fn() }
    },
    mockUtils: {
        formatEuro: vi.fn(v => `€${v}`),
        getISODate: vi.fn(() => '2024-01-01')
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockUI.Toast }));

import { showAperturaForm } from '../../js/operator/opening.js';

describe('Operator Opening Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="main-content"></div>';
    });

    it('should render opening form', async () => {
        const container = document.getElementById('main-content')!;
        await showAperturaForm(container, 'ST-1');

        expect(container.innerHTML).toContain('form');
    });

    it('should handle errors during form rendering', async () => {
        const container = document.getElementById('main-content')!;
        mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new Error('DB Error'))
        });

        await showAperturaForm(container, 'ST-1');
        expect(mockUI.showErrorMessage).toHaveBeenCalled();
    });
});
