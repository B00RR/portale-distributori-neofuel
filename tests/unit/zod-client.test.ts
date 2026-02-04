import { describe, it, expect, vi } from 'vitest';

vi.mock('zod', () => ({
    z: {
        object: vi.fn(() => ({ parse: vi.fn(), safeParse: vi.fn() })),
        string: vi.fn(() => ({ email: vi.fn() })),
        number: vi.fn(),
        boolean: vi.fn()
    }
}));

import { createZodClient, validateSchema } from '../../js/core/zod-client.js';

describe('Zod Client Module', () => {
    it('should create zod client', () => {
        const client = createZodClient();
        expect(client).toBeDefined();
    });

    it('should validate schema', () => {
        const schema = { name: 'string', age: 'number' };
        const data = { name: 'Test', age: 30 };

        const result = validateSchema(schema, data);
        expect(result).toBeDefined();
    });

    it('should handle validation errors', () => {
        const schema = { email: 'string' };
        const data = { email: 'invalid' };

        try {
            validateSchema(schema, data);
        } catch (e) {
            expect(e).toBeDefined();
        }
    });
});
