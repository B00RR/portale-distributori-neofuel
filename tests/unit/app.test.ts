import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockSupabase,
    mockInitOfflineQueue,
    mockSetupAutoSync,
    mockRegisterExecutor,
    mockRegisterSW,
    mockLogger
} = vi.hoisted(() => ({
    mockSupabase: {
        rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null })
            }))
        }))
    },
    mockInitOfflineQueue: vi.fn().mockResolvedValue(undefined),
    mockSetupAutoSync: vi.fn(),
    mockRegisterExecutor: vi.fn(),
    mockRegisterSW: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('virtual:pwa-register', () => ({ registerSW: mockRegisterSW }));
vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/core/offline-queue.js', () => ({
    initOfflineQueue: mockInitOfflineQueue,
    setupAutoSync: mockSetupAutoSync,
    registerExecutor: mockRegisterExecutor
}));
vi.mock('../../js/operator/offline-financial-executors-v2.js', () => ({}));
vi.mock('../../js/core/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../js/core/analytics.js', () => ({ initAnalytics: vi.fn(), trackLogin: vi.fn() }));
vi.mock('../../js/core/auth.js', () => ({
    initLoginElements: vi.fn(),
    loadSession: vi.fn().mockResolvedValue(null),
    setLoggedUser: vi.fn(),
    setOnLoginSuccess: vi.fn(),
    handlePasswordReset: vi.fn(),
    requestPasswordReset: vi.fn()
}));
vi.mock('../../js/admin.js', () => ({ showAdminArea: vi.fn() }));
vi.mock('../../js/operator.js', () => ({ showOperatorMenu: vi.fn() }));
vi.mock('../../js/operator/station-context.js', () => ({ ensureSelectedOperatorStation: vi.fn() }));
vi.mock('../../js/shared/state.js', () => ({ store: { setUser: vi.fn(), getUser: vi.fn() } }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: vi.fn() } }));
vi.mock('../../js/ui/ui-settings-panel.js', () => ({}));
vi.mock('../../js/utils/calculation-presets.js', () => ({ initializeCalculationPresets: vi.fn() }));

type CapturedExecutor = (action: {
    id: string;
    payload: Record<string, unknown>;
}) => Promise<boolean>;

async function importAppAndGetExecutor(type: string): Promise<CapturedExecutor> {
    vi.resetModules();
    await import('../../js/app.js');

    if (!mockRegisterExecutor.mock.calls.length) {
        document.dispatchEvent(new Event('DOMContentLoaded'));
    }

    await vi.waitFor(() => {
        expect(mockRegisterExecutor).toHaveBeenCalledWith(type, expect.any(Function));
    });

    return mockRegisterExecutor.mock.calls.find(([registeredType]) => registeredType === type)?.[1];
}

describe('App offline RPC executors', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSupabase.rpc.mockResolvedValue({ data: { success: true }, error: null });
        localStorage.clear();
        document.body.innerHTML = '';
    });

    it('passes the queued action id as p_request_id when redeeming a voucher offline', async () => {
        const executor = await importAppAndGetExecutor('voucher_redeem');

        await expect(
            executor({
                id: 'voucher_redeem_1700000000000_abc1234',
                payload: {
                    voucherCode: 'ABCD1234',
                    stationId: '7',
                    operatorId: 'operator-auth-id'
                }
            })
        ).resolves.toBe(true);

        expect(mockSupabase.rpc).toHaveBeenCalledWith('redeem_voucher_validated',
            expect.objectContaining({
                p_voucher_code: 'ABCD1234',
                p_station_id: 7,
                p_operator_id: 'operator-auth-id',
                p_request_id: 'voucher_redeem_1700000000000_abc1234'
            })
        );
    });

    it('passes the queued action id as p_request_id when closing a shift offline', async () => {
        const executor = await importAppAndGetExecutor('shift_close');

        await expect(
            executor({
                id: 'shift_close_1700000000000_def5678',
                payload: {
                    shiftId: 22,
                    stationId: 7,
                    closingData: { total: 100 },
                    isFinal: true,
                    finalCounters: { diesel: 1234 }
                }
            })
        ).resolves.toBe(true);

        expect(mockSupabase.rpc).toHaveBeenCalledWith('submit_shift_closure',
            expect.objectContaining({
                p_shift_id: 22,
                p_station_id: 7,
                p_closing_data: { total: 100 },
                p_is_final: true,
                p_final_counters: { diesel: 1234 },
                p_tank_usage: [],
                p_request_id: 'shift_close_1700000000000_def5678'
            })
        );
    });
});
