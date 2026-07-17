/**
 * Sorgente unica e invalidazione degli indici stazione (#349):
 * tutti i moduli leggono la stessa lista canonica e ogni modifica di una
 * stazione invalida lista e record `station_<id>` interessati.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { orderMock, selectMock, fromMock } = vi.hoisted(() => {
    const orderMock = vi.fn();
    const selectMock = vi.fn(() => ({ order: orderMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return { orderMock, selectMock, fromMock };
});

vi.mock('../../js/core/api.js', () => ({
    supabase: { from: fromMock }
}));

import { getStations, invalidateStationCaches } from '../../js/core/stations-cache.js';
import { Cache, CACHE_KEYS } from '../../js/utils/cache.js';

const STATION_ROWS = [
    {
        station_id: 1,
        station_name: 'Neofuel Roma',
        location: 'Roma',
        allow_partial_closure: true,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        created_by_auth: null,
        updated_at: null
    },
    {
        station_id: 2,
        station_name: 'Neofuel Milano',
        location: 'Milano',
        allow_partial_closure: false,
        is_active: true,
        created_at: '2026-02-01T00:00:00.000Z',
        created_by_auth: null,
        updated_at: null
    }
];

describe('Stations cache single source (#349)', () => {
    beforeEach(() => {
        Cache.clear();
        orderMock.mockResolvedValue({ data: STATION_ROWS, error: null });
    });

    it('fetches the canonical station list once and serves it from cache', async () => {
        const first = await getStations();
        const second = await getStations();

        expect(first).toEqual(STATION_ROWS);
        expect(second).toEqual(STATION_ROWS);
        expect(fromMock).toHaveBeenCalledTimes(1);
        expect(fromMock).toHaveBeenCalledWith('fuel_stations');
        expect(selectMock).toHaveBeenCalledWith('*');
    });

    it('returns an empty list when no stations exist', async () => {
        orderMock.mockResolvedValue({ data: null, error: null });

        expect(await getStations()).toEqual([]);
    });

    it('propagates query errors to the caller', async () => {
        orderMock.mockResolvedValue({ data: null, error: new Error('boom') });

        await expect(getStations()).rejects.toThrow('boom');
        // L'errore non deve essere messo in cache.
        orderMock.mockResolvedValue({ data: STATION_ROWS, error: null });
        expect(await getStations()).toEqual(STATION_ROWS);
    });

    it('invalidateStationCaches refreshes the station list', async () => {
        await getStations();
        expect(fromMock).toHaveBeenCalledTimes(1);

        invalidateStationCaches(1);

        await getStations();
        expect(fromMock).toHaveBeenCalledTimes(2);
    });

    it('invalidateStationCaches(id) drops the cached station record too', async () => {
        Cache.set(`${CACHE_KEYS.STATION_PREFIX}1`, 'Vecchio Nome');
        Cache.set(`${CACHE_KEYS.STATION_PREFIX}2`, 'Altro Nome');
        Cache.set(CACHE_KEYS.STATIONS, STATION_ROWS);

        invalidateStationCaches(1);

        expect(Cache.get(CACHE_KEYS.STATIONS)).toBeNull();
        expect(Cache.get(`${CACHE_KEYS.STATION_PREFIX}1`)).toBeNull();
        // Gli indici delle altre stazioni non c'entrano e restano validi.
        expect(Cache.get(`${CACHE_KEYS.STATION_PREFIX}2`)).toBe('Altro Nome');
    });

    it('invalidateStationCaches without id (create) only drops the list', () => {
        Cache.set(`${CACHE_KEYS.STATION_PREFIX}1`, 'Nome Valido');
        Cache.set(CACHE_KEYS.STATIONS, STATION_ROWS);

        invalidateStationCaches();

        expect(Cache.get(CACHE_KEYS.STATIONS)).toBeNull();
        expect(Cache.get(`${CACHE_KEYS.STATION_PREFIX}1`)).toBe('Nome Valido');
    });
});
