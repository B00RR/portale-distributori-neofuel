import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cache, CACHE_KEYS } from '../../js/utils/cache.js';

describe('Cache Module', () => {
    beforeEach(() => {
        Cache.clear();
    });

    describe('getOrFetch', () => {
        it('should fetch data on first call', async () => {
            const fetchFn = vi.fn(async () => ['station1', 'station2']);
            const result = await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 60000);

            expect(result).toEqual(['station1', 'station2']);
            expect(fetchFn).toHaveBeenCalledTimes(1);
        });

        it('should return cached data on second call within TTL', async () => {
            const fetchFn = vi.fn(async () => ['station1', 'station2']);

            const result1 = await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 60000);
            const result2 = await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 60000);

            expect(result1).toEqual(result2);
            expect(fetchFn).toHaveBeenCalledTimes(1); // Called only once
        });

        it('should refetch data after invalidation', async () => {
            const fetchFn = vi.fn(async () => ['station1', 'station2']);

            const result1 = await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 60000);
            expect(fetchFn).toHaveBeenCalledTimes(1);

            Cache.invalidate(CACHE_KEYS.STATIONS);

            const result2 = await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 60000);
            expect(fetchFn).toHaveBeenCalledTimes(2); // Called again after invalidation
            expect(result1).toEqual(result2);
        });

        it('should refetch data after TTL expires', async () => {
            const fetchFn = vi.fn(async () => ['station1', 'station2']);

            await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 100); // 100ms TTL
            expect(fetchFn).toHaveBeenCalledTimes(1);

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 150));

            await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 100);
            expect(fetchFn).toHaveBeenCalledTimes(2); // Called again after TTL expires
        });

        it('should handle different cache keys independently', async () => {
            const stationsFn = vi.fn(async () => ['station1', 'station2']);
            const customersFn = vi.fn(async () => ['customer1', 'customer2']);

            await Cache.getOrFetch(CACHE_KEYS.STATIONS, stationsFn, 60000);
            await Cache.getOrFetch(CACHE_KEYS.CUSTOMERS, customersFn, 60000);

            // Second call should use cache
            await Cache.getOrFetch(CACHE_KEYS.STATIONS, stationsFn, 60000);
            await Cache.getOrFetch(CACHE_KEYS.CUSTOMERS, customersFn, 60000);

            expect(stationsFn).toHaveBeenCalledTimes(1);
            expect(customersFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('invalidate', () => {
        it('should remove specific cache entry', async () => {
            const fetchFn = vi.fn(async () => ['data']);

            await Cache.getOrFetch('test_key', fetchFn, 60000);
            expect(fetchFn).toHaveBeenCalledTimes(1);

            Cache.invalidate('test_key');

            await Cache.getOrFetch('test_key', fetchFn, 60000);
            expect(fetchFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('invalidateByPrefix', () => {
        it('should remove all cache entries with matching prefix', async () => {
            const fetchFn = vi.fn(async () => ['data']);

            await Cache.getOrFetch('customer_station_1', fetchFn, 60000);
            await Cache.getOrFetch('customer_station_2', fetchFn, 60000);

            expect(fetchFn).toHaveBeenCalledTimes(2);

            Cache.invalidateByPrefix('customer_station_');

            await Cache.getOrFetch('customer_station_1', fetchFn, 60000);
            await Cache.getOrFetch('customer_station_2', fetchFn, 60000);

            expect(fetchFn).toHaveBeenCalledTimes(4); // Both refetched
        });

        it('should not affect other prefixes', async () => {
            const fetchFn = vi.fn(async () => ['data']);

            await Cache.getOrFetch('station_1', fetchFn, 60000);
            await Cache.getOrFetch('customer_1', fetchFn, 60000);

            expect(fetchFn).toHaveBeenCalledTimes(2);

            Cache.invalidateByPrefix('customer_');

            // station_1 should still be cached
            await Cache.getOrFetch('station_1', fetchFn, 60000);
            expect(fetchFn).toHaveBeenCalledTimes(2); // Not called again

            // customer_1 should be refetched
            await Cache.getOrFetch('customer_1', fetchFn, 60000);
            expect(fetchFn).toHaveBeenCalledTimes(3); // Called again
        });
    });

    describe('clear', () => {
        it('should clear entire cache', async () => {
            const fetchFn = vi.fn(async () => ['data']);

            await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 60000);
            await Cache.getOrFetch(CACHE_KEYS.CUSTOMERS, fetchFn, 60000);

            expect(fetchFn).toHaveBeenCalledTimes(2);

            Cache.clear();

            await Cache.getOrFetch(CACHE_KEYS.STATIONS, fetchFn, 60000);
            await Cache.getOrFetch(CACHE_KEYS.CUSTOMERS, fetchFn, 60000);

            expect(fetchFn).toHaveBeenCalledTimes(4);
        });
    });

    describe('getStats', () => {
        it('should return accurate stats', async () => {
            const fetchFn = vi.fn(async () => ['data']);

            await Cache.getOrFetch('key1', fetchFn, 60000);
            await Cache.getOrFetch('key2', fetchFn, 60000);

            const stats = Cache.getStats();
            expect(stats.total).toBe(2);
            expect(stats.valid).toBe(2);
            expect(stats.expired).toBe(0);
        });
    });
});
