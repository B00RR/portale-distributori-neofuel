/**
 * Centralized Application State Management
 * Implements a simple Pub/Sub pattern with TypeScript types.
 */

import type { UserRole } from './roles.js';

// ========== TYPE DEFINITIONS ==========

export interface User {
  id?: string;
  user_id: string;
  email: string;
  role: UserRole;
  station_id?: string | number | null;
  full_name?: string;
  assignedStations?: { id: number | string; name?: string }[];
  user_metadata?: {
    full_name?: string;
    station_id?: string;
    role?: string;
  };
}

export interface Station {
  id?: number | string;
  station_id: number;
  name?: string;
  station_name: string;
  location?: string;
  address?: string;
}

export interface Filters {
  dateFrom: string | null;
  dateTo: string | null;
  searchQuery: string;
  rangeLabel: 'today' | 'week' | 'month' | 'custom' | 'all';
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface AppState {
  user: User | null;
  stations: Station[];
  stationFilter: string | null;
  filters: Filters;
  pagination: Pagination;
  loading: boolean;
  error: string | null;
  busy: boolean;
}

export type StateKey = keyof AppState;
export type StateChangeCallback = (key: StateKey, value: unknown) => void;

// ========== STORE CLASS ==========

class Store {
  private state: AppState;
  private listeners: Set<StateChangeCallback>;

  constructor() {
    this.state = {
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
      error: null,
      busy: false
    };
    this.listeners = new Set();
  }

  /**
   * Get a snapshot of the current state
   */
  getState(): AppState {
    return { ...this.state };
  }

  /**
   * Set the logged-in user
   */
  setUser(user: User | null): void {
    this.state.user = user;
    this.notify('user', user);
  }

  /**
   * Set the list of available fuel stations
   */
  setStations(stations: Station[]): void {
    this.state.stations = stations;
    this.notify('stations', stations);
  }

  /**
   * Update the global station filter
   */
  setStationFilter(stationId: string | number | null): void {
    this.state.stationFilter = stationId === null ? null : String(stationId);
    this.notify('stationFilter', this.state.stationFilter);
  }

  /**
   * Update complex filters
   */
  setFilters(newFilters: Partial<Filters>): void {
    this.state.filters = { ...this.state.filters, ...newFilters };
    // Reset page on filter change
    this.state.pagination.page = 0;
    this.notify('filters', this.state.filters);
    this.notify('pagination', this.state.pagination);
  }

  /**
   * Update pagination
   */
  setPagination(newPagination: Partial<Pagination>): void {
    this.state.pagination = { ...this.state.pagination, ...newPagination };
    this.notify('pagination', this.state.pagination);
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.state.loading = loading;
    this.notify('loading', loading);
  }

  /**
   * Set busy state (e.g. modal open, wizard in progress)
   */
  setBusy(busy: boolean): void {
    this.state.busy = busy;
    this.notify('busy', busy);
  }

  /**
   * Set error state
   */
  setError(error: string | null): void {
    this.state.error = error;
    this.notify('error', error);
  }

  /**
   * Subscribe to state changes
   * @returns unsubscribe function
   */
  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of a change
   */
  private notify(key: StateKey, value: unknown): void {
    this.listeners.forEach(listener => listener(key, value));
  }

  // --- Getters ---

  getFilter(): string | null {
    return this.state.stationFilter;
  }

  getFilters(): Filters {
    return this.state.filters;
  }

  getPagination(): Pagination {
    return this.state.pagination;
  }

  getUser(): User | null {
    return this.state.user;
  }

  getStations(): Station[] {
    return this.state.stations;
  }

  isLoading(): boolean {
    return this.state.loading;
  }

  /**
   * Check whether the app is in a busy/critical state (modal, wizard, etc.)
   */
  isBusy(): boolean {
    return this.state.busy;
  }

  getError(): string | null {
    return this.state.error;
  }
}

// Create a singleton instance
export const store = new Store();
