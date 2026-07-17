/**
 * CACHE UTILITY
 * Intelligent caching with TTL for static/semi-static data
 */

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes default

export interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheStats {
  total: number;
  valid: number;
  expired: number;
}

// Internal storage
const cacheStore = new Map<string, CacheEntry>();

// Epoch per chiave, incrementato a ogni invalidazione: un fetch ancora in volo
// non deve ripopolare una chiave invalidata nel frattempo (#349).
const keyEpochs = new Map<string, number>();

function bumpEpoch(key: string): void {
  keyEpochs.set(key, (keyEpochs.get(key) ?? 0) + 1);
}

/**
 * Cache utility to store data with expiration (TTL)
 */
export const Cache = {
  /**
   * Get a value from cache
   * @param key - Cache key
   * @returns The value if present and not expired, otherwise null
   */
  get<T = unknown>(key: string): T | null {
    const entry = cacheStore.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      cacheStore.delete(key);
      return null;
    }

    return entry.data as T;
  },

  /**
   * Set a value in cache
   * @param key - Cache key
   * @param data - Data to store
   * @param ttl - Time to live in milliseconds (default: 5 minutes)
   */
  set<T = unknown>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
    cacheStore.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    });
  },

  /**
   * Invalidate (remove) a value from cache
   * @param key - Key to invalidate
   */
  invalidate(key: string): void {
    cacheStore.delete(key);
    bumpEpoch(key);
  },

  /**
   * Invalidate all values with a prefix
   * @param prefix - Prefix of keys to invalidate
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of cacheStore.keys()) {
      if (key.startsWith(prefix)) {
        cacheStore.delete(key);
      }
    }
    // Anche le chiavi con un fetch in volo (registrate in keyEpochs ma non
    // ancora in cacheStore) devono risultare invalidate.
    for (const key of keyEpochs.keys()) {
      if (key.startsWith(prefix)) {
        bumpEpoch(key);
      }
    }
  },

  /**
   * Clear entire cache
   */
  clear(): void {
    cacheStore.clear();
    for (const key of keyEpochs.keys()) {
      bumpEpoch(key);
    }
  },

  /**
   * Helper for fetch with cache
   * Executes function only if data is not in cache
   * @param key - Cache key
   * @param fetchFn - Async function to fetch data
   * @param ttl - TTL in milliseconds
   * @returns Cached data or fetched data
   */
  async getOrFetch<T = unknown>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = DEFAULT_TTL
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    if (!keyEpochs.has(key)) {
      keyEpochs.set(key, 0);
    }
    const epochAtFetch = keyEpochs.get(key);

    const data = await fetchFn();
    // Se la chiave è stata invalidata mentre il fetch era in volo, il dato è
    // già potenzialmente stantio: va restituito al chiamante ma non cachato.
    if (data !== null && data !== undefined && keyEpochs.get(key) === epochAtFetch) {
      this.set(key, data, ttl);
    }
    return data;
  },

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
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

// Default cache keys for consistency
export const CACHE_KEYS = {
  STATIONS: 'stations',
  CUSTOMERS: 'customers',
  FUEL_TYPES: 'fuel_types',
  STATION_PREFIX: 'station_'
};
