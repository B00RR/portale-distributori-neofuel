import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockHandleError, mockUI, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
    },
    mockHandleError: vi.fn(),
    mockUI: {
        openModal: vi.fn(),
        openConfirmModal: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str),
        formatNumberIt: vi.fn((n) => n.toLocaleString())
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase, safeSupabaseQuery: vi.fn(), getStationName: vi.fn() }));
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: mockHandleError }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showTanksAdminModal } from '../../js/admin/tanks.js';

describe('Admin Tanks Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="tanks-container"></div>';
    });

    it('should show tanks modal', async () => {
        await showTanksAdminModal(1);

        expect(mockUI.openModal).toHaveBeenCalled();
    });
});
