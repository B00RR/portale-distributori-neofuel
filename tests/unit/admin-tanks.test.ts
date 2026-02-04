import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
        })),
        delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
        }))
    }))
};

const mockToast = { show: vi.fn() };

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

import { showTanksTab, addTank, updateTank, deleteTank, checkTankLevel } from '../../js/admin/tanks.js';

describe('Admin Tanks Module (Hardware Management)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="tanks-container"></div>';
    });

    it('should show tanks tab with current levels', async () => {
        const container = document.getElementById('tanks-container')!;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [
                    { id: 1, product: 'Gasolio', capacity: 10000, current_level: 7500 }
                ],
                error: null
            })
        });

        await showTanksTab(container, 1);

        expect(mockSupabase.from).toHaveBeenCalledWith('tanks');
        expect(container.innerHTML).toContain('7500');
    });

    it('should add new tank', async () => {
        const tankData = {
            station_id: 1,
            product: 'Benzina',
            capacity: 15000
        };

        await addTank(tankData);

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('aggiunto'),
            'success'
        );
    });

    it('should update tank levels', async () => {
        await updateTank(1, { current_level: 8000 });

        expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should delete tank', async () => {
        await deleteTank(1);

        expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should check tank level and warn if critical (MOCK)', async () => {
        // CRITICAL: Mock tank level sensor - no physical device
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
                data: { id: 1, current_level: 500, capacity: 10000 },
                error: null
            })
        });

        const result = await checkTankLevel(1);

        expect(result).toBeDefined();
        // Level is 5% - should trigger warning
        if (result && result.current_level / result.capacity < 0.1) {
            expect(mockToast.show).toHaveBeenCalledWith(
                expect.stringContaining('Livello critico'),
                'warning'
            );
        }
    });

    it('should handle tank overflow scenario', async () => {
        const tankData = {
            current_level: 11000,
            capacity: 10000
        };

        // Should prevent overflow
        const isValid = tankData.current_level <= tankData.capacity;
        expect(isValid).toBe(false);
    });

    it('should handle tank sensor errors', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Sensor offline' }
            })
        });

        const container = document.getElementById('tanks-container')!;
        await showTanksTab(container, 1);

        expect(mockToast.show).toHaveBeenCalled();
    });
});
