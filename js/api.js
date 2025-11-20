// ==========================================
// API & SUPABASE
// ==========================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// Client standard (anon key) - tutte le autorizzazioni passano dalle RLS del database
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('Supabase inizializzato:', {
    url: SUPABASE_URL,
    hasAuth: !!supabase.auth
});

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

// Helper: Carica nome stazione (pattern ripetuto)
export async function getStationName(stationId) {
    if (!stationId) return `#${stationId}`;
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
}
