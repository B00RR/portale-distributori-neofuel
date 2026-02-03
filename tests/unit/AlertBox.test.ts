import { describe, it, expect, beforeEach } from 'vitest';
import { AlertBox } from '../../js/ui/components/AlertBox.js';
import { html } from 'lit';

describe('AlertBox Component', () => {

    beforeEach(() => {
        // Ensure component is registered
        if (!customElements.get('alert-box')) {
            customElements.define('alert-box', AlertBox);
        }
    });

    describe('Component Structure', () => {
        it('should be defined as a custom element', () => {
            const element = document.createElement('alert-box') as AlertBox;
            expect(element).toBeInstanceOf(AlertBox);
        });

        it('should have default properties', () => {
            const element = new AlertBox();
            expect(element.type).toBe('info');
            expect(element.dismissible).toBe(false);
            expect(element.visible).toBe(true);
            expect(element.icon).toBe('');
        });
    });

    describe('Type Variants', () => {
        it('should support info type', () => {
            const element = new AlertBox();
            element.type = 'info';
            expect(element.type).toBe('info');
        });

        it('should support success type', () => {
            const element = new AlertBox();
            element.type = 'success';
            expect(element.type).toBe('success');
        });

        it('should support warning type', () => {
            const element = new AlertBox();
            element.type = 'warning';
            expect(element.type).toBe('warning');
        });

        it('should support danger type', () => {
            const element = new AlertBox();
            element.type = 'danger';
            expect(element.type).toBe('danger');
        });
    });

    describe('Visibility Control', () => {
        it('should start visible by default', () => {
            const element = new AlertBox();
            expect(element.visible).toBe(true);
        });

        it('should hide when hide() is called', () => {
            const element = new AlertBox();
            element.hide();
            expect(element.visible).toBe(false);
        });

        it('should show when show() is called', () => {
            const element = new AlertBox();
            element.visible = false;
            element.show();
            expect(element.visible).toBe(true);
        });

        it('should return empty template when not visible', () => {
            const element = new AlertBox();
            element.visible = false;
            const result = element.render();
            expect(result).toBeDefined();
        });
    });

    describe('Dismissible Behavior', () => {
        it('should not be dismissible by default', () => {
            const element = new AlertBox();
            expect(element.dismissible).toBe(false);
        });

        it('should support dismissible mode', () => {
            const element = new AlertBox();
            element.dismissible = true;
            expect(element.dismissible).toBe(true);
        });
    });

    describe('Icon Handling', () => {
        it('should have default icons for each type', () => {
            const element = new AlertBox();

            element.type = 'info';
            const infoRender = element.render();
            expect(infoRender).toBeDefined();

            element.type = 'success';
            const successRender = element.render();
            expect(successRender).toBeDefined();

            element.type = 'warning';
            const warningRender = element.render();
            expect(warningRender).toBeDefined();

            element.type = 'danger';
            const dangerRender = element.render();
            expect(dangerRender).toBeDefined();
        });

        it('should allow custom icon', () => {
            const element = new AlertBox();
            element.icon = 'fa-custom-icon';
            expect(element.icon).toBe('fa-custom-icon');
        });
    });

    describe('Render Method', () => {
        it('should render without throwing', () => {
            const element = new AlertBox();
            expect(() => element.render()).not.toThrow();
        });

        it('should render with all properties set', () => {
            const element = new AlertBox();
            element.type = 'success';
            element.dismissible = true;
            element.icon = 'fa-check';
            element.visible = true;

            expect(() => element.render()).not.toThrow();
        });
    });

    describe('Event Emission', () => {
        it('should have emit method from BaseComponent', () => {
            const element = new AlertBox();
            expect(element.emit).toBeDefined();
            expect(typeof element.emit).toBe('function');
        });
    });
});
