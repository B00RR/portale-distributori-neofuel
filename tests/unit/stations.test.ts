/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    showStationsTab,
    openStationModal,
    deleteStation
} from '../../js/admin/stations.js';

// --- MOCKS ---

vi.mock('../../js/core/api.js', () => {
    return {
        supabase: {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({ data: {}, error: null }))
                    })),
                    update: vi.fn(() => ({
                        eq: vi.fn(() => Promise.resolve({ error: null }))
                    })),
                    insert: vi.fn(() => Promise.resolve({ error: null })),
                    delete: vi.fn(() => ({
                        eq: vi.fn(() => Promise.resolve({ error: null }))
                    }))
                }))
            })),
        },
        safeSupabaseQuery: vi.fn((cb) => cb()),
        Cache: {
            getOrFetch: vi.fn((key, fetchFn) => fetchFn()),
            invalidate: vi.fn(),
            invalidateByPrefix: vi.fn(),
            clear: vi.fn(),
            get: vi.fn(),
            set: vi.fn(),
            getStats: vi.fn(() => ({ total: 0, valid: 0, expired: 0 }))
        },
        CACHE_KEYS: {
            STATIONS: 'stations',
            CUSTOMERS: 'customers',
            FUEL_TYPES: 'fuel_types',
            STATION_PREFIX: 'station_'
        }
    };
});

vi.mock('../../js/shared/error-handler.js', () => ({
    handleError: vi.fn()
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: { show: vi.fn() }
}));

vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true)),
    setButtonLoading: vi.fn()
}));

vi.mock('../../js/utils/utils.js', () => ({
    escapeHtml: vi.fn((s) => s || '')
}));

// Mock sub-modules
vi.mock('../../js/admin/islands.js', () => ({
    showIslandsModal: vi.fn()
}));
vi.mock('../../js/admin/prices.js', () => ({
    showPrezziAdminModal: vi.fn()
}));
vi.mock('../../js/admin/tanks.js', () => ({
    showTanksAdminModal: vi.fn()
}));

describe('Stations Module', () => {
    let container: HTMLElement;
    let actions: HTMLElement;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'admin-content';
        actions = document.createElement('div');
        actions.id = 'header-actions';
        document.body.appendChild(container); // Append to body for finding by ID
        document.body.appendChild(actions);

        // Mock Modal Body
        const modalBody = document.createElement('div');
        modalBody.id = 'modal-body';
        document.body.appendChild(modalBody);

        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        document.body.innerHTML = '';
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('showStationsTab', () => {
        it('should fetch and render stations', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const mockStations = [
                { station_id: 1, station_name: 'Shell Roma', location: 'Roma', allow_partial_closure: true }
            ];

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: mockStations, error: null }))
                }))
            } as unknown as ReturnType<typeof supabase.from>);

            await showStationsTab(container, actions);

            expect(container.innerHTML).toContain('Shell Roma');
            expect(actions.innerHTML).toContain('Nuovo Distributore');
        });

        it('should handle API errors', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { handleError } = await import('../../js/shared/error-handler.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.reject(new Error('Fetch failed')))
                }))
            } as unknown as ReturnType<typeof supabase.from>);

            await showStationsTab(container, actions);

            expect(handleError).toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should bind sub-module buttons', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { showIslandsModal } = await import('../../js/admin/islands.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: [{ station_id: 1, station_name: 'Test' }], error: null }))
                }))
            } as unknown as ReturnType<typeof supabase.from>);

            await showStationsTab(container, actions);

            const islandsBtn = container.querySelector('.islands-station') as HTMLElement;
            islandsBtn.click();

            expect(showIslandsModal).toHaveBeenCalledWith(1);
        });
    });

    describe('openStationModal', () => {
        it('should render create form', async () => {
            await openStationModal();
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Crea Distributore');
        });

        it('should render edit form with data', async () => {
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({ data: { station_id: 1, station_name: 'Edit Me' }, error: null }))
                    }))
                }))
            } as unknown as ReturnType<typeof supabase.from>);

            await openStationModal(1);
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Edit Me');
        });

        it('should handle form submission (update)', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const navUpdate = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));

            vi.mocked(supabase.from).mockImplementation((table) => {
                if (table === 'fuel_stations') return {
                    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { station_id: 1 }, error: null }) }) }),
                    update: navUpdate
                } as unknown as ReturnType<typeof supabase.from>;
                return {} as unknown as ReturnType<typeof supabase.from>;
            });

            await openStationModal(1);
            const form = document.getElementById('station-form') as HTMLFormElement;

            // Explicitly set values to ensure FormData works in JSDOM
            const nameInput = form.querySelector('input[name="station_name"]') as HTMLInputElement;
            nameInput.value = "Updated Name";

            form.requestSubmit();

            // Wait for handlers
            await new Promise(resolve => setTimeout(resolve, 100));

            const { Toast } = await import('../../js/ui/toast.js');
            if (navUpdate.mock.calls.length === 0) {
                expect(Toast.show).toHaveBeenCalled();
            }

            expect(navUpdate).toHaveBeenCalled();
        });
    });

    describe('deleteStation', () => {
        it('should delete station on confirm', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn(() => Promise.resolve({ error: null })) });

            vi.mocked(supabase.from).mockReturnValue({
                delete: deleteMock
            } as unknown as ReturnType<typeof supabase.from>);

            // We need to attach listeners to verify reload event, but simple function call verification is enough
            await deleteStation(1);

            expect(deleteMock).toHaveBeenCalled();
        });
    });
});
