import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
    },
    mockToast: { show: vi.fn() },
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showInfoModal: vi.fn(),
        openConfirmModal: vi.fn(),
        showLoadingMessage: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str),
        formatGunCounter: vi.fn((n) => n.toString()),
        parseGunCounter: vi.fn((str) => parseInt(str))
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase, safeSupabaseQuery: vi.fn() }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showGunsModal } from '../../js/admin/guns.js';

describe('Admin Guns Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="guns-container"></div>';
    });

    it('should show guns modal', async () => {
        await showGunsModal(1, 'Isola 1', 1);

        expect(mockUI.openModal).toHaveBeenCalled();
    });
});
