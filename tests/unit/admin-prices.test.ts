import { describe, it, expect, vi } from 'vitest';

const mockSupabase = { from: vi.fn() };
vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));

import { showPricesTab, updatePrices } from '../../js/admin/prices.js';

describe('Admin Prices Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="container"></div>';
    });

    it('should render prices tab', async () => {
        const container = document.getElementById('container')!;
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null })
        });

        await showPricesTab(container);
        expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should update prices', async () => {
        mockSupabase.from.mockReturnValue({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null })
        });

        await updatePrices(1, { gasolio: 1.50 });
        expect(mockSupabase.from).toHaveBeenCalled();
    });
});
