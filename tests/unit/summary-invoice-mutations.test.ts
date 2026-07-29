/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface QueryResult {
  data: unknown[];
  error: Error | null;
}

type Builder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  then: (resolve: (result: QueryResult) => unknown) => Promise<unknown>;
};

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  directUpdate: vi.fn(),
  directDelete: vi.fn(),
  openConfirmModal: vi.fn(),
  closeModal: vi.fn(),
  toast: vi.fn(),
  handleError: vi.fn(),
  checkOpeningStatus: vi.fn()
}));

function dataFor(table: string): unknown[] {
  if (table === 'invoices') {
    return [
      {
        id: 40,
        customer_name: 'Azienda SRL',
        amount: 150,
        payment_method: 'pos',
        product_category: 'carburante',
        description: 'Rifornimento flotta',
        status: 'pending',
        created_at: '2026-07-24T09:00:00Z'
      }
    ];
  }
  if (table === 'movimenti_cassa') {
    return [
      {
        id: 40,
        tipo: 'uscita',
        importo: 20,
        descrizione: 'Spesa',
        payment_method: 'contanti',
        operator_id: 42,
        created_at: '2026-07-24T10:00:00Z'
      }
    ];
  }
  return [];
}

function makeBuilder(table: string): Builder {
  const builder = {} as Builder;
  const chain = vi.fn(() => builder);
  Object.assign(builder, {
    select: chain,
    eq: chain,
    update: vi.fn((payload: unknown) => {
      mocks.directUpdate(table, payload);
      return builder;
    }),
    delete: vi.fn(() => {
      mocks.directDelete(table);
      return builder;
    }),
    then: (resolve: (result: QueryResult) => unknown) =>
      Promise.resolve({ data: dataFor(table), error: null }).then(resolve)
  });
  return builder;
}

vi.mock('../../js/core/api.js', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc
  },
  Json: {}
}));
vi.mock('../../js/operator/opening.js', () => ({ checkOpeningStatus: mocks.checkOpeningStatus }));
vi.mock('../../js/core/logger.js', () => ({ logger: { error: vi.fn() } }));
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: mocks.handleError }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: mocks.toast } }));
vi.mock('../../js/ui/ui.js', () => ({
  openModal: vi.fn(() => {
    if (!document.getElementById('modal-body')) {
      const modalBody = document.createElement('div');
      modalBody.id = 'modal-body';
      document.body.appendChild(modalBody);
    }
  }),
  closeModal: mocks.closeModal,
  openConfirmModal: mocks.openConfirmModal
}));
vi.mock('../../js/utils/sanitizer.js', () => ({
  setSafeHTML: (element: HTMLElement, html: string) => {
    element.innerHTML = html;
  }
}));
vi.mock('../../js/utils/utils.js', () => ({ escapeHtml: (value: string) => value }));

import { showShiftSummary, buildShiftSummaryItems } from '../../js/operator/summary.js';

async function renderSummary(): Promise<HTMLElement> {
  await showShiftSummary(1, 42);
  const modalBody = document.getElementById('modal-body');
  expect(modalBody).not.toBeNull();
  expect(modalBody!.querySelectorAll('[data-item-id="40"]')).toHaveLength(2);
  mocks.rpc.mockClear();
  return modalBody!;
}

function clickInvoiceEdit(container: HTMLElement): HTMLFormElement {
  const invoiceRow = container.querySelector('[data-item-key="invoice:40"]');
  expect(invoiceRow).not.toBeNull();
  (invoiceRow!.querySelector('.btn-edit-item') as HTMLButtonElement).click();
  const form = document.getElementById('summary-edit-form') as HTMLFormElement;
  expect(form).not.toBeNull();
  return form;
}

