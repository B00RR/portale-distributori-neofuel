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
 * Validates if a cache entry is still valid based on TTL
 * @param timestamp - Entry creation timestamp
 * @param ttlMs - Time-to-live in milliseconds
 * @returns boolean
 */
function isValid(timestamp: number, ttlMs: number): boolean {
    return (Date.now() - timestamp) < ttlMs;
}

/**
 * Retrieves data from cache if valid
 * @param key - Cache key
 * @param ttlMs - Optional custom TTL (defaults to global constant)
 * @returns Cached data or null if invalid/missing
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
 * Saves data to cache with timestamp
 * @param key - Cache key
 * @param data - Data to store
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
 * Clears all application cache entries
 */
export function clearCache(): void {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('cache_')) {
            localStorage.removeItem(key);
        }
    });
}

/**
 * Automatic background cleanup of expired entries
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
