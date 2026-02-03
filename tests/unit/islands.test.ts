import { describe, it, expect, vi, beforeEach } from 'vitest';

// Global Vars
let showIslandsModal: any;
let supabase: any;
let safeSupabaseQuery: any;
let Toast: any;
let UI: any;
let getStationNameMock: any;

// Builders
let islandsBuilder: any;
let gunsBuilder: any;

describe('Islands Module', () => {

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = '<div id="app-modal"><div id="modal-body" class="modal-content"><div id="modal-body"></div></div></div>';

        getStationNameMock = vi.fn().mockResolvedValue('Station Test');

        // Builders
        islandsBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
        };

        gunsBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }) // Direct return for simple check
        };

        // Mocks
        vi.doMock('../../js/core/api.js', () => ({
            supabase: {
                from: vi.fn((table) => {
                    if (table === 'islands') return islandsBuilder;
                    if (table === 'pistole') return gunsBuilder;
                    return { select: vi.fn() };
                })
            },
            safeSupabaseQuery: vi.fn((cb) => cb()),
            getStationName: getStationNameMock
        }));

        vi.doMock('../../js/ui/ui.js', () => ({
            showLoadingMessage: vi.fn(),
            openModal: vi.fn(),
            closeModal: vi.fn(),
            showInfoModal: vi.fn(),
            openConfirmModal: vi.fn().mockResolvedValue(true),
            showErrorMessage: vi.fn()
        }));

        vi.doMock('../../js/ui/toast.js', () => ({
            Toast: { show: vi.fn() }
        }));

        vi.doMock('../../js/utils/utils.js', async (importOriginal) => {
            const actual = await importOriginal();
            return { ...actual };
        });

        // Mock Guns Dependency
        vi.doMock('../../js/admin/guns.js', () => ({
            showGunsModal: vi.fn()
        }));

        // Import
        const IslandsModule = await import('../../js/admin/islands.ts');
        showIslandsModal = IslandsModule.showIslandsModal;

        const ApiModule = await import('../../js/core/api.js');
        supabase = ApiModule.supabase;
        safeSupabaseQuery = ApiModule.safeSupabaseQuery;

        const UIModule = await import('../../js/ui/ui.js');
        UI = UIModule;

        const ToastModule = await import('../../js/ui/toast.js');
        Toast = ToastModule.Toast;
    });

    it('should render islands list', async () => {
        const mockIslands = [
            { island_id: 1, nome: 'Isola A', pistole: [{ id: 1 }] },
            { island_id: 2, island_name: 'Isola B', pistole: [] }
        ];
        islandsBuilder.order.mockResolvedValue({ data: mockIslands, error: null });

        await showIslandsModal(100);

        const body = document.getElementById('modal-body');
        expect(UI.openModal).toHaveBeenCalledWith(expect.stringContaining('Gestione Isole'));
        expect(body?.innerHTML).toContain('Isola A');
        expect(body?.innerHTML).toContain('Isola B');
        expect(body?.innerHTML).toContain('1 pistola');
    });

    it('should handle Add Island', async () => {
        islandsBuilder.order.mockResolvedValue({ data: [], error: null });
        await showIslandsModal(100);

        // Click add button
        const addBtn = document.getElementById('add-island-btn') as HTMLButtonElement;
        addBtn.click();

        // Wait for form render (it's direct call but let's await just in case logic checks async)
        // openIslandForm calls openModal ('Nuova Isola')
        await vi.waitFor(() => {
            expect(UI.openModal).toHaveBeenCalledWith('Nuova Isola');
        });

        const form = document.getElementById('island-form') as HTMLFormElement;
        const input = form.querySelector('input[name="nome"]') as HTMLInputElement;
        input.value = "New Island";

        form.dispatchEvent(new Event('submit'));

        await vi.waitFor(() => {
            expect(islandsBuilder.insert).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ nome: 'New Island', station_id: 100 })
            ]));
            expect(UI.showInfoModal).toHaveBeenCalledWith(expect.stringContaining('creata'));
        });
    });

    it('should handle Edit Island', async () => {
        const mockIslands = [{ island_id: 1, nome: 'Isola A', pistole: [] }];
        islandsBuilder.order.mockResolvedValue({ data: mockIslands, error: null });
        // Single for edit
        islandsBuilder.single.mockResolvedValue({ data: mockIslands[0], error: null });

        await showIslandsModal(100);

        const editBtn = document.querySelector('.edit-island') as HTMLButtonElement;
        editBtn.click(); // calls openIslandForm(..., 1)

        await vi.waitFor(() => {
            expect(UI.openModal).toHaveBeenCalledWith('Modifica Isola');
            expect(islandsBuilder.select).toHaveBeenCalled();
        });

        const form = document.getElementById('island-form') as HTMLFormElement;
        const input = form.querySelector('input[name="nome"]') as HTMLInputElement;
        input.value = "Updated Island";

        form.dispatchEvent(new Event('submit'));

        await vi.waitFor(() => {
            expect(islandsBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Updated Island' }));
            expect(UI.showInfoModal).toHaveBeenCalledWith(expect.stringContaining('aggiornata'));
        });
    });

    it('should block deletion if guns exist', async () => {
        const mockIslands = [{ island_id: 1, nome: 'Isola A', pistole: [{ id: 1 }] }];
        islandsBuilder.order.mockResolvedValue({ data: mockIslands, error: null });

        // Mock guns check return
        gunsBuilder.eq.mockResolvedValue({ data: [{ id: 1 }], error: null });

        await showIslandsModal(100);

        const delBtn = document.querySelector('.delete-island') as HTMLButtonElement;
        delBtn.click();

        await vi.waitFor(() => {
            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('Impossibile eliminare'), 'warning');
            expect(islandsBuilder.delete).not.toHaveBeenCalled();
        });
    });

    it('should allow deletion if no guns', async () => {
        const mockIslands = [{ island_id: 2, nome: 'Isola B', pistole: [] }];
        islandsBuilder.order.mockResolvedValue({ data: mockIslands, error: null });

        gunsBuilder.eq.mockResolvedValue({ data: [], error: null });

        await showIslandsModal(100);

        const delBtn = document.querySelector('.delete-island') as HTMLButtonElement;
        delBtn.click();

        await vi.waitFor(() => {
            expect(UI.openConfirmModal).toHaveBeenCalled();
            expect(islandsBuilder.delete).toHaveBeenCalled();
            expect(UI.showInfoModal).toHaveBeenCalledWith(expect.stringContaining('eliminata'));
        });
    });
});
