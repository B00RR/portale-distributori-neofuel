/**
 * Stations Cache — sorgente unica per la lista distributori (#349).
 *
 * Tutti i moduli leggono la stessa chiave cache con la stessa query canonica,
 * così la forma dei dati non dipende da quale modulo arriva primo e
 * l'invalidazione copre ogni consumatore con una sola chiamata.
 */
import type { Database } from '../../supabase/database.types.js';
import { Cache, CACHE_KEYS } from '../utils/cache.js';

import { supabase } from './api.js';

export type FuelStationRow = Database['public']['Tables']['fuel_stations']['Row'];

const STATIONS_TTL_MS = 10 * 60 * 1000;

/**
 * Lista canonica dei distributori (tutte le colonne, dal più recente).
 * I moduli che necessitano di un ordinamento diverso ordinano una copia.
 */
export async function getStations(): Promise<FuelStationRow[]> {
  return Cache.getOrFetch<FuelStationRow[]>(
    CACHE_KEYS.STATIONS,
    async () => {
      const { data, error } = await supabase
        .from('fuel_stations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        throw error;
      }
      return data ?? [];
    },
    STATIONS_TTL_MS
  );
}

/**
 * Invalida tutti e soltanto gli indici derivati dai dati di stazione:
 * la lista condivisa e, se indicato, il record `station_<id>` della stazione
 * modificata o eliminata. Per le creazioni omettere l'id: nessun record
 * per-stazione può esistere ancora in cache.
 */
export function invalidateStationCaches(stationId?: number): void {
  Cache.invalidate(CACHE_KEYS.STATIONS);
  if (stationId !== undefined) {
    Cache.invalidate(`${CACHE_KEYS.STATION_PREFIX}${stationId}`);
  }
}
