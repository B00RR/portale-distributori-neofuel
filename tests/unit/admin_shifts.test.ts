import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showChiusureTab,
  showClosureDetails,
  openBulkExportModal,
  handleBulkExport,
  deleteClosure,
  computeShiftMetrics
} from '../../js/admin/shifts.js';

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
    'or',
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
  ) => resolve({ data: [{ id: 1, shift_id: 123, closed_at: '2024-01-01T10:00:00Z' }], error: null, count: 1 });

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
      const sampleClosure = {
        id: 1,
        shift_id: 100,
        operator_id: 1,
        closure_type: 'partial',
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48h ago (STALE parent shift)
        closed_at: new Date().toISOString(),
        closing_data: { is_final: false },
        shifts: {
          station_id: 'ST1',
          status: 'open',
          opening_data: {},
          fuel_stations: { station_name: 'Test Station' },
          users: { full_name: 'Opening Operator' }
        },
        closure_users: { full_name: 'Closure Operator' }
      };

      const mockTable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
          resolve({ data: [sampleClosure], error: null, count: 1 })
      };
      const mockTotals = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [sampleClosure], error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      expect(container.innerHTML).toContain('Test Station');
      expect(container.innerHTML).toContain('Closure Operator');
      expect(container.innerHTML).toContain('STALE');
      expect(container.innerHTML).toContain('Parziale');
    });

    it('should render daily total card with correct sums for current day closures', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const now = new Date();
      const todayISO = now.toISOString();

      const makeClosure = (id: number, fuel: number, extra: number, expected: number, real: number) => ({
        id,
        shift_id: id,
        operator_id: 1,
        closure_type: 'final' as const,
        created_at: todayISO,
        closed_at: todayISO,
        closing_data: {
          computed: {
            totale_venduto_carburante: fuel,
            totale_venduto_extra: extra,
            expected_cash: expected,
            real_cash: real
          }
        },
        shifts: {
          station_id: 'ST1',
          status: 'closed',
          opening_data: {},
          fuel_stations: { station_name: 'Test Station' },
          users: { full_name: 'Test User' }
        },
        closure_users: { full_name: 'Test User' }
      });

      const closure1 = makeClosure(1, 150.5, 50.25, 200, 198.5);
      const closure2 = makeClosure(2, 100, 20, 120, 120);

      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const closureYesterday = {
        id: 3,
        shift_id: 3,
        operator_id: 1,
        closure_type: 'final',
        created_at: yesterday.toISOString(),
        closed_at: yesterday.toISOString(),
        closing_data: {
          computed: {
            totale_venduto_carburante: 1000,
            totale_venduto_extra: 100,
            expected_cash: 1100,
            real_cash: 1100
          }
        },
        shifts: {
          station_id: 'ST1',
          status: 'closed',
          opening_data: {},
          fuel_stations: { station_name: 'Test Station' },
          users: { full_name: 'Test User' }
        },
        closure_users: { full_name: 'Test User' }
      };

      const mockTable1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
          resolve({
            data: [closure1, closure2, closureYesterday],
            error: null,
            count: 3
          })
      };
      const mockTotals1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({
            data: [closure1, closure2],
            error: null
          })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable1 as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals1 as unknown as ReturnType<typeof supabase.from>);

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

      const makeClosure = (id: number, fuel: number) => ({
        id,
        shift_id: id,
        operator_id: 1,
        closure_type: 'final' as const,
        created_at: todayISO,
        closed_at: todayISO,
        closing_data: {
          computed: {
            totale_venduto_carburante: fuel,
            expected_cash: fuel,
            real_cash: fuel
          }
        },
        shifts: {
          station_id: 'ST1',
          status: 'closed',
          opening_data: {},
          fuel_stations: { station_name: 'Stazione Nord' },
          users: { full_name: 'Mario Rossi' }
        },
        closure_users: { full_name: 'Mario Rossi' }
      });

      const closure1 = makeClosure(101, 100);
      const closure2 = makeClosure(102, 200);

      const mockTable2 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
          resolve({
            data: [closure1, closure2],
            error: null,
            count: 2
          })
      };
      const mockTotals2 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({
            data: [closure1, closure2],
            error: null
          })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable2 as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals2 as unknown as ReturnType<typeof supabase.from>);

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
      await showClosureDetails(123, 456);
      expect(openModal).toHaveBeenCalledWith('Dettagli Chiusura Parziale');
    });

    it('should handle fetch error', async () => {
      const { supabase } = await import('../../js/core/api.js');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') })
      } as unknown as ReturnType<typeof supabase.from>);

      await showClosureDetails(999, 456);
      expect(document.body.innerHTML).toContain('Errore: Chiusura non trovata');
    });

    it('should fetch and show details (success case)', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const sample = {
        id: 123,
        shift_id: 456,
        operator_id: 1,
        closure_type: 'final',
        closed_at: '2024-01-01T10:00:00Z',
        created_at: '2024-01-01T10:00:00Z',
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
        },
        shifts: {
          station_id: 'ST1',
          status: 'closed',
          opening_data: {}
        },
        closure_users: { full_name: 'Test User' }
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

      await showClosureDetails(123, 456);
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

  describe('Task #425 Regression Tests', () => {
    it('1. Turno aperto live-like: computeShiftMetrics returns correct values from opening_data', () => {
      const openShift = {
        status: 'open',
        opening_data: {
          cash_in: 300,
          cash_out: 293.6,
          total_amount: 545,
          cash_in_minus_out: 6.4
        }
      };

      const metrics = computeShiftMetrics(openShift);
      expect(metrics.fuelRevenue).toBe(545);
      expect(metrics.extraRevenue).toBe(0);
      expect(metrics.totalSold).toBe(545);
      expect(metrics.expectedCash).toBe(293.6);
      expect(metrics.realCash).toBe(300);
      expect(metrics.discrepancy).toBe(6.4);
    });

    it('2. Se cash_in_minus_out manca, discrepancy = cash_in - cash_out', () => {
      const openShift = {
        status: 'open',
        opening_data: {
          cash_in: 300,
          cash_out: 293.6,
          total_amount: 545
        }
      };

      const metrics = computeShiftMetrics(openShift);
      expect(metrics.discrepancy).toBeCloseTo(6.4);
    });

    it('3. Turni aperti non producono più righe "Apertura" nella tabella chiusure', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const mockTable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: [], error: null, count: 0 })
      };
      const mockTotals = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      expect(container.innerHTML).toContain('Nessuna chiusura trovata');
      expect(container.innerHTML).not.toContain('Apertura');
    });

    it('4. Parziale/finale continua a leggere correttamente snapshot.computed e i fallback legacy', () => {
      const shiftSnapshot = {
        status: 'closed',
        closing_data: {
          snapshot: {
            computed: {
              fuel_revenue: 400,
              extra_revenue: 50,
              total_sold: 450,
              expected_cash: 200,
              real_cash: 195,
              discrepancy: -5
            }
          }
        }
      };
      const m1 = computeShiftMetrics(shiftSnapshot);
      expect(m1.fuelRevenue).toBe(400);
      expect(m1.extraRevenue).toBe(50);
      expect(m1.totalSold).toBe(450);
      expect(m1.expectedCash).toBe(200);
      expect(m1.realCash).toBe(195);
      expect(m1.discrepancy).toBe(-5);

      const shiftLegacy = {
        status: 'closed',
        closing_data: {
          ricavo_teorico: 300,
          contante_atteso: 150,
          operator_cash: 140,
          computed: {
            totale_venduto_carburante: 300,
            totale_venduto_extra: 20
          }
        }
      };
      const m2 = computeShiftMetrics(shiftLegacy);
      expect(m2.fuelRevenue).toBe(300);
      expect(m2.extraRevenue).toBe(20);
      expect(m2.totalSold).toBe(320);
      expect(m2.expectedCash).toBe(150);
      expect(m2.realCash).toBe(140);
      expect(m2.discrepancy).toBe(-10);
    });

    it('5. Valori numerici come stringhe vengono convertiti; valori non finiti/invalidi diventano 0', () => {
      const stringShift = {
        status: 'open',
        opening_data: {
          cash_in: '300',
          cash_out: '293.6',
          total_amount: '545',
          cash_in_minus_out: '6.4'
        }
      };
      const m1 = computeShiftMetrics(stringShift);
      expect(m1.totalSold).toBe(545);
      expect(m1.realCash).toBe(300);
      expect(m1.expectedCash).toBe(293.6);
      expect(m1.discrepancy).toBe(6.4);

      const invalidShift = {
        status: 'open',
        opening_data: {
          cash_in: Infinity,
          cash_out: 'invalid',
          total_amount: NaN,
          cash_in_minus_out: null
        }
      };
      const m2 = computeShiftMetrics(invalidShift);
      expect(m2.totalSold).toBe(0);
      expect(m2.realCash).toBe(0);
      expect(m2.expectedCash).toBe(0);
      expect(m2.discrepancy).toBe(0);
    });

    it('6. Il Totale Giornaliero usa tutte le righe chiusura del periodo e non soltanto le righe della pagina corrente', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const now = new Date().toISOString();

      const makeClosure = (id: number, total: number) => ({
        id,
        shift_id: id,
        operator_id: 1,
        closure_type: 'final' as const,
        created_at: now,
        closed_at: now,
        closing_data: { computed: { totale_venduto_carburante: total, totale_venduto_extra: 0, expected_cash: total, real_cash: total } },
        shifts: {
          station_id: 'ST1',
          status: 'closed',
          opening_data: {},
          fuel_stations: { station_name: 'Test Station' },
          users: { full_name: 'Test User' }
        },
        closure_users: { full_name: 'Test User' }
      });

      const closurePage1 = makeClosure(1, 545);
      const closurePage2 = makeClosure(2, 100);

      const mockTable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: [closurePage1], error: null, count: 2 })
      };

      const mockTotals = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: [closurePage1, closurePage2], error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);

      const card = container.querySelector('.daily-total-card');
      expect(card?.textContent).toContain('645,00');
    });

    it('7. Il filtro stazione e i filtri data vengono applicati anche alla query non paginata dei totali', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const { store } = await import('../../js/shared/state.js');

      vi.mocked(store.getFilters).mockReturnValue({
        rangeLabel: 'custom',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-24'
      });
      vi.mocked(store.getFilter).mockReturnValue('2');

      const eqFn = vi.fn().mockReturnThis();
      const gteFn = vi.fn().mockReturnThis();
      const ltFn = vi.fn().mockReturnThis();

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: eqFn,
        gte: gteFn,
        lt: ltFn,
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 })
      };

      vi.mocked(supabase.from).mockReturnValue(
        mockQuery as unknown as ReturnType<typeof supabase.from>
      );

      await showChiusureTab(container, actions);

      expect(eqFn).toHaveBeenCalledWith('shifts.station_id', 2);
      expect(gteFn).toHaveBeenCalledWith('closed_at', '2026-07-01');
      expect(ltFn).toHaveBeenCalledWith('closed_at', '2026-07-25');
    });
  });

  describe('Issue #443: Active shifts inclusion in Totale Giornaliero', () => {
    function getMetricValueByLabel(cardContainer: Element, label: string): string | null {
      const card = cardContainer.querySelector('.daily-total-card');
      if (!card) return null;
      const allDivs = Array.from(card.querySelectorAll('div'));
      const labelDiv = allDivs.find(
        d => d.children.length === 0 && d.textContent?.trim() === label
      );
      if (!labelDiv) return null;
      const parent = labelDiv.parentElement;
      if (!parent) return null;
      const valDiv = parent.children[1] || labelDiv.nextElementSibling;
      return valDiv?.textContent?.trim() || null;
    }

    it('1. Con la nuova tabella shift_closures, i totali si basano solo sulle righe di chiusura', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const { store } = await import('../../js/shared/state.js');

      vi.mocked(store.getFilters).mockReturnValue({
        dateFrom: '',
        dateTo: ''
      });
      vi.mocked(store.getFilter).mockReturnValue('ST1');

      const finalClosure = {
        id: 1,
        shift_id: 1,
        operator_id: 1,
        closure_type: 'final',
        created_at: '2026-07-20T10:00:00Z',
        closed_at: '2026-07-20T10:00:00Z',
        closing_data: {
          computed: {
            totale_venduto_carburante: 545,
            totale_venduto_extra: 0,
            expected_cash: 293.6,
            real_cash: 300,
            discrepancy: 6.4
          }
        },
        shifts: {
          station_id: 'ST1',
          status: 'closed',
          opening_data: {},
          fuel_stations: { station_name: 'Stazione Test' },
          users: { full_name: 'Operatore Test' }
        },
        closure_users: { full_name: 'Operatore Test' }
      };

      const mockTable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: [finalClosure], error: null, count: 1 })
      };

      const mockTotals = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [finalClosure], error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      expect(getMetricValueByLabel(container, 'Venduto Carburante')).toBe('€ 545,00');
      expect(getMetricValueByLabel(container, 'Venduto Extra')).toBe('€ 0,00');
      expect(getMetricValueByLabel(container, 'Totale Venduto')).toBe('€ 545,00');
      expect(getMetricValueByLabel(container, 'Contante Atteso')).toBe('€ 293,60');
      expect(getMetricValueByLabel(container, 'Contante Reale')).toBe('€ 300,00');
      expect(getMetricValueByLabel(container, 'Discrepanza')).toBe('+€ 6,40');
    });

    it('2. Senza filtri data, la query dei totali non usa piu or() per turni aperti', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const { store } = await import('../../js/shared/state.js');

      vi.mocked(store.getFilters).mockReturnValue({
        dateFrom: '',
        dateTo: ''
      });
      vi.mocked(store.getFilter).mockReturnValue('ST1');

      const orFn = vi.fn().mockReturnThis();
      const mockTable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 })
      };
      const mockTotals = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: orFn,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      expect(orFn).not.toHaveBeenCalled();
    });

    it('3. Applicazione separata di eq("shifts.station_id") alla query non paginata dei totali', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const { store } = await import('../../js/shared/state.js');

      vi.mocked(store.getFilters).mockReturnValue({
        dateFrom: '',
        dateTo: ''
      });
      vi.mocked(store.getFilter).mockReturnValue('2');

      const tableEqFn = vi.fn().mockReturnThis();
      const totalsEqFn = vi.fn().mockReturnThis();

      const mockTable = {
        select: vi.fn().mockReturnThis(),
        eq: tableEqFn,
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 })
      };

      const mockTotals = {
        select: vi.fn().mockReturnThis(),
        eq: totalsEqFn,
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockTable as unknown as ReturnType<typeof supabase.from>)
        .mockReturnValueOnce(mockTotals as unknown as ReturnType<typeof supabase.from>);

      await showChiusureTab(container, actions);

      expect(tableEqFn).toHaveBeenCalledWith('shifts.station_id', 2);
      expect(totalsEqFn).toHaveBeenCalledWith('shifts.station_id', 2);
    });
  });
});
