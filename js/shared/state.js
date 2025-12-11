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

    getUser() {
        return this.state.user;
    }
}

// Create a singleton instance
export const store = new Store();
