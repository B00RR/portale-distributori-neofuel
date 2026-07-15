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

const keyFor = (userId: string): string => `${OPERATOR_SELECTED_STATION_KEY}:${userId}`;

describe('operator station context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('uses the persisted station when it is still assigned', () => {
    localStorage.setItem(keyFor('10'), '2');

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
    expect(localStorage.getItem(keyFor('10'))).toBe('2');
  });

  it('falls back to the first assigned station when persisted station is stale', () => {
    localStorage.setItem(keyFor('10'), '999');

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
    expect(localStorage.getItem(keyFor('10'))).toBe('1');
  });

  it('returns null and clears persistence when the user has no assigned stations (#253)', () => {
    localStorage.setItem(OPERATOR_SELECTED_STATION_KEY, '2');
    localStorage.setItem(keyFor('10'), '2');

    const result = ensureSelectedOperatorStation({
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      station_id: 2,
      assignedStations: []
    });

    expect(result.stationId).toBeNull();
    expect(result.user.station_id).toBeNull();
    expect(localStorage.getItem(keyFor('10'))).toBeNull();
    expect(localStorage.getItem(OPERATOR_SELECTED_STATION_KEY)).toBeNull();
  });

  it('does not inherit the station persisted by another user on the same device (#253)', () => {
    localStorage.setItem(keyFor('99'), '2');
    localStorage.setItem(OPERATOR_SELECTED_STATION_KEY, '2');

    const result = ensureSelectedOperatorStation({
      user_id: '10',
      email: 'op@test.com',
      role: 'operator',
      assignedStations: [{ id: 1, name: 'Roma' }]
    });

    expect(result.stationId).toBe('1');
    expect(localStorage.getItem(keyFor('10'))).toBe('1');
    expect(localStorage.getItem(keyFor('99'))).toBe('2');
    expect(localStorage.getItem(OPERATOR_SELECTED_STATION_KEY)).toBeNull();
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
    expect(localStorage.getItem(keyFor('10'))).toBe('2');
  });

  it('refuses to select a station when the user has no assignments (#253)', () => {
    mockStore.getUser.mockReturnValue({
      user_id: '10',
      email: 'op@test.com',
      role: 'operator' as const,
      station_id: null,
      assignedStations: []
    });

    expect(setSelectedOperatorStation('2')).toBeNull();
    expect(mockStore.setUser).not.toHaveBeenCalled();
    expect(localStorage.getItem(keyFor('10'))).toBeNull();
  });

  it('reads persisted selected station through getSelectedOperatorStationId', () => {
    localStorage.setItem(keyFor('10'), '2');
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
