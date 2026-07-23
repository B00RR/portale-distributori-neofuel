/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockCheckOpeningStatus, mockToast, mockRouter } = vi.hoisted(() => ({
  mockSupabase: {
    rpc: vi.fn()
  },
  mockCheckOpeningStatus: vi.fn(),
  mockToast: {
    show: vi.fn()
  },
  mockRouter: {
    navigateTo: vi.fn()
  }
}));

vi.mock('../../js/core/api.js', () => ({
  supabase: mockSupabase
}));

vi.mock('../../js/operator/opening.js', () => ({
  checkOpeningStatus: mockCheckOpeningStatus
}));

vi.mock('../../js/ui/toast.js', () => ({
  Toast: mockToast
}));

vi.mock('../../js/operator/router.js', () => ({
  router: mockRouter
}));

import { showCustomerRefundForm } from '../../js/operator/refund.js';

describe('Customer Refund Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="operator-content"></div>';
  });

  it('renders warning if no shift is open', async () => {
    mockCheckOpeningStatus.mockResolvedValue(null);

    await showCustomerRefundForm(1, 10);

    const container = document.getElementById('operator-content');
    expect(container?.innerHTML).toContain('Nessun Turno Aperto');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('renders customer refund form when shift is open', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open' });

    await showCustomerRefundForm(1, 10);

    const form = document.querySelector('[data-testid="customer-refund-form"]');
    expect(form).not.toBeNull();

    const amountInput = document.querySelector('[data-testid="refund-amount"]');
    const dateInput = document.querySelector('[data-testid="refund-receipt-date"]');
    const methodSelect = document.querySelector('[data-testid="refund-method"]');
    const notesInput = document.querySelector('[data-testid="refund-notes"]');
    const submitBtn = document.querySelector('[data-testid="btn-confirm-refund"]');

    expect(amountInput).not.toBeNull();
    expect(dateInput).not.toBeNull();
    expect(methodSelect).not.toBeNull();
    expect(notesInput).not.toBeNull();
    expect(submitBtn).not.toBeNull();
  });

  it('submits refund successfully via RPC', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open' });
    mockSupabase.rpc.mockResolvedValue({ data: { id: 5 }, error: null });

    await showCustomerRefundForm(1, 10);

    const amountInput = document.querySelector('[data-testid="refund-amount"]') as HTMLInputElement;
    const dateInput = document.querySelector(
      '[data-testid="refund-receipt-date"]'
    ) as HTMLInputElement;
    const methodSelect = document.querySelector(
      '[data-testid="refund-method"]'
    ) as HTMLSelectElement;
    const notesInput = document.querySelector(
      '[data-testid="refund-notes"]'
    ) as HTMLTextAreaElement;
    const form = document.querySelector('#customer-refund-form') as HTMLFormElement;

    amountInput.value = '25.50';
    dateInput.value = '2026-07-23';
    methodSelect.value = 'cash';
    notesInput.value = 'Rimborso mancata erogazione 5L';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Wait microtasks
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_customer_refund', {
      p_shift_id: 100,
      p_station_id: 1,
      p_amount: 25.5,
      p_receipt_date: '2026-07-23',
      p_method: 'cash',
      p_notes: 'Rimborso mancata erogazione 5L'
    });

    expect(mockToast.show).toHaveBeenCalledWith(
      'Rimborso cliente registrato con successo',
      'success'
    );
    expect(mockRouter.navigateTo).toHaveBeenCalledWith('resoconto');
  });

  it('shows warning toast if amount is invalid', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open' });

    await showCustomerRefundForm(1, 10);

    const amountInput = document.querySelector('[data-testid="refund-amount"]') as HTMLInputElement;
    const form = document.querySelector('#customer-refund-form') as HTMLFormElement;

    amountInput.value = '0';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('Inserire un importo valido.', 'warning');
  });

  it('shows error toast if RPC fails', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open' });
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error('RPC Error') });

    await showCustomerRefundForm(1, 10);

    const amountInput = document.querySelector('[data-testid="refund-amount"]') as HTMLInputElement;
    const dateInput = document.querySelector(
      '[data-testid="refund-receipt-date"]'
    ) as HTMLInputElement;
    const form = document.querySelector('#customer-refund-form') as HTMLFormElement;

    amountInput.value = '10.00';
    dateInput.value = '2026-07-23';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockSupabase.rpc).toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('RPC Error', 'error');
  });
});
