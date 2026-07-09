import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUtils } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null })
    }
  },
  mockUI: {
    openModal: vi.fn(),
    closeModal: vi.fn(),
    showInfoModal: vi.fn(),
    showErrorMessage: vi.fn()
  },
  mockUtils: {
    escapeHtml: vi.fn(str => str),
    getErrorMessage: vi.fn(err => (err instanceof Error ? err.message : String(err)))
  }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/utils/utils.js', () => mockUtils);

import { showPrezziEditForm } from '../../js/operator/prices.js';

describe('Operator Prices Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });
    document.body.innerHTML = '<div id="modal-body"></div>';
  });

  it('should display price edit form', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 1,
          prezzo_benzina: 1.789,
          prezzo_gasolio: 1.549
        },
        error: null
      })
    });

    await showPrezziEditForm(123);

    expect(mockUI.openModal).toHaveBeenCalledWith('Modifica Prezzi');
    expect(document.getElementById('modal-body')?.innerHTML).toContain('1.789');
  });

  it('validates and submits parsed prices through the secure Edge Function', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    });

    await showPrezziEditForm(123);

    const form = document.getElementById('op-prezzi-form') as HTMLFormElement;
    (form.elements.namedItem('benzina') as HTMLInputElement).value = '1.789';
    (form.elements.namedItem('gasolio') as HTMLInputElement).value = '1.549';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('update-prices', {
      body: {
        station_id: 123,
        benzina: 1.789,
        gasolio: 1.549,
        validita: 'immediate'
      }
    });
  });

  it('blocks invalid prices before calling the Edge Function', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    });

    await showPrezziEditForm(123);

    const form = document.getElementById('op-prezzi-form') as HTMLFormElement;
    (form.elements.namedItem('benzina') as HTMLInputElement).value = '-1';
    (form.elements.namedItem('gasolio') as HTMLInputElement).value = '1.549';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
    expect(mockUI.showInfoModal).toHaveBeenCalledWith(expect.stringContaining('Prezzo non valido'));
  });

  it('should display 3 decimal precision inputs', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { prezzo_benzina: 1.549, prezzo_gasolio: 1.329 },
        error: null
      })
    });

    await showPrezziEditForm(123);

    const html = document.getElementById('modal-body')?.innerHTML || '';
    expect(html).toContain('step="0.001"');
  });
});
