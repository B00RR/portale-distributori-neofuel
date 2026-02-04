import { describe, it, expect, vi } from 'vitest';

// Trivial test for re-export module
vi.mock('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm', () => ({
    createClient: vi.fn(() => ({}))
}));

import { createClient } from '../../js/core/supabase-client.js';

describe('Supabase Client Module', () => {
    it('should export createClient', () => {
        expect(createClient).toBeDefined();
    });
});
