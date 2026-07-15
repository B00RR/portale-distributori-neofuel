import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockStore,
  mockApertura,
  mockClosure,
  mockPrezzi,
  mockCredits,
  mockOutflow,
  mockExtraIncome,
  mockVoucher,
  mockInvoice
} = vi.hoisted(() => ({
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
    // Reset singleton state
    (router as unknown as { currentView: string | null }).currentView = null;

    mockStore.getUser.mockReturnValue({
      id: 'user-123',
      user_id: '1',
      station_id: '456',
      email: 'op@test.com',
      role: 'operator',
      assignedStations: [{ id: 456, name: 'Roma' }]
    });
  });

  describe('navigateTo', () => {
    it('should navigate to apertura', async () => {
      await router.navigateTo('apertura');
      expect(mockApertura.showAperturaForm).toHaveBeenCalledWith('456');
    });

    it('should navigate to chiusura', async () => {
      await router.navigateTo('chiusura');
      expect(mockClosure.startClosureWizard).toHaveBeenCalledWith('456', '1');
    });

    it('should navigate to prezzi', async () => {
      await router.navigateTo('prezzi');
      expect(mockPrezzi.showPrezziEditForm).toHaveBeenCalledWith(456);
    });

    it('should navigate to crediti', async () => {
      await router.navigateTo('crediti');
      expect(mockCredits.showCreditsMenu).toHaveBeenCalledWith('456', '1');
    });
    it('should navigate to uscite', async () => {
      await router.navigateTo('uscite');
      expect(mockOutflow.showOutflowMenu).toHaveBeenCalledWith('456', '1');
    });
    it('should navigate to incassi', async () => {
      await router.navigateTo('incassi');
      expect(mockExtraIncome.showExtraIncomeMenu).toHaveBeenCalledWith('456', '1');
    });
    it('should navigate to voucher', async () => {
      await router.navigateTo('voucher');
      expect(mockVoucher.showVoucherMenu).toHaveBeenCalledWith('456', 'user-123');
    });
    it('should navigate to fatture', async () => {
      await router.navigateTo('fatture');
      expect(mockInvoice.showInvoiceMenu).toHaveBeenCalledWith('456', '1');
    });

    it('passes the numeric DB user_id to shift flows and the auth UUID only to vouchers (#248)', async () => {
      await router.navigateTo('apertura');
      await router.navigateTo('voucher');

      // ShiftOpener did Number(userId) but now opening doesn't pass userId anymore; the RPC voucher wants the UUID.
      expect(mockApertura.showAperturaForm).toHaveBeenCalledWith('456');
      expect(mockVoucher.showVoucherMenu).toHaveBeenCalledWith('456', 'user-123');
    });

    it('falls back to user_id for vouchers when the auth UUID is missing (#248)', async () => {
      mockStore.getUser.mockReturnValue({
        user_id: '1',
        station_id: '456',
        email: 'op@test.com',
        role: 'operator',
        assignedStations: [{ id: 456, name: 'Roma' }]
      });

      await router.navigateTo('voucher');

      expect(mockVoucher.showVoucherMenu).toHaveBeenCalledWith('456', '1');
    });

    it('should use the persisted selected station instead of the first assigned station', async () => {
      localStorage.setItem('operator_selected_station:1', '222');
      mockStore.getUser.mockReturnValue({
        id: 'user-123',
        user_id: '1',
        station_id: '111',
        email: 'op@test.com',
        role: 'operator',
        assignedStations: [
          { id: 111, name: 'Roma' },
          { id: 222, name: 'Milano' }
        ]
      });

      await router.navigateTo('crediti');

      expect(mockCredits.showCreditsMenu).toHaveBeenCalledWith('222', '1');
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
