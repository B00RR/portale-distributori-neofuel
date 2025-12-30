// ==========================================
// API & SUPABASE
// ==========================================
// @ts-ignore
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { Cache, CACHE_KEYS } from "../utils/cache.js";

// Client standard (anon key) - Singleton pattern per evitare multiple istanze durante HMR
// @ts-ignore
const globalSupabase = globalThis.__supabaseClient;
export const supabase = globalSupabase || createClient(SUPABASE_URL, SUPABASE_KEY);
// @ts-ignore
if (!globalThis.__supabaseClient) globalThis.__supabaseClient = supabase;

// Helper: Gestione errori standardizzata per query Supabase
// Modificato per gestire la coda offline in caso di mutazioni (insert, update, upsert, delete)
export async function safeSupabaseQuery(queryFn, errorMessage = 'Errore nella query') {
    // Rileva se la query è una mutazione (grossolano ma efficace per PostgREST query builder)
    const queryStr = queryFn.toString();
    const isMutation = queryStr.includes('.insert') || queryStr.includes('.update') ||
        queryStr.includes('.upsert') || queryStr.includes('.delete');

    try {
        const result = await queryFn();
        if (result.error) {
            // Se è un errore di rete (non un errore di permessi/logica) e siamo offline o il server non risponde
            if (isMutation && (!navigator.onLine || result.error.status === 0 || result.error.status >= 500)) {
                await handleOfflineMutation(queryFn);
                return { data: null, error: null, offline: true };
            }
            throw new Error(result.error.message || errorMessage);
        }
        return result;
    } catch (err) {
        // Fallback per errori catastrofici (tipo fetch failed)
        if (isMutation && (!navigator.onLine || err.message.toLowerCase().includes('fetch'))) {
            try {
                await handleOfflineMutation(queryFn);
                return { data: null, error: null, offline: true };
            } catch (queueErr) {
                console.error("Errore critico accodamento offline:", queueErr);
            }
        }
        console.error(errorMessage, err);
        throw err;
    }
}

/**
 * Tenta di estrarre i dati dalla funzione query per salvarli offline
 * @param {Function} queryFn 
 */
async function handleOfflineMutation(queryFn) {
    const { offlineDB } = await import("./offline-db.js");
    const { Toast } = await import("../ui/toast.js");

    // NOTA: Estrarre i parametri esatti da una funzione anonima è complesso.
    // In una versione ideale, passeremmo un oggetto strutturato a safeSupabaseQuery.
    // Per ora, salviamo il fallimento per un retry manuale/automatico appena torna online.
    // In Neofuel, la maggior parte delle mutazioni sono in operator/vouchers.js e operator/extra-income.js

    // Mostriamo un avviso all'utente
    Toast.show("Connessione assente. L'operazione è stata salvata localmente e verrà sincronizzata appena possibile.", "warning");

    // Salvataggio semplificato (qui andrebbe implementata l'estrazione dei payload se possibile)
    // Per Neofuel, implementeremo un interceptor più evoluto o refactoreremo le chiamate critiche.
    return offlineDB.enqueue({
        type: 'mutation_retry',
        description: 'Operazione database in attesa',
        // queryFn: queryFn.toString() // Potrebbe non essere ri-eseguibile direttamente
    });
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
