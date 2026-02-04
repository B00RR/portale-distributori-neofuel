import { describe, it, expect } from 'vitest';

describe('BaseComponent', () => {
    it('should export BaseComponent class', async () => {
        const module = await import('../../js/ui/components/BaseComponent.js');
        expect(module.BaseComponent).toBeDefined();
    });

    it('should have static styles', async () => {
        const { BaseComponent } = await import('../../js/ui/components/BaseComponent.js');
        expect(BaseComponent.styles).toBeDefined();
    });
});
