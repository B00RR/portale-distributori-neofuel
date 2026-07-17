import { describe, it, expect, vi, beforeEach } from 'vitest';

// Global Vars for Mocks
let showOperatorsTab: any;
let deleteUser: any;
let openOperatorModal: any;
let openAssignStationModal: any;
let supabase: any;
let safeSupabaseQuery: any;
let Toast: any;
let UI: any;

// Builders
let usersBuilder: any;
let fuelStationsBuilder: any;
let userStationsBuilder: any;

describe('Operators Module', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML =
      '<div id="admin-content"></div>' +
      '<div id="header-actions"></div>' +
      '<div id="app-modal"><div id="modal-body"></div></div>';

    // Mocks setup
    usersBuilder = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    };

    fuelStationsBuilder = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null })
    };

    userStationsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    };

    vi.doMock('../../js/core/api.js', () => ({
      supabase: {
        from: vi.fn(table => {
          if (table === 'users') return usersBuilder;
          if (table === 'fuel_stations') return fuelStationsBuilder;
          if (table === 'user_stations') return userStationsBuilder;
          return { select: vi.fn() };
        }),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        functions: {
          invoke: vi.fn().mockResolvedValue({ data: { error: null }, error: null })
        }
      },
      safeSupabaseQuery: vi.fn(cb => cb()),
      Cache: {
        getOrFetch: vi.fn((key, fetchFn) => fetchFn()),
        invalidate: vi.fn(),
        invalidateByPrefix: vi.fn(),
        clear: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
        getStats: vi.fn(() => ({ total: 0, valid: 0, expired: 0 }))
      },
      CACHE_KEYS: {
        STATIONS: 'stations',
        CUSTOMERS: 'customers',
        FUEL_TYPES: 'fuel_types',
        STATION_PREFIX: 'station_'
      }
    }));

    vi.doMock('../../js/ui/ui.js', () => ({
      showLoadingMessage: vi.fn(),
      openModal: vi.fn(),
      closeModal: vi.fn(),
      setButtonLoading: vi.fn(),
      openConfirmModal: vi.fn().mockResolvedValue(true)
    }));

    vi.doMock('../../js/ui/toast.js', () => ({
      Toast: { show: vi.fn() }
    }));

    vi.doMock('../../js/utils/utils.js', async importOriginal => {
      const actual = await importOriginal();
      return { ...actual };
    });

    vi.doMock('../../js/core/schemas.js', () => ({
      CreateUserSchema: {},
      UpdateUserSchema: {},
      safeParse: vi
        .fn()
        .mockReturnValue({ success: true, data: { full_name: 'Test', role: 'operator' } })
    }));

    vi.doMock('../../js/shared/error-handler.js', () => ({
      handleError: vi.fn()
    }));

    // Import
    const OperatorsModule = await import('../../js/admin/operators.ts');
    showOperatorsTab = OperatorsModule.showOperatorsTab;
    deleteUser = OperatorsModule.deleteUser;
    openOperatorModal = OperatorsModule.openOperatorModal;
    openAssignStationModal = OperatorsModule.openAssignStationModal;

    const ApiModule = await import('../../js/core/api.js');
    supabase = ApiModule.supabase;
    safeSupabaseQuery = ApiModule.safeSupabaseQuery;

    const UIModule = await import('../../js/ui/ui.js');
    UI = UIModule;

    const ToastModule = await import('../../js/ui/toast.js');
    Toast = ToastModule.Toast;
  });

  it('should render operators list', async () => {
    const mockUsers = [
      {
        user_id: 'u1',
        full_name: 'Mario Rossi',
        email: 'mario@test.com',
        role: 'operator',
        created_at: '2023-01-01',
        user_stations: [
          {
            station_id: 1,
            fuel_stations: { station_name: 'Stazione 1' }
          }
        ]
      }
    ];

    usersBuilder.order.mockResolvedValue({ data: mockUsers, error: null });

    const container = document.getElementById('admin-content') as HTMLElement;
    const actions = document.getElementById('header-actions') as HTMLElement;

    await showOperatorsTab(container, actions);

    expect(container.innerHTML).toContain('Mario Rossi');
    expect(container.innerHTML).toContain('Stazione 1');
    expect(actions.innerHTML).toContain('Nuovo Operatore');
  });

  it('should handle Operator Creation (RPC via Edge Function)', async () => {
    // Mock import schema validation included in doMock

    await openOperatorModal();

    const form = document.getElementById('operator-form') as HTMLFormElement;
    expect(form).toBeTruthy();

    const nameInput = form.querySelector('input[name="full_name"]') as HTMLInputElement;
    nameInput.value = 'New User';

    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'admin_create_user_v2',
        expect.anything()
      );
      expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('creato'), 'success');
      expect(UI.closeModal).toHaveBeenCalled();
    });
  });

  it('should handle Operator Edit', async () => {
    const mockUser = {
      user_id: 'u1',
      full_name: 'Old Name',
      email: 'old@test.com',
      role: 'operator'
    };
    usersBuilder.single.mockResolvedValue({ data: mockUser, error: null });

    await openOperatorModal('u1');

    const form = document.getElementById('operator-form') as HTMLFormElement;
    const nameInput = form.querySelector('input[name="full_name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Old Name');

    // Simulating submit
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      // In edit mode it calls supabase.from('users').update
      expect(usersBuilder.update).toHaveBeenCalled();
      expect(Toast.show).not.toHaveBeenCalledWith(expect.stringContaining('creato'), 'success'); // Edit msg logic?
      // Actually code closes modal and dispatches event.
      expect(UI.closeModal).toHaveBeenCalled();
    });
  });

  it('should preserve full admin roles in the edit form', async () => {
    usersBuilder.single.mockResolvedValue({
      data: {
        user_id: 'u2',
        full_name: 'Full Admin',
        email: 'full-admin@test.com',
        role: 'full_admin'
      },
      error: null
    });

    await openOperatorModal('u2');

    const roleSelect = document.querySelector('select[name="role"]') as HTMLSelectElement;
    expect(roleSelect.value).toBe('full_admin');
    expect(roleSelect.querySelector('option[value="super_admin"]')).toBeTruthy();
  });

  it('should not close the modal when an operator update fails', async () => {
    const updateError = new Error('Update failed');
    usersBuilder.single.mockResolvedValue({
      data: { user_id: 'u1', full_name: 'Old Name', email: 'old@test.com', role: 'operator' },
      error: null
    });
    usersBuilder.update.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValue({ error: updateError })
    });
    const { handleError } = await import('../../js/shared/error-handler.js');

    await openOperatorModal('u1');
    const form = document.getElementById('operator-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(handleError).toHaveBeenCalledWith(updateError, 'saveOperator');
      expect(UI.closeModal).not.toHaveBeenCalled();
    });
  });

  it('should handle Delete Operator', async () => {
    const container = document.getElementById('admin-content') as HTMLElement;

    await deleteUser(1, container, null);

    await vi.waitFor(() => {
      expect(UI.openConfirmModal).toHaveBeenCalled();
      expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_user', { p_user_id: 1 });
      expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('eliminato'), 'success');
    });
  });

  it('should handle Assign Station', async () => {
    const mockStations = [{ station_id: 1, station_name: 'Station A' }];
    fuelStationsBuilder.order.mockResolvedValue({ data: mockStations, error: null });

    await openAssignStationModal(1);

    const form = document.getElementById('assign-station-form') as HTMLFormElement;
    const select = form.querySelector('select[name="station_id"]') as HTMLSelectElement;
    select.value = '1';

    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('admin_assign_station', {
        p_user_id: 1,
        p_station_id: 1
      });
      expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('salvata'), 'success');
    });
  });
});
