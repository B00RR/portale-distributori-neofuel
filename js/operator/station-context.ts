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

// Senza assegnazioni nessuna stazione è valida: il fallback "lista vuota =
// tutto permesso" faceva ereditare a un operatore la stazione persistita da
// un altro account sullo stesso dispositivo (#253).
function isAssignedStation(stationId: string, assignedStationIds: string[]): boolean {
  return assignedStationIds.includes(stationId);
}

// Chiave scopata per utente: la selezione di un account non deve mai valere
// per un altro account sullo stesso dispositivo (#253).
function storageKeyFor(user: Pick<User, 'user_id'>): string {
  return `${OPERATOR_SELECTED_STATION_KEY}:${user.user_id}`;
}

function persistSelectedStation(user: Pick<User, 'user_id'>, stationId: string | null): void {
  // La chiave legacy non scopata è la fonte del leakage tra utenti: va sempre rimossa.
  localStorage.removeItem(OPERATOR_SELECTED_STATION_KEY);
  if (stationId) {
    localStorage.setItem(storageKeyFor(user), stationId);
  } else {
    localStorage.removeItem(storageKeyFor(user));
  }
}

export function ensureSelectedOperatorStation<T extends User>(
  user: T
): { user: T; stationId: string | null } {
  const assignedStationIds = getAssignedStationIds(user.assignedStations);
  const persistedStationId = normalizeStationId(localStorage.getItem(storageKeyFor(user)));
  const currentStationId = normalizeStationId(user.station_id);

  const selectedStationId =
    persistedStationId && isAssignedStation(persistedStationId, assignedStationIds)
      ? persistedStationId
      : currentStationId && isAssignedStation(currentStationId, assignedStationIds)
        ? currentStationId
        : (assignedStationIds[0] ?? null);

  persistSelectedStation(user, selectedStationId);

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
  persistSelectedStation(user, selectedStationId);
  store.setUser(nextUser);

  return selectedStationId;
}
