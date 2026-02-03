import { describe, it, expect, beforeEach } from 'vitest';
import { LoadingState } from '../../js/ui/components/LoadingState.js';

describe('LoadingState Component', () => {

    beforeEach(() => {
        // Ensure component is registered
        if (!customElements.get('loading-state')) {
            customElements.define('loading-state', LoadingState);
        }
    });

    describe('Component Structure', () => {
        it('should be defined as a custom element', () => {
            const element = document.createElement('loading-state') as LoadingState;
            expect(element).toBeInstanceOf(LoadingState);
        });

        it('should have default properties', () => {
            const element = new LoadingState();
            expect(element.message).toBe('Caricamento...');
            expect(element.size).toBe('medium');
        });
    });

    describe('Message Property', () => {
        it('should support custom message', () => {
            const element = new LoadingState();
            element.message = 'Loading data...';
            expect(element.message).toBe('Loading data...');
        });

        it('should render with default message', () => {
            const element = new LoadingState();
            expect(() => element.render()).not.toThrow();
        });

        it('should render with custom message', () => {
            const element = new LoadingState();
            element.message = 'Please wait...';
            expect(() => element.render()).not.toThrow();
        });

        it('should render without message when empty', () => {
            const element = new LoadingState();
            element.message = '';
            expect(() => element.render()).not.toThrow();
        });
    });

    describe('Size Variants', () => {
        it('should default to medium size', () => {
            const element = new LoadingState();
            expect(element.size).toBe('medium');
        });

        it('should support small size', () => {
            const element = new LoadingState();
            element.size = 'small';
            expect(element.size).toBe('small');
        });

        it('should support medium size', () => {
            const element = new LoadingState();
            element.size = 'medium';
            expect(element.size).toBe('medium');
        });

        it('should support large size', () => {
            const element = new LoadingState();
            element.size = 'large';
            expect(element.size).toBe('large');
        });
    });

    describe('Render Method', () => {
        it('should render without throwing', () => {
            const element = new LoadingState();
            expect(() => element.render()).not.toThrow();
        });

        it('should render with all properties set', () => {
            const element = new LoadingState();
            element.message = 'Custom loading message';
            element.size = 'large';

            expect(() => element.render()).not.toThrow();
        });

        it('should render small spinner', () => {
            const element = new LoadingState();
            element.size = 'small';
            element.message = 'Loading...';

            const result = element.render();
            expect(result).toBeDefined();
        });

        it('should render large spinner', () => {
            const element = new LoadingState();
            element.size = 'large';
            element.message = 'Please wait...';

            const result = element.render();
            expect(result).toBeDefined();
        });
    });

    describe('Inheritance', () => {
        it('should have emit method from BaseComponent', () => {
            const element = new LoadingState();
            expect(element.emit).toBeDefined();
            expect(typeof element.emit).toBe('function');
        });
    });
});
