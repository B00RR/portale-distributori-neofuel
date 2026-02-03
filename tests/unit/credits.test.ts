import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showCreditiOverview } from '../../js/admin/credits.js';

// --- MOCKS ---

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            delete: mockDelete
        }))
    },
    safeSupabaseQuery: vi.fn((fn) => fn())
}));

vi.mock('../../js/shared/error-handler.js', () => ({
    handleError: vi.fn()
}));

vi.mock('../../js/shared/validators.js', () => ({
    Validators: {
        required: 'required',
        number: 'number'
    },
    validateForm: vi.fn(),
    formatErrorMessages: vi.fn((e) => JSON.stringify(e))
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
    escapeHtml: vi.fn((s) => s),
    formatEuro: vi.fn((n) => `€ ${n}`)
}));

describe('Credits Module', () => {

    beforeEach(() => {
        vi.clearAllMocks();

        // Default Chain
        mockSelect.mockReturnValue({
            eq: mockEq
        });
        mockEq.mockReturnValue({
            single: mockSingle,
            order: mockOrder
        });
        mockOrder.mockResolvedValue({ data: [], error: null });

        // DOM Setup
        document.body.innerHTML = `
            <div id="container"></div>
            <div id="actions"></div>
            <div id="modal-body"></div>
        `;
    });

    describe('showCreditiOverview', () => {
        it('should render customer list', async () => {
            const mockCustomers = [
                { id: 1, cliente: 'Mario Rossi', saldo: 100, updated_at: '2023-01-01', fuel_stations: { station_name: 'Stazione 1' } },
                { id: 2, cliente: 'Luigi Verdi', saldo: 50, updated_at: '2023-01-02' }
            ];

            // Setup specific chain for this test
            // Query: .from().select().order() (if no station filter)
            mockSelect.mockReturnValue({
                order: mockOrder
            });
            mockOrder.mockResolvedValue({ data: mockCustomers, error: null });

            const container = document.getElementById('container')!;
            const actions = document.getElementById('actions')!;

            await showCreditiOverview(container, actions);

            expect(container.innerHTML).toContain('Mario Rossi');
            expect(container.innerHTML).toContain('Luigi Verdi');
            expect(container.innerHTML).toContain('Stazione 1');

            // Should add "Nuovo Cliente" button
            expect(actions.innerHTML).toContain('Nuovo Cliente');
        });

        it('should filter by stationId', async () => {
            mockSelect.mockReturnValue({
                eq: mockEq
            });
            mockEq.mockReturnValue({
                order: mockOrder
            });
            mockOrder.mockResolvedValue({ data: [], error: null });

            const container = document.getElementById('container')!;
            await showCreditiOverview(container, null, 99);

            expect(mockEq).toHaveBeenCalledWith('station_id', 99);
        });

        it('should handle empty list', async () => {
            mockSelect.mockReturnValue({ order: mockOrder });
            mockOrder.mockResolvedValue({ data: [], error: null });

            const container = document.getElementById('container')!;
            await showCreditiOverview(container, null);

            expect(container.innerHTML).toContain('Nessun cliente trovato');
        });

        it('should handle API errors', async () => {
            const { handleError } = await import('../../js/shared/error-handler.js');
            mockSelect.mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: null, error: new Error('API Fail') })
            });

            const container = document.getElementById('container')!;
            await showCreditiOverview(container, null);

            expect(handleError).toHaveBeenCalled();
        });
    });

    describe('Customer Interaction (Delete)', () => {
        it('should delete customer after confirmation', async () => {
            const { openConfirmModal } = await import('../../js/ui/ui.js');
            const { supabase } = await import('../../js/core/api.js');
            const { Toast } = await import('../../js/ui/toast.js');

            // Render list first to attach listeners
            // Setup specific chain for delete
            const deleteChain = { eq: mockEq };
            mockDelete.mockReturnValue(deleteChain);
            mockEq.mockResolvedValue({ error: null });

            // AND setup data fetch (must explicitly rewire select mock for first call)
            // showCreditiOverview calls .select()... so we need mockSelect to return a chain that has .order
            // But we also need mockDelete to work. They are on the same global 'supabase.from' mock.
            // The issue is: mockSelect was globally mocked in beforeEach.
            // We just need to ensure mockOrder returns data.
            mockOrder.mockResolvedValue({ data: [{ id: 10, cliente: 'Delete Me' }], error: null });

            // Ensure mockSelect is connected (it is by default in beforeEach)
            mockSelect.mockReturnValue({
                order: mockOrder,
                eq: mockEq // for verify updates/filtering
            });

            const container = document.getElementById('container')!;
            await showCreditiOverview(container, null);

            // Click delete
            const btn = container.querySelector('.delete-customer') as HTMLElement;
            expect(btn).toBeTruthy();
            btn.click(); // This calls deleteCustomer(10)

            await new Promise(r => setTimeout(r, 0));

            // Verify
            expect(openConfirmModal).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledWith('crediti_clienti');
            expect(mockDelete).toHaveBeenCalled();
            expect(mockEq).toHaveBeenCalledWith('id', 10);
            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('eliminato'), 'success');
        });

        it('should cancel delete if not confirmed', async () => {
            const { openConfirmModal } = await import('../../js/ui/ui.js');
            vi.mocked(openConfirmModal).mockResolvedValue(false);

            // Render
            mockSelect.mockReturnValue({ order: mockOrder });
            mockOrder.mockResolvedValue({ data: [{ id: 11, cliente: 'Safe' }], error: null });

            const container = document.getElementById('container')!;
            await showCreditiOverview(container, null);

            const btn = container.querySelector('.delete-customer') as HTMLElement;
            btn.click();
            await new Promise(r => setTimeout(r, 0));

            expect(mockDelete).not.toHaveBeenCalled();
        });
    });

    describe('Customer Modal (Create/Edit)', () => {
        // Need to access the internal function openCustomerModal
        // Since it's not exported, we simulate clicking the "Add" or "Edit" buttons

        it('should open modal for New Customer', async () => {
            const { openModal } = await import('../../js/ui/ui.js');

            // Render with actions
            const container = document.getElementById('container')!;
            const actions = document.getElementById('actions')!;
            mockSelect.mockReturnValue({ order: mockOrder }); // Empty list
            mockOrder.mockResolvedValue({ data: [], error: null });

            await showCreditiOverview(container, actions);

            const addBtn = actions.querySelector('#add-customer-btn') as HTMLElement;
            expect(addBtn).toBeTruthy();
            addBtn.click();

            expect(openModal).toHaveBeenCalledWith('Nuovo Cliente');
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Crea Cliente');
        });

        it('should open modal for Edit Customer and load data', async () => {
            const { openModal } = await import('../../js/ui/ui.js');

            // Render list
            mockSelect.mockReturnValue({ order: mockOrder });
            mockOrder.mockResolvedValue({ data: [{ id: 20, cliente: 'Edit Me' }], error: null });

            const container = document.getElementById('container')!;
            await showCreditiOverview(container, null);

            // Prepare mock for single select (loading customer)
            mockSelect.mockReturnValue({ eq: mockEq });
            mockEq.mockReturnValue({ single: mockSingle });
            mockSingle.mockResolvedValue({ data: { id: 20, cliente: 'Edit Me Loaded' }, error: null });

            const editBtn = container.querySelector('.edit-customer') as HTMLElement;
            editBtn.click();
            await new Promise(r => setTimeout(r, 0)); // Wait for fetch

            expect(openModal).toHaveBeenCalledWith('Modifica Cliente');
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.innerHTML).toContain('Salva Modifiche');
            expect((modalBody?.querySelector('input[name="cliente"]') as HTMLInputElement).value).toBe('Edit Me Loaded');
        });

        it('should submit form and create customer', async () => {
            // Simulate "New Customer" flow
            const container = document.getElementById('container')!;
            const actions = document.getElementById('actions')!;
            await showCreditiOverview(container, actions);
            const addBtn = actions.querySelector('#add-customer-btn') as HTMLElement;
            addBtn.click();

            // Simulate Form Submit
            const form = document.getElementById('customer-form') as HTMLFormElement;
            const inputName = form.querySelector('input[name="cliente"]') as HTMLInputElement;
            const inputSaldo = form.querySelector('input[name="saldo"]') as HTMLInputElement;

            inputName.value = 'New Guy';
            inputSaldo.value = '500';

            // Mock validation success
            const { validateForm } = await import('../../js/shared/validators.js');
            vi.mocked(validateForm).mockReturnValue(null);

            // Mock insert
            mockInsert.mockResolvedValue({ error: null });

            form.dispatchEvent(new Event('submit'));
            await new Promise(r => setTimeout(r, 0));

            expect(mockInsert).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ cliente: 'New Guy', saldo: 500 })
            ]));
        });

        it('should submit form and update customer', async () => {
            // Simulate "Edit Customer" flow
            mockSelect.mockReturnValue({ order: mockOrder });
            mockOrder.mockResolvedValue({ data: [{ id: 30, cliente: 'Old Name' }], error: null });
            const container = document.getElementById('container')!;
            await showCreditiOverview(container, null);

            // Setup fetch mock
            const mockSupabase = await import('../../js/core/api.js');
            // We need to reset the mock behavior for the 'fetch single' call inside openCustomerModal
            // But simpler is to assume openCustomerModal calls supabase.from().select().eq().single()
            // We already mocked chain in beforeEach/above.
            mockSelect.mockReturnValue({ eq: mockEq });
            mockEq.mockReturnValue({ single: mockSingle });
            mockSingle.mockResolvedValue({ data: { id: 30, cliente: 'Old Name' }, error: null });

            const editBtn = container.querySelector('.edit-customer') as HTMLElement;
            editBtn.click();
            await new Promise(r => setTimeout(r, 0));

            // Now simulate submit
            const form = document.getElementById('customer-form') as HTMLFormElement;
            const inputName = form.querySelector('input[name="cliente"]') as HTMLInputElement;
            inputName.value = 'New Name';

            // Mock validation
            const { validateForm } = await import('../../js/shared/validators.js');
            vi.mocked(validateForm).mockReturnValue(null);

            // Mock update
            // Logic: supabase.from().update({...}).eq('id', 30)
            mockSelect.mockReturnValue({ eq: mockEq }); // Reset if needed, but existing chain works for update too
            // Actually, `update` is on top level of from() usually? No, supabase.from('Table').update()
            // Our mock from() returns obj with update/insert/select/delete.
            // .update().eq()
            mockUpdate.mockReturnValue({ eq: mockEq });
            mockEq.mockResolvedValue({ error: null }); // Final execution

            form.dispatchEvent(new Event('submit'));
            await new Promise(r => setTimeout(r, 0));

            expect(mockUpdate).toHaveBeenCalledWith({ cliente: 'New Name' });
            expect(mockEq).toHaveBeenCalledWith('id', 30);
        });

        it('should handle validation errors', async () => {
            // Open Modal
            const container = document.getElementById('container')!;
            const actions = document.getElementById('actions')!;
            await showCreditiOverview(container, actions);
            actions.querySelector<HTMLElement>('#add-customer-btn')!.click();

            // Mock validation fail
            const { validateForm } = await import('../../js/shared/validators.js');
            vi.mocked(validateForm).mockReturnValue({ cliente: ['Required'] });
            const { Toast } = await import('../../js/ui/toast.js');

            const form = document.getElementById('customer-form') as HTMLFormElement;
            form.dispatchEvent(new Event('submit'));

            expect(mockInsert).not.toHaveBeenCalled();
            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('Errore'), 'error');
        });
    });
});
