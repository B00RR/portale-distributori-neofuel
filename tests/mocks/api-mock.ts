import { vi } from 'vitest';

export const supabase = {
    from: vi.fn(() => ({
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: [], count: 0 })),
                    single: vi.fn(() => Promise.resolve({ data: null })),
                    maybeSingle: vi.fn(() => Promise.resolve({ data: null }))
                })),
                single: vi.fn(() => Promise.resolve({ data: null })),
                maybeSingle: vi.fn(() => Promise.resolve({ data: null }))
            })),
            order: vi.fn(() => ({
                range: vi.fn(() => Promise.resolve({ data: [], count: 0 }))
            })),
            maybeSingle: vi.fn(() => Promise.resolve({ data: null }))
        })),
        delete: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null }))
        })),
        insert: vi.fn(() => ({
            select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null }))
            }))
        }))
    }))
};

export const getStationName = vi.fn((id) => Promise.resolve(`Station ${id}`));
export const safeSupabaseQuery = vi.fn(async (fn) => await fn());
export const Cache = {
    getOrFetch: vi.fn((key, fn) => fn())
};
export const CACHE_KEYS = {
    STATION_PREFIX: 'station_'
};
