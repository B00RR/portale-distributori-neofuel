/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockCheckOpeningStatus, mockToast, mockShowShiftSummary } = vi.hoisted(
  () => ({
    mockSupabase: {
      rpc: vi.fn()
    },
    mockCheckOpeningStatus: vi.fn(),
    mockToast: {
      show: vi.fn()
    },
    mockShowShiftSummary: vi.fn()
  })
);

vi.mock('../../js/core/api.js', () => ({
  supabase: mockSupabase
}));

vi.mock('../../js/operator/opening.js', () => ({
  checkOpeningStatus: mockCheckOpeningStatus
}));

vi.mock('../../js/ui/toast.js', () => ({
  Toast: mockToast
}));

vi.mock('../../js/operator/summary.js', () => ({
  showShiftSummary: mockShowShiftSummary
}));

import { showCustomerRefundForm } from '../../js/operator/refund.js';

describe('Customer Refund Form in Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="operator-content"></div>';
  });

  it('4. showCustomerRefundForm() opens modal and uses #modal-body, preserving fields and buttons', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open' });

    await showCustomerRefundForm(1, 10);

    // Should open modal (#app-modal) and render in #modal-body
    const modalBody = document.getElementById('modal-body');
    expect(modalBody).not.toBeNull();

    // #operator-content should NOT be written to
    const operatorContent = document.getElementById('operator-content');
    expect(operatorContent?.innerHTML).toBe('');

    const form = modalBody?.querySelector('[data-testid="customer-refund-form"]');
    expect(form).not.toBeNull();

    const amountInput = modalBody?.querySelector('[data-testid="refund-amount"]');
    const dateInput = modalBody?.querySelector('[data-testid="refund-receipt-date"]');
    const methodSelect = modalBody?.querySelector('[data-testid="refund-method"]');
    const notesInput = modalBody?.querySelector('[data-testid="refund-notes"]');
    const submitBtn = modalBody?.querySelector('[data-testid="btn-confirm-refund"]');
    const cancelBtn = modalBody?.querySelector('[data-testid="btn-cancel-refund"]');

    expect(amountInput).not.toBeNull();
    expect(dateInput).not.toBeNull();
    expect(methodSelect).not.toBeNull();
    expect(notesInput).not.toBeNull();
    expect(submitBtn).not.toBeNull();
    expect(cancelBtn).not.toBeNull();
  });

  it('renders warning in #modal-body if no shift is open', async () => {
    mockCheckOpeningStatus.mockResolvedValue(null);

    await showCustomerRefundForm(1, 10);

    const modalBody = document.getElementById('modal-body');
    expect(modalBody?.innerHTML).toContain('Nessun Turno Aperto');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('submits refund successfully via RPC and triggers showShiftSummary popup', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open' });
    mockSupabase.rpc.mockResolvedValue({ data: { id: 5 }, error: null });

    await showCustomerRefundForm(1, 10);

    const modalBody = document.getElementById('modal-body')!;
    const amountInput = modalBody.querySelector(
      '[data-testid="refund-amount"]'
    ) as HTMLInputElement;
    const dateInput = modalBody.querySelector(
      '[data-testid="refund-receipt-date"]'
    ) as HTMLInputElement;
    const methodSelect = modalBody.querySelector(
      '[data-testid="refund-method"]'
    ) as HTMLSelectElement;
    const notesInput = modalBody.querySelector(
      '[data-testid="refund-notes"]'
    ) as HTMLTextAreaElement;
    const form = modalBody.querySelector('#customer-refund-form') as HTMLFormElement;

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
    expect(mockShowShiftSummary).toHaveBeenCalledWith(1, 10);
  });

  it('shows warning toast if amount is invalid', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open' });

    await showCustomerRefundForm(1, 10);

    const modalBody = document.getElementById('modal-body')!;
    const amountInput = modalBody.querySelector(
      '[data-testid="refund-amount"]'
    ) as HTMLInputElement;
    const form = modalBody.querySelector('#customer-refund-form') as HTMLFormElement;

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

    const modalBody = document.getElementById('modal-body')!;
    const amountInput = modalBody.querySelector(
      '[data-testid="refund-amount"]'
    ) as HTMLInputElement;
    const dateInput = modalBody.querySelector(
      '[data-testid="refund-receipt-date"]'
    ) as HTMLInputElement;
    const form = modalBody.querySelector('#customer-refund-form') as HTMLFormElement;

    amountInput.value = '10.00';
    dateInput.value = '2026-07-23';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockSupabase.rpc).toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('RPC Error', 'error');
  });
});
