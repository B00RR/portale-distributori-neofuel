/**
 * Vitest Global Setup
 * Mock di Supabase e window globals
 */

import { vi } from 'vitest';

// Mock Supabase Client
export const createSupabaseMock = () => {
    const mockQuery = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    return {
        from: vi.fn().mockReturnValue(mockQuery),
        auth: {
            signInWithPassword: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
            signOut: vi.fn().mockResolvedValue({ error: null }),
            getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
};

// Setup global mocks
export function setupGlobalMocks() {
    // Mock window.supabase
    global.window = global.window || {};
    global.window.supabase = createSupabaseMock();

    // Mock Html5Qrcode
    global.window.Html5Qrcode = vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        clear: vi.fn(),
    }));

    // Mock Chart.js
    global.window.Chart = vi.fn();

    // Mock document methods if needed
    if (!global.document.getElementById) {
        global.document.getElementById = vi.fn().mockReturnValue(null);
    }
}

// Eseguito prima di tutti i test
setupGlobalMocks();
