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

import { showIslandsTab, addIsland, updateIsland, deleteIsland } from '../../js/admin/islands.js';

describe('Admin Islands Module (Hardware Management)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="islands-container"></div>';
    });

    it('should show islands tab', async () => {
        const container = document.getElementById('islands-container')!;

        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [
                    { id: 1, name: 'Isola 1', position: 'Nord', pistols: [] }
                ],
                error: null
            })
        });

        await showIslandsTab(container, 1);

        expect(mockSupabase.from).toHaveBeenCalledWith('islands');
        expect(container.innerHTML).toContain('Isola 1');
    });

    it('should add new island', async () => {
        const islandData = {
            station_id: 1,
            name: 'Isola 2',
            position: 'Sud'
        };

        await addIsland(islandData);

        expect(mockSupabase.from).toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalledWith(
            expect.stringContaining('aggiunta'),
            'success'
        );
    });

    it('should update island', async () => {
        await updateIsland(1, { name: 'Isola 1 - Aggiornata' });

        expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should delete island', async () => {
        await deleteIsland(1);

        expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should handle islands with multiple guns', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: [{
                    id: 1,
                    name: 'Isola Multipla',
                    pistols: [
                        { id: 1, product: 'Gasolio' },
                        { id: 2, product: 'Benzina' }
                    ]
                }],
                error: null
            })
        });

        const container = document.getElementById('islands-container')!;
        await showIslandsTab(container, 1);

        expect(container.innerHTML).toContain('Isola Multipla');
    });

    it('should handle island errors', async () => {
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Network error' }
            })
        });

        const container = document.getElementById('islands-container')!;
        await showIslandsTab(container, 1);

        expect(mockToast.show).toHaveBeenCalled();
    });
});
