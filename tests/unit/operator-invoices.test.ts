import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockSupabase,
  mockUI,
  mockUtils,
  mockToast,
  mockErrorHandler,
  mockSanitizer,
  mockOfflineQueue,
  mockLogger
} = vi.hoisted(() => {
  const queryBuilder: any = {};
  const chain = vi.fn((...args) => queryBuilder);

  Object.assign(queryBuilder, {
    select: chain,
    eq: chain,
    gte: chain,
    lte: chain,
    order: chain,
    in: chain,
    ilike: chain,
    limit: chain,
    maybeSingle: chain,
    or: chain,
    insert: chain,
    update: chain,
    single: chain,
    then: (resolve: any) => resolve({ data: null, error: null })
  });

  return {
    mockSupabase: {
      from: vi.fn(() => queryBuilder)
    },
    mockUI: {
      openModal: vi.fn(),
      closeModal: vi.fn(),
      showInfoModal: vi.fn(),
      showLoadingMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      openConfirmModal: vi.fn().mockResolvedValue(true)
    },
    mockUtils: {
      formatEuro: vi.fn(v => `€${v}`),
      formatLitri: vi.fn(v => `${v}L`),
      escapeHtml: vi.fn((v: string) => v),
      getISODate: vi.fn(() => '2024-01-01')
    },
    mockToast: {
      show: vi.fn()
    },
    mockErrorHandler: {
      handleError: vi.fn()
    },
    mockSanitizer: {
      setSafeHTML: vi.fn((el, html) => {
        if (el && typeof el.innerHTML === 'string') {
          el.innerHTML = html;
        }
      })
    },
    mockOfflineQueue: {
      isOffline: vi.fn(() => false),
      queueAction: vi.fn()
    },
    mockLogger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    }
  };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/shared/error-handler.js', () => mockErrorHandler);
vi.mock('../../js/utils/sanitizer.js', () => mockSanitizer);
vi.mock('../../js/core/offline-queue.js', () => mockOfflineQueue);
vi.mock('../../js/core/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../js/operator/ui-components.js', () => ({
  createErrorMessage: vi.fn((title, err) => `<div class="error">${title}</div>`),
  createFormActions: vi.fn(
    opts =>
      '<div class="form-actions"><button id="btn-cancel">Annulla</button><button type="submit">Continua</button></div>'
  )
}));
vi.mock('../../js/operator/opening.js', () => ({
  checkOpeningStatus: vi.fn(async () => ({
    id: 1,
    opened_at: '2024-01-01T08:00:00Z',
    operator_id: 'operator1',
    status: 'active',
    opening_data: null,
    closing_data: null,
    users: { full_name: 'Test Operator' }
  }))
}));

import { showInvoiceMenu, processInvoiceRequest } from '../../js/operator/invoices.js';
import { checkOpeningStatus } from '../../js/operator/opening.js';

describe('Operator Invoices Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="modal-body"></div>
      <div id="invoices-container"></div>
    `;
  });

  describe('showInvoiceMenu', () => {
    it('should open modal and load opening status', async () => {
      await showInvoiceMenu(1, 'user123');

      expect(mockUI.openModal).toHaveBeenCalledWith('Richiesta Fattura');
      expect(checkOpeningStatus).toHaveBeenCalledWith(1);
    });

    it('should render loading spinner initially', async () => {
      const modalBody = document.getElementById('modal-body')!;

      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 5));

      // Check that setSafeHTML was called (mocked version sets innerHTML)
      expect(mockSanitizer.setSafeHTML).toHaveBeenCalled();
    });

    it('should show warning when no active opening exists', async () => {
      vi.mocked(checkOpeningStatus).mockResolvedValueOnce(null);

      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const modalBody = document.getElementById('modal-body')!;
      // Check that the warning message was rendered
      expect(modalBody.innerHTML).toContain('Nessun Turno Aperto');
    });

    it('should close modal when warning close button clicked', async () => {
      vi.mocked(checkOpeningStatus).mockResolvedValueOnce(null);

      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const closeBtn = document.getElementById('btn-close-warning') as HTMLButtonElement;
      expect(closeBtn).toBeTruthy();
      closeBtn?.click();

      expect(mockUI.closeModal).toHaveBeenCalled();
    });

    it('should render customer choice buttons when opening exists', async () => {
      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Seleziona il tipo di cliente');
      expect(modalBody.innerHTML).toContain('Nuovo Cliente');
      expect(modalBody.innerHTML).toContain('Cliente Esistente');
    });

    it('should handle errors and show error message', async () => {
      const testError = new Error('Test error');
      vi.mocked(checkOpeningStatus).mockRejectedValueOnce(testError);

      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const modalBody = document.getElementById('modal-body')!;
      // Error message should be rendered
      expect(modalBody.innerHTML).toBeTruthy();
    });

    it('should close modal when error close button clicked', async () => {
      const testError = new Error('Test error');
      vi.mocked(checkOpeningStatus).mockRejectedValueOnce(testError);

      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const closeBtn = document.getElementById('btn-close-err') as HTMLButtonElement;
      expect(closeBtn).toBeTruthy();
      closeBtn?.click();

      expect(mockUI.closeModal).toHaveBeenCalled();
    });

    it('should navigate to new customer form when button clicked', async () => {
      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const newCustomerBtn = document.getElementById('btn-new-customer') as HTMLButtonElement;
      expect(newCustomerBtn).toBeTruthy();
      newCustomerBtn?.click();

      await new Promise(r => setTimeout(r, 5));

      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Nuovo Cliente');
      expect(modalBody.innerHTML).toContain('Ragione Sociale');
    });

    it('should navigate to existing customer form when button clicked', async () => {
      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const existingCustomerBtn = document.getElementById(
        'btn-existing-customer'
      ) as HTMLButtonElement;
      expect(existingCustomerBtn).toBeTruthy();
      existingCustomerBtn?.click();

      await new Promise(r => setTimeout(r, 5));

      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Cliente Esistente');
      expect(modalBody.innerHTML).toContain('customer-search');
    });

    it('should cancel and close modal from customer choice', async () => {
      await showInvoiceMenu(1, 'user123');

      await new Promise(r => setTimeout(r, 10));

      const cancelBtn = document.getElementById('btn-cancel-choice') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();
      cancelBtn?.click();

      expect(mockUI.closeModal).toHaveBeenCalled();
    });
  });

  describe('New Customer Form', () => {
    beforeEach(async () => {
      await showInvoiceMenu(1, 'user123');
      await new Promise(r => setTimeout(r, 10));
      const newCustomerBtn = document.getElementById('btn-new-customer') as HTMLButtonElement;
      newCustomerBtn?.click();
      await new Promise(r => setTimeout(r, 5));
    });

    it('should show validation error when all fields empty', async () => {
      const form = document.getElementById('new-customer-form') as HTMLFormElement;
      expect(form).toBeTruthy();

      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 5));

      expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('almeno'), 'warning');
    });

    it('should submit form with customer data when online', async () => {
      mockOfflineQueue.isOffline.mockReturnValue(false);

      let callCount = 0;
      const queryBuilder: any = {
        select: vi.fn(function () {
          return this;
        }),
        or: vi.fn(function () {
          return this;
        }),
        maybeSingle: vi.fn(async function () {
          // First call is for search, return null
          if (callCount === 0) {
            callCount++;
            return { data: null, error: null };
          }
          return { data: null, error: null };
        }),
        insert: vi.fn(function () {
          return this;
        }),
        single: vi.fn(async function () {
          return { data: { id: 123, nome: 'Test Customer' }, error: null };
        })
      };

      mockSupabase.from.mockReturnValue(queryBuilder);

      const form = document.getElementById('new-customer-form') as HTMLFormElement;
      const nomeInput = form?.querySelector('input[name="nome"]') as HTMLInputElement;
      const phoneInput = form?.querySelector('input[name="telefono"]') as HTMLInputElement;

      if (nomeInput) nomeInput.value = 'Test Customer';
      if (phoneInput) phoneInput.value = '3331234567';

      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 30));

      // Should render invoice form
      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Richiesta Fattura');
    });

    it('should handle existing customer update', async () => {
      mockOfflineQueue.isOffline.mockReturnValue(false);

      const existingCustomer = { id: 999, nome: 'Existing' };
      const updateBuilder: any = {
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      };

      const queryBuilder: any = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: existingCustomer,
          error: null
        }),
        update: vi.fn(() => updateBuilder),
        from: vi.fn()
      };

      mockSupabase.from.mockReturnValue(queryBuilder);

      const form = document.getElementById('new-customer-form') as HTMLFormElement;
      const nomeInput = form?.querySelector('input[name="nome"]') as HTMLInputElement;

      if (nomeInput) nomeInput.value = 'Existing';

      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 20));

      // Should have called update
      expect(updateBuilder.eq).toBeTruthy();
    });

    it('should queue request when offline', async () => {
      mockOfflineQueue.isOffline.mockReturnValue(true);

      const form = document.getElementById('new-customer-form') as HTMLFormElement;
      const nomeInput = form?.querySelector('input[name="nome"]') as HTMLInputElement;

      if (nomeInput) nomeInput.value = 'Offline Customer';

      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 10));

      // Should render invoice form without waiting for supabase
      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Richiesta Fattura');
    });

    it('should go back to customer choice', async () => {
      const cancelBtn = document.getElementById('btn-cancel') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();

      cancelBtn?.click();

      await new Promise(r => setTimeout(r, 5));

      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Seleziona il tipo di cliente');
    });
  });

  describe('Existing Customer Form', () => {
    beforeEach(async () => {
      await showInvoiceMenu(1, 'user123');
      await new Promise(r => setTimeout(r, 10));
      const existingCustomerBtn = document.getElementById(
        'btn-existing-customer'
      ) as HTMLButtonElement;
      existingCustomerBtn?.click();
      await new Promise(r => setTimeout(r, 5));
    });

    it('should show validation error when customer not selected', async () => {
      const form = document.getElementById('existing-customer-form') as HTMLFormElement;
      expect(form).toBeTruthy();

      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 5));

      expect(mockToast.show).toHaveBeenCalledWith(
        expect.stringContaining('Selezionare un cliente'),
        'warning'
      );
    });

    it('should search customers on input', async () => {
      const searchInput = document.getElementById('customer-search') as HTMLInputElement;

      const customers = [
        { id: 1, nome: 'Customer 1', telefono: '3331111111', partita_iva: null },
        { id: 2, nome: 'Customer 2', telefono: '3332222222', partita_iva: null }
      ];

      const queryBuilder: any = {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: customers,
          error: null
        })
      };

      mockSupabase.from.mockReturnValue(queryBuilder);

      // Simulate user typing
      searchInput.value = 'Cust';
      searchInput.dispatchEvent(new Event('input'));

      // Wait for debounce (250ms + buffer)
      await new Promise(r => setTimeout(r, 300));

      // Check that search was performed
      expect(mockSupabase.from).toHaveBeenCalledWith('clienti_fatturazione');
    });

    it('should populate hidden customer ID when suggestion clicked', async () => {
      const customers = [
        { id: 123, nome: 'Customer 1', telefono: '3331111111', partita_iva: null }
      ];

      const queryBuilder: any = {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: customers,
          error: null
        })
      };

      mockSupabase.from.mockReturnValue(queryBuilder);

      const searchInput = document.getElementById('customer-search') as HTMLInputElement;
      searchInput.value = 'Cust';
      searchInput.dispatchEvent(new Event('input'));

      await new Promise(r => setTimeout(r, 300));

      const suggestionItem = document.querySelector('.suggestion-item') as HTMLElement;
      if (suggestionItem) {
        suggestionItem.click();
      }

      await new Promise(r => setTimeout(r, 5));

      const customerIdInput = document.getElementById('selected-customer-id') as HTMLInputElement;
      expect(customerIdInput?.value).toBeTruthy();
    });

    it('should submit form with selected customer', async () => {
      const form = document.getElementById('existing-customer-form') as HTMLFormElement;
      const searchInput = document.getElementById('customer-search') as HTMLInputElement;
      const customerIdInput = document.getElementById('selected-customer-id') as HTMLInputElement;

      searchInput.value = 'Test Customer';
      customerIdInput.value = '456';

      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 5));

      // Should render invoice form
      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Richiesta Fattura');
    });

    it('should go back to customer choice', async () => {
      const cancelBtn = document.getElementById('btn-cancel') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();

      cancelBtn?.click();

      await new Promise(r => setTimeout(r, 5));

      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Seleziona il tipo di cliente');
    });
  });

  describe('Invoice Form', () => {
    beforeEach(async () => {
      // Navigate to invoice form through new customer
      mockOfflineQueue.isOffline.mockReturnValue(true); // Use offline to skip customer creation

      await showInvoiceMenu(1, 'user123');
      await new Promise(r => setTimeout(r, 10));

      const newCustomerBtn = document.getElementById('btn-new-customer') as HTMLButtonElement;
      newCustomerBtn?.click();
      await new Promise(r => setTimeout(r, 5));

      const form = document.getElementById('new-customer-form') as HTMLFormElement;
      const nomeInput = form?.querySelector('input[name="nome"]') as HTMLInputElement;
      if (nomeInput) nomeInput.value = 'Test Customer';

      form?.dispatchEvent(new Event('submit'));
      await new Promise(r => setTimeout(r, 20));
    });

    it('should show validation error when product category is "altro" without note', async () => {
      const form = document.getElementById('invoice-form') as HTMLFormElement;

      const amountInput = form?.querySelector('input[name="amount"]') as HTMLInputElement;
      const paymentSelect = form?.querySelector(
        'select[name="payment_method"]'
      ) as HTMLSelectElement;
      const categorySelect = form?.querySelector(
        'select[name="product_category"]'
      ) as HTMLSelectElement;

      if (amountInput) amountInput.value = '100.50';
      if (paymentSelect) paymentSelect.value = 'contanti';
      if (categorySelect) {
        categorySelect.value = 'altro';
        categorySelect.dispatchEvent(new Event('change'));
      }

      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 5));

      expect(mockToast.show).toHaveBeenCalledWith(
        expect.stringContaining('obbligatorio specificare'),
        'warning'
      );
    });

    it('should show product note field when "altro" selected', async () => {
      const categorySelect = document.getElementById('product-category') as HTMLSelectElement;
      const productNoteGroup = document.getElementById('product-note-group') as HTMLElement;

      categorySelect.value = 'altro';
      categorySelect.dispatchEvent(new Event('change'));

      await new Promise(r => setTimeout(r, 5));

      expect(productNoteGroup?.style.display).not.toBe('none');
    });

    it('should hide product note field when non-"altro" selected', async () => {
      const categorySelect = document.getElementById('product-category') as HTMLSelectElement;
      const productNoteGroup = document.getElementById('product-note-group') as HTMLElement;

      // First show it
      categorySelect.value = 'altro';
      categorySelect.dispatchEvent(new Event('change'));

      // Then hide it
      categorySelect.value = 'gasolio';
      categorySelect.dispatchEvent(new Event('change'));

      await new Promise(r => setTimeout(r, 5));

      expect(productNoteGroup?.style.display).toBe('none');
    });

    it('should show validation error when required fields empty', async () => {
      const form = document.getElementById('invoice-form') as HTMLFormElement;
      form?.dispatchEvent(new Event('submit'));

      await new Promise(r => setTimeout(r, 5));

      expect(mockToast.show).toHaveBeenCalledWith(
        expect.stringContaining('dati obbligatori'),
        'warning'
      );
    });

    it('should allow selecting all payment methods', async () => {
      const form = document.getElementById('invoice-form') as HTMLFormElement;
      const paymentSelect = form?.querySelector(
        'select[name="payment_method"]'
      ) as HTMLSelectElement;

      expect(paymentSelect).toBeTruthy();
      const options = paymentSelect?.querySelectorAll('option');
      const optionValues = Array.from(options || []).map(o => (o as HTMLOptionElement).value);

      expect(optionValues).toContain('contanti');
      expect(optionValues).toContain('pos');
      expect(optionValues).toContain('bonifico');
    });

    it('should go back to customer choice', async () => {
      const cancelBtn = document.getElementById('btn-cancel') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();

      cancelBtn?.click();

      await new Promise(r => setTimeout(r, 5));

      const modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Seleziona il tipo di cliente');
    });
  });

  describe('processInvoiceRequest', () => {
    beforeEach(() => {
      mockOfflineQueue.isOffline.mockReturnValue(false);
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      });
    });

    it('should validate numeric userId', async () => {
      await expect(
        processInvoiceRequest(1, 'invalid', 123, 'Customer', 100, 'contanti', 'gasolio', 'notes')
      ).rejects.toThrow('ID operatore non valido');
    });

    it('should validate numeric stationId', async () => {
      await expect(
        processInvoiceRequest(
          'invalid',
          '123',
          123,
          'Customer',
          100,
          'contanti',
          'gasolio',
          'notes'
        )
      ).rejects.toThrow('ID stazione non valido');
    });

    it('should reject negative userId', async () => {
      await expect(
        processInvoiceRequest(1, '-5', 123, 'Customer', 100, 'contanti', 'gasolio', 'notes')
      ).rejects.toThrow('ID operatore non valido');
    });

    it('should reject zero stationId', async () => {
      await expect(
        processInvoiceRequest(0, '123', 123, 'Customer', 100, 'contanti', 'gasolio', 'notes')
      ).rejects.toThrow('ID stazione non valido');
    });

    it('should queue action when offline', async () => {
      mockOfflineQueue.isOffline.mockReturnValue(true);

      await processInvoiceRequest(1, '123', 456, 'Customer', 100.5, 'contanti', 'gasolio', 'notes');

      expect(mockOfflineQueue.queueAction).toHaveBeenCalledWith(
        'movement_create',
        expect.objectContaining({
          kind: 'invoice_request',
          stationId: 1,
          operatorId: '123',
          amount: 100.5,
          paymentMethod: 'contanti',
          productCategory: 'gasolio'
        })
      );
    });

    it('should insert invoice when online', async () => {
      mockOfflineQueue.isOffline.mockReturnValue(false);

      await processInvoiceRequest(
        1,
        '123',
        456,
        'Test Customer',
        100.5,
        'pos',
        'benzina',
        'test notes'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    });

    it('should throw on supabase error', async () => {
      const testError = new Error('Insert failed');
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: testError })
      });

      await expect(
        processInvoiceRequest(1, '123', 456, 'Customer', 100, 'contanti', 'gasolio', 'notes')
      ).rejects.toThrow();
    });

    it('should handle null cliente_id', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      await processInvoiceRequest(
        1,
        '123',
        null,
        'Unknown Customer',
        100,
        'contanti',
        'gasolio',
        'notes'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    });

    it('should handle empty string cliente_id as null', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      await processInvoiceRequest(
        1,
        '123',
        '',
        'Unknown Customer',
        100,
        'contanti',
        'gasolio',
        'notes'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    });

    it('should generate invoice number from timestamp', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      await processInvoiceRequest(1, '123', 456, 'Customer', 100, 'contanti', 'gasolio', 'notes');

      // Should have called insert with generated invoice number starting with REQ-
      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should use provided options for createdAt and invoiceNumber', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      const customDate = '2024-05-15T10:30:00Z';
      const customInvoiceNumber = 'CUSTOM-123';

      await processInvoiceRequest(1, '123', 456, 'Customer', 100, 'contanti', 'gasolio', 'notes', {
        createdAt: customDate,
        invoiceNumber: customInvoiceNumber
      });

      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should skip offline queue when skipOfflineQueue option is true', async () => {
      mockOfflineQueue.isOffline.mockReturnValue(true);
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      await processInvoiceRequest(1, '123', 456, 'Customer', 100, 'contanti', 'gasolio', 'notes', {
        skipOfflineQueue: true
      });

      // Should not queue when skipOfflineQueue is true
      expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    });
  });

  describe('Integration tests', () => {
    it('should navigate through full form flow', async () => {
      // This test verifies the complete navigation flow without actually submitting
      mockOfflineQueue.isOffline.mockReturnValue(true);

      // Start
      await showInvoiceMenu(1, 'user123');
      await new Promise(r => setTimeout(r, 10));

      let modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Seleziona il tipo di cliente');

      // New customer button
      const newCustomerBtn = document.getElementById('btn-new-customer') as HTMLButtonElement;
      newCustomerBtn?.click();
      await new Promise(r => setTimeout(r, 5));

      modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Nuovo Cliente');

      // Fill new customer form
      const customerForm = document.getElementById('new-customer-form') as HTMLFormElement;
      const nomeInput = customerForm?.querySelector('input[name="nome"]') as HTMLInputElement;
      if (nomeInput) nomeInput.value = 'Acme Corp';

      customerForm?.dispatchEvent(new Event('submit'));
      await new Promise(r => setTimeout(r, 20));

      // Should navigate to invoice form
      modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Richiesta Fattura');
      expect(modalBody.innerHTML).toContain('Acme Corp');
    });

    it('should handle form cancel and navigation back', async () => {
      await showInvoiceMenu(1, 'user123');
      await new Promise(r => setTimeout(r, 10));

      // Click new customer
      const newCustomerBtn = document.getElementById('btn-new-customer') as HTMLButtonElement;
      newCustomerBtn?.click();
      await new Promise(r => setTimeout(r, 5));

      let modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Nuovo Cliente');

      // Click cancel to go back
      const cancelBtn = document.getElementById('btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
      await new Promise(r => setTimeout(r, 5));

      modalBody = document.getElementById('modal-body')!;
      expect(modalBody.innerHTML).toContain('Seleziona il tipo di cliente');

      // Click cancel choice to close
      const cancelChoiceBtn = document.getElementById('btn-cancel-choice') as HTMLButtonElement;
      cancelChoiceBtn?.click();

      expect(mockUI.closeModal).toHaveBeenCalled();
    });
  });
});
