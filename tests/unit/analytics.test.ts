import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showAnalyticsTab } from '../../js/admin/analytics.js';
import { supabase } from '../../js/core/api.js';

// --- MOCKS ---

vi.mock('../../js/core/api.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(function () {
          return this;
        }),
        gte: vi.fn(function () {
          return this;
        }),
        lt: vi.fn(function () {
          return this;
        }),
        order: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
  }
}));

vi.mock('../../js/ui/ui.js', () => ({
  showLoadingMessage: vi.fn(),
  showErrorMessage: vi.fn()
}));

vi.mock('../../js/utils/utils.js', () => ({
  formatEuro: vi.fn(n => `€ ${n}`),
  formatLitri: vi.fn(n => `${n} L`),
  getISODate: vi.fn(
    d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]
  )
}));

// Mock Chart.js
const mockChartInstance = {
  destroy: vi.fn()
};
const mockChartConstructor = vi.fn(function () {
  return mockChartInstance;
});

describe('Analytics Module', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Setup Chart on logical window objects (JSDOM)
    Object.defineProperty(window, 'Chart', { value: mockChartConstructor, writable: true });
    (global as unknown as { Chart: typeof mockChartConstructor }).Chart = mockChartConstructor;

    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should render dashboard layout', async () => {
    await showAnalyticsTab(container);
    expect(container.innerHTML).toContain('Andamento Ricavi');
    expect(container.innerHTML).toContain('Volume Erogato');
  });

  it('should fetch data for 30d range by default', async () => {
    // Mock success response
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(function () {
          return this;
        }),
        gte: vi.fn(function () {
          return this;
        }),
        lt: vi.fn(function () {
          return this;
        }),
        order: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    } as unknown as Awaited<ReturnType<typeof supabase.from>>);

    await showAnalyticsTab(container);

    expect(supabase.from).toHaveBeenCalledWith('shifts');
    // Default range is 30d, so it should query.
  });

  it('should calculate stats correctly from mixed shifts', async () => {
    // Fix time to ensure determinstic date matching
    const NOW = new Date('2026-02-15T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const mockShifts = [
      {
        // Shift closed today
        closed_at: NOW.toISOString(),
        closing_data: {
          ricavo_teorico: 100,
          litri_benzina: 50,
          litri_gasolio: 100,
          soldi_contanti: 100
        },
        station_id: 1
      },
      {
        // Shift closed same day (aggregated)
        closed_at: NOW.toISOString(),
        closing_data: {
          ricavo_teorico: 200,
          litri_benzina: 10,
          litri_gasolio: 20,
          soldi_pos_totale: 200
        },
        station_id: 1
      }
    ];

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(function () {
          return this;
        }),
        gte: vi.fn(function () {
          return this;
        }),
        lt: vi.fn(function () {
          return this;
        }),
        order: vi.fn(() => {
          return Promise.resolve({ data: mockShifts, error: null });
        })
      }))
    } as unknown as Awaited<ReturnType<typeof supabase.from>>);

    await showAnalyticsTab(container);

    // Verify Charts were initialized
    expect(mockChartConstructor).toHaveBeenCalledTimes(4); // Revenue, Volume, Payment, FuelMix

    // Check data passed to chart (Revenue sum = 300)
    const revenueChartCall = mockChartConstructor.mock.calls[0];
    const config = revenueChartCall[1];
    // dataset[0].data should include 300
    expect(config.data.datasets[0].data).toContain(300);

    vi.useRealTimers();
  });

  it('should handle date range switching', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(function () {
          return this;
        }),
        gte: vi.fn(function () {
          return this;
        }),
        lt: vi.fn(function () {
          return this;
        }),
        order: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    } as unknown as Awaited<ReturnType<typeof supabase.from>>);

    await showAnalyticsTab(container);

    // Click "7 Giorni"
    const btn7d = container.querySelector('button[data-range="7d"]') as HTMLButtonElement;
    expect(btn7d).toBeTruthy();
    btn7d.click();

    await new Promise(r => process.nextTick(r)); // Wait for async handler

    // Should call API twice (initial + click)
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('should handle chart updates (destroy and recreate)', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(function () {
          return this;
        }),
        gte: vi.fn(function () {
          return this;
        }),
        lt: vi.fn(function () {
          return this;
        }),
        order: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    } as unknown as Awaited<ReturnType<typeof supabase.from>>);

    // Clear previous mock calls to track only this test's actions
    mockChartInstance.destroy.mockClear();
    (mockChartConstructor as unknown as { mockClear: () => void }).mockClear();

    await showAnalyticsTab(container);

    // First load: 4 charts created
    expect(mockChartConstructor).toHaveBeenCalledTimes(4);

    // Note: We cannot assert destroy.not.called because 'charts' module state persists
    // from previous tests, so it might destroy existing ones.
    // We focus on what happens after the CLICK.

    // Clear again for clarity
    mockChartInstance.destroy.mockClear();

    // Reload/Switch range
    const btn7d = container.querySelector('button[data-range="7d"]') as HTMLButtonElement;
    btn7d.click();
    await new Promise(r => process.nextTick(r));

    // Should destroy previous charts (4) before creating new ones
    expect(mockChartInstance.destroy).toHaveBeenCalledTimes(4);
  });
});
