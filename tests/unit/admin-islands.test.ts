import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUtils, mockShowGunsModal } = vi.hoisted(() => ({
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
        showLoadingMessage: vi.fn(),
        showInfoModal: vi.fn(),
        openConfirmModal: vi.fn(),
        showErrorMessage: vi.fn()
    },
    mockUtils: {
        escapeHtml: vi.fn((str) => str)
    },
    mockShowGunsModal: vi.fn()
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase, safeSupabaseQuery: vi.fn(), getStationName: vi.fn() }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/admin/guns.js', () => ({ showGunsModal: mockShowGunsModal }));

import { showIslandsModal } from '../../js/admin/islands.js';

describe('Admin Islands Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="islands-container"></div>';
    });

    it('should show islands modal', async () => {
        await showIslandsModal(1);

        expect(mockUI.openModal).toHaveBeenCalled();
    });
});
