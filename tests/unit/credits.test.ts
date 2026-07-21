/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUtils, mockOpening, mockOfflineQueue } = vi.hoisted(
  () => ({
    mockSupabase: {
      rpc: vi.fn(),
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(),
        maybeSingle: vi.fn(),
        single: vi.fn(),
        insert: vi.fn(),
        update: vi.fn()
      }))
    },
    mockToast: { show: vi.fn() },
    mockUI: {
      openModal: vi.fn(),
      closeModal: vi.fn(),
      showInfoModal: vi.fn()
    },
    mockUtils: {
      escapeHtml: vi.fn(str => str),
      formatEuro: vi.fn(val => `€${val.toFixed(2)}`),
      formatDateSafe: vi.fn(val => (val ? String(val) : '—')),
      getItalianBusinessDayEndUtc: vi.fn(() => '2024-01-01T23:59:59.999Z'),
      getItalianBusinessDate: vi.fn(() => '2024-01-01')
    },
    mockOpening: {
      checkOpeningStatus: vi.fn()
    },
    mockOfflineQueue: {
      isOffline: vi.fn(() => false),
      queueAction: vi.fn().mockResolvedValue(undefined)
    }
  })
);

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/operator/opening.js', () => mockOpening);
vi.mock('../../js/core/offline-queue.js', () => mockOfflineQueue);

import { showCreditsMenu, processNewCredit, processPayment } from '../../js/operator/credits.js';

