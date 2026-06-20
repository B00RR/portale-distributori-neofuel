/**
 * API & Supabase Module
 * Handles Supabase client initialization and data access functions
 */

import { createClient, SupabaseClient, type PostgrestError } from '@supabase/supabase-js';

import type { Database } from '../../supabase/database.types.js';
import { Cache, CACHE_KEYS } from '../utils/cache.js';

import { Toast } from '../ui/toast.js';

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { logger } from './logger.js';
import { queueAction, type QueuedAction } from './offline-queue.js';

// ========== TYPE DEFINITIONS ==========

export type Json = Database['public']['Functions']['submit_shift_closure']['Args']['p_closing_data'];

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

export type QueryFunction<T = unknown> = () => PromiseLike<{ data: T | null; error: PostgrestError | null; offline?: boolean }>;

export interface OfflineQueueRequest {
    type: QueuedAction['type'];
    payload: Record<string, unknown>;
}

// ========== SUPABASE CLIENT ==========

// Standard client (anon key) - Singleton pattern to avoid multiple instances during HMR
declare global {
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
  queryFn: QueryFunction<T>,
  errorMessage: string = 'Errore nella query',
  offlineAction?: OfflineQueueRequest
): Promise<SupabaseQueryResult<T>> {
  try {
    const result = await queryFn();
    if (result.error) {
      const extError = result.error as PostgrestErrorExt;
      if (offlineAction && isOfflineNetworkError(extError)) {
        await queueStructuredOfflineAction(offlineAction);
        return { data: null, error: null, offline: true };
      }
      throw new Error(result.error.message || errorMessage);
    }
    return result as SupabaseQueryResult<T>;
  } catch (err) {
    if (offlineAction && isOfflineThrownError(err)) {
      try {
        await queueStructuredOfflineAction(offlineAction);
        return { data: null, error: null, offline: true };
      } catch (queueErr) {
        logger.error('api.offlineQueue', queueErr);
      }
    }
    logger.error('api.safeSupabaseQuery', err);
    throw err;
  }
}

function isOfflineNetworkError(error: PostgrestErrorExt): boolean {
  return (
    !navigator.onLine ||
    (error.status ?? -1) === 0 ||
    (error.status ?? 0) >= 500 ||
    (error.statusCode ?? -1) === 0 ||
    (error.statusCode ?? 0) >= 500
  );
}

function isOfflineThrownError(err: unknown): boolean {
  return (
    !navigator.onLine ||
    (err instanceof Error && err.message.toLowerCase().includes('fetch'))
  );
}

async function queueStructuredOfflineAction(action: OfflineQueueRequest): Promise<void> {
  await queueAction(action.type, action.payload);

  Toast.show(
    'Connessione assente. L\'operazione e\' stata salvata localmente e verra\' sincronizzata appena possibile.',
    'warning'
  );
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
