import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    showOperatorsTab,
    openOperatorModal,
    openAssignStationModal,
    deleteUser
} from '../../js/admin/operators.js';

// --- MOCKS ---

// Mock API
vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
                    maybeSingle: vi.fn(() => Promise.resolve({ data: { station_id: 1 }, error: null }))
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ error: null }))
                })),
                delete: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ error: null }))
                }))
            }))
        })),
        rpc: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        functions: {
            invoke: vi.fn(() => Promise.resolve({ data: {}, error: null }))
        },
        safeSupabaseQuery: vi.fn((cb) => cb())
    }
}));

// Mock Schema Validation
vi.mock('../../js/core/schemas.js', () => ({
    CreateUserSchema: {},
    UpdateUserSchema: {},
    safeParse: vi.fn(() => ({ success: true, data: { full_name: 'Test', role: 'operator' } }))
}));

// Mock Error Handler
vi.mock('../../js/shared/error-handler.js', () => ({
    handleError: vi.fn()
}));

// Mock UI Components
vi.mock('../../js/ui/toast.js', () => ({
    Toast: { show: vi.fn() }
}));

vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    setButtonLoading: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../js/utils/utils.js', () => ({
    escapeHtml: vi.fn((s) => s || '')
}));

describe('Operators Module', () => {
    let container: HTMLElement;
    let actions: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        actions = document.createElement('div');
        container.id = 'admin-content';
        actions.id = 'header-actions';
        document.body.appendChild(container);
        document.body.appendChild(actions);
        // Mock modal body for modal tests
        const modalBody = document.createElement('div');
        modalBody.id = 'modal-body';
        document.body.appendChild(modalBody);

        vi.clearAllMocks();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('showOperatorsTab', () => {
        it('should fetch and display operators', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const mockUsers = [
                { user_id: '1', full_name: 'Mario Rossi', email: 'mario@test.com', role: 'operator' },
                { user_id: '2', full_name: 'Admin User', email: 'admin@test.com', role: 'admin' }
            ];

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: mockUsers, error: null }))
                }))
            } as any);

            await showOperatorsTab(container, actions);

            expect(container.innerHTML).toContain('Mario Rossi');
            expect(container.innerHTML).toContain('Admin User');
            expect(actions.innerHTML).toContain('Nuovo Operatore');
        });

        it('should handle API errors', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { handleError } = await import('../../js/shared/error-handler.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.rejected(new Error('Fetch failed')))
                }))
            } as any);

            await showOperatorsTab(container, actions);

            expect(handleError).toHaveBeenCalled();
        });

        it('should handle empty list', async () => {
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
            } as any);

            await showOperatorsTab(container, actions);
            expect(container.innerHTML).toContain('Nessun operatore trovato');
        });
    });

    describe('openOperatorModal', () => {
        it('should render create form', async () => {
            await openOperatorModal();
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Crea Utente');
            expect(modalBody?.innerHTML).toContain('Password'); // Should show password for new user
        });

        it('should render edit form with existing data', async () => {
            const { supabase } = await import('../../js/core/api.js');
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({
                            data: { user_id: '1', full_name: 'Luigi', email: 'l@test.com', role: 'operator' },
                            error: null
                        }))
                    }))
                }))
            } as any);

            await openOperatorModal('1');
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Luigi');
            expect(modalBody?.innerHTML).toContain('Salva Modifiche');
            expect(modalBody?.innerHTML).not.toContain('Password'); // Should NOT show password input for edit
        });

        it('should handle form submission for creation (Edge Function)', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { Toast } = await import('../../js/ui/toast.js');

            // Mock invoke response
            vi.mocked(supabase.functions.invoke).mockResolvedValue({
                data: { user: { id: 'new-id' } },
                error: null
            } as any);

            await openOperatorModal();

            const form = document.getElementById('operator-form') as HTMLFormElement;
            // Simulate form submission
            // Note: In a real DOM test we'd fill inputs, but we mocked Zod to always return success with strict data
            form.dispatchEvent(new Event('submit'));

            // Wait for async handler (dynamic import + logic)
            await new Promise(resolve => setTimeout(resolve, 10)); // Slight delay for event loop

            expect(supabase.functions.invoke).toHaveBeenCalledWith('admin_create_user_v2', expect.objectContaining({
                body: expect.objectContaining({
                    full_name: 'Test',
                    role: 'operator'
                })
            }));
            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('Utente creato'), 'success');
        });
    });

    describe('deleteUser', () => {
        it('should call admin_delete_user RPC', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { openConfirmModal } = await import('../../js/ui/ui.js');

            vi.mocked(openConfirmModal).mockResolvedValue(true);
            vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any);

            await deleteUser('1', container, actions);

            expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_user', { p_user_id: '1' });
        });

        it('should abort if not confirmed', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { openConfirmModal } = await import('../../js/ui/ui.js');

            vi.mocked(openConfirmModal).mockResolvedValue(false);

            await deleteUser('1', container, actions);

            expect(supabase.rpc).not.toHaveBeenCalled();
        });
    });

    describe('openAssignStationModal', () => {
        it('should load stations and current assignment', async () => {
            const { supabase } = await import('../../js/core/api.js');

            // Mock station list
            const stationsMock = { data: [{ station_id: 1, station_name: 'Gas Station' }] };
            // Mock current assignment
            const assignmentMock = { data: { station_id: 1 } };

            const selectMock = vi.fn();
            const fromMock = vi.fn((table) => {
                if (table === 'fuel_stations') return { select: vi.fn(() => Promise.resolve(stationsMock)) };
                if (table === 'user_stations') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve(assignmentMock)) })) })) };
                return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) };
            });

            vi.mocked(supabase.from).mockImplementation(fromMock as any);

            await openAssignStationModal('1');

            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Gas Station');
        });
    });

});
