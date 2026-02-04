import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import module under test
import { store, type User, type Station, type Filters, type Pagination } from '../../js/shared/state.js';

describe('State Module', () => {
    beforeEach(() => {
        // Reset store to initial state
        store.setUser(null);
        store.setStations([]);
        store.setStationFilter(null);
        store.setFilters({ dateFrom: null, dateTo: null, searchQuery: '', rangeLabel: 'all' });
        store.setPagination({ page: 0, pageSize: 50, totalCount: 0 });
        store.setLoading(false);
        store.setError(null);
    });

    describe('getState', () => {
        it('should return a snapshot of current state', () => {
            const state = store.getState();

            expect(state).toEqual({
                user: null,
                stations: [],
                stationFilter: null,
                filters: {
                    dateFrom: null,
                    dateTo: null,
                    searchQuery: '',
                    rangeLabel: 'all'
                },
                pagination: {
                    page: 0,
                    pageSize: 50,
                    totalCount: 0
                },
                loading: false,
                error: null
            });
        });

        it('should return independent copies (immutability check)', () => {
            const state1 = store.getState();
            const state2 = store.getState();

            expect(state1).toEqual(state2);
            expect(state1).not.toBe(state2);
        });
    });

    describe('setUser', () => {
        it('should set the user and notify listeners', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            const user: User = {
                id: 'uuid-123',
                user_id: '1',
                email: 'test@example.com',
                role: 'admin',
                full_name: 'Test Admin'
            };

            store.setUser(user);

            expect(store.getUser()).toEqual(user);
            expect(callback).toHaveBeenCalledWith('user', user);
        });

        it('should allow setting user to null', () => {
            const user: User = {
                id: 'uuid-123',
                user_id: '1',
                email: 'test@example.com',
                role: 'operator',
                full_name: 'Test Operator'
            };

            store.setUser(user);
            expect(store.getUser()).toEqual(user);

            store.setUser(null);
            expect(store.getUser()).toBeNull();
        });
    });

    describe('setStations', () => {
        it('should set the stations list and notify listeners', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            const stations: Station[] = [
                { id: 1, station_id: 1, station_name: 'Station A', name: 'Station A' },
                { id: 2, station_id: 2, station_name: 'Station B', name: 'Station B' }
            ];

            store.setStations(stations);

            expect(store.getStations()).toEqual(stations);
            expect(callback).toHaveBeenCalledWith('stations', stations);
        });

        it('should allow setting empty stations array', () => {
            const stations: Station[] = [
                { id: 1, station_id: 1, station_name: 'Station A', name: 'Station A' }
            ];

            store.setStations(stations);
            expect(store.getStations()).toEqual(stations);

            store.setStations([]);
            expect(store.getStations()).toEqual([]);
        });
    });

    describe('setStationFilter', () => {
        it('should set the station filter and notify listeners', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            store.setStationFilter('STN-123');

            expect(store.getFilter()).toBe('STN-123');
            expect(callback).toHaveBeenCalledWith('stationFilter', 'STN-123');
        });

        it('should allow setting filter to null', () => {
            store.setStationFilter('STN-456');
            expect(store.getFilter()).toBe('STN-456');

            store.setStationFilter(null);
            expect(store.getFilter()).toBeNull();
        });
    });

    describe('setFilters', () => {
        it('should merge new filters with existing filters', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            store.setFilters({ dateFrom: '2024-01-01', searchQuery: 'test' });

            const filters = store.getFilters();
            expect(filters.dateFrom).toBe('2024-01-01');
            expect(filters.searchQuery).toBe('test');
            expect(filters.dateTo).toBeNull();
            expect(filters.rangeLabel).toBe('all');

            expect(callback).toHaveBeenCalledWith('filters', expect.objectContaining({
                dateFrom: '2024-01-01',
                searchQuery: 'test'
            }));
        });

        it('should reset page to 0 when filters change', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            store.setPagination({ page: 5, pageSize: 50, totalCount: 200 });
            expect(store.getPagination().page).toBe(5);

            store.setFilters({ dateFrom: '2024-02-01' });

            expect(store.getPagination().page).toBe(0);
            expect(callback).toHaveBeenCalledWith('pagination', expect.objectContaining({ page: 0 }));
        });

        it('should notify both filters and pagination', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            store.setFilters({ rangeLabel: 'week' });

            expect(callback).toHaveBeenCalledWith('filters', expect.any(Object));
            expect(callback).toHaveBeenCalledWith('pagination', expect.any(Object));
        });
    });

    describe('setPagination', () => {
        it('should merge new pagination with existing', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            store.setPagination({ page: 3, totalCount: 150 });

            const pagination = store.getPagination();
            expect(pagination.page).toBe(3);
            expect(pagination.totalCount).toBe(150);
            expect(pagination.pageSize).toBe(50); // Default value

            expect(callback).toHaveBeenCalledWith('pagination', expect.objectContaining({
                page: 3,
                totalCount: 150
            }));
        });

        it('should allow updating only one property', () => {
            store.setPagination({ pageSize: 100 });

            const pagination = store.getPagination();
            expect(pagination.pageSize).toBe(100);
            expect(pagination.page).toBe(0);
        });
    });

    describe('setLoading', () => {
        it('should set loading state and notify listeners', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            store.setLoading(true);
            expect(store.isLoading()).toBe(true);
            expect(callback).toHaveBeenCalledWith('loading', true);

            store.setLoading(false);
            expect(store.isLoading()).toBe(false);
            expect(callback).toHaveBeenCalledWith('loading', false);
        });
    });

    describe('setError', () => {
        it('should set error message and notify listeners', () => {
            const callback = vi.fn();
            store.subscribe(callback);

            store.setError('Network error');
            expect(store.getError()).toBe('Network error');
            expect(callback).toHaveBeenCalledWith('error', 'Network error');

            store.setError(null);
            expect(store.getError()).toBeNull();
            expect(callback).toHaveBeenCalledWith('error', null);
        });
    });

    describe('subscribe and notify', () => {
        it('should notify all subscribers when state changes', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            store.subscribe(callback1);
            store.subscribe(callback2);

            store.setLoading(true);

            expect(callback1).toHaveBeenCalledWith('loading', true);
            expect(callback2).toHaveBeenCalledWith('loading', true);
        });

        it('should return unsubscribe function', () => {
            const callback = vi.fn();
            const unsubscribe = store.subscribe(callback);

            store.setLoading(true);
            expect(callback).toHaveBeenCalledTimes(1);

            unsubscribe();
            store.setLoading(false);
            expect(callback).toHaveBeenCalledTimes(1); // Not called again
        });

        it('should handle multiple subscribe/unsubscribe cycles', () => {
            const callback = vi.fn();

            const unsub1 = store.subscribe(callback);
            const unsub2 = store.subscribe(callback);

            store.setLoading(true);
            expect(callback).toHaveBeenCalledTimes(2); // Called twice

            unsub1();
            store.setLoading(false);
            expect(callback).toHaveBeenCalledTimes(3); // Called once more

            unsub2();
            store.setLoading(true);
            expect(callback).toHaveBeenCalledTimes(3); // Not called
        });
    });

    describe('Getters', () => {
        it('getUser should return current user', () => {
            expect(store.getUser()).toBeNull();

            const user: User = {
                id: 'uuid',
                user_id: '1',
                email: 'user@test.com',
                role: 'operator',
                full_name: 'Operator'
            };
            store.setUser(user);

            expect(store.getUser()).toEqual(user);
        });

        it('getStations should return current stations', () => {
            expect(store.getStations()).toEqual([]);

            const stations: Station[] = [
                { id: 1, station_id: 1, station_name: 'Station 1', name: 'Station 1' }
            ];
            store.setStations(stations);

            expect(store.getStations()).toEqual(stations);
        });

        it('getFilter should return current station filter', () => {
            expect(store.getFilter()).toBeNull();

            store.setStationFilter('STN-999');
            expect(store.getFilter()).toBe('STN-999');
        });

        it('getFilters should return current filters', () => {
            const filters = store.getFilters();
            expect(filters).toEqual({
                dateFrom: null,
                dateTo: null,
                searchQuery: '',
                rangeLabel: 'all'
            });
        });

        it('getPagination should return current pagination', () => {
            const pagination = store.getPagination();
            expect(pagination).toEqual({
                page: 0,
                pageSize: 50,
                totalCount: 0
            });
        });

        it('isLoading should return current loading state', () => {
            expect(store.isLoading()).toBe(false);

            store.setLoading(true);
            expect(store.isLoading()).toBe(true);
        });

        it('getError should return current error', () => {
            expect(store.getError()).toBeNull();

            store.setError('Test error');
            expect(store.getError()).toBe('Test error');
        });
    });
});
