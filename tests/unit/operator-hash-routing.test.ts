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
  mockInvoice,
  mockSummary,
  mockRefund
} = vi.hoisted(() => ({
  mockStore: {
    getUser: vi.fn(),
    setBusy: vi.fn()
  },
  mockApertura: { showAperturaForm: vi.fn() },
  mockClosure: { startClosureWizard: vi.fn() },
  mockPrezzi: { showPrezziEditForm: vi.fn() },
  mockCredits: { showCreditsMenu: vi.fn() },
  mockOutflow: { showOutflowMenu: vi.fn() },
  mockExtraIncome: { showExtraIncomeMenu: vi.fn() },
  mockVoucher: { showVoucherMenu: vi.fn() },
  mockInvoice: { showInvoiceMenu: vi.fn() },
  mockSummary: { showShiftSummary: vi.fn() },
  mockRefund: { showCustomerRefundForm: vi.fn() }
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
vi.mock('../../js/operator/summary.js', () => mockSummary);
vi.mock('../../js/operator/refund.js', () => mockRefund);

import { router, OPERATOR_VIEWS, isOperatorView } from '../../js/operator/router.js';

describe('Operator Hash Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState(null, '', '/');
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

  describe('isOperatorView', () => {
    it('accepts all valid operator views', () => {
      expect(isOperatorView('apertura')).toBe(true);
      expect(isOperatorView('chiusura')).toBe(true);
      expect(isOperatorView('prezzi')).toBe(true);
      expect(isOperatorView('crediti')).toBe(true);
      expect(isOperatorView('uscite')).toBe(true);
      expect(isOperatorView('incassi')).toBe(true);
      expect(isOperatorView('voucher')).toBe(true);
      expect(isOperatorView('fatture')).toBe(true);
      expect(isOperatorView('resoconto')).toBe(true);
    });

    it('rejects invalid views', () => {
      expect(isOperatorView('nonexistent')).toBe(false);
      expect(isOperatorView('admin')).toBe(false);
      expect(isOperatorView('')).toBe(false);
      expect(isOperatorView('APERTURA')).toBe(false);
    });
  });

  describe('OPERATOR_VIEWS whitelist', () => {
    it('contains all 10 operator views', () => {
      expect(OPERATOR_VIEWS).toHaveLength(10);
      expect(OPERATOR_VIEWS).toContain('apertura');
      expect(OPERATOR_VIEWS).toContain('chiusura');
      expect(OPERATOR_VIEWS).toContain('prezzi');
      expect(OPERATOR_VIEWS).toContain('crediti');
      expect(OPERATOR_VIEWS).toContain('uscite');
      expect(OPERATOR_VIEWS).toContain('incassi');
      expect(OPERATOR_VIEWS).toContain('voucher');
      expect(OPERATOR_VIEWS).toContain('fatture');
      expect(OPERATOR_VIEWS).toContain('resoconto');
      expect(OPERATOR_VIEWS).toContain('rimborso');
    });
  });

  describe('navigateTo hash integration', () => {
    it('writes hash to window.location.hash on successful navigation', async () => {
      await router.navigateTo('fatture');
      expect(window.location.hash).toBe('#/operator/fatture');
    });

    it('does not change hash when user context is missing', async () => {
      mockStore.getUser.mockReturnValue(null);
      await router.navigateTo('prezzi');
      expect(window.location.hash).toBe('');
    });

    it('does not change hash when station context is missing', async () => {
      mockStore.getUser.mockReturnValue({
        id: 'user-123',
        user_id: '1',
        station_id: undefined, // Missing station
        email: 'op@test.com',
        role: 'operator'
      });
      await router.navigateTo('crediti');
      expect(window.location.hash).toBe('');
    });

    it('writes correct hashes for all operator views', async () => {
      for (const view of OPERATOR_VIEWS) {
        window.history.pushState(null, '', '/');

        await router.navigateTo(view);
        expect(window.location.hash).toBe(`#/operator/${view}`);
      }
    });

    it('no-ops repeated navigations to the same view', async () => {
      await router.navigateTo('apertura');
      const pushStateSpy = vi.spyOn(window.history, 'pushState');
      await router.navigateTo('apertura');
      expect(pushStateSpy).not.toHaveBeenCalled();
      pushStateSpy.mockRestore();
    });
  });
});
