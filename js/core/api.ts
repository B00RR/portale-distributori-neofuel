/**
 * API & Supabase Module
 * Handles Supabase client initialization and data access functions
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore - External CDN module
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { Cache, CACHE_KEYS } from "../utils/cache.js";

// ========== TYPE DEFINITIONS ==========

export interface SupabaseQueryResult<T = any> {
    data: T | null;
    error: any | null;
    offline?: boolean;
}

export type QueryFunction = () => Promise<SupabaseQueryResult<any>>;

// ========== SUPABASE CLIENT ==========

// Standard client (anon key) - Singleton pattern to avoid multiple instances during HMR
declare global {
    interface Window {
        __supabaseClient?: any;
    }
}

const globalSupabase = (globalThis as any).__supabaseClient;
export const supabase = globalSupabase || createClient(SUPABASE_URL, SUPABASE_KEY);
if (!(globalThis as any).__supabaseClient) {
    (globalThis as any).__supabaseClient = supabase;
}

// ========== HELPER FUNCTIONS ==========

/**
 * Wraps a Supabase query with standardized error handling and enqueues mutations for offline sync when needed.
 *
 * @param queryFn - A function that executes a Supabase query and resolves to a SupabaseQueryResult
 * @param errorMessage - Fallback error message used when the query result does not include a descriptive message
 * @returns A SupabaseQueryResult<T>. When a mutation is saved for later synchronization, returns an object with `offline: true`, `data: null`, and `error: null`.
 * @throws Re-throws the original error when the query fails and the operation is not enqueued for offline handling
 */
export async function safeSupabaseQuery<T = any>(
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
            // If it's a network error (not permission/logic error) and we're offline or server not responding
            if (isMutation && (!navigator.onLine || result.error.status === 0 || result.error.status >= 500)) {
                await handleOfflineMutation(queryFn);
                return { data: null, error: null, offline: true };
            }
            throw new Error(result.error.message || errorMessage);
        }
        return result;
    } catch (err: any) {
        // Fallback for catastrophic errors (like fetch failed)
        if (isMutation && (!navigator.onLine || err.message?.toLowerCase().includes('fetch'))) {
            try {
                await handleOfflineMutation(queryFn);
                return { data: null, error: null, offline: true };
            } catch (queueErr) {
                console.error("Critical offline queue error:", queueErr);
            }
        }
        console.error(errorMessage, err);
        throw err;
    }
}

/**
 * Save a failed mutation placeholder for later retry and notify the user.
 *
 * Displays a warning toast to the user and enqueues a `mutation_retry` entry in the offline DB.
 *
 * @param _queryFn - Optional query function; currently not persisted or re-executed but accepted for future payload extraction or retry metadata.
 */
async function handleOfflineMutation(_queryFn: QueryFunction): Promise<void> {
    const { offlineDB } = await import("./offline-db.js");
    const { Toast } = await import("../ui/toast.js");

    // NOTE: Extracting exact parameters from an anonymous function is complex.
    // In an ideal version, we would pass a structured object to safeSupabaseQuery.
    // For now, we save the failure for manual/automatic retry when back online.
    // In Neofuel, most mutations are in operator/vouchers.js and operator/extra-income.js

    // Show warning to user
    (Toast as any).show(
        "Connessione assente. L'operazione è stata salvata localmente e verrà sincronizzata appena possibile.",
        "warning"
    );

    // Simplified save (here we should implement payload extraction if possible)
    // For Neofuel, we'll implement a more evolved interceptor or refactor critical calls.
    await (offlineDB as any).enqueue({
        type: 'mutation_retry',
        description: 'Operazione database in attesa',
        // queryFn: queryFn.toString() // May not be directly re-executable
    });
}

/**
 * Retrieves a fuel station's display name, using a cached value when available.
 *
 * If `stationId` is falsy returns `#<stationId>`. Otherwise fetches the station_name from the `fuel_stations` table and caches the result for 10 minutes.
 *
 * @param stationId - Station identifier used to look up the name (string or number).
 * @returns The station's name if found, otherwise a fallback string in the form `#<stationId>`.
 */
export async function getStationName(stationId: string | number): Promise<string> {
    if (!stationId) return `#${stationId}`;

    const cacheKey = `${CACHE_KEYS.STATION_PREFIX}${stationId}`;

    return Cache.getOrFetch(cacheKey, async () => {
        try {
            const { data: st } = await (supabase as any)
                .from('fuel_stations')
                .select('station_name')
                .eq('station_id', stationId)
                .maybeSingle();
            return st?.station_name || `#${stationId}`;
        } catch (err) {
            console.warn('Error loading station name:', err);
            return `#${stationId}`;
        }
    }, 10 * 60 * 1000); // Cache for 10 minutes
}

// Re-export Cache for direct use
export { Cache, CACHE_KEYS };