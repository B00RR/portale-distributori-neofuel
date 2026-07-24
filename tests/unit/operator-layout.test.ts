import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStore,
  mockGetStationName,
  mockGetPendingCount,
  mockGetFailedCount,
  mockCheckOpeningStatus
} = vi.hoisted(() => ({
  mockStore: {
    getUser: vi.fn(),
    setUser: vi.fn()
  },
  mockGetStationName: vi.fn(),
  mockGetPendingCount: vi.fn(),
  mockGetFailedCount: vi.fn(),
  mockCheckOpeningStatus: vi.fn()
}));

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));
vi.mock('../../js/core/api.js', () => ({
  getStationName: mockGetStationName,
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    }))
  }
}));
vi.mock('../../js/core/auth.js', () => ({ clearSession: vi.fn() }));
vi.mock('../../js/core/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));
vi.mock('../../js/core/offline-queue.js', () => ({
  getPendingCount: mockGetPendingCount,
  getFailedCount: mockGetFailedCount
}));
vi.mock('../../js/ui/ui.js', () => ({ openConfirmModal: vi.fn() }));
vi.mock('../../js/operator/opening.js', () => ({
  checkOpeningStatus: mockCheckOpeningStatus
}));

import { renderOperatorShell } from '../../js/operator/layout.js';

describe('Operator Layout Module', () => {
  const handlers = {
    onNavigate: vi.fn(),
    onOpening: vi.fn(),
    onClosure: vi.fn(),
    onStationChange: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<main id="main-content"></main>';
    mockGetStationName.mockResolvedValue('Roma');
    mockGetPendingCount.mockResolvedValue(0);
    mockGetFailedCount.mockResolvedValue(0);
    mockCheckOpeningStatus.mockResolvedValue(null);
    localStorage.clear();
  });

  it('does not render a station selector for one assigned station', async () => {
    mockStore.getUser.mockReturnValue({
      id: 'auth-user',
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      station_id: '1',
      assignedStations: [{ id: 1, name: 'Roma' }]
    });
    const container = document.getElementById('main-content') as HTMLElement;

    await renderOperatorShell(container, handlers);

    expect(container.querySelector('#operator-station-select')).toBeNull();
  });

  it('exposes ARIA state for the movements accordion', async () => {
    mockStore.getUser.mockReturnValue({
      id: 'auth-user',
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      station_id: '1',
      assignedStations: [{ id: 1, name: 'Roma' }]
    });
    const container = document.getElementById('main-content') as HTMLElement;

    await renderOperatorShell(container, handlers);

    const trigger = container.querySelector('#btn-movimenti') as HTMLButtonElement;
    const panel = container.querySelector('#movimenti-content') as HTMLElement;
    expect(trigger.getAttribute('aria-controls')).toBe('movimenti-content');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');

    trigger.click();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
  });

  it('renders a station selector for multiple stations and persists changes', async () => {
    const user = {
      id: 'auth-user',
      user_id: '10',
      email: 'op@test.com',
      role: 'operator' as const,
      station_id: '1',
      assignedStations: [
        { id: 1, name: 'Roma' },
        { id: 2, name: 'Milano' }
      ]
    };
    mockStore.getUser.mockReturnValue(user);
    const container = document.getElementById('main-content') as HTMLElement;

    await renderOperatorShell(container, handlers);

    const selector = container.querySelector('#operator-station-select') as HTMLSelectElement;
    expect(selector).toBeInstanceOf(HTMLSelectElement);
    expect(selector.value).toBe('1');
    expect([...selector.options].map(option => option.textContent)).toEqual(['Roma', 'Milano']);

    selector.value = '2';
    selector.dispatchEvent(new Event('change'));

    expect(mockStore.setUser).toHaveBeenCalledWith({ ...user, station_id: '2' });
    expect(localStorage.getItem('operator_selected_station:10')).toBe('2');
    expect(handlers.onStationChange).toHaveBeenCalledWith('2');
  });

  it('renders the offline actions button and reflects failed count', async () => {
    mockStore.getUser.mockReturnValue({
      id: 'auth-user',
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      station_id: '1',
      assignedStations: [{ id: 1, name: 'Roma' }]
    });
    mockGetPendingCount.mockResolvedValue(2);
    mockGetFailedCount.mockResolvedValue(1);
    const container = document.getElementById('main-content') as HTMLElement;

    await renderOperatorShell(container, handlers);
    await new Promise(resolve => setTimeout(resolve, 0));

    const offlineBtn = container.querySelector('#op-offline-btn') as HTMLButtonElement;
    expect(offlineBtn).toBeInstanceOf(HTMLButtonElement);
    expect(offlineBtn.querySelector('#sync-count')?.textContent).toBe('3');
  });
});
