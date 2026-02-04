import { describe, it, expect } from 'vitest';

import { z } from '../../js/core/zod-client.js';

describe('Zod Client Module', () => {
    it('should export z from zod library', () => {
        expect(z).toBeDefined();
        expect(z.string).toBeDefined();
        expect(z.number).toBeDefined();
    });

    it('should allow creating schemas', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number()
        });

        expect(schema).toBeDefined();
    });

    it('should validate data', () => {
        const schema = z.string().email();
        const result = schema.safeParse('test@example.com');

        expect(result.success).toBe(true);
    });
});
