import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStore, mockApertura, mockClosure, mockPrezzi, mockCredits, mockOutflow, mockExtraIncome, mockVoucher, mockInvoice } = vi.hoisted(() => ({
    mockStore: {
        getUser: vi.fn()
    },
    mockApertura: { showAperturaForm: vi.fn() },
    mockClosure: { startClosureWizard: vi.fn() },
    mockPrezzi: { showPrezziEditForm: vi.fn() },
    mockCredits: { showCreditsMenu: vi.fn() },
    mockOutflow: { showOutflowMenu: vi.fn() },
    mockExtraIncome: { showExtraIncomeMenu: vi.fn() },
    mockVoucher: { showVoucherMenu: vi.fn() },
    mockInvoice: { showInvoiceMenu: vi.fn() }
}));

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));
vi.mock('../../js/operator/opening.js', () => mockApertura);
vi.mock('../../js/operator/closure.js', () => mockClosure);
vi.mock('../../js/operator/prices.js', () => mockPrezzi);
vi.mock('../../js/operator/credits.js', () => mockCredits);
vi.mock('../../js/operator/outflows.js', () => mockOutflow);
vi.mock('../../js/operator/extra-income.js', () => mockExtraIncome);
vi.mock('../../js/operator/vouchers.js', () => mockVoucher);
vi.mock('../../js/operator/invoices.js', () => mockInvoice);

import { router } from '../../js/operator/router.js';

describe('Operator Router', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStore.getUser.mockReturnValue({
            id: 'user-123',
            user_id: '1',
            station_id: 'ST-456',
            email: 'op@test.com',
            role: 'operator'
        });
    });

    describe('navigateTo', () => {
        it('should navigate to apertura', async () => {
            await router.navigateTo('apertura');

            expect(mockApertura.showAperturaForm).toHaveBeenCalledWith('ST-456', 'user-123');
        });

        it('should navigate to chiusura', async () => {
            await router.navigateTo('chiusura');

            expect(mockClosure.startClosureWizard).toHaveBeenCalledWith('ST-456', 'user-123');
        });

        it('should navigate to prezzi', async () => {
            await router.navigateTo('prezzi');

            expect(mockPrezzi.showPrezziEditForm).toHaveBeenCalledWith(456);
        });

        it('should navigate to crediti', async () => {
            await router.navigateTo('crediti');

            expect(mockCredits.showCreditsMenu).toHaveBeenCalledWith('ST-456', 'user-123');
        });

        it('should navigate to uscite', async () => {
            await router.navigateTo('uscite');

            expect(mockOutflow.showOutflowMenu).toHaveBeenCalledWith('ST-456', 'user-123');
        });

        it('should navigate to incassi', async () => {
            await router.navigateTo('incassi');

            expect(mockExtraIncome.showExtraIncomeMenu).toHaveBeenCalledWith('ST-456', 'user-123');
        });

        it('should navigate to voucher', async () => {
            await router.navigateTo('voucher');

            expect(mockVoucher.showVoucherMenu).toHaveBeenCalledWith('ST-456', 'user-123');
        });

        it('should navigate to fatture', async () => {
            await router.navigateTo('fatture');

            expect(mockInvoice.showInvoiceMenu).toHaveBeenCalledWith('ST-456', 'user-123');
        });

        it('should handle missing user context', async () => {
            mockStore.getUser.mockReturnValue(null);

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            await router.navigateTo('apertura');

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing user'));
            consoleSpy.mockRestore();
        });

        it('should handle assignedStations fallback', async () => {
            mockStore.getUser.mockReturnValue({
                id: 'user-789',
                user_id: '2',
                assignedStations: [{ id: 'ST-999' }],
                email: 'op2@test.com',
                role: 'operator'
            });

            await router.navigateTo('apertura');

            expect(mockApertura.showAperturaForm).toHaveBeenCalledWith('ST-999', 'user-789');
        });
    });

    describe('getCurrentView', () => {
        it('should return null initially', () => {
            expect(router.getCurrentView()).toBeNull();
        });

        it('should return current view after navigation', async () => {
            await router.navigateTo('crediti');
            expect(router.getCurrentView()).toBe('crediti');
        });
    });
});