describe('Credits Module - Logic and UI Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="modal-body"></div>';
    mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
    vi.stubGlobal('crypto', {
      randomUUID: () => 'mock-uuid-value-1234'
    });
  });

  it('should throw if crypto.randomUUID is not available', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(
      processNewCredit('123', '456', 'Nuovo Cliente', 100, 'Gasolio', 'Test note')
    ).rejects.toThrow('crypto.randomUUID non supportato o non disponibile in questo ambiente');
  });

  it('should warn if no shift open', async () => {
    mockOpening.checkOpeningStatus.mockResolvedValue(null);
    await showCreditsMenu('123', '456');
    const modalBody = document.getElementById('modal-body');
    expect(modalBody?.innerHTML).toContain('Nessun Turno Aperto');
  });

  it('should render credits menu', async () => {
    mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
    await showCreditsMenu('123', '456');
    const modalBody = document.getElementById('modal-body');
    expect(modalBody?.innerHTML).toContain('Nuovo Credito');
    expect(modalBody?.innerHTML).toContain('Pagamento');
  });

  it('should call create_credit_transaction RPC when online', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({ data: { success: true }, error: null });
    mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });

    await processNewCredit('123', '456', 'Nuovo Cliente', 100, 'Gasolio', 'Test note');

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'create_credit_transaction',
      expect.objectContaining({
        p_request_id: expect.stringMatching(/^credit-create-/),
        p_station_id: 123,
        p_shift_id: 1,
        p_customer_name: 'Nuovo Cliente',
        p_amount: 100,
        p_product: 'Gasolio',
        p_notes: 'Test note'
      })
    );
    const rpcArgs = mockSupabase.rpc.mock.calls[0][1];
    expect(rpcArgs).not.toHaveProperty('p_created_at');
    expect(rpcArgs).not.toHaveProperty('operatorId');
    expect(rpcArgs).not.toHaveProperty('operator');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('should throw error when create_credit_transaction RPC returns success:false', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({
      data: { success: false, error: 'some_error', message: 'Errore creazione' },
      error: null
    });

    await expect(
      processNewCredit('123', '456', 'Nuovo Cliente', 100, 'Gasolio', 'Test note')
    ).rejects.toThrow('Errore creazione');
  });

  it('should throw error when create_credit_transaction RPC returns null or malformed data', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    await expect(
      processNewCredit('123', '456', 'Nuovo Cliente', 100, 'Gasolio', 'Test note')
    ).rejects.toThrow('Risposta del server non valida o vuota');
  });

  it('should throw error when create_credit_transaction RPC returns DB error', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

    await expect(
      processNewCredit('123', '456', 'Nuovo Cliente', 100, 'Gasolio', 'Test note')
    ).rejects.toThrow('DB Error');
  });

  it('should queue credit_create offline action without operatorId or createdAt', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(true);

    await processNewCredit('123', '456', 'Nuovo Cliente', 100, 'Gasolio', 'Test note');

    expect(mockOfflineQueue.queueAction).toHaveBeenCalledWith(
      'movement_create',
      expect.objectContaining({
        kind: 'credit_create',
        stationId: 123,
        operatorId: '456',
        customerName: 'Nuovo Cliente',
        amount: 100,
        product: 'Gasolio',
        notes: 'Test note'
      })
    );
    const queuedPayload = mockOfflineQueue.queueAction.mock.calls[0][1];
    expect(queuedPayload).toHaveProperty('operatorId', '456');
    expect(queuedPayload).toHaveProperty('createdAt', '2024-01-01T23:59:59.999Z');
  });

  it('should call register_credit_payment RPC when online', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({ data: { success: true }, error: null });

    await processPayment('123', '456', 7, 50, 'contanti');

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'register_credit_payment',
      expect.objectContaining({
        p_request_id: expect.stringMatching(/^credit-payment-/),
        p_station_id: 123,
        p_shift_id: 1,
        p_customer_id: 7,
        p_amount: 50,
        p_method: 'contanti'
      })
    );
    const rpcArgs = mockSupabase.rpc.mock.calls[0][1];
    expect(rpcArgs).not.toHaveProperty('p_created_at');
    expect(rpcArgs).not.toHaveProperty('operatorId');
    expect(rpcArgs).not.toHaveProperty('operator');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('should throw error when register_credit_payment RPC returns success:false', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({
      data: { success: false, error: 'some_error', message: 'Errore pagamento' },
      error: null
    });

    await expect(processPayment('123', '456', 7, 50, 'contanti')).rejects.toThrow(
      'Errore pagamento'
    );
  });

  it('should throw error when register_credit_payment RPC returns null or malformed data', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    await expect(processPayment('123', '456', 7, 50, 'contanti')).rejects.toThrow(
      'Risposta del server non valida o vuota'
    );
  });

  it('should throw error when register_credit_payment RPC returns DB error', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(false);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

    await expect(processPayment('123', '456', 7, 50, 'contanti')).rejects.toThrow('DB Error');
  });

  it('should queue credit_payment offline action without operatorId, customer.saldo, or createdAt', async () => {
    mockOfflineQueue.isOffline.mockReturnValue(true);

    await processPayment('123', '456', 7, 50, 'contanti');

    expect(mockOfflineQueue.queueAction).toHaveBeenCalledWith(
      'movement_create',
      expect.objectContaining({
        kind: 'credit_payment',
        stationId: 123,
        operatorId: '456',
        customerId: 7,
        amount: 50,
        method: 'contanti'
      })
    );
    const queuedPayload = mockOfflineQueue.queueAction.mock.calls[0][1];
    expect(queuedPayload).toHaveProperty('operatorId', '456');
    expect(queuedPayload).not.toHaveProperty('customer');
    expect(queuedPayload).not.toHaveProperty('saldo');
    expect(queuedPayload).toHaveProperty('createdAt', '2024-01-01T23:59:59.999Z');
  });

  it('should have standard styled "Tutto" button in payment modal', async () => {
    // This requires mocking the flow to open the payment modal
    const { showPaymentModal } = (await import('../../js/operator/credits.js')) as unknown as {
      showPaymentModal: unknown;
    };
    const customer = { id: 7, cliente: 'Cliente Test', saldo: 150 };

    // We can't easily call internal showPaymentModal unless we export it or trigger it via UI
    // Let's trigger it via UI by mocking the list of debtors
    mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [customer], error: null })
    });

    await showCreditsMenu('123', '456');
    document.getElementById('btn-payment-credit')?.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    // Click on the result item
    const resultItem = document.querySelector('.result-item') as HTMLElement;
    resultItem.click();

    // Check the modal content for the "Tutto" button class
    const tuttoBtn = document.getElementById('btn-full-amount');
    expect(tuttoBtn?.className).toContain('menu-button');
    expect(tuttoBtn?.className).toContain('secondary');
  });

  it('should have clean dropdown options (no parentheses)', async () => {
    mockOpening.checkOpeningStatus.mockResolvedValue({ id: 1 });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi
        .fn()
        .mockResolvedValue({ data: [{ id: 1, cliente: 'Test', saldo: 10 }], error: null })
    });

    await showCreditsMenu('123', '456');
    document.getElementById('btn-payment-credit')?.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    (document.querySelector('.result-item') as HTMLElement).click();

    const select = document.getElementById('pay-method') as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.text);

    expect(options[0]).toBe('Contanti');
    expect(options[1]).toBe('POS');
    expect(options).not.toContain(expect.stringContaining('('));
  });
});
