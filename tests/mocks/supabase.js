/**
 * Supabase Mock Module
 * Mock completo del client Supabase per i test
 */

import { vi } from 'vitest';

export class MockSupabaseClient {
    constructor() {
        this.mockData = new Map();
        this.mockErrors = new Map();
    }

    // Configura mock data per una tabella
    setMockData(table, data) {
        this.mockData.set(table, data);
    }

    // Configura errore per una tabella
    setMockError(table, error) {
        this.mockErrors.set(table, error);
    }

    // Reset tutti i mock
    reset() {
        this.mockData.clear();
        this.mockErrors.clear();
    }

    // Query builder
    from(table) {
        const builder = new MockQueryBuilder(table, this);
        return builder;
    }

    // Auth mock
    auth = {
        signInWithPassword: vi.fn(async ({ email, password }) => {
            if (email === 'test@example.com' && password === 'password') {
                return {
                    data: { user: { id: '123', email }, session: { token: 'mock-token' } },
                    error: null
                };
            }
            return { data: null, error: { message: 'Invalid credentials' } };
        }),
        signOut: vi.fn(async () => ({ error: null })),
        getSession: vi.fn(async () => ({
            data: { session: { user: { id: '123' } } },
            error: null
        })),
    };

    // RPC mock
    rpc = vi.fn(async (functionName, params) => {
        return { data: null, error: null };
    });
}

class MockQueryBuilder {
    constructor(table, client) {
        this.table = table;
        this.client = client;
        this.filters = {};
        this.selectedFields = '*';
        this.orderBy = null;
        this.limitCount = null;
    }

    select(fields = '*') {
        this.selectedFields = fields;
        return this;
    }

    insert(data) {
        this.insertData = data;
        return this;
    }

    update(data) {
        this.updateData = data;
        return this;
    }

    delete() {
        this.deleteFlag = true;
        return this;
    }

    eq(column, value) {
        this.filters[column] = value;
        return this;
    }

    in(column, values) {
        this.filters[`${column}_in`] = values;
        return this;
    }

    is(column, value) {
        this.filters[`${column}_is`] = value;
        return this;
    }

    order(column, options = {}) {
        this.orderBy = { column, ...options };
        return this;
    }

    limit(count) {
        this.limitCount = count;
        return this;
    }

    // Execute query
    async execute() {
        const error = this.client.mockErrors.get(this.table);
        if (error) {
            return { data: null, error };
        }

        let data = this.client.mockData.get(this.table) || [];

        // Apply filters
        if (Object.keys(this.filters).length > 0) {
            data = data.filter(row => {
                return Object.entries(this.filters).every(([key, value]) => {
                    if (key.endsWith('_in')) {
                        const field = key.replace('_in', '');
                        return value.includes(row[field]);
                    }
                    if (key.endsWith('_is')) {
                        const field = key.replace('_is', '');
                        return row[field] === value;
                    }
                    return row[key] === value;
                });
            });
        }

        // Apply limit
        if (this.limitCount) {
            data = data.slice(0, this.limitCount);
        }

        return { data, error: null };
    }

    // Terminators
    async single() {
        const result = await this.execute();
        return {
            data: result.data?.[0] || null,
            error: result.error
        };
    }

    async maybeSingle() {
        return this.single();
    }

    // Default promise behavior
    then(resolve, reject) {
        return this.execute().then(resolve, reject);
    }
}

// Export singleton per test
export const mockSupabase = new MockSupabaseClient();
