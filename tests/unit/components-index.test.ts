import { describe, it, expect } from 'vitest';

describe('UI Components Index', () => {
    it('should import without errors', async () => {
        const module = await import('../../js/ui/components/index.js');
        expect(module).toBeDefined();
        expect(module.BaseComponent).toBeDefined();
    });
});
