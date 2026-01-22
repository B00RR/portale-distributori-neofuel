/**
 * Client-Side Caching Module
 * 
 * Implements a robust caching strategy for static/semi-static data using LocalStorage.
 * Follows enterprise best practices with TTL, versioning, and automatic cleanup.
 * 
 * @module cache
 */

import { CACHE_DEFAULT_TTL_MS, CACHE_CLEANUP_INTERVAL_MS } from '../shared/app-constants.js';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    version: string;
}

const CACHE_VERSION = '1.0';

/**
 * Determines whether a cache entry's timestamp falls within the specified TTL.
 *
 * @param timestamp - Entry creation time in milliseconds since the UNIX epoch
 * @param ttlMs - Time-to-live duration in milliseconds
 * @returns `true` if the entry is still within `ttlMs` from `timestamp`, `false` otherwise.
 */
function isValid(timestamp: number, ttlMs: number): boolean {
    return (Date.now() - timestamp) < ttlMs;
}

/**
 * Retrieve a value from localStorage cache if it exists, matches the current cache version, and is within the TTL.
 *
 * @param key - Cache identifier; stored under `cache_{key}` in localStorage
 * @param ttlMs - Time-to-live in milliseconds used to validate the entry
 * @returns The cached value for `key` if valid, `null` otherwise
 */
export function getFromCache<T>(key: string, ttlMs: number = CACHE_DEFAULT_TTL_MS): T | null {
    try {
        const raw = localStorage.getItem(`cache_${key}`);
        if (!raw) return null;

        const entry: CacheEntry<T> = JSON.parse(raw);

        // Check version
        if (entry.version !== CACHE_VERSION) {
            localStorage.removeItem(`cache_${key}`);
            return null;
        }

        // Check TTL
        if (!isValid(entry.timestamp, ttlMs)) {
            localStorage.removeItem(`cache_${key}`);
            return null;
        }

        return entry.data;
    } catch (error) {
        console.warn(`[Cache] Error retrieving ${key}:`, error);
        return null;
    }
}

/**
 * Store a value in the client-side cache under the given key, recording the current timestamp and cache version.
 *
 * @param key - The cache key (stored with a `cache_` prefix in localStorage)
 * @param data - The value to store in the cache
 */
export function setInCache<T>(key: string, data: T): void {
    try {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            version: CACHE_VERSION
        };
        localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    } catch (error) {
        console.warn(`[Cache] Error setting ${key}:`, error);
    }
}

/**
 * Remove all LocalStorage entries created by the caching module (keys starting with "cache_").
 */
export function clearCache(): void {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('cache_')) {
            localStorage.removeItem(key);
        }
    });
}

/**
 * Starts a periodic background task that removes expired or malformed localStorage entries prefixed with "cache_".
 *
 * The task runs at an interval defined by CACHE_CLEANUP_INTERVAL_MS and deletes entries whose stored timestamp is older than CACHE_DEFAULT_TTL_MS or that cannot be parsed.
 */
export function startCacheCleanup(): void {
    setInterval(() => {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('cache_')) {
                // Accessing triggers validation logic in getFromCache, effectively cleaning up
                const raw = localStorage.getItem(key);
                if (raw) {
                    try {
                        const entry: CacheEntry<unknown> = JSON.parse(raw);
                        if (!isValid(entry.timestamp, CACHE_DEFAULT_TTL_MS)) {
                            localStorage.removeItem(key);
                        }
                    } catch (e) {
                        localStorage.removeItem(key);
                    }
                }
            }
        });
    }, CACHE_CLEANUP_INTERVAL_MS);
}