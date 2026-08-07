import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsResult } from '../../js/admin/analytics-aggregation.js';

const { mockSupabase, mockUtils } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: [], error: null })
    })),
    rpc: vi.fn().mockResolvedValue({
      data: {
        daily: [],
        totals: {},
        metadata: { complete: true }
      },
      error: null
    })
  },
  mockUtils: {
    getISODate: vi.fn(d => d.toISOString().split('T')[0]),
    formatEuro: vi.fn(n => `€${n}`),
    formatLitri: vi.fn(n => `${n}L`)
  }
}));

global.window = global.window || ({} as unknown as typeof globalThis.window);
const mockDestroyChart = vi.fn();
const mockChart = vi.fn();

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/utils/utils.js', () => mockUtils);

let chartsModule: typeof import('../../js/admin/dashboard-charts.js');

describe('Dashboard Charts Module', () => {
  beforeAll(async () => {
    (global.window as unknown as { Chart: typeof mockChart }).Chart = mockChart;
    chartsModule = await import('../../js/admin/dashboard-charts.js');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (global.window as unknown as { Chart: typeof mockChart }).Chart = mockChart;
    mockChart.mockImplementation(function () {
      return { destroy: mockDestroyChart };
    });
    document.body.innerHTML = '<canvas id="test-chart"></canvas>';
  });

  it('should fetch analytics data', async () => {
    const result = await chartsModule.fetchAnalyticsData();
    expect(result).toBeDefined();
    expect(result.daily).toHaveLength(30);
    expect(result.totals).toEqual({
      benzina: 0,
      gasolio: 0,
      contanti: 0,
      pos: 0,
      crediti: 0,
      voucher: 0,
      utaDkv: 0,
      idGestore: 0,
      revenue: 0
    });
  });

  it('should merge server-side RPC days into the seeded Italian calendar', async () => {
    const { createItalianCalendarRange } = await import('../../js/admin/analytics-aggregation.js');
    const seedRange = createItalianCalendarRange('30d');
    const firstSeedDay = seedRange.days[0]!.date;

    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        daily: [{ date: firstSeedDay, revenue: 100, liters_benzina: 40, liters_gasolio: 60 }],
        totals: {
          benzina: 40,
          gasolio: 60,
          contanti: 50,
          pos: 30,
          crediti: 0,
          voucher: 0,
          utaDkv: 0,
          idGestore: 0,
          revenue: 100
        },
        metadata: { complete: true, row_count: 1, day_count: 1 }
      },
      error: null
    });

    const result = await chartsModule.fetchAnalyticsData();

    // 30 seeded days preserved; the RPC-provided day is populated, others stay zero.
    expect(result.daily).toHaveLength(30);
    const firstDay = result.daily.find(d => d.date === firstSeedDay);
    expect(firstDay).toMatchObject({ revenue: 100, liters_benzina: 40, liters_gasolio: 60 });
    expect(result.totals).toMatchObject({
      benzina: 40,
      gasolio: 60,
      contanti: 50,
      pos: 30,
      revenue: 100
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'get_analytics_aggregation',
      expect.objectContaining({
        p_station_id: null,
        p_start_iso: expect.any(String),
        p_end_exclusive_iso: expect.any(String)
      })
    );
  });

  it('should fall back to client-side aggregation when the RPC errors', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('rpc down') });
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: [], error: null })
    });

    const result = await chartsModule.fetchAnalyticsData();

    expect(result.daily).toHaveLength(30);
    expect(mockSupabase.from).toHaveBeenCalledWith('shift_closures');
  });

  it('should render revenue chart', () => {
    const data: AnalyticsResult = {
      daily: [{ date: '2024-01-01', revenue: 100, liters_benzina: 50, liters_gasolio: 50 }],
      totals: {
        revenue: 100,
        benzina: 50,
        gasolio: 50,
        contanti: 0,
        pos: 0,
        crediti: 0,
        voucher: 0,
        utaDkv: 0,
        idGestore: 0
      }
    };
    chartsModule.renderRevenueChart(data, 'test-chart');
    expect(mockChart).toHaveBeenCalledWith(
      document.getElementById('test-chart'),
      expect.objectContaining({
        type: 'line',
        data: expect.objectContaining({
          datasets: [expect.objectContaining({ data: [100] })]
        })
      })
    );
  });

  it('should resolve Chart.js lazily when it becomes available after import', () => {
    const data: AnalyticsResult = {
      daily: [{ date: '2024-01-01', revenue: 100, liters_benzina: 0, liters_gasolio: 0 }],
      totals: {
        revenue: 100,
        benzina: 0,
        gasolio: 0,
        contanti: 0,
        pos: 0,
        crediti: 0,
        voucher: 0,
        utaDkv: 0,
        idGestore: 0
      }
    };
    const chartWindow = global.window as unknown as { Chart?: typeof mockChart };
    delete chartWindow.Chart;

    chartsModule.renderRevenueChart(data, 'test-chart');
    expect(mockChart).not.toHaveBeenCalled();

    chartWindow.Chart = mockChart;
    chartsModule.renderRevenueChart(data, 'test-chart');
    expect(mockChart).toHaveBeenCalledTimes(1);
  });

  it('should render volume chart', () => {
    const data: AnalyticsResult = {
      daily: [{ date: '2024-01-01', revenue: 0, liters_benzina: 100, liters_gasolio: 200 }],
      totals: {
        benzina: 100,
        gasolio: 200,
        revenue: 0,
        contanti: 0,
        pos: 0,
        crediti: 0,
        voucher: 0,
        utaDkv: 0,
        idGestore: 0
      }
    };
    chartsModule.renderVolumeChart(data, 'test-chart');
    expect(mockChart).toHaveBeenCalledWith(
      document.getElementById('test-chart'),
      expect.objectContaining({
        type: 'bar',
        data: expect.objectContaining({
          datasets: [
            expect.objectContaining({ label: 'Benzina', data: [100] }),
            expect.objectContaining({ label: 'Gasolio', data: [200] })
          ]
        })
      })
    );
  });

  it('should render payment chart', () => {
    const data: AnalyticsResult = {
      daily: [],
      totals: {
        contanti: 100,
        pos: 200,
        crediti: 50,
        voucher: 25,
        utaDkv: 10,
        idGestore: 5,
        revenue: 0,
        benzina: 0,
        gasolio: 0
      }
    };
    chartsModule.renderPaymentChart(data, 'test-chart');
    expect(mockChart).toHaveBeenCalledWith(
      document.getElementById('test-chart'),
      expect.objectContaining({
        type: 'doughnut',
        data: expect.objectContaining({
          labels: ['Contanti', 'POS', 'Crediti', 'Voucher', 'UTA/DKV', 'ID Gestore'],
          datasets: [expect.objectContaining({ data: [100, 200, 50, 25, 10, 5] })]
        })
      })
    );
  });

  it('should render fuel mix chart', () => {
    const data: AnalyticsResult = {
      daily: [],
      totals: {
        benzina: 1000,
        gasolio: 2000,
        revenue: 0,
        contanti: 0,
        pos: 0,
        crediti: 0,
        voucher: 0,
        utaDkv: 0,
        idGestore: 0
      }
    };
    chartsModule.renderFuelMixChart(data, 'test-chart');
    expect(mockChart).toHaveBeenCalledWith(
      document.getElementById('test-chart'),
      expect.objectContaining({
        type: 'pie',
        data: expect.objectContaining({
          labels: ['Benzina', 'Gasolio'],
          datasets: [expect.objectContaining({ data: [1000, 2000] })]
        })
      })
    );
  });
});
