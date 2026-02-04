import { describe, it, expect } from 'vitest';

import { createClient } from '../../js/core/supabase-client.js';

describe('Supabase Client Module', () => {
    it('should export createClient from supabase', () => {
        expect(createClient).toBeDefined();
        expect(typeof createClient).toBe('function');
    });

    it('should create a client instance', () => {
        const client = createClient('https://test.supabase.co', 'test-key');

        expect(client).toBeDefined();
        expect(client.auth).toBeDefined();
    });
});
