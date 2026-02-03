import { describe, it, expect, vi, beforeEach } from 'vitest';

// Dynamic import variables
let showTanksAdminModal: any;
let supabase: any;
let safeSupabaseQuery: any;
let UI: any;
let Toast: any;
let ErrorHandler: any;

// Mock Builders
let tanksBuilder: any;
let linksBuilder: any;
let pumpsBuilder: any;
let deleteEqMock: any;
let getStationNameMock: any;

describe('Tanks Module', () => {

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = '<div id="app-modal"><div id="modal-body"></div></div>';

        // Setup common mocks
        deleteEqMock = vi.fn().mockResolvedValue({ error: null });
        getStationNameMock = vi.fn().mockResolvedValue('Stazione Test');

        // Query Builders
        tanksBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            delete: vi.fn().mockReturnValue({ eq: deleteEqMock })
        };

        linksBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            delete: vi.fn().mockReturnValue({ eq: deleteEqMock })
        };

        pumpsBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null })
        };

        // DoMocks
        vi.doMock('../../js/core/api.js', () => ({
            supabase: {
                from: vi.fn((table) => {
                    if (table === 'tanks') return tanksBuilder;
                    if (table === 'tank_pump_links') return linksBuilder;
                    if (table === 'pistole') return pumpsBuilder;
                    return tanksBuilder;
                })
            },
            safeSupabaseQuery: vi.fn((cb) => cb()),
            getStationName: getStationNameMock
        }));

        vi.doMock('../../js/shared/error-handler.js', () => ({
            handleError: vi.fn()
        }));

        const uiMock = {
            openModal: vi.fn(),
            closeModal: vi.fn(),
            showInfoModal: vi.fn(),
            openConfirmModal: vi.fn().mockReturnValue(Promise.resolve(true)),
            showLoadingMessage: vi.fn(),
            showErrorMessage: vi.fn()
        };
        vi.doMock('../../js/ui/ui.js', () => uiMock);
        vi.doMock('../../js/ui/ui.ts', () => uiMock);

        vi.doMock('../../js/ui/toast.js', () => ({
            Toast: { show: vi.fn() }
        }));

        vi.doMock('../../js/utils/utils.js', async (importOriginal) => {
            const actual = await importOriginal();
            return { ...actual };
        });
        vi.doMock('../../js/utils/utils.ts', async (importOriginal) => {
            const actual = await importOriginal();
            return { ...actual };
        });

        // Import Modules
        const TanksModule = await import('../../js/admin/tanks.ts');
        showTanksAdminModal = TanksModule.showTanksAdminModal;

        const ApiModule = await import('../../js/core/api.js');
        supabase = ApiModule.supabase;
        safeSupabaseQuery = ApiModule.safeSupabaseQuery;

        const UIModule = await import('../../js/ui/ui.js');
        UI = UIModule;

        const ErrorHandlerModule = await import('../../js/shared/error-handler.js');
        ErrorHandler = ErrorHandlerModule.handleError;
    });

    it('should render tanks and links successfully', async () => {
        // Mock Data
        const mockTanks = [{ id: 1, name: 'Cisterna 1', fuel_type: 'Benzina', capacity: 1000 }];
        const mockPumps = [{ id: 10, nome: 'Pistola A', tipo_carburante: 'Benzina', islands: { nome: 'Isola 1' } }];
        const mockLinks = [{
            id: 100,
            pump_id: 10,
            tank_id: 1,
            mode: 'auto',
            is_active: true,
            pistole: mockPumps[0],
            tanks: mockTanks[0]
        }];

        tanksBuilder.order.mockResolvedValue({ data: mockTanks, error: null });
        linksBuilder.order.mockResolvedValue({ data: mockLinks, error: null });
        pumpsBuilder.order.mockResolvedValue({ data: mockPumps, error: null });

        await showTanksAdminModal(999);

        const modalBody = document.getElementById('modal-body');
        expect(UI.openModal).toHaveBeenCalledWith(expect.stringContaining('Gestione Cisterne'));
        expect(modalBody?.innerHTML).toContain('Cisterna 1');
        expect(modalBody?.innerHTML).toContain('Pistola A');
        expect(modalBody?.innerHTML).toContain('Automatica');
    });

    it('should handle Add Tank submission', async () => {
        await showTanksAdminModal(999);

        const form = document.getElementById('add-tank-form') as HTMLFormElement;
        const nameInput = form.querySelector('input[name="name"]') as HTMLInputElement;
        nameInput.value = 'New Tank';

        form.dispatchEvent(new Event('submit'));

        await vi.waitFor(() => {
            expect(tanksBuilder.insert).toHaveBeenCalled();
            // Should match payload, but verifying call is enough for logic flow
            expect(tanksBuilder.insert).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ name: 'New Tank' })
            ]));
        });
    });

    it('should handle Add Link submission', async () => {
        // Setup initial data so form is enabled
        tanksBuilder.order.mockResolvedValue({ data: [{ id: 1, name: 'T1' }], error: null });
        pumpsBuilder.order.mockResolvedValue({ data: [{ id: 10, nome: 'P1' }], error: null });

        await showTanksAdminModal(999);

        const form = document.getElementById('tank-link-form') as HTMLFormElement;
        // Need to wait for rendering to enable fields? 
        // Logic renders immediately after await Promise.all.

        // Select logic
        const pumpSelect = form.querySelector('select[name="pump_id"]') as HTMLSelectElement;
        const tankSelect = form.querySelector('select[name="tank_id"]') as HTMLSelectElement;

        // Populate if not already (js logic populates it)
        pumpSelect.value = "10";
        tankSelect.value = "1";

        form.dispatchEvent(new Event('submit'));

        await vi.waitFor(() => {
            expect(linksBuilder.insert).toHaveBeenCalled();
            expect(linksBuilder.insert).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ pump_id: 10, tank_id: 1 })
            ]));
        });
    });

    it('should handle Delete Tank interaction', async () => {
        const mockTanks = [{ id: 55, name: 'DelTank', fuel_type: 'Benzina', capacity: 1000 }];
        tanksBuilder.order.mockResolvedValue({ data: mockTanks, error: null });

        await showTanksAdminModal(999);

        const delBtn = document.querySelector('.delete-tank') as HTMLButtonElement;
        expect(delBtn).toBeTruthy();
        delBtn.click();

        await vi.waitFor(() => {
            expect(UI.openConfirmModal).toHaveBeenCalled();
            expect(tanksBuilder.delete).toHaveBeenCalled();
            expect(deleteEqMock).toHaveBeenCalledWith('id', '55'); // Dataset id is string
        });
    });

    it('should handle Toggle Link interaction', async () => {
        const mockLinks = [{ id: 77, pump_id: 10, tank_id: 1, is_active: true }];
        linksBuilder.order.mockResolvedValue({ data: mockLinks, error: null });
        // Update mock
        const eqMock = vi.fn().mockResolvedValue({ error: null });
        linksBuilder.update.mockReturnValue({ eq: eqMock });

        await showTanksAdminModal(999);

        const toggleBtn = document.querySelector('.tank-link-toggle') as HTMLButtonElement;
        toggleBtn.click();

        await vi.waitFor(() => {
            expect(linksBuilder.update).toHaveBeenCalledWith({ is_active: false }); // Toggle true -> false
            expect(eqMock).toHaveBeenCalledWith('id', '77');
        });
    });

    it('should handle errors gracefully', async () => {
        tanksBuilder.order.mockResolvedValue({ data: null, error: { message: 'DB Fail' } });

        await showTanksAdminModal(999);

        expect(ErrorHandler).toHaveBeenCalled();
    });

});
