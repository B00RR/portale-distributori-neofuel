import { store, User } from '../shared/state.js';

export const OPERATOR_SELECTED_STATION_KEY = 'operator_selected_station';

type AssignedStation = NonNullable<User['assignedStations']>[number];

function normalizeStationId(stationId: string | number | null | undefined): string | null {
  if (stationId === null || stationId === undefined || stationId === '') {
    return null;
  }

  return String(stationId);
}

function getAssignedStationIds(assignedStations: AssignedStation[] | undefined): string[] {
  return (assignedStations ?? [])
    .map(station => normalizeStationId(station.id))
    .filter((stationId): stationId is string => stationId !== null);
}

function isAssignedStation(stationId: string, assignedStationIds: string[]): boolean {
  return assignedStationIds.length === 0 || assignedStationIds.includes(stationId);
}

function persistSelectedStation(stationId: string | null): void {
  if (stationId) {
    localStorage.setItem(OPERATOR_SELECTED_STATION_KEY, stationId);
  } else {
    localStorage.removeItem(OPERATOR_SELECTED_STATION_KEY);
  }
}

export function ensureSelectedOperatorStation<T extends User>(
  user: T
): { user: T; stationId: string | null } {
  const assignedStationIds = getAssignedStationIds(user.assignedStations);
  const persistedStationId = normalizeStationId(
    localStorage.getItem(OPERATOR_SELECTED_STATION_KEY)
  );
  const currentStationId = normalizeStationId(user.station_id);

  const selectedStationId =
    persistedStationId && isAssignedStation(persistedStationId, assignedStationIds)
      ? persistedStationId
      : currentStationId && isAssignedStation(currentStationId, assignedStationIds)
        ? currentStationId
        : (assignedStationIds[0] ?? null);

  persistSelectedStation(selectedStationId);

  return {
    user: { ...user, station_id: selectedStationId } as T,
    stationId: selectedStationId
  };
}

export function getSelectedOperatorStationId(user = store.getUser()): string | null {
  if (!user) {
    return null;
  }

  return ensureSelectedOperatorStation(user).stationId;
}

export function setSelectedOperatorStation(stationId: string | number): string | null {
  const selectedStationId = normalizeStationId(stationId);
  const user = store.getUser();

  if (!selectedStationId || !user) {
    return null;
  }

  const assignedStationIds = getAssignedStationIds(user.assignedStations);
  if (!isAssignedStation(selectedStationId, assignedStationIds)) {
    return null;
  }

  const nextUser = { ...user, station_id: selectedStationId };
  persistSelectedStation(selectedStationId);
  store.setUser(nextUser);

  return selectedStationId;
}
