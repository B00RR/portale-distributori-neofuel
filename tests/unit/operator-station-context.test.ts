import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    getUser: vi.fn(),
    setUser: vi.fn()
  }
}));

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));

import {
  ensureSelectedOperatorStation,
  getSelectedOperatorStationId,
  OPERATOR_SELECTED_STATION_KEY,
  setSelectedOperatorStation
} from '../../js/operator/station-context.js';

describe('operator station context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('uses the persisted station when it is still assigned', () => {
    localStorage.setItem(OPERATOR_SELECTED_STATION_KEY, '2');

    const result = ensureSelectedOperatorStation({
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      station_id: 1,
      assignedStations: [
        { id: 1, name: 'Roma' },
        { id: 2, name: 'Milano' }
      ]
    });

    expect(result.stationId).toBe('2');
    expect(result.user.station_id).toBe('2');
    expect(localStorage.getItem(OPERATOR_SELECTED_STATION_KEY)).toBe('2');
  });

  it('falls back to the first assigned station when persisted station is stale', () => {
    localStorage.setItem(OPERATOR_SELECTED_STATION_KEY, '999');

    const result = ensureSelectedOperatorStation({
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      assignedStations: [
        { id: 1, name: 'Roma' },
        { id: 2, name: 'Milano' }
      ]
    });

    expect(result.stationId).toBe('1');
    expect(result.user.station_id).toBe('1');
    expect(localStorage.getItem(OPERATOR_SELECTED_STATION_KEY)).toBe('1');
  });

  it('updates store and persistence when selecting another assigned station', () => {
    const user = {
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

    const selected = setSelectedOperatorStation('2');

    expect(selected).toBe('2');
    expect(mockStore.setUser).toHaveBeenCalledWith({ ...user, station_id: '2' });
    expect(localStorage.getItem(OPERATOR_SELECTED_STATION_KEY)).toBe('2');
  });

  it('reads persisted selected station through getSelectedOperatorStationId', () => {
    localStorage.setItem(OPERATOR_SELECTED_STATION_KEY, '2');
    mockStore.getUser.mockReturnValue({
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      station_id: '1',
      assignedStations: [
        { id: 1, name: 'Roma' },
        { id: 2, name: 'Milano' }
      ]
    });

    expect(getSelectedOperatorStationId()).toBe('2');
  });
});
