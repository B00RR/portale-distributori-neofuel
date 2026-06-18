import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUtils, mockOfflineQueue, mockRules } = vi.hoisted(() => {
    const chain: any = {};
    const defaultRes = { data: [], error: null };

    // Explicit return to avoid "this" context issues
    Object.assign(chain, {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        like: vi.fn(() => chain),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })), // Nested chain for update
        then: (resolve: any) => resolve(defaultRes), // Default thenable
    });

    return {
        mockSupabase: {
            from: vi.fn(() => chain),
            rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
            chain // Export to access in tests
        },
        mockToast: { show: vi.fn() },
        mockUtils: {
            formatEuro: vi.fn((val) => `€${val.toFixed(2)}`),
            formatDate: vi.fn((d) => d),
            createRateLimiter: vi.fn(() => ({ check: () => true }))
        },
        mockOfflineQueue: {
            isOffline: vi.fn(() => false),
            queueAction: vi.fn()
        },
        mockRules: {
            validateVoucher: vi.fn(() => ({ valid: true }))
        }
    };
});

global.window = global.window || ({} as unknown as typeof global.window);
(global.window as unknown as Partial<typeof global.window & { Html5Qrcode: unknown }> & Record<string, unknown>).Html5Qrcode = vi.fn().mockImplementation(() => ({
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
        // Reset default then behavior
        mockSupabase.chain.then = (resolve: any) => resolve({ data: [], error: null });

        document.body.innerHTML = `<voucher-manager stationId="ST-123" userId="user-456"></voucher-manager>`;
        element = document.querySelector('voucher-manager');
        await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should process valid voucher', async () => {
        const voucherData = { id: 1, code: 'V123', amount: 50, status: 'active', expires_at: '2025-12-31' };

        // Override then for this test
        mockSupabase.chain.then = (resolve: any) => resolve({ data: [voucherData], error: null });

        await element.processCode('V123');
        await new Promise(r => setTimeout(r, 10));

        expect(element.activeVoucher).toBeDefined();
        if (element.activeVoucher) {
            expect(element.activeVoucher.code).toBe('V123');
        } else {
            console.log('ErrorMessage:', element.errorMessage);
            throw new Error('activeVoucher is null');
        }
    });

    it('should redeem voucher', async () => {
        element.activeVoucher = { id: 1, code: 'V123', amount: 100 };
        element.stationId = 'ST-123';
        element.userId = 'user-456';

        await element.confirmRedeem();
        await new Promise(r => setTimeout(r, 10));

        expect(mockSupabase.rpc).toHaveBeenCalled();
    });
});
