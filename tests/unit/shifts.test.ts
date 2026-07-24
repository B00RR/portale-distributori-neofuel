import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showChiusureTab, showClosureDetails, deleteClosure } from '../../js/admin/shifts.js';

// --- MOCKS ---

vi.mock('../../js/core/api.js', () => {
  const mockChain: Record<string, unknown> = {};
  const methods = [
    'select',
    'eq',
    'gt',
    'gte',
    'lt',
    'lte',
    'range',
    'order',
    'limit',
    'single',
    'maybeSingle',
    'not',
    'in'
  ];
  methods.forEach(m => {
    mockChain[m] = vi.fn(() => mockChain);
  });
  mockChain.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null, count: 0 });

  return {
    supabase: {
      from: vi.fn(() => mockChain),
      rpc: vi.fn(() => Promise.resolve({ error: null }))
    },
    Cache: {
      getOrFetch: vi.fn((key, fetchFn) => fetchFn()),
      invalidate: vi.fn(),
      invalidateByPrefix: vi.fn(),
      clear: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      getStats: vi.fn(() => ({ total: 0, valid: 0, expired: 0 }))
    },
    CACHE_KEYS: {
      STATIONS: 'stations',
      CUSTOMERS: 'customers',
      FUEL_TYPES: 'fuel_types',
      STATION_PREFIX: 'station_'
    }
  };
});

vi.mock('../../js/shared/error-handler.js', () => ({
  handleError: vi.fn()
}));

vi.mock('../../js/shared/state.js', () => ({
  store: {
    getFilters: vi.fn(() => ({ dateFrom: null, dateTo: null })),
    getPagination: vi.fn(() => ({ page: 0, pageSize: 20, totalCount: 0 })),
    getFilter: vi.fn(() => null),
    getUser: vi.fn(() => ({ role: 'admin' })),
    setPagination: vi.fn(),
    subscribe: vi.fn(() => () => {})
  }
}));

vi.mock('../../js/ui/toast.js', () => ({
  Toast: {
    show: vi.fn()
  }
}));

vi.mock('../../js/core/business-logic-manager.js', () => ({
  BusinessLogicManager: {
    loadRules: vi.fn(() => Promise.resolve({ force_close_hours_threshold: 24 }))
  }
}));

vi.mock('../../js/ui/ui.js', () => ({
  showLoadingMessage: vi.fn(),
  openModal: vi.fn(),
  closeModal: vi.fn(),
  openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../js/utils/export_utils.js', () => ({
  fetchClosureExportData: vi.fn(() => Promise.resolve({ station_id: 1 })),
  generateClosureExcel: vi.fn(() => Promise.resolve()),
  generateMultiClosureExcel: vi.fn(() => Promise.resolve()),
  computeExportSummaryMetrics: vi.fn(() => Promise.resolve({}))
}));

vi.mock('../../js/utils/utils.js', () => ({
  escapeHtml: vi.fn(text => String(text || '')),
  formatEuro: vi.fn(val => `€ ${val}`),
  getItalianBusinessDate: vi.fn(() => '2026-07-24')
}));

vi.mock('../../js/admin/components/FilterBar.js', () => ({
  FilterBar: class MockFilterBar {
    render() {}
  }
}));

vi.mock('../../js/admin/components/Pagination.js', () => ({
  Pagination: class MockPagination {
    render() {}
  }
}));

