import { describe, it, expect } from 'vitest';

describe('Auth Module', () => {
    it('should import without errors', async () => {
        const module = await import('../../js/core/auth.js');
        expect(module).toBeDefined();
    });
});
