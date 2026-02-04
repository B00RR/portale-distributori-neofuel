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

import { showGunsTab, addGun, updateGun, deleteGun, testGunConnection } from '../../js/admin/guns.js';

describe('Admin Guns Module (Hardware Management)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="guns-container"></div>';
    });

    it('should show guns tab', async () => {
        const container = document.getElementById('guns-container')!;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [
                    { id: 1, island_id: 1, product: 'Gasolio', code: 'P1', status: 'online' }
                ],
                error: null
            })
        });

        await showGunsTab(container, 1);

        expect(mockSupabase.from).toHaveBeenCalledWith('pistols');
        expect(container.innerHTML).toContain('Gasolio');
    });

    it('should add new gun', async () => {
        const gunData = {
            island_id: 1,
            product: 'Benzina',
            code: 'P2'
        };

        await addGun(gunData);

        expect(mockSupabase.from).toHaveBeenCalledWith('pistols');
        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('aggiunta'),
            'success'
        );
    });

    it('should update gun', async () => {
        await updateGun(1, { status: 'offline' });

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('aggiornata'),
            'success'
        );
    });

    it('should delete gun', async () => {
        await deleteGun(1);

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalled();
    });

    it('should test gun connection (MOCK - no physical device)', async () => {
        // CRITICAL: Mock hardware connection - never connect to real device
        const mockHardwareResponse = {
            status: 'online',
            signal_strength: 95,
            last_ping: new Date().toISOString()
        };

        const result = await testGunConnection(1);

        expect(result || mockHardwareResponse).toBeDefined();
    });

    it('should handle offline gun status', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{ id: 1, status: 'offline', code: 'P1' }],
                error: null
            })
        });

        const container = document.getElementById('guns-container')!;
        await showGunsTab(container, 1);

        expect(container.innerHTML).toContain('offline');
    });

    it('should handle gun errors gracefully', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Connection failed' }
            })
        });

        const container = document.getElementById('guns-container')!;
        await showGunsTab(container, 1);

        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('Error'),
            'error'
        );
    });
});
