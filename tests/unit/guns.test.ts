import { describe, it, expect, vi, beforeEach } from 'vitest';

// Dynamic import variables
let showGunsModal: any;
let supabase: any;
let safeSupabaseQuery: any;
let pistoleBuilder: any;
let countersBuilder: any;
let deleteEqMock: any;
let updateEqMock: any;
let UI: any;
let Toast: any;

describe('Guns Module', () => {
  beforeEach(async () => {
    vi.resetModules(); // Clear cache

    // Setup DOM
    document.body.innerHTML = '<div id="app-modal"><div id="modal-body"></div></div>';

    // Setup Mocks via doMock
    deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    updateEqMock = vi.fn().mockResolvedValue({ error: null });

    pistoleBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnValue({ eq: deleteEqMock }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnValue({ eq: updateEqMock })
    };
    // Default order response
    pistoleBuilder.order.mockResolvedValue({ data: [], error: null });

    const shiftsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null })
    };

    countersBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ error: null })
      })
    };

    vi.doMock('../../js/core/api.js', () => ({
      supabase: {
        from: vi.fn(table => {
          if (table === 'pistole') return pistoleBuilder;
          if (table === 'shift_pistols') return countersBuilder;
          if (table === 'shifts') return shiftsBuilder;
          return pistoleBuilder;
        })
      },
      safeSupabaseQuery: vi.fn(cb => cb())
    }));

    vi.doMock('../../js/ui/toast.js', () => ({
      Toast: { show: vi.fn() }
    }));

    const uiMock = {
      openModal: vi.fn(),
      closeModal: vi.fn(),
      showInfoModal: vi.fn(),
      openConfirmModal: vi.fn().mockReturnValue(Promise.resolve(true)),
      showLoadingMessage: vi.fn()
    };

    vi.doMock('../../js/ui/ui.js', () => uiMock);
    vi.doMock('../../js/ui/ui.ts', () => uiMock);

    vi.doMock('../../js/utils/utils.js', async importOriginal => {
      const actual = await importOriginal();
      return { ...actual };
    });

    // Import modules
    const GunsModule = await import('../../js/admin/guns.ts');
    showGunsModal = GunsModule.showGunsModal;

    const ApiModule = await import('../../js/core/api.js');
    supabase = ApiModule.supabase;
    safeSupabaseQuery = ApiModule.safeSupabaseQuery;

    const UIModule = await import('../../js/ui/ui.js');
    UI = UIModule;

    const ToastModule = await import('../../js/ui/toast.js');
    Toast = ToastModule.Toast;

    vi.clearAllMocks();
  });

  it('should fetch and render specific guns for island', async () => {
    const mockGuns = [
      { id: 1, nome: 'Pistola 1', tipo_carburante: 'benzina', numero_litri: 100, island_id: 1 }
    ];
    pistoleBuilder.order.mockResolvedValue({ data: mockGuns, error: null });

    await showGunsModal(1, 'Isola Test', 100);

    const modalBody = document.getElementById('modal-body');
    expect(UI.openModal).toHaveBeenCalledWith('Pistole - Isola Test');
    expect(modalBody?.innerHTML).toContain('Pistola 1');
  });

  it('should handle empty state', async () => {
    pistoleBuilder.order.mockResolvedValue({ data: [], error: null });

    await showGunsModal(1, 'Isola Empty', 100);
    const modalBody = document.getElementById('modal-body');
    expect(modalBody?.innerHTML).toContain('Nessuna pistola configurata');
  });

  it('should handle fetch errors', async () => {
    // Mock safeSupabaseQuery to throw or internal call to throw (but showGunsModal uses raw supabase call)
    // guns.ts: const { data: rawGuns, error } = await supabase...
    // We need 'error' to be returned.
    pistoleBuilder.order.mockResolvedValue({ data: null, error: { message: 'Database Error' } });

    await showGunsModal(1, 'Isola Error', 100);
    const modalBody = document.getElementById('modal-body');
    expect(modalBody?.innerHTML).toContain('Errore: Database Error');
  });

  it('should open Add Gun form on button click', async () => {
    pistoleBuilder.order.mockResolvedValue({ data: [], error: null });
    pistoleBuilder.insert.mockResolvedValue({ data: null, error: null });

    await showGunsModal(1, 'Isola Test', 100);

    const addBtn = document.getElementById('add-gun-btn');
    expect(addBtn).toBeTruthy();
    addBtn?.click();

    expect(UI.openModal).toHaveBeenCalledWith('Nuova Pistola');

    // Simulate Submit
    const form = document.getElementById('gun-form') as HTMLFormElement;
    const nameInput = form.querySelector('input[name="nome"]') as HTMLInputElement;
    nameInput.value = 'Nuova Pistola X';

    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(pistoleBuilder.insert).toHaveBeenCalled();
      expect(UI.showInfoModal).toHaveBeenCalledWith('Pistola creata con successo!');
    });
  });

  it('should handle deleting a gun', async () => {
    const mockGuns = [
      { id: 99, nome: 'To Delete', tipo_carburante: 'benzina', numero_litri: 0, island_id: 1 }
    ];
    pistoleBuilder.order.mockResolvedValue({ data: mockGuns, error: null });

    await showGunsModal(1, 'Isola Test', 100);

    const deleteBtn = document.querySelector('.delete-gun') as HTMLButtonElement;
    deleteBtn.click();

    await vi.waitFor(() => {
      expect(UI.openConfirmModal).toHaveBeenCalled();
      expect(pistoleBuilder.delete).toHaveBeenCalled();
      expect(deleteEqMock).toHaveBeenCalledWith('id', 99);
    });
  });

  it('should preserve historical counters when correcting the current counter', async () => {
    pistoleBuilder.order.mockResolvedValue({
      data: [
        {
          id: 7,
          nome: 'Pistola 7',
          tipo_carburante: 'gasolio',
          numero_litri: 100,
          island_id: 1
        }
      ],
      error: null
    });

    await showGunsModal(1, 'Isola Test', 100);
    (document.querySelector('.edit-counter') as HTMLButtonElement).click();

    const form = document.getElementById('counter-form') as HTMLFormElement;
    const counterInput = form.querySelector('input[name="numero_litri"]') as HTMLInputElement;
    counterInput.value = '123,45';
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(pistoleBuilder.update).toHaveBeenCalledWith({ numero_litri: 123.45 });
      expect(updateEqMock).toHaveBeenCalledWith('id', 7);
    });
    expect(countersBuilder.select).not.toHaveBeenCalled();
  });

  it('should refuse to delete a gun referenced by historical closures', async () => {
    pistoleBuilder.order.mockResolvedValue({
      data: [
        {
          id: 8,
          nome: 'Storica',
          tipo_carburante: 'benzina',
          numero_litri: 10,
          island_id: 1
        }
      ],
      error: null
    });
    countersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: 50 }, error: null });

    await showGunsModal(1, 'Isola Test', 100);
    (document.querySelector('.delete-gun') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(UI.showInfoModal).toHaveBeenCalledWith(expect.stringContaining('storico'));
    });
    expect(pistoleBuilder.delete).not.toHaveBeenCalled();
  });
});
