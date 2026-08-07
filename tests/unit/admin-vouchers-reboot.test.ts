import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockToast, mockUI, mockUtils } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null })
      }))
    })),
    rpc: vi.fn().mockResolvedValue({
      data: {
        batches: [],
        global: {
          total_gen: 0,
          total_redeemed: 0,
          total_active: 0,
          redeemed_value: 0,
          circulating_value: 0
        }
      },
      error: null
    })
  },
  mockToast: { show: vi.fn() },
  mockUI: {
    showLoadingMessage: vi.fn(),
    showInfoModal: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openConfirmModal: vi.fn()
  },
  mockUtils: {
    escapeHtml: vi.fn(str => str),
    formatEuro: vi.fn(val => `€${val}`),
    formatDate: vi.fn(d => d),
    getISODate: vi.fn(() => '2024-01-01'),
    getItalianBusinessDate: vi.fn(() => '2024-01-01')
  }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showVoucherAdminTab } from '../../js/admin/vouchers_reboot.js';

describe('Admin Vouchers Reboot Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="voucher-container"></div>';
  });

  it('should render voucher admin tab', async () => {
    const container = document.getElementById('voucher-container')!;

    await showVoucherAdminTab(container);

    expect(container.innerHTML).toContain('voucher');
  });

  it('should load vouchers from database', async () => {
    const container = document.getElementById('voucher-container')!;

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: '1', description: 'Batch 1', customer_name: 'Customer A' }],
        error: null
      })
    });

    await showVoucherAdminTab(container);

    expect(mockSupabase.from).toHaveBeenCalled();
  });

  it('dashboard uses get_voucher_batch_stats RPC and server-side pagination', async () => {
    const container = document.getElementById('voucher-container')!;

    const rangeMock = vi.fn().mockResolvedValue({
      data: [
        { id: 'b1', description: 'Batch 1', customer_name: 'A' },
        { id: 'b2', description: 'Batch 2', customer_name: 'B' }
      ],
      error: null,
      count: 5
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: rangeMock,
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
    });

    mockSupabase.rpc.mockResolvedValue({
      data: {
        batches: [
          {
            batch_id: 'b1',
            total_count: 5,
            redeemed_count: 2,
            active_count: 3,
            void_count: 0,
            total_amount: 250,
            redeemed_amount: 100
          }
        ],
        global: {
          total_gen: 10,
          total_redeemed: 4,
          total_active: 6,
          redeemed_value: 200,
          circulating_value: 300
        }
      },
      error: null
    });

    await showVoucherAdminTab(container);

    // Switch to the Dashboard tab to exercise renderDashboard
    const dashboardTab = container.querySelector('[data-tab="dashboard"]') as HTMLElement;
    dashboardTab.click();

    await vi.waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_voucher_batch_stats');
    });

    // The batches query must be paginated server-side via .range()
    expect(rangeMock).toHaveBeenCalledWith(0, 24);
  });
});
