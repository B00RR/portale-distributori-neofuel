// ==========================================
// API & SUPABASE
// ==========================================
// @ts-ignore
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { Cache, CACHE_KEYS } from "../utils/cache.js";

// Client standard (anon key) - tutte le autorizzazioni passano dalle RLS del database
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper: Gestione errori standardizzata per query Supabase
export async function safeSupabaseQuery(queryFn, errorMessage = 'Errore nella query') {
    try {
        const result = await queryFn();
        if (result.error) {
            throw new Error(result.error.message || errorMessage);
        }
        return result;
    } catch (err) {
        console.error(errorMessage, err);
        throw err;
    }
}

// Helper: Carica nome stazione (con caching)
export async function getStationName(stationId) {
    if (!stationId) return `#${stationId}`;

    const cacheKey = `${CACHE_KEYS.STATION_PREFIX}${stationId}`;

    return Cache.getOrFetch(cacheKey, async () => {
        try {
            const { data: st } = await supabase
                .from('fuel_stations')
                .select('station_name')
                .eq('station_id', stationId)
                .maybeSingle();
            return st?.station_name || `#${stationId}`;
        } catch (err) {
            console.warn('Errore nel caricamento nome stazione:', err);
            return `#${stationId}`;
        }
    }, 10 * 60 * 1000); // Cache per 10 minuti
}

// Re-export Cache per uso diretto
export { Cache, CACHE_KEYS };
