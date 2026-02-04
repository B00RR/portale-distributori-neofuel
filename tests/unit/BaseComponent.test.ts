import { describe, it, expect } from 'vitest';

import { BaseComponent } from '../../js/ui/components/BaseComponent.js';

describe('BaseComponent', () => {
    it('should export BaseComponent class', () => {
        expect(BaseComponent).toBeDefined();
    });

    it('should have emit method', () => {
        const component = new BaseComponent();
        expect(component.emit).toBeDefined();
        expect(typeof component.emit).toBe('function');
    });

    it('should have handleComponentError method', () => {
        const component = new BaseComponent();
        expect(component.handleComponentError).toBeDefined();
        expect(typeof component.handleComponentError).toBe('function');
    });

    it('should have styles defined', () => {
        expect(BaseComponent.styles).toBeDefined();
    });
});
