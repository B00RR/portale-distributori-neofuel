// ==========================================
// CACHE UTILITY
// Caching intelligente con TTL per dati statici
// ==========================================

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minuti di default

// Storage interno
const cacheStore = new Map();

/**
 * Cache utility per memorizzare dati con scadenza (TTL)
 */
export const Cache = {
    /**
     * Ottiene un valore dalla cache
     * @param {string} key - Chiave del valore
     * @returns {*} Il valore se presente e non scaduto, altrimenti null
     */
    get(key) {
        const entry = cacheStore.get(key);
        if (!entry) return null;

        // Verifica scadenza
        if (Date.now() > entry.expiresAt) {
            cacheStore.delete(key);
            return null;
        }

        return entry.data;
    },

    /**
     * Imposta un valore nella cache
     * @param {string} key - Chiave del valore
     * @param {*} data - Dati da memorizzare
     * @param {number} ttl - Time to live in millisecondi (default: 5 minuti)
     */
    set(key, data, ttl = DEFAULT_TTL) {
        cacheStore.set(key, {
            data,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now()
        });
    },

    /**
     * Invalida (rimuove) un valore dalla cache
     * @param {string} key - Chiave da invalidare
     */
    invalidate(key) {
        cacheStore.delete(key);
    },

    /**
     * Invalida tutti i valori con un prefisso
     * @param {string} prefix - Prefisso delle chiavi da invalidare
     */
    invalidateByPrefix(prefix) {
        for (const key of cacheStore.keys()) {
            if (key.startsWith(prefix)) {
                cacheStore.delete(key);
            }
        }
    },

    /**
     * Pulisce tutta la cache
     */
    clear() {
        cacheStore.clear();
    },

    /**
     * Helper per fetch con cache
     * Esegue la funzione solo se i dati non sono in cache
     * @param {string} key - Chiave cache
     * @param {Function} fetchFn - Funzione async che recupera i dati
     * @param {number} ttl - TTL in millisecondi
     * @returns {Promise<*>} Dati dalla cache o dal fetch
     */
    async getOrFetch(key, fetchFn, ttl = DEFAULT_TTL) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        const data = await fetchFn();
        if (data !== null && data !== undefined) {
            this.set(key, data, ttl);
        }
        return data;
    },

    /**
     * Ottiene statistiche sulla cache
     * @returns {Object} Statistiche
     */
    getStats() {
        let validCount = 0;
        let expiredCount = 0;
        const now = Date.now();

        for (const entry of cacheStore.values()) {
            if (now > entry.expiresAt) {
                expiredCount++;
            } else {
                validCount++;
            }
        }

        return {
            total: cacheStore.size,
            valid: validCount,
            expired: expiredCount
        };
    }
};

// Chiavi cache predefinite per consistenza
export const CACHE_KEYS = {
    STATIONS: 'stations',
    CUSTOMERS: 'customers',
    FUEL_TYPES: 'fuel_types',
    STATION_PREFIX: 'station_'
};
