import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showChiusureTab,
  showClosureDetails,
  openBulkExportModal,
  handleBulkExport,
  deleteClosure
} from '../../js/admin/shifts.js';
import { handleError } from '../../js/shared/error-handler.js';

// Mock dependencies
// Mock dependencies
vi.mock('../../js/core/api.js', () => {
  const query: Record<string, unknown> = {};
  const methods = [
    'select',
    'eq',
    'order',
    'range',
    'limit',
    'gte',
    'lt',
    'lte',
    'not',
    'in',
    'single',
    'maybeSingle',
    'rpc'
  ];
  methods.forEach(m => {
    query[m] = vi.fn(() => query);
  });
  // Ensure then is available for await
  query.then = (
    resolve: (value: {
      data: { id: number; station_id: string }[];
      error: null;
      count: number;
    }) => unknown
  ) => resolve({ data: [{ id: 123, station_id: 'ST1' }], error: null, count: 1 });

  return {
    supabase: {
      from: vi.fn(() => query),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null }))
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

vi.mock('../../js/ui/toast.js', () => ({
  Toast: {
    show: vi.fn(),
    confirm: vi.fn(() => Promise.resolve(true))
  }
}));

vi.mock('../../js/ui/ui.js', () => ({
  showLoadingMessage: vi.fn(),
  openModal: vi.fn(() => {
    const body = document.createElement('div');
    body.id = 'modal-body';
    document.body.appendChild(body);
  }),
  closeModal: vi.fn(),
  openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../js/shared/state.js', () => ({
  store: {
    getState: vi.fn(() => ({ stationId: 'ST1' })),
    getFilters: vi.fn(() => ({ dateFrom: '', dateTo: '' })),
    getPagination: vi.fn(() => ({ page: 0, pageSize: 10, totalCount: 0 })),
    getFilter: vi.fn(() => 'ST1'),
    getUser: vi.fn(() => ({ role: 'admin' })),
    setPagination: vi.fn(),
    subscribe: vi.fn(() => () => {})
  }
}));

vi.mock('../../js/core/business-logic-manager.js', () => ({
  BusinessLogicManager: {
    loadRules: vi.fn(() => Promise.resolve({ force_close_hours_threshold: 24 })),
    saveRules: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../../js/admin/components/FilterBar.js', () => ({
  FilterBar: class {
    render = vi.fn();
    onFilter = vi.fn();
  }
}));

vi.mock('../../js/admin/components/Pagination.js', () => ({
  Pagination: class {
    render = vi.fn();
    onPageChange = vi.fn();
  }
}));

vi.mock('../../js/shared/error-handler.js', () => ({
  handleError: vi.fn()
}));

describe('Admin Shifts Module', () => {
  let container: HTMLElement;
  let actions: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    actions = document.createElement('div');
    vi.clearAllMocks();
  });

  describe('showChiusureTab', () => {
    it('should render initial layout', async () => {
      await showChiusureTab(container, actions);
      expect(container.innerHTML).toContain('data-container');
      expect(actions.innerHTML).toContain('btn-bulk-export');
    });

    it('should show empty message when no closures', async () => {
      const { supabase } = await import('../../js/core/api.js');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
          resolve({ data: [], error: null, count: 0 })
      } as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);
      expect(container.innerHTML).toContain('Nessuna chiusura trovata');
    });

    it('should handle errors in renderTable', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const { handleError } = await import('../../js/shared/error-handler.js');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: null; error: Error }) => unknown) =>
          resolve({ data: null, error: new Error('DB Error') })
      } as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);
      expect(handleError).toHaveBeenCalled();
    });

    it('should render table rows with full data and stale logic', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const sampleShift = {
        id: 1,
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48h ago (STALE)
        closed_at: null,
        status: 'open',
        station_id: 'ST1',
        operator_id: 'OP1',
        fuel_stations: { station_name: 'Test Station' },
        users: { full_name: 'Test User' },
        closing_data: {
          ricavo_teorico: 100,
          is_final: false
        }
      };

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
          resolve({ data: [sampleShift], error: null, count: 1 })
      } as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      expect(container.innerHTML).toContain('Test Station');
      expect(container.innerHTML).toContain('Test User');
      expect(container.innerHTML).toContain('STALE');
      expect(container.innerHTML).toContain('100,00');
    });

    it('should render daily total card with correct sums for current day closures', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const now = new Date();
      const todayISO = now.toISOString();

      const sampleShift1 = {
        id: 1,
        created_at: todayISO,
        closed_at: todayISO,
        status: 'closed',
        station_id: 'ST1',
        operator_id: 'OP1',
        fuel_stations: { station_name: 'Test Station' },
        users: { full_name: 'Test User' },
        closing_data: {
          computed: {
            totale_venduto_carburante: 150.5,
            totale_venduto_extra: 50.25,
            expected_cash: 200,
            real_cash: 198.5
          }
        }
      };

      const sampleShift2 = {
        id: 2,
        created_at: todayISO,
        closed_at: todayISO,
        status: 'closed',
        station_id: 'ST1',
        operator_id: 'OP1',
        fuel_stations: { station_name: 'Test Station' },
        users: { full_name: 'Test User' },
        closing_data: {
          computed: {
            totale_venduto_carburante: 100,
            totale_venduto_extra: 20,
            expected_cash: 120,
            real_cash: 120
          }
        }
      };

      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sampleShiftYesterday = {
        id: 3,
        created_at: yesterday.toISOString(),
        closed_at: yesterday.toISOString(),
        status: 'closed',
        station_id: 'ST1',
        operator_id: 'OP1',
        fuel_stations: { station_name: 'Test Station' },
        users: { full_name: 'Test User' },
        closing_data: {
          computed: {
            totale_venduto_carburante: 1000,
            totale_venduto_extra: 100,
            expected_cash: 1100,
            real_cash: 1100
          }
        }
      };

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
          resolve({
            data: [sampleShift1, sampleShift2, sampleShiftYesterday],
            error: null,
            count: 3
          })
      } as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      expect(container.innerHTML).toContain('daily-total-card');
      expect(container.innerHTML).toContain('Totale Giornaliero');
      expect(container.innerHTML).toContain('250,50');
      expect(container.innerHTML).toContain('70,25');
      expect(container.innerHTML).toContain('320,75');
      expect(container.innerHTML).toContain('320,00');
      expect(container.innerHTML).toContain('318,50');
      expect(container.innerHTML).toContain('1,50');
    });

    it('should render each closure as a separate row in the table when an operator has multiple closures on the same day', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const now = new Date();
      const todayISO = now.toISOString();

      const closure1 = {
        id: 101,
        created_at: todayISO,
        closed_at: todayISO,
        status: 'closed',
        station_id: 'ST1',
        operator_id: 'OP1',
        fuel_stations: { station_name: 'Stazione Nord' },
        users: { full_name: 'Mario Rossi' },
        closing_data: {
          computed: {
            totale_venduto_carburante: 100,
            expected_cash: 100,
            real_cash: 100
          }
        }
      };

      const closure2 = {
        id: 102,
        created_at: todayISO,
        closed_at: todayISO,
        status: 'closed',
        station_id: 'ST1',
        operator_id: 'OP1',
        fuel_stations: { station_name: 'Stazione Nord' },
        users: { full_name: 'Mario Rossi' },
        closing_data: {
          computed: {
            totale_venduto_carburante: 200,
            expected_cash: 200,
            real_cash: 200
          }
        }
      };

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
          resolve({
            data: [closure1, closure2],
            error: null,
            count: 2
          })
      } as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      const tableRows = container.querySelectorAll('tbody tr');
      expect(tableRows.length).toBe(2);

      const viewButtons = container.querySelectorAll('.view-closure');
      expect(viewButtons.length).toBe(2);
      expect((viewButtons[0] as HTMLElement).dataset.id).toBe('101');
      expect((viewButtons[1] as HTMLElement).dataset.id).toBe('102');
    });
  });

  describe('showClosureDetails', () => {
    it('should fetch and show details (empty case)', async () => {
      const { openModal } = await import('../../js/ui/ui.js');
      await showClosureDetails(123);
      expect(openModal).toHaveBeenCalledWith('Dettagli Chiusura');
    });

    it('should handle fetch error', async () => {
      const { supabase } = await import('../../js/core/api.js');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') })
      } as unknown as ReturnType<typeof supabase.from>);

      await showClosureDetails(999);
      expect(document.body.innerHTML).toContain('Errore: Chiusura non trovata');
    });

    it('should fetch and show details (success case)', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const sample = {
        id: 123,
        station_id: 'ST1',
        status: 'closed',
        created_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-01T10:00:00Z',
        opening_data: {},
        closing_data: {
          snapshot: {
            computed: {
              fuel_revenue: 500,
              extra_revenue: 0,
              total_sold: 500,
              self: { cash_in: 0, cash_out: 0, pos: 0, fleet: 0, manager: 0 },
              operator: { cash: 0, pos: 0, fleet: 0 },
              expected_cash: 0,
              real_cash: 0,
              discrepancy: 0,
              outflows: 0,
              vouchers: 0,
              points: 0,
              new_credits: 0,
              extra_by_method: { cash: 0, pos: 0, uta_dkv_fine_mese: 0 },
              credit_payments: { cash: 0, pos: 0, uta_dkv_fine_mese: 0 }
            }
          }
        }
      };
      vi.mocked(supabase.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: sample, error: null })
        } as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        } as unknown as ReturnType<typeof supabase.from>);

      await showClosureDetails(123);
      expect(document.body.innerHTML).toContain('500,00');
    });
  });

  describe('Bulk Export', () => {
    it('openBulkExportModal should create modal', async () => {
      const { openModal } = await import('../../js/ui/ui.js');
      await openBulkExportModal();
      expect(openModal).toHaveBeenCalledWith('Export Multiplo Chiusure');
    });

    it('handleBulkExport should call export_utils (last_n)', async () => {
      const exportMod = await import('../../js/utils/export_utils.js');
      vi.spyOn(exportMod, 'fetchShiftPistolsForBulkExport').mockResolvedValue(new Map([[123, []]]));
      vi.spyOn(exportMod, 'generateMultiClosureExcel').mockResolvedValue(undefined);
      vi.spyOn(exportMod, 'computeExportSummaryMetrics').mockResolvedValue(
        {} as Partial<ReturnType<typeof exportMod.computeExportSummaryMetrics>>
      );

      await handleBulkExport({ stationId: 'ST1', type: 'last_n', limit: 10 });

      expect(exportMod.generateMultiClosureExcel).toHaveBeenCalled();
    });

    it('handleBulkExport should handle generation error', async () => {
      const exportMod = await import('../../js/utils/export_utils.js');
      const exportError = new Error('Export failed');
      vi.spyOn(exportMod, 'fetchShiftPistolsForBulkExport').mockResolvedValue(new Map([[123, []]]));
      vi.spyOn(exportMod, 'computeExportSummaryMetrics').mockResolvedValue(
        {} as Awaited<ReturnType<typeof exportMod.computeExportSummaryMetrics>>
      );
      vi.spyOn(exportMod, 'generateMultiClosureExcel').mockRejectedValue(exportError);

      await expect(handleBulkExport({ stationId: 'ST1', type: 'last_n', limit: 10 })).rejects.toBe(
        exportError
      );
    });
    it('handleBulkExport should call export_utils (date_range)', async () => {
      const exportMod = await import('../../js/utils/export_utils.js');
      vi.spyOn(exportMod, 'fetchShiftPistolsForBulkExport').mockResolvedValue(new Map([[123, []]]));
      vi.spyOn(exportMod, 'computeExportSummaryMetrics').mockResolvedValue(
        {} as Awaited<ReturnType<typeof exportMod.computeExportSummaryMetrics>>
      );
      vi.spyOn(exportMod, 'generateMultiClosureExcel').mockResolvedValue(undefined);

      await handleBulkExport({
        stationId: 'ST1',
        type: 'date_range',
        limit: 10,
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31'
      });

      expect(exportMod.generateMultiClosureExcel).toHaveBeenCalled();
    });

    it('handleBulkExport should throw if no data', async () => {
      const { supabase } = await import('../../js/core/api.js');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [], error: null })
      } as unknown as ReturnType<typeof supabase.from>);

      await expect(
        handleBulkExport({ stationId: 'ST1', type: 'last_n', limit: 10 })
      ).rejects.toThrow('Nessuna chiusura trovata');
    });
  });

  describe('deleteClosure', () => {
    it('should ask for confirmation and delete', async () => {
      const { openConfirmModal } = await import('../../js/ui/ui.js');
      const { supabase } = await import('../../js/core/api.js');
      const callback = vi.fn();

      await deleteClosure(123, callback);

      expect(openConfirmModal).toHaveBeenCalled();
      expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_closure', { closure_id: 123 });
      expect(callback).toHaveBeenCalled();
    });

    it('should do nothing if not confirmed', async () => {
      const { openConfirmModal } = await import('../../js/ui/ui.js');
      const { supabase } = await import('../../js/core/api.js');
      vi.mocked(openConfirmModal).mockResolvedValueOnce(false);

      await deleteClosure(123);

      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });
});
