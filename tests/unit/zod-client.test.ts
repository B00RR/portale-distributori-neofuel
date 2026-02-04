import { describe, it, expect } from 'vitest';
import { z } from 'zod'; // Use REAL Zod

// Do NOT mock 'zod' module.
// If the module under test imports zod, let it use the real one.

describe('Zod Client Module', () => {
    it('should validate string', () => {
        const schema = z.string().email();
        const result = schema.safeParse('test@example.com');
        expect(result.success).toBe(true);
    });

    it('should fail invalid string', () => {
        const schema = z.string().email();
        const result = schema.safeParse('invalid-email');
        expect(result.success).toBe(false);
    });
});
