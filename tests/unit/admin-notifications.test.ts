import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockBusinessLogic, mockHandleError, mockFormatNumber } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
    },
    mockBusinessLogic: {
        loadRules: vi.fn().mockResolvedValue({ notifications_enabled: true, fuel_reserve_alert_liters: 1000, force_close_hours_threshold: 24 })
    },
    mockHandleError: vi.fn(),
    mockFormatNumber: vi.fn((n) => n.toLocaleString())
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/core/business-logic-manager.js', () => ({ BusinessLogicManager: mockBusinessLogic }));
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: mockHandleError }));
vi.mock('../../js/utils/utils.js', () => ({ formatNumberIt: mockFormatNumber }));

import { showNotificheAdmin } from '../../js/admin/notifications.js';

describe('Admin Notifications Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="notifications-container"></div>';
    });

    it('should display notifications', async () => {
        const container = document.getElementById('notifications-container')!;

        await showNotificheAdmin(container);

        expect(container.innerHTML).toBeTruthy();
    });

    it('should load business rules', async () => {
        const container = document.getElementById('notifications-container')!;

        await showNotificheAdmin(container);

        expect(mockBusinessLogic.loadRules).toHaveBeenCalled();
    });
});
