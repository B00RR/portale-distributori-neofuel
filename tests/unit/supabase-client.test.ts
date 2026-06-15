import { describe, it, expect, vi } from 'vitest';

// Trivial test for re-export module
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({}))
}));

import { createClient } from '../../js/core/supabase-client.js';

describe('Supabase Client Module', () => {
    it('should export createClient', () => {
        expect(createClient).toBeDefined();
    });
});
