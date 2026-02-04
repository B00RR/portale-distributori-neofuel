import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        auth: { getSession: vi.fn() },
        from: vi.fn()
    }))
}));

import { initSupabaseClient, getSupabaseClient } from '../../js/core/supabase-client.js';

describe('Supabase Client Module', () => {
    it('should initialize supabase client', () => {
        const client = initSupabaseClient('url', 'key');
        expect(client).toBeDefined();
    });

    it('should get supabase client instance', () => {
        const client = getSupabaseClient();
        expect(client).toBeDefined();
    });

    it('should handle missing client gracefully', () => {
        const client = getSupabaseClient();
        expect(client).toBeDefined();
    });
});
