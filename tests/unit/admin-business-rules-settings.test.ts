/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showBusinessRulesSettings } from '../../js/admin/business-rules-settings.js';

// Setup hoisted mocks
const { mockBusinessLogic, mockStore, mockToast } = vi.hoisted(() => {
  return {
    mockBusinessLogic: {
      loadRules: vi.fn(),
      saveRules: vi.fn()
    },
    mockStore: {
      getUser: vi.fn()
    },
    mockToast: {
      show: vi.fn()
    }
  };
});

vi.mock('../../js/core/business-logic-manager.js', () => ({
  BusinessLogicManager: mockBusinessLogic
}));

vi.mock('../../js/shared/state.js', () => ({
  store: mockStore
}));

vi.mock('../../js/ui/toast.js', () => ({
  Toast: mockToast
}));

describe('Business Rules Settings Component', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    vi.clearAllMocks();

    // Default mock behavior
    mockStore.getUser.mockReturnValue({
      role: 'admin',
      full_name: 'Test Admin',
      email: 'admin@neofuel.it'
    });

    mockBusinessLogic.loadRules.mockResolvedValue({
      cash_error_threshold: 10,
      max_price_limit: 2.5,
      fuel_reserve_alert_liters: 2000,
      force_close_hours_threshold: 24,
      notifications_enabled: true,
      critical_discrepancy_alert: 50,
      last_updated_by: 'Test Admin',
      updated_at: '2026-07-03T12:00:00.000Z'
    });

    mockBusinessLogic.saveRules.mockResolvedValue(undefined);
  });

  it('should block access if not full admin', async () => {
    mockStore.getUser.mockReturnValue({
      role: 'operator',
      full_name: 'Test Operator',
      email: 'operator@neofuel.it'
    });

    await showBusinessRulesSettings(container);

    expect(container.textContent).toContain('Accesso Negato');
    expect(container.querySelector('#business-rules-form')).toBeNull();
    expect(mockBusinessLogic.loadRules).not.toHaveBeenCalled();
  });

  it('should render form with business rules settings when user is admin', async () => {
    await showBusinessRulesSettings(container);

    expect(container.querySelector('#business-rules-form')).toBeTruthy();

    const cashInput = container.querySelector('input[name="cash_error_threshold"]') as HTMLInputElement;
    const priceInput = container.querySelector('input[name="max_price_limit"]') as HTMLInputElement;
    const reserveInput = container.querySelector('input[name="fuel_reserve_alert_liters"]') as HTMLInputElement;
    const closeHoursInput = container.querySelector('input[name="force_close_hours_threshold"]') as HTMLInputElement;
    const discrepancyInput = container.querySelector('input[name="critical_discrepancy_alert"]') as HTMLInputElement;
    const notificationsCheckbox = container.querySelector('input[name="notifications_enabled"]') as HTMLInputElement;
    const updatedByInput = container.querySelector('input[name="last_updated_by"]') as HTMLInputElement;
    const updatedAtInput = container.querySelector('input[name="updated_at"]') as HTMLInputElement;

    expect(cashInput).toBeTruthy();
    expect(cashInput.value).toBe('10');

    expect(priceInput).toBeTruthy();
    expect(priceInput.value).toBe('2.5');

    expect(reserveInput).toBeTruthy();
    expect(reserveInput.value).toBe('2000');

    expect(closeHoursInput).toBeTruthy();
    expect(closeHoursInput.value).toBe('24');

    expect(discrepancyInput).toBeTruthy();
    expect(discrepancyInput.value).toBe('50');

    expect(notificationsCheckbox).toBeTruthy();
    expect(notificationsCheckbox.checked).toBe(true);

    expect(updatedByInput).toBeTruthy();
    expect(updatedByInput.value).toBe('Test Admin');
    expect(updatedByInput.readOnly).toBe(true);

    expect(updatedAtInput).toBeTruthy();
    expect(updatedAtInput.readOnly).toBe(true);
  });

  it('should show validation warnings and not call saveRules on invalid inputs', async () => {
    await showBusinessRulesSettings(container);

    const form = container.querySelector('#business-rules-form') as HTMLFormElement;
    const cashInput = container.querySelector('input[name="cash_error_threshold"]') as HTMLInputElement;

    // Set invalid value for cash threshold (>1000)
    cashInput.value = '1500';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(mockToast.show).toHaveBeenCalledWith(
      'La tolleranza errore cassa deve essere compresa tra 0 e 1000 €.',
      'warning'
    );
    expect(mockBusinessLogic.saveRules).not.toHaveBeenCalled();
  });

  it('should show validation warnings on invalid max price limit input', async () => {
    await showBusinessRulesSettings(container);

    const form = container.querySelector('#business-rules-form') as HTMLFormElement;
    const priceInput = container.querySelector('input[name="max_price_limit"]') as HTMLInputElement;

    // Set invalid value for price limit (>5)
    priceInput.value = '6.5';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(mockToast.show).toHaveBeenCalledWith(
      'Il tetto massimo prezzo deve essere compreso tra 0 e 5 €/L.',
      'warning'
    );
    expect(mockBusinessLogic.saveRules).not.toHaveBeenCalled();
  });

  it('should call saveRules when form is submitted with valid inputs', async () => {
    await showBusinessRulesSettings(container);

    const form = container.querySelector('#business-rules-form') as HTMLFormElement;
    const cashInput = container.querySelector('input[name="cash_error_threshold"]') as HTMLInputElement;
    const priceInput = container.querySelector('input[name="max_price_limit"]') as HTMLInputElement;
    const notificationsCheckbox = container.querySelector('input[name="notifications_enabled"]') as HTMLInputElement;

    cashInput.value = '25.5';
    priceInput.value = '2.1';
    notificationsCheckbox.checked = false;

    // Spy loadRules to return updated metadata values when it is called after saving
    mockBusinessLogic.loadRules.mockResolvedValue({
      cash_error_threshold: 25.5,
      max_price_limit: 2.1,
      fuel_reserve_alert_liters: 2000,
      force_close_hours_threshold: 24,
      notifications_enabled: false,
      critical_discrepancy_alert: 50,
      last_updated_by: 'Test Admin',
      updated_at: '2026-07-03T15:30:00.000Z'
    });

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockBusinessLogic.saveRules).toHaveBeenCalledWith({
      cash_error_threshold: 25.5,
      max_price_limit: 2.1,
      fuel_reserve_alert_liters: 2000,
      force_close_hours_threshold: 24,
      critical_discrepancy_alert: 50,
      notifications_enabled: false,
      last_updated_by: 'Test Admin'
    });
  });
});
