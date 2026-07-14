import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Hoist
const { mockSupabase, mockCharts, mockUI, mockConfig, mockBusinessLogic, mockEngine } = vi.hoisted(
  () => {
    const queryBuilder: Record<string, unknown> = {};
    const chain = vi.fn(() => queryBuilder);
    Object.assign(queryBuilder, {
      select: chain,
      eq: chain,
      gte: chain,
      lte: chain,
      lt: chain,
      order: chain,
      in: chain,
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], count: 5, error: null })
    });

    return {
      mockSupabase: { from: vi.fn(() => queryBuilder) },
      mockCharts: {
        fetchAnalyticsData: vi.fn(() => Promise.resolve({ daily: [], totals: {} })),
        renderRevenueChart: vi.fn(),
        renderVolumeChart: vi.fn(),
        renderPaymentChart: vi.fn(),
        renderFuelMixChart: vi.fn()
      },
      mockUI: {
        showLoadingMessage: vi.fn(),
        showErrorMessage: vi.fn((c, e) => {
          throw e;
        })
      },
      mockConfig: {
        loadDashboardConfig: vi.fn(),
        saveDashboardConfig: vi.fn(),
        KPI_CATALOG: {
          venduto: { title: 'Venduto', icon: 'fa-euro' },
          andamento_ricavi: { title: 'Ricavi', icon: 'fa-chart', defaultSize: '2x1' }
        }
      },
      mockBusinessLogic: {
        BusinessLogicManager: {
          loadRules: vi.fn(() => Promise.resolve({}))
        }
      },
      mockEngine: {
        calculationEngine: { run: vi.fn(() => Promise.resolve(1000)) },
        CALCULATION_SCOPES: { KPI_VENDUTO: 'KPI_VENDUTO', KPI_EROGATO: 'KPI_EROGATO' }
      }
    };
  }
);

// 2. Mock modules
vi.mock('../../js/core/api.js', () => ({
  supabase: mockSupabase,
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
}));
vi.mock('../../js/admin/dashboard-charts.js', () => mockCharts);
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/core/auth.js', () => ({ loggedUser: { user_id: 'test-user-id' } }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: vi.fn() } }));

// TRY BOTH PATHS just in case (safe in Vitest)
vi.mock('../../js/admin/dashboard-config.js', () => {
  return mockConfig;
});
vi.mock('../../js/admin/dashboard-config', () => {
  return mockConfig;
});

vi.mock('../../js/core/business-logic-manager.js', () => mockBusinessLogic);
vi.mock('../../js/utils/calculation-engine.js', () => mockEngine);

describe('Admin Dashboard Module', () => {
  let showDashboard: (container: HTMLElement) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // vi.resetModules(); // Removed to avoid mock factory issues

    // Setup mock return
    mockConfig.loadDashboardConfig.mockResolvedValue({
      kpiLayout: [
        { id: 'venduto', visible: true, size: '1x1' },
        { id: 'andamento_ricavi', visible: true, size: '2x1' }
      ],
      gridColumns: 4
    });

    global.window = global.window || ({} as unknown as typeof globalThis.window);
    (global.window as unknown as { Chart: typeof vi.fn; Sortable: typeof vi.fn }).Chart = vi.fn();
    (global.window as unknown as { Chart: typeof vi.fn; Sortable: typeof vi.fn }).Sortable =
      vi.fn();

    document.body.innerHTML = '<div id="dashboard-container"></div>';

    const module = await import('../../js/admin/dashboard.js');
    showDashboard = module.showDashboard;
  });

  it('should render dashboard', async () => {
    const container = document.getElementById('dashboard-container')!;
    await showDashboard(container);
    await new Promise(r => setTimeout(r, 20));

    expect(container.innerHTML).toContain('dashboard-kpi-grid');
  });

  it('should init charts', async () => {
    const container = document.getElementById('dashboard-container')!;
    await showDashboard(container);
    await new Promise(r => setTimeout(r, 20));

    expect(mockCharts.fetchAnalyticsData).toHaveBeenCalled();
  });
});
