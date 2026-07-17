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

    // #349: un fetch ancora in volo non deve ripopolare una chiave invalidata
    // nel frattempo, altrimenti la cache diverge dallo stato reale del DB.
    describe('atomic invalidation vs in-flight fetches', () => {
        function deferredFetch<T>(): { fetchFn: () => Promise<T>; resolve: (value: T) => void } {
            let resolveFn!: (value: T) => void;
            const fetchFn = vi.fn(
                () =>
                    new Promise<T>(resolve => {
                        resolveFn = resolve;
                    })
            );
            return { fetchFn, resolve: value => resolveFn(value) };
        }

        it('invalidate during an in-flight fetch prevents stale repopulation', async () => {
            const { fetchFn, resolve } = deferredFetch<string>();

            const pending = Cache.getOrFetch('stations', fetchFn, 60000);
            Cache.invalidate('stations');
            resolve('stale-data');

            // Il chiamante riceve comunque il dato che aveva richiesto...
            await expect(pending).resolves.toBe('stale-data');
            // ...ma la cache non viene ripopolata con dati pre-invalidazione.
            expect(Cache.get('stations')).toBeNull();

            const refetch = vi.fn(async () => 'fresh-data');
            await expect(Cache.getOrFetch('stations', refetch, 60000)).resolves.toBe('fresh-data');
            expect(refetch).toHaveBeenCalledTimes(1);
        });

        it('invalidateByPrefix during an in-flight fetch prevents stale repopulation', async () => {
            const { fetchFn, resolve } = deferredFetch<string>();

            const pending = Cache.getOrFetch('station_9', fetchFn, 60000);
            Cache.invalidateByPrefix('station_');
            resolve('old-name');

            await expect(pending).resolves.toBe('old-name');
            expect(Cache.get('station_9')).toBeNull();
        });

        it('clear during an in-flight fetch prevents stale repopulation', async () => {
            const { fetchFn, resolve } = deferredFetch<string>();

            const pending = Cache.getOrFetch('stations', fetchFn, 60000);
            Cache.clear();
            resolve('old-list');

            await expect(pending).resolves.toBe('old-list');
            expect(Cache.get('stations')).toBeNull();
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
