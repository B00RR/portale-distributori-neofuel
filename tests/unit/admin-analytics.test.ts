import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null })
        }))
    },
    mockUI: {
        showLoadingMessage: vi.fn(),
        showErrorMessage: vi.fn()
    },
    mockUtils: {
        formatEuro: vi.fn((v) => `€${v}`),
        formatLitri: vi.fn((v) => `${v}L`),
        getISODate: vi.fn(() => '2024-01-01')
    }
}));

global.window = global.window || ({} as any);
(global.window as any).Chart = vi.fn();

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showAnalyticsTab } from '../../js/admin/analytics.js';

describe('Admin Analytics Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="analytics-container"></div>';
    });

    it('should display analytics tab', async () => {
        const container = document.getElementById('analytics-container')!;

        await showAnalyticsTab(container);

        expect(container.innerHTML).toContain('analytics');
    });

    it('should fetch shift data', async () => {
        const container = document.getElementById('analytics-container')!;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{ closed_at: '2024-01-01', closing_data: { ricavo_teorico: 100 } }],
                error: null
            })
        });

        await showAnalyticsTab(container);

        expect(mockSupabase.from).toHaveBeenCalled();
    });
});
