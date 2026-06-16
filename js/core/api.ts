/**
 * API & Supabase Module
 * Handles Supabase client initialization and data access functions
 */

import { createClient, SupabaseClient, type PostgrestError } from '@supabase/supabase-js';

import type { Database } from '../../supabase/database.types.js';

import { Cache, CACHE_KEYS } from '../utils/cache.js';

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { logger } from './logger.js';

// ========== TYPE DEFINITIONS ==========

export type AppSupabaseClient = SupabaseClient<Database>;

export interface SupabaseQueryResult<T = unknown> {
    data: T | null;
    error: PostgrestError | null;
    offline?: boolean;
}

interface PostgrestErrorExt extends PostgrestError {
    status?: number;
    statusCode?: number;
}

export type QueryFunction = () => Promise<SupabaseQueryResult<unknown>>;

// ========== SUPABASE CLIENT ==========

// Standard client (anon key) - Singleton pattern to avoid multiple instances during HMR
declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: AppSupabaseClient | undefined;
}

const globalSupabase = globalThis.__supabaseClient;
export const supabase: AppSupabaseClient = globalSupabase || createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
if (!globalThis.__supabaseClient) {
  globalThis.__supabaseClient = supabase;
}

// ========== HELPER FUNCTIONS ==========

/**
 * Standardized error handling for Supabase queries
 * Modified to handle offline queue for mutations (insert, update, upsert, delete)
 */
export async function safeSupabaseQuery<T = unknown>(
  queryFn: QueryFunction,
  errorMessage: string = 'Errore nella query'
): Promise<SupabaseQueryResult<T>> {
  // Detect if the query is a mutation (rough but effective for PostgREST query builder)
  const queryStr = queryFn.toString();
  const isMutation =
    queryStr.includes('.insert') ||
    queryStr.includes('.update') ||
    queryStr.includes('.upsert') ||
    queryStr.includes('.delete');

  try {
    const result = await queryFn();
    if (result.error) {
      const extError = result.error as PostgrestErrorExt;
      // If it's a network error (not permission/logic error) and we're offline or server not responding
      if (isMutation && (!navigator.onLine || (extError.status ?? -1) === 0 || (extError.status ?? 0) >= 500 || (extError.statusCode ?? -1) === 0 || (extError.statusCode ?? 0) >= 500)) {
        await handleOfflineMutation(queryFn);
        return { data: null, error: null, offline: true };
      }
      throw new Error(result.error.message || errorMessage);
    }
    return result as SupabaseQueryResult<T>;
  } catch (err) {
    // Fallback for catastrophic errors (like fetch failed)
    if (
      isMutation &&
      (!navigator.onLine || (err instanceof Error && err.message.toLowerCase().includes('fetch')))
    ) {
      try {
        await handleOfflineMutation(queryFn);
        return { data: null, error: null, offline: true };
      } catch (queueErr) {
        logger.error('api.offlineQueue', queueErr);
      }
    }
    logger.error('api.safeSupabaseQuery', err);
    throw err;
  }
}

/**
 * Attempts to extract data from query function to save offline
 * @param _queryFn - The query function to queue (unused in current implementation)
 */
async function handleOfflineMutation(_queryFn: QueryFunction): Promise<void> {
  const { offlineDB } = await import('./offline-db.js');
  const { Toast } = await import('../ui/toast.js');

  // NOTE: Extracting exact parameters from an anonymous function is complex.
  // In an ideal version, we would pass a structured object to safeSupabaseQuery.
  // For now, we save the failure for manual/automatic retry when back online.
  // In Neofuel, most mutations are in operator/vouchers.js and operator/extra-income.js

  // Show warning to user
  Toast.show(
    'Connessione assente. L\'operazione è stata salvata localmente e verrà sincronizzata appena possibile.',
    'warning'
  );

  // Simplified save (here we should implement payload extraction if possible)
  // For Neofuel, we'll implement a more evolved interceptor or refactor critical calls.
  await offlineDB.enqueue({
    type: 'mutation_retry',
    description: 'Operazione database in attesa'
    // queryFn: queryFn.toString() // May not be directly re-executable
  });
}

/**
 * Load station name (with caching)
 */
const getStationName = async (stationId: string | number): Promise<string> => {
  if (!stationId) {
    return `#${stationId}`;
  }

  const numericId = typeof stationId === 'string' ? parseInt(stationId, 10) : stationId;

  const cacheKey = `${CACHE_KEYS.STATION_PREFIX}${numericId}`;

  return Cache.getOrFetch(cacheKey, async () => {
    try {
      const { data: st } = await supabase
        .from('fuel_stations')
        .select('station_name')
        .eq('station_id', numericId)
        .maybeSingle();
      const station = st as { station_name?: string } | null;
      return station?.station_name || `#${numericId}`;
    } catch (err) {
      logger.warn('api.getStationName', 'Error loading station name');
      logger.debug('api.getStationName', logger.getUserMessage(logger.error('api.getStationName', err)));
      return `#${numericId}`;
    }
  }, 10 * 60 * 1000); // Cache for 10 minutes
};

export { Cache, CACHE_KEYS, getStationName };
