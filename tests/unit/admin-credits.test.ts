/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });

const { mockSupabase, mockHandleError, mockUI, mockUtils, mockSafeSupabaseQuery } = vi.hoisted(
  () => ({
    mockSupabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
        insert: mockInsert,
        update: vi.fn().mockResolvedValue({ data: null, error: null }),
        delete: vi.fn().mockResolvedValue({ data: null, error: null })
      }))
    },
    mockSafeSupabaseQuery: vi.fn(cb => cb()),
    mockHandleError: vi.fn(),
    mockUI: {
      showLoadingMessage: vi.fn(),
      openModal: vi.fn(),
      closeModal: vi.fn(),
      setButtonLoading: vi.fn(),
      openConfirmModal: vi.fn()
    },
    mockUtils: {
      formatEuro: vi.fn(val => `€${val.toFixed(2)}`)
    }
  })
);

vi.mock('../../js/core/api.js', () => ({
  supabase: mockSupabase,
  safeSupabaseQuery: mockSafeSupabaseQuery,
  Cache: {
    getOrFetch: vi.fn((key, fn) => fn()),
    invalidate: vi.fn(),
    invalidateByPrefix: vi.fn()
  },
  CACHE_KEYS: { CUSTOMERS: 'customers' }
}));

vi.mock('../../js/shared/error-handler.js', () => ({ handleError: mockHandleError }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: vi.fn() } }));
vi.mock('../../js/utils/utils.js', () => mockUtils);
vi.mock('../../js/utils/sanitizer.js', () => ({
  setSafeHTML: (el: HTMLElement, html: string) => {
    el.innerHTML = html;
  }
}));

import { showCreditiOverview } from '../../js/admin/credits.js';

describe('Admin Credits Module (#325)', () => {
  let container: HTMLElement;
  let actionsContainer: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    actionsContainer = document.createElement('div');
    document.body.replaceChildren(container, actionsContainer);

    const modalBody = document.createElement('div');
    modalBody.id = 'modal-body';
    document.body.appendChild(modalBody);
  });

  it('should render customer list overview and add customer button', async () => {
    await showCreditiOverview(container, actionsContainer, 1);

    expect(actionsContainer.querySelector('#add-customer-btn')).not.toBeNull();
  });

  it('should pass station_id to insert when creating a new customer with station context', async () => {
    await showCreditiOverview(container, actionsContainer, 42);

    const addBtn = actionsContainer.querySelector('#add-customer-btn') as HTMLButtonElement;
    addBtn.click();

    const modalBody = document.getElementById('modal-body')!;
    const form = modalBody.querySelector('#customer-form') as HTMLFormElement;
    expect(form).not.toBeNull();

    const nameInput = form.querySelector('input[name="cliente"]') as HTMLInputElement;
    const saldoInput = form.querySelector('input[name="saldo"]') as HTMLInputElement;

    nameInput.value = 'Nuova Azienda SRL';
    saldoInput.value = '150';

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockSupabase.from).toHaveBeenCalledWith('crediti_clienti');
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        cliente: 'Nuova Azienda SRL',
        saldo: 150,
        importo: 150,
        station_id: 42
      })
    ]);
  });
});
