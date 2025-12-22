/**
 * Test per js/core/api.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase } from '../mocks/supabase.js';

// Mock del modulo api
vi.mock('../../js/core/api.js', async () => {
    const actual = await vi.importActual('../../js/core/api.js');
    return {
        ...actual,
        supabase: mockSupabase,
    };
});

import { safeSupabaseQuery } from '../../js/core/api.js';

describe('safeSupabaseQuery', () => {
    beforeEach(() => {
        mockSupabase.reset();
    });

    it('should return data on successful query', async () => {
        mockSupabase.setMockData('fuel_stations', [
            { station_id: 1, station_name: 'Station 1' }
        ]);

        const result = await safeSupabaseQuery(() =>
            mockSupabase.from('fuel_stations').select('*')
        );

        expect(result.data).toHaveLength(1);
        expect(result.data[0].station_name).toBe('Station 1');
        expect(result.error).toBeNull();
    });

    it('should throw error on failed query', async () => {
        mockSupabase.setMockError('fuel_stations', {
            message: 'Database connection failed'
        });

        await expect(
            safeSupabaseQuery(() => mockSupabase.from('fuel_stations').select('*'))
        ).rejects.toThrow('Database connection failed');
    });

    it('should handle empty results', async () => {
        mockSupabase.setMockData('fuel_stations', []);

        const result = await safeSupabaseQuery(() =>
            mockSupabase.from('fuel_stations').select('*')
        );

        expect(result.data).toHaveLength(0);
        expect(result.error).toBeNull();
    });

    it('should propagate custom error message', async () => {
        mockSupabase.setMockError('users', {
            message: 'Permission denied'
        });

        await expect(
            safeSupabaseQuery(
                () => mockSupabase.from('users').select('*'),
                'Custom error message'
            )
        ).rejects.toThrow();
    });

    it('should handle .single() queries', async () => {
        mockSupabase.setMockData('fuel_stations', [
            { station_id: 1, station_name: 'Station 1' }
        ]);

        const result = await safeSupabaseQuery(() =>
            mockSupabase.from('fuel_stations').select('*').eq('station_id', 1).single()
        );

        expect(result.data).toMatchObject({ station_id: 1 });
    });
});
