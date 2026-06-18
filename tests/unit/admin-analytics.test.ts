import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils } = vi.hoisted(() => {
    const queryBuilder: any = {};
    const chain = vi.fn((...args) => queryBuilder);
    const analyticsResult = { data: [{ closing_data: { ricavo_teorico: 100 }, closed_at: '2024-01-01' }], error: null };
    Object.assign(queryBuilder, {
        select: chain, eq: chain, gte: chain, lte: chain, order: chain, in: chain,
        then: (resolve: any) => resolve(analyticsResult)
    });

    return {
        mockSupabase: { from: vi.fn(() => queryBuilder) },
        mockUI: {
            showLoadingMessage: vi.fn(),
            showErrorMessage: vi.fn((c, e) => console.log('[MockUI] Error:', e))
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
        }) as any;

        global.window = global.window || ({} as any);
        // Chart must be a real class so `new Chart()` works
        (global.window as any).Chart = class {
            destroy() {}
            update() {}
        };
    });

    it('should display analytics structure', async () => {
        const container = document.getElementById('analytics-container')!;
        await showAnalyticsTab(container);

        await new Promise(r => setTimeout(r, 10));

        expect(container.innerHTML).toContain('analytics-wrapper');
    });

    it('should fetch analytics data', async () => {
        const container = document.getElementById('analytics-container')!;
        await showAnalyticsTab(container);
        await new Promise(r => setTimeout(r, 10));

        expect(mockSupabase.from).toHaveBeenCalledWith('shifts');
    });
});
