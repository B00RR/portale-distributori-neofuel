import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils } = vi.hoisted(() => {
    const queryBuilder: Record<string, unknown> = {};
    const chain = vi.fn(() => queryBuilder);
    const analyticsResult = { data: [{ closing_data: { ricavo_teorico: 100 }, closed_at: '2024-01-01' }], error: null };
    Object.assign(queryBuilder, {
        select: chain, eq: chain, gte: chain, lt: chain, order: chain, in: chain,
        then: (resolve: (value: typeof analyticsResult) => unknown) => resolve(analyticsResult)
    });

    return {
        mockSupabase: { from: vi.fn(() => queryBuilder) },
        mockUI: {
            showLoadingMessage: vi.fn(),
            showErrorMessage: vi.fn()
        },
        mockUtils: {
            formatEuro: vi.fn(v => `€${v}`),
            formatLitri: vi.fn(v => `${v}L`),
            getISODate: vi.fn(() => '2024-01-01')
        }
    };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showAnalyticsTab } from '../../js/admin/analytics.js';

describe('Admin Analytics Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        document.body.innerHTML = '<div id="analytics-container"></div>';

        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(), stroke: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
            fill: vi.fn(), closePath: vi.fn(), strokeRect: vi.fn(), clearRect: vi.fn(), save: vi.fn(),
            restore: vi.fn(), createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            measureText: vi.fn(() => ({ width: 10 }))
        }) as unknown as CanvasRenderingContext2D;

        global.window = global.window || ({} as unknown as Window & typeof globalThis);
        // Chart must be a real class so `new Chart()` works
        (global.window as unknown as { Chart: typeof Chart }).Chart = class {
            destroy() {}
            update() {}
        };
    });

    it('should display analytics structure', async () => {
        const container = document.getElementById('analytics-container')!;
        await showAnalyticsTab(container);

        await new Promise(r => setTimeout(r, 10));

        expect(container.innerHTML).toContain('analytics-wrapper');
        expect(mockUI.showErrorMessage).not.toHaveBeenCalled();
    });

    it('should fetch analytics data', async () => {
        const container = document.getElementById('analytics-container')!;
        await showAnalyticsTab(container);
        await new Promise(r => setTimeout(r, 10));

        expect(mockSupabase.from).toHaveBeenCalledWith('shifts');
        expect(mockUI.showErrorMessage).not.toHaveBeenCalled();
    });
});
