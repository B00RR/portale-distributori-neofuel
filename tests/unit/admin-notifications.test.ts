import { describe, it, expect, vi } from 'vitest';

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
        }))
    }))
};

const mockToast = { show: vi.fn() };

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

import { showNotifications, createNotification, markAsRead, deleteNotification } from '../../js/admin/notifications.js';

describe('Admin Notifications Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="notifications-container"></div>';
    });

    it('should show notifications', async () => {
        const container = document.getElementById('notifications-container')!;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{ id: 1, message: 'Test notification', read: false }],
                error: null
            })
        });

        await showNotifications(container);

        expect(mockSupabase.from).toHaveBeenCalledWith('notifications');
    });

    it('should create notification', async () => {
        await createNotification('Test message', 'info');

        expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should mark notification as read', async () => {
        await markAsRead(1);

        expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should delete notification', async () => {
        mockSupabase.from.mockReturnValue({
            delete: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null })
            }))
        });

        await deleteNotification(1);

        expect(mockSupabase.from).toHaveBeenCalled();
    });
});
