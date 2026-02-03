import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    showCreditiOverview
} from '../../js/admin/credits.js';

// Mocks
vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(function () { return this; }),
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
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
    },
    safeSupabaseQuery: vi.fn((fn) => fn())
}));

vi.mock('../../js/shared/error-handler.js', () => ({
    handleError: vi.fn()
}));

vi.mock('../../js/shared/validators.js', () => ({
    Validators: {
        required: vi.fn(),
        number: vi.fn()
    },
    validateForm: vi.fn(() => null),
    formatErrorMessages: vi.fn((errors) => JSON.stringify(errors))
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

vi.mock('../../js/ui/ui.js', () => ({
    showLoadingMessage: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    setButtonLoading: vi.fn(),
    openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../js/utils/utils.js', () => ({
    escapeHtml: vi.fn((text) => String(text || '')),
    formatEuro: vi.fn((val) => `€ ${val}`)
}));

describe('Credits Module', () => {

    beforeEach(() => {
        document.body.innerHTML = '<div id="container"></div><div id="actions"></div>';
        vi.clearAllMocks();
    });

    describe('showCreditiOverview', () => {
        it('should render credit customers table', async () => {
            const { supabase } = await import('../../js/core/api.js');

            const mockCustomers = [
                {
                    id: 1,
                    cliente: 'ACME Corp',
                    saldo: 1000,
                    station_id: 5,
                    updated_at: '2024-01-01',
                    fuel_stations: { station_name: 'Stazione 1' }
                }
            ];

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(function () { return this; }),
                    order: vi.fn(() => Promise.resolve({ data: mockCustomers, error: null }))
                }))
            } as any);

            const container = document.getElementById('container')!;
            const actions = document.getElementById('actions')!;

            await showCreditiOverview(container, actions, null);

            expect(container.innerHTML).toContain('ACME Corp');
            expect(container.innerHTML).toContain('€ 1000');
        });

        it('should add "Nuovo Cliente" button to actions', async () => {
            const container = document.getElementById('container')!;
            const actions = document.getElementById('actions')!;

            await showCreditiOverview(container, actions, null);

            expect(actions.innerHTML).toContain('Nuovo Cliente');
        });

        it('should filter by station ID if provided', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const container = document.getElementById('container')!;

            const eqMock = vi.fn(function () { return this; });
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: eqMock,
                    order: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
            } as any);

            await showCreditiOverview(container, null, 5);

            expect(eqMock).toHaveBeenCalledWith('station_id', 5);
        });

        it('should handle empty customer list', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(function () { return this; }),
                    order: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
            } as any);

            const container = document.getElementById('container')!;

            await showCreditiOverview(container, null, null);

            expect(container.textContent).toContain('Nessun cliente trovato');
        });

        it('should handle errors gracefully', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { handleError } = await import('../../js/shared/error-handler.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(function () { return this; }),
                    order: vi.fn(() => Promise.resolve({ data: null, error: new Error('DB error') }))
                }))
            } as any);

            const container = document.getElementById('container')!;

            await showCreditiOverview(container, null, null);

            expect(handleError).toHaveBeenCalled();
        });

        it('should format dates correctly', async () => {
            const { supabase } = await import('../../js/core/api.js');

            const mockCustomers = [
                {
                    id: 1,
                    cliente: 'Test',
                    saldo: 500,
                    updated_at: '2024-06-15T12:00:00Z',
                    fuel_stations: { station_name: 'Station 1' }
                }
            ];

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(function () { return this; }),
                    order: vi.fn(() => Promise.resolve({ data: mockCustomers, error: null }))
                }))
            } as any);

            const container = document.getElementById('container')!;

            await showCreditiOverview(container, null, null);

            expect(container.innerHTML).toContain('2024');
        });

        it('should escape HTML in customer names', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const { escapeHtml } = await import('../../js/utils/utils.js');

            const mockCustomers = [
                {
                    id: 1,
                    cliente: '<script>alert("XSS")</script>',
                    saldo: 100,
                    fuel_stations: { station_name: 'Station' }
                }
            ];

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(function () { return this; }),
                    order: vi.fn(() => Promise.resolve({ data: mockCustomers, error: null }))
                }))
            } as any);

            const container = document.getElementById('container')!;

            await showCreditiOverview(container, null, null);

            expect(escapeHtml).toHaveBeenCalledWith('<script>alert("XSS")</script>');
        });
    });
});