describe('Shifts Module', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'container';
    document.body.appendChild(container);

    const actions = document.createElement('div');
    actions.id = 'actions';
    document.body.appendChild(actions);

    const modalBody = document.createElement('div');
    modalBody.id = 'modal-body';
    document.body.appendChild(modalBody);

    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('showChiusureTab - Data Rendering', () => {
    it('should render shifts table container', async () => {
      const actions = document.getElementById('actions')!;
      await showChiusureTab(container, actions);

      expect(container.querySelector('#filters-container')).toBeTruthy();
      expect(container.querySelector('#data-container')).toBeTruthy();
      expect(container.querySelector('#pagination-container')).toBeTruthy();
    });

    it('should add bulk export button to actions', async () => {
      const actions = document.getElementById('actions')!;
      await showChiusureTab(container, actions);

      const btn = document.getElementById('btn-bulk-export');
      expect(btn).toBeTruthy();
      expect(btn?.textContent).toContain('Export Multiplo');
    });

    it('should display "Nessuna chiusura trovata" when data is empty', async () => {
      const { supabase } = await import('../../js/core/api.js');

      // Create a recursive mock chain that handles any combination of calls
      const mockChain = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        gte: vi.fn(() => mockChain),
        lt: vi.fn(() => mockChain),
        lte: vi.fn(() => mockChain),
        range: vi.fn(() => mockChain),
        order: vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 })),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 })
      };

      vi.mocked(supabase.from).mockReturnValue(
        mockChain as unknown as ReturnType<typeof supabase.from>
      );

      await showChiusureTab(container, null);

      expect(container.innerHTML).toContain('Nessuna chiusura trovata');
    });
  });

  describe('Stale Indicator Logic', () => {
    it('should show STALE badge for open shifts exceeding threshold', async () => {
      const { supabase } = await import('../../js/core/api.js');
      // Mock shift created 25 hours ago (threshold is 24)
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const staleShift = {
        id: 101,
        station_id: 1,
        operator_id: 'op1',
        status: 'open',
        created_at: staleDate,
        closed_at: null,
        closing_data: { is_final: false }
      };

      const mockChain = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        gte: vi.fn(() => mockChain),
        lt: vi.fn(() => mockChain),
        lte: vi.fn(() => mockChain),
        range: vi.fn(() => mockChain),
        order: vi.fn(() => Promise.resolve({ data: [staleShift], error: null, count: 1 })),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: [staleShift], error: null, count: 1 })
      };

      vi.mocked(supabase.from).mockReturnValue(
        mockChain as unknown as ReturnType<typeof supabase.from>
      );

      await showChiusureTab(container, null);

      // Wait for async rendering
      await new Promise(r => setTimeout(r, 0));

      const badge = container.querySelector('.badge-danger');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('STALE');
    });

    it('should NOT show STALE badge for recent open shifts', async () => {
      const { supabase } = await import('../../js/core/api.js');
      // Mock shift created 10 hours ago
      const recentDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
      const recentShift = {
        id: 102,
        status: 'open',
        created_at: recentDate,
        closing_data: { is_final: false }
      };

      const mockChain = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        gte: vi.fn(() => mockChain),
        lt: vi.fn(() => mockChain),
        lte: vi.fn(() => mockChain),
        range: vi.fn(() => mockChain),
        order: vi.fn(() => Promise.resolve({ data: [recentShift], error: null, count: 1 })),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: [recentShift], error: null, count: 1 })
      };

      vi.mocked(supabase.from).mockReturnValue(
        mockChain as unknown as ReturnType<typeof supabase.from>
      );

      await showChiusureTab(container, null);
      await new Promise(r => setTimeout(r, 0));

      expect(container.innerHTML).not.toContain('STALE');
    });
  });

  describe('showClosureDetails - Self Service Logic', () => {
    it('should display the simple view when no banknotes were dispensed', async () => {
      const { formatEuro } = await import('../../js/utils/utils.js');
      const { supabase } = await import('../../js/core/api.js');

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: {
                  id: 1,
                  station_id: 'ST1',
                  status: 'closed',
                  created_at: '2024-01-01',
                  opening_data: {},
                  closing_data: {
                    snapshot: {
                      computed: {
                        self: { cash_in: 100, cash_out: 0, pos: 0, fleet: 0, manager: 0 }
                      }
                    }
                  }
                },
                error: null
              })
            )
          }))
        }))
      } as unknown as ReturnType<typeof supabase.from>);

      await showClosureDetails(1);

      const modalBody = document.getElementById('modal-body');
      // Expect simple format: "Contanti: € 100" (incassate = 100)
      expect(modalBody?.innerHTML).toContain('Contanti:');
      expect(formatEuro).toHaveBeenCalledWith(100);
    });

    it('should display the incassato with the raw breakdown when banknotes were dispensed (#347)', async () => {
      const { formatEuro } = await import('../../js/utils/utils.js');
      const { supabase } = await import('../../js/core/api.js');

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: {
                  id: 1,
                  station_id: 'ST1',
                  status: 'closed',
                  created_at: '2024-01-01',
                  opening_data: {},
                  closing_data: {
                    snapshot: {
                      computed: {
                        self: { cash_in: 80, cash_out: 30, pos: 0, fleet: 0, manager: 0 }
                      }
                    }
                  }
                },
                error: null
              })
            )
          }))
        }))
      } as unknown as ReturnType<typeof supabase.from>);

      await showClosureDetails(1);

      const modalBody = document.getElementById('modal-body');
      expect(modalBody?.innerHTML).toContain('Contanti:');
      expect(modalBody?.innerHTML).toContain('Incassati:');
      expect(modalBody?.innerHTML).toContain('Erogati:');
      // Mostra l'incassato (80) come valore principale
      expect(formatEuro).toHaveBeenCalledWith(80);
    });
  });

  describe('Bulk Export Modal', () => {
    it('should open modal and populate station dropdown', async () => {
      const { openModal } = await import('../../js/ui/ui.js');
      const { supabase } = await import('../../js/core/api.js');
      const actions = document.getElementById('actions')!;

      // Mock Stations fetch
      const mockStations = [
        { station_id: 1, station_name: 'Stazione A' },
        { station_id: 2, station_name: 'Stazione B' }
      ];

      // Setup supabase mock specifically for this flow
      // Note: Shifts module calls showChiusureTab -> renders btn -> user clicks -> openBulkExportModal -> fetch stations

      // We need to mock the stations query which is: .from('fuel_stations').select(...)
      const fromMock = vi.mocked(supabase.from);
      fromMock.mockImplementation(table => {
        if (table === 'fuel_stations') {
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: mockStations, error: null }))
            }))
          } as unknown as ReturnType<typeof supabase.from>;
        }
        // Default shift query fallback
        return {
          select: vi.fn(() => ({
            range: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], count: 0 })) }))
          }))
        } as unknown as ReturnType<typeof supabase.from>;
      });

      await showChiusureTab(container, actions);

      const btn = document.getElementById('btn-bulk-export');
      btn?.click();

      // Wait for async fetch
      await new Promise(r => setTimeout(r, 0));

      expect(openModal).toHaveBeenCalledWith('Export Multiplo Chiusure');

      const modalBody = document.getElementById('modal-body');
      const select = modalBody?.querySelector('#bulk-station');
      expect(select).toBeTruthy();
      expect(select?.innerHTML).toContain('Stazione A');
      expect(select?.innerHTML).toContain('Stazione B');
    });
  });

  describe('deleteClosure', () => {
    it('should call RPC for deletion', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const callback = vi.fn();

      await deleteClosure(1, callback);

      expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_closure', {
        closure_id: 1
      });
    });
  });
});