describe('invoice mutations in shift summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mocks.from.mockImplementation((table: string) => makeBuilder(table));
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
    mocks.openConfirmModal.mockResolvedValue(true);
    mocks.checkOpeningStatus.mockResolvedValue({
      id: 100,
      station_id: 1,
      operator_id: 42,
      opened_at: '2026-07-24T06:00:00Z',
      closed_at: null,
      status: 'open',
      opening_data: null,
      closing_data: null,
      created_at: '2026-07-24T06:00:00Z',
      updated_at: '2026-07-24T06:00:00Z'
    });
  });

  it('edits an invoice through update_shift_invoice and never a direct invoices update', async () => {
    const container = await renderSummary();
    const form = clickInvoiceEdit(container);
    (form.elements.namedItem('amount') as HTMLInputElement).value = '175.50';
    (form.elements.namedItem('payment_method') as HTMLSelectElement).value = 'bonifico';
    (form.elements.namedItem('description') as HTMLTextAreaElement).value = '';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('update_shift_invoice', {
        p_invoice_id: 40,
        p_amount: 175.5,
        p_payment_method: 'bonifico',
        p_description: null
      });
    });
    expect(mocks.directUpdate).not.toHaveBeenCalledWith('invoices', expect.anything());
  });

  it('blocks a zero invoice amount before the RPC', async () => {
    const container = await renderSummary();
    const form = clickInvoiceEdit(container);
    (form.elements.namedItem('amount') as HTMLInputElement).value = '0';
    (form.elements.namedItem('payment_method') as HTMLSelectElement).value = 'pos';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(mocks.handleError).toHaveBeenCalled();
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith('Voce aggiornata con successo.', 'success');
  });

  it('blocks a blank invoice payment method before the RPC', async () => {
    const container = await renderSummary();
    const form = clickInvoiceEdit(container);
    (form.elements.namedItem('amount') as HTMLInputElement).value = '25';
    (form.elements.namedItem('payment_method') as HTMLSelectElement).value = '';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(mocks.handleError).toHaveBeenCalled();
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith('Voce aggiornata con successo.', 'success');
  });

  it('deletes an invoice through delete_shift_invoice after confirmation', async () => {
    const container = await renderSummary();
    const invoiceRow = container.querySelector('[data-item-key="invoice:40"]');
    (invoiceRow!.querySelector('.btn-delete-item') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('delete_shift_invoice', { p_invoice_id: 40 });
    });
    expect(mocks.directDelete).not.toHaveBeenCalledWith('invoices');
  });

  it('does not delete when confirmation is cancelled', async () => {
    mocks.openConfirmModal.mockResolvedValue(false);
    const container = await renderSummary();
    const invoiceRow = container.querySelector('[data-item-key="invoice:40"]');
    (invoiceRow!.querySelector('.btn-delete-item') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(mocks.openConfirmModal).toHaveBeenCalled());
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.directDelete).not.toHaveBeenCalled();
  });

  it('handles an invoice RPC error without success toast or refresh', async () => {
    const rpcError = new Error('update failed');
    mocks.rpc.mockResolvedValue({ data: null, error: rpcError });
    const container = await renderSummary();
    const form = clickInvoiceEdit(container);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(mocks.handleError).toHaveBeenCalledWith(rpcError, 'summary.edit');
    });
    expect(mocks.toast).not.toHaveBeenCalledWith('Voce aggiornata con successo.', 'success');
    expect(mocks.closeModal).not.toHaveBeenCalled();
    expect(mocks.checkOpeningStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps the direct table update path for non-invoice items', async () => {
    const container = await renderSummary();
    const movementRow = container.querySelector('[data-item-key="movimento_cassa:40"]');
    expect(movementRow).not.toBeNull();
    (movementRow!.querySelector('.btn-edit-item') as HTMLButtonElement).click();
    const form = document.getElementById('summary-edit-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(mocks.directUpdate).toHaveBeenCalledWith(
        'movimenti_cassa',
        expect.objectContaining({ importo: 20 })
      );
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('update_shift_invoice', expect.anything());
  });

  it('keeps the direct table delete path for non-invoice items', async () => {
    const container = await renderSummary();
    const movementRow = container.querySelector('[data-item-key="movimento_cassa:40"]');
    expect(movementRow).not.toBeNull();
    (movementRow!.querySelector('.btn-delete-item') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(mocks.directDelete).toHaveBeenCalledWith('movimenti_cassa');
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('delete_shift_invoice', expect.anything());
  });

  it('ensures voucher items are never deletable or editable even when shift is open', () => {
    const items = buildShiftSummaryItems({
      shift: { id: 100, station_id: 1, status: 'open' } as any,
      shiftPistols: [],
      tankReadings: [],
      movimentiCassa: [],
      creditiMovimenti: [],
      vouchers: [
        {
          id: 'v1',
          code: 'VOUCHER-01',
          amount: 50,
          status: 'redeemed',
          redeemed_at: '2026-07-29T10:00:00Z'
        }
      ],
      invoices: [],
      puntiRiscatti: [],
      canEdit: true
    });

    const voucherItem = items.find(i => i.kind === 'voucher');
    expect(voucherItem).toBeDefined();
    expect(voucherItem!.deletable).toBe(false);
    expect(voucherItem!.editable).toBe(false);
  });
});
