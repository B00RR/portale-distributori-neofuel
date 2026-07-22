import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    supabase: {
      rpc: vi.fn()
    },
    ui: {
      showLoadingMessage: vi.fn()
    },
    utils: {
      escapeHtml: vi.fn(str => str?.toString() || ''),
      formatEuro: vi.fn(v => `€${v}`)
    },
    stationsCache: {
      getStations: vi.fn()
    },
    handleError: vi.fn()
  };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mocks.supabase }));
vi.mock('../../js/core/stations-cache.js', () => ({ getStations: mocks.stationsCache.getStations }));
vi.mock('../../js/ui/ui.js', () => ({ showLoadingMessage: mocks.ui.showLoadingMessage }));
vi.mock('../../js/utils/sanitizer.js', () => ({ setSafeHTML: vi.fn((el, html) => { el.innerHTML = html; }) }));
vi.mock('../../js/utils/utils.js', () => ({ escapeHtml: mocks.utils.escapeHtml, formatEuro: mocks.utils.formatEuro }));
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: mocks.handleError }));

import { showReconciliationTab } from '../../js/admin/reconciliation.js';

describe('Admin Reconciliation Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-set mock implementations before each test (avoid mockReset wiping them)
    mocks.stationsCache.getStations.mockResolvedValue([
      { station_id: 1, station_name: 'Station One' },
      { station_id: 2, station_name: 'Station Two' }
    ]);

    mocks.supabase.rpc.mockResolvedValue({
      data: {
        date: '2026-07-22',
        station_id: 1,
        shifts: [
          {
            id: 101,
            opened_at: '2026-07-22T08:00:00Z',
            closed_at: '2026-07-22T16:00:00Z',
            operator_id: 2,
            operator_name: 'Mario Rossi',
            status: 'closed',
            closing_data: {
              computed: {
                fuel_revenue: 1500.00,
                extra_revenue: 200.00,
                total_sold: 1700.00,
                expected_cash: 1600.00,
                real_cash: 1595.00,
                discrepancy: 5.00,
                pos: 300.00,
                fleet: 200.00,
                vouchers: 50.00,
                new_credits: 100.00,
                outflows: 80.00
              }
            }
          }
        ],
        totals: {
          fuel_revenue: 1500.00,
          extra_revenue: 200.00,
          total_sold: 1700.00,
          expected_cash: 1600.00,
          real_cash: 1595.00,
          discrepancy: 5.00,
          pos_total: 300.00,
          fleet_total: 200.00,
          vouchers_total: 50.00,
          credits_total: 100.00,
          outflows_total: 80.00
        },
        movements: {
          extra_incomes: [],
          outflows: [],
          vouchers: [],
          credits: []
        }
      },
      error: null
    });

    document.body.innerHTML = '<div id="reconciliation-container"></div><div id="header-actions"></div>';
  });

  it('should initialize, load stations, and trigger get_daily_reconciliation RPC', async () => {
    const container = document.getElementById('reconciliation-container')!;
    const headerActions = document.getElementById('header-actions')!;

    await showReconciliationTab(container, headerActions, 1);

    // Check that getStations was called
    expect(mocks.stationsCache.getStations).toHaveBeenCalled();

    // Check that handleError was NOT called (no initialization error)
    expect(mocks.handleError).not.toHaveBeenCalled();

    // Check that RPC get_daily_reconciliation was called
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('get_daily_reconciliation', expect.any(Object));

    // Check that container has rendered the title and totals cards
    expect(container.innerHTML).toContain('Riconciliazione Giornaliera');
    expect(container.innerHTML).toContain('Totali Vendite');
    expect(container.innerHTML).toContain('Transazioni Elettroniche');
    expect(container.innerHTML).toContain('Contanti');
    expect(container.innerHTML).toContain('Altri Movimenti');
    expect(container.innerHTML).toContain('Dettaglio Chiusure del Giorno');

    // Verification of the mocked table content inside the container
    expect(container.innerHTML).toContain('€1500');
    expect(container.innerHTML).toContain('€200');
    expect(container.innerHTML).toContain('€5');
  });

  it('should trigger update when station select changes', async () => {
    const container = document.getElementById('reconciliation-container')!;
    const headerActions = document.getElementById('header-actions')!;

    await showReconciliationTab(container, headerActions, 1);

    const select = container.querySelector('#recon-station-select') as HTMLSelectElement;
    expect(select).not.toBeNull();

    select.value = '2';
    // Manually trigger change event
    select.dispatchEvent(new Event('change'));

    expect(mocks.supabase.rpc).toHaveBeenLastCalledWith('get_daily_reconciliation', expect.objectContaining({
      p_station_id: 2
    }));
  });
});
