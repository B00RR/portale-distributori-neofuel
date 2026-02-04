import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUtils, mockOfflineQueue, mockRules } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null })
            })),
            insert: vi.fn().mockResolvedValue({ error: null })
        })),
        rpc: vi.fn().mockResolvedValue({ data: {}, error: null })
    },
    mockToast: { show: vi.fn() },
    mockUtils: {
        formatEuro: vi.fn((val) => `€${val.toFixed(2)}`),
        formatDate: vi.fn((d) => d)
    },
    mockOfflineQueue: {
        isOffline: vi.fn(() => false),
        queueAction: vi.fn()
    },
    mockRules: {
        validateVoucher: vi.fn(() => true)
    }
}));

global.window = global.window || ({} as any);
(global.window as any).Html5Qrcode = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn()
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/core/offline-queue.js', () => mockOfflineQueue);
vi.mock('../../js/core/rules.js', () => mockRules);

import '../../js/ui/components/VoucherManager.js';

describe('VoucherManager (523 lines)', () => {
    let element: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        document.body.innerHTML = `<voucher-manager stationId="ST-123" userId="user-456"></voucher-manager>`;
        element = document.querySelector('voucher-manager');
        await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should register', () => {
        expect(customElements.get('voucher-manager')).toBeDefined();
    });

    it('should process valid voucher', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 1, code: 'V123', amount: 50, status: 'active', expires_at: '2025-12-31' },
                error: null
            })
        });

        await element.processCode('V123');
        expect(element.state.scannedVoucher?.code).toBe('V123');
    });

    it('should redeem voucher', async () => {
        element.state.scannedVoucher = { id: 1, code: 'V123', amount: 100 };
        await element.confirmRedeem();
        expect(mockSupabase.rpc).toHaveBeenCalled();
    });

    it('should handle offline queue', async () => {
        mockOfflineQueue.isOffline.mockReturnValue(true);
        element.state.scannedVoucher = { id: 1, code: 'OFF', amount: 25 };
        await element.confirmRedeem();
        expect(mockOfflineQueue.queueAction).toHaveBeenCalled();
    });
});
