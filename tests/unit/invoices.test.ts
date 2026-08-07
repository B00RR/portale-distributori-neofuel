import { beforeEach, describe, expect, it, vi } from 'vitest';

interface InvoiceRow {
  id: number;
  created_at: string;
  amount: number;
  payment_method: string;
  product_category: string;
  status: string;
  user: { full_name: string };
}

interface QueryResult {
  data: InvoiceRow[];
  error: null;
  count: number;
}

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  then: (resolve: (value: QueryResult) => unknown) => unknown;
};

const { mockSupabase, mockUI, mockUtils, mockToast, mockErrorHandler, queryBuilder } = vi.hoisted(
  () => {
    const rows: InvoiceRow[] = [
      {
        id: 1,
        created_at: '2024-01-01',
        amount: 100,
        payment_method: 'contanti',
        product_category: 'Gasolio',
        status: 'completed',
        user: { full_name: 'Test' }
      }
    ];

    const builder = {} as QueryBuilder;
    const chain = vi.fn(() => builder);
    Object.assign(builder, {
      select: chain,
      eq: chain,
      order: chain,
      range: chain,
      in: chain,
      then: (resolve: (value: QueryResult) => unknown) =>
        resolve({ data: rows, error: null, count: rows.length })
    });

    return {
      queryBuilder: builder,
      mockSupabase: {
        from: vi.fn(() => builder),
        rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null })
      },
      mockUI: {
        showLoadingMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        openConfirmModal: vi.fn().mockResolvedValue(true)
      },
      mockUtils: {
        formatEuro: vi.fn((value: number) => `€${value}`),
        formatLitri: vi.fn((value: number) => `${value}L`),
        getISODate: vi.fn(() => '2024-01-01'),
        escapeHtml: vi.fn((value: string) => value)
      },
      mockToast: { show: vi.fn() },
      mockErrorHandler: { handleError: vi.fn() }
    };
  }
);

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/shared/error-handler.js', () => mockErrorHandler);

import { showFattureTab } from '../../js/admin/invoices.js';

describe('Admin Invoices Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(queryBuilder);
    mockSupabase.rpc.mockResolvedValue({ data: { success: true }, error: null });
    document.body.innerHTML = `
      <div id="invoices-container"></div>
      <button class="nav-btn active">Tab</button>
    `;
  });

  it('updates status through the RPC and refreshes the active tab on success', async () => {
    const container = document.getElementById('invoices-container');
    const activeTab = document.querySelector('.nav-btn.active') as HTMLButtonElement;
    const refreshSpy = vi.spyOn(activeTab, 'click');
    expect(container).not.toBeNull();

    await showFattureTab(container!);
    const button = container!.querySelector('.toggle-status') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_invoice_status', {
        p_invoice_id: 1,
        p_new_status: 'pending'
      });
      expect(mockToast.show).toHaveBeenCalledWith('Stato fattura aggiornato', 'success');
      expect(refreshSpy).toHaveBeenCalledOnce();
    });
  });

  it('handles an RPC error without showing success or refreshing the tab', async () => {
    const rpcError = new Error('RPC failed');
    mockSupabase.rpc.mockResolvedValue({ data: null, error: rpcError });
    const container = document.getElementById('invoices-container');
    const activeTab = document.querySelector('.nav-btn.active') as HTMLButtonElement;
    const refreshSpy = vi.spyOn(activeTab, 'click');
    expect(container).not.toBeNull();

    await showFattureTab(container!);
    const button = container!.querySelector('.toggle-status') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(rpcError, 'toggleInvoiceStatus');
    });
    expect(mockToast.show).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
