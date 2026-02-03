import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks for everything used in vi.mock factories
const { mockSupabase, mockSelect, mockFrom, mockOfflineDB, mockToast, mockCache } = vi.hoisted(() => {
    const mockSelect = vi.fn();
    const mockFrom = vi.fn(() => ({
        select: mockSelect
    }));

    return {
        mockSelect,
        mockFrom,
        mockSupabase: { from: mockFrom },
        mockOfflineDB: { enqueue: vi.fn().mockResolvedValue(true) },
        mockToast: { show: vi.fn() },
        mockCache: {
            getOrFetch: vi.fn((key, fetcher) => fetcher()) // Default pass-through
        }
    };
});

// Mock dependencies
vi.mock('../../js/core/offline-db.js', () => ({
    offlineDB: mockOfflineDB
}));
vi.mock('../../js/ui/toast.js', () => ({
    Toast: mockToast
}));
vi.mock('../../js/utils/cache.js', () => ({
    Cache: mockCache,
    CACHE_KEYS: { STATION_PREFIX: 'station_' }
}));

// Mock Config
vi.mock('../../js/core/config.js', () => ({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_KEY: 'test-key'
}));

// Mock Supabase Client
vi.mock('../../js/core/supabase-client.js', () => ({
    createClient: () => mockSupabase
}));

// Import module under test
import { safeSupabaseQuery, getStationName, supabase } from '../../js/core/api.js';

describe('API Module', () => {
    // Navigator override
    const originalNavigator = global.navigator;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset Navigator to online
        Object.defineProperty(global, 'navigator', {
            value: { onLine: true },
            writable: true
        });
    });

    afterEach(() => {
        Object.defineProperty(global, 'navigator', {
            value: originalNavigator,
            writable: true
        });
    });

    describe('safeSupabaseQuery', () => {
        it('should return result on success', async () => {
            const mockResult = { data: 'test', error: null };
            const queryFn = vi.fn().mockResolvedValue(mockResult);

            const result = await safeSupabaseQuery(queryFn);
            expect(result).toEqual(mockResult);
            expect(queryFn).toHaveBeenCalled();
        });

        it('should throw error on failure', async () => {
            const mockResult = { data: null, error: { message: 'DB Error' } };
            const queryFn = vi.fn().mockResolvedValue(mockResult);

            await expect(safeSupabaseQuery(queryFn)).rejects.toThrow('DB Error');
        });

        it('should use default error message', async () => {
            const mockResult = { data: null, error: {} }; // No message
            const queryFn = vi.fn().mockResolvedValue(mockResult);

            await expect(safeSupabaseQuery(queryFn, 'Custom Error')).rejects.toThrow('Custom Error');
        });

        it('should handle Offline Mutation', async () => {
            // Simulate Offline
            Object.defineProperty(global, 'navigator', {
                value: { onLine: false },
                writable: true
            });

            const mutationFn = async () => {
                return { error: { message: 'Fetch failed' } };
            };
            mutationFn.toString = () => "function() { return supabase.from('x').insert(...) }";

            const result = await safeSupabaseQuery(mutationFn as any);

            expect(result.offline).toBe(true);
            expect(mockOfflineDB.enqueue).toHaveBeenCalled();
            expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('Connessione assente'), 'warning');
        });

        it('should NOT handle Offline for Read queries', async () => {
            Object.defineProperty(global, 'navigator', {
                value: { onLine: false },
                writable: true
            });

            const readFn = async () => {
                return { error: { message: 'Fetch failed' } };
            };
            readFn.toString = () => "function() { return supabase.from('x').select(...) }";

            await expect(safeSupabaseQuery(readFn as any)).rejects.toThrow('Fetch failed');
            expect(mockOfflineDB.enqueue).not.toHaveBeenCalled();
        });
    });

    describe('getStationName', () => {
        it('should fetch station name if not cached', async () => {
            const mockBuilder = {
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: { station_name: 'Test Station' } })
            };
            mockSelect.mockReturnValue(mockBuilder);

            const name = await getStationName(123);

            // Using expect.any(Function) because cache impl might wrap it or simple pass
            expect(mockCache.getOrFetch).toHaveBeenCalledWith('station_123', expect.any(Function), expect.any(Number));
            expect(name).toBe('Test Station');
            expect(mockSupabase.from).toHaveBeenCalledWith('fuel_stations');
        });

        it('should return ID if error occurs', async () => {
            const mockBuilder = {
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockRejectedValue(new Error('Fail'))
            };
            mockSelect.mockReturnValue(mockBuilder);

            const name = await getStationName(999);
            expect(name).toBe('#999');
        });
    });
});
