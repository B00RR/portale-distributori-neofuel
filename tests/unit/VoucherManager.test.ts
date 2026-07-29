import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUtils, mockOfflineQueue } = vi.hoisted(() => {
  return {
    mockSupabase: {
      from: vi.fn(() => ({})),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null })
    },
    mockToast: { show: vi.fn() },
    mockUtils: {
      formatEuro: vi.fn(val => `€${val.toFixed(2)}`),
      formatDate: vi.fn(d => d),
      createRateLimiter: vi.fn(() => ({ check: () => true }))
    },
    mockOfflineQueue: {
      isOffline: vi.fn(() => false),
      queueAction: vi.fn()
    }
  };
});

global.window = global.window || ({} as unknown as typeof global.window);
(
  global.window as unknown as Partial<typeof global.window & { Html5Qrcode: unknown }> &
    Record<string, unknown>
).Html5Qrcode = vi.fn().mockImplementation(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn()
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/core/offline-queue.js', () => mockOfflineQueue);

import '../../js/ui/components/VoucherManager.js';

describe('VoucherManager Component', () => {
  let element: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSupabase.rpc.mockResolvedValue({
      data: { success: true, code: 'V123', amount: 50 },
      error: null
    });

    document.body.innerHTML = `<voucher-manager stationId="1" userId="user-456"></voucher-manager>`;
    element = document.querySelector('voucher-manager');
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it('should process valid voucher via validate_voucher_for_preview RPC', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { success: true, code: 'V123', amount: 50, status: 'active' },
      error: null
    });

    await element.processCode('V123');
    await new Promise(r => setTimeout(r, 10));

    expect(mockSupabase.rpc).toHaveBeenCalledWith('validate_voucher_for_preview', {
      p_voucher_code: 'V123',
      p_station_id: 1
    });

    expect(element.activeVoucher).toBeDefined();
    expect(element.activeVoucher?.code).toBe('V123');
    expect(element.mode).toBe('verify');
  });

  it('handles ambiguous prefixes error returned by validate_voucher_for_preview RPC', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Più voucher corrispondono al codice: inserisci il codice completo.'
      },
      error: null
    });

    await element.processCode('V123');
    await new Promise(r => setTimeout(r, 10));

    expect(element.mode).toBe('error');
    expect(element.errorMessage).toContain('codice completo');
    expect(element.activeVoucher).toBeNull();
  });

  it('should redeem voucher via redeem_voucher_validated RPC', async () => {
    element.activeVoucher = { id: 1, code: 'V123', amount: 100 };
    element.stationId = '1';
    element.userId = 'user-456';

    await element.confirmRedeem();
    await new Promise(r => setTimeout(r, 10));

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'redeem_voucher_validated',
      expect.objectContaining({
        p_voucher_code: 'V123',
        p_station_id: 1,
        p_operator_id: 'user-456'
      })
    );
  });

  it('should clear a stale validation error before processing another code', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Voucher già riscattato',
        reason: 'redeemed',
        code: 'OLD1',
        amount: 50
      },
      error: null
    });

    await element.processCode('OLD1');
    expect(element.validationResult).toMatchObject({ valid: false, reason: 'redeemed' });

    mockSupabase.rpc.mockResolvedValueOnce({
      data: { success: false, error: 'Codice non trovato.' },
      error: null
    });
    await element.processCode('MISS');

    expect(element.validationResult).toBeNull();
    expect(element.activeVoucher).toBeNull();
    expect(element.errorMessage).toBe('Codice non trovato.');
  });

  it('should process points redemption', async () => {
    element.stationId = '123';
    element.userId = '456';
    element.shiftId = '789';
    element.pointsAmount = '15.50';

    await element.confirmPointsRedeem();
    await new Promise(r => setTimeout(r, 10));

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'register_punti_riscatto',
      expect.objectContaining({
        p_station_id: 123,
        p_shift_id: 789,
        p_operator_id: 456,
        p_importo: 15.5
      })
    );
    expect(element.mode).toBe('success');
  });

  it('should warn on invalid points amount', async () => {
    element.pointsAmount = '0';
    await element.confirmPointsRedeem();

    expect(mockToast.show).toHaveBeenCalledWith('Inserire un importo punti valido.', 'warning');
  });

  it('includes shiftId when queueing voucher_redeem offline', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(true);
    element.activeVoucher = { id: 1, code: 'OFFLINE1', amount: 30 };
    element.stationId = '1';
    element.userId = 'user-456';
    element.shiftId = '999';

    await element.confirmRedeem();

    expect(mockOfflineQueue.queueAction).toHaveBeenCalledWith(
      'voucher_redeem',
      expect.objectContaining({
        voucherCode: 'OFFLINE1',
        stationId: '1',
        operatorId: 'user-456',
        voucherAmount: 30,
        shiftId: '999'
      }),
      expect.anything()
    );
  });
});
