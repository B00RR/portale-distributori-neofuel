/**
 * Centralized Application State Management
 * Implements a simple Pub/Sub pattern.
 */

class Store {
    constructor() {
        this.state = {
            user: null,
            stations: [],
            stationFilter: null, // ID of selected station in Admin global filter
            filters: {
                dateFrom: null, // YYYY-MM-DD
                dateTo: null,   // YYYY-MM-DD
                searchQuery: '',
                rangeLabel: 'all' // 'today', 'week', 'month', 'custom', 'all'
            },
            pagination: {
                page: 0,
                pageSize: 50,
                totalCount: 0
            },
            loading: false,
            error: null
        };
        this.listeners = new Set();
    }

    /**
     * Get a snapshot of the current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Set the logged-in user
     * @param {Object} user 
     */
    setUser(user) {
        this.state.user = user;
        this.notify('user', user);
    }

    /**
     * Set the list of available fuel stations
     * @param {Array} stations 
     */
    setStations(stations) {
        this.state.stations = stations;
        this.notify('stations', stations);
    }

    /**
     * Update the global station filter
     * @param {number|null} stationId 
     */
    setStationFilter(stationId) {
        this.state.stationFilter = stationId;
        this.notify('stationFilter', stationId);
    }

    /**
     * Update complex filters
     * @param {Object} newFilters - partial object to merge
     */
    setFilters(newFilters) {
        this.state.filters = { ...this.state.filters, ...newFilters };
        // Reset page on filter change
        this.state.pagination.page = 0;
        this.notify('filters', this.state.filters);
        this.notify('pagination', this.state.pagination);
    }

    /**
     * Update pagination
     * @param {Object} newPagination 
     */
    setPagination(newPagination) {
        this.state.pagination = { ...this.state.pagination, ...newPagination };
        this.notify('pagination', this.state.pagination);
    }

    /**
     * Subscribe to state changes
     * @param {Function} callback - Function called with (key, value) on change
     * @returns {Function} unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of a change
     * @param {string} key 
     * @param {any} value 
     */
    notify(key, value) {
        this.listeners.forEach(listener => listener(key, value));
    }

    // --- Helpers ---

    /**
     * Get currently filtered station ID (or null for all)
     */
    getFilter() {
        return this.state.stationFilter;
    }

    getFilters() {
        return this.state.filters;
    }

    getPagination() {
        return this.state.pagination;
    }

    getUser() {
        return this.state.user;
    }
}

// Create a singleton instance
export const store = new Store();
