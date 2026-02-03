import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Toast } from '../../js/ui/toast.js';

describe('Toast Component', () => {

    beforeEach(() => {
        // Clean up DOM
        const existing = document.getElementById('toast-container');
        if (existing) existing.remove();
    });

    afterEach(() => {
        // Clean up after tests
        const container = document.getElementById('toast-container');
        if (container) container.remove();
    });

    describe('Toast.show', () => {
        it('should create toast container if not exists', () => {
            Toast.show('Test message');

            const container = document.getElementById('toast-container');
            expect(container).not.toBeNull();
        });

        it('should create toast element', () => {
            Toast.show('Test');

            const container = document.getElementById('toast-container');
            const toasts = container?.querySelectorAll('.toast');
            expect(toasts?.length).toBeGreaterThan(0);
        });

        it('should support success type', () => {
            Toast.show('Success!', 'success');

            const toast = document.querySelector('.toast-success');
            expect(toast).not.toBeNull();
        });

        it('should support error type', () => {
            Toast.show('Error!', 'error');

            const toast = document.querySelector('.toast-error');
            expect(toast).not.toBeNull();
        });

        it('should support warning type', () => {
            Toast.show('Warning!', 'warning');

            const toast = document.querySelector('.toast-warning');
            expect(toast).not.toBeNull();
        });

        it('should support info type', () => {
            Toast.show('Info!', 'info');

            const toast = document.querySelector('.toast-info');
            expect(toast).not.toBeNull();
        });

        it('should escape HTML in message', () => {
            Toast.show('<script>alert(1)</script>', 'info');

            const container = document.getElementById('toast-container');
            expect(container?.innerHTML).not.toContain('<script>');
            expect(container?.innerHTML).toContain('&lt;script&gt;');
        });

        it('should support action buttons', () => {
            let clicked = false;
            Toast.show('With action', 'info', 5000, {
                action: {
                    text: 'Click me',
                    onClick: () => { clicked = true; }
                }
            });

            const actionBtn = document.querySelector('.toast-action-btn');
            expect(actionBtn).not.toBeNull();
            expect(actionBtn?.textContent).toContain('Click me');
        });

        it('should call action onClick when button clicked', () => {
            let clicked = false;
            Toast.show('Action test', 'info', 5000, {
                action: {
                    text: 'Action',
                    onClick: () => { clicked = true; }
                }
            });

            const actionBtn = document.querySelector('.toast-action-btn') as HTMLElement;
            actionBtn?.click();

            expect(clicked).toBe(true);
        });

        it('should support custom duration', () => {
            Toast.show('Custom duration', 'info', 100);

            const container = document.getElementById('toast-container');
            expect(container).not.toBeNull();
        });

        it('should display multiple toasts', () => {
            Toast.show('First', 'info');
            Toast.show('Second', 'success');
            Toast.show('Third', 'warning');

            const toasts = document.querySelectorAll('.toast');
            expect(toasts.length).toBe(3);
        });
    });

    describe('Toast.dismiss', () => {
        it('should remove toast element', () => {
            Toast.show('Test', 'info', 0);

            const container = document.getElementById('toast-container')!;
            const toast = container.querySelector('.toast') as HTMLElement;

            Toast.dismiss(toast, container);

            // Should start dismiss animation
            expect(toast.classList.contains('show')).toBe(false);
        });

        it('should handle already dismissed toast', () => {
            Toast.show('Test', 'info', 0);

            const container = document.getElementById('toast-container')!;
            const toast = container.querySelector('.toast') as HTMLElement;

            // Call dismiss multiple times
            Toast.dismiss(toast, container);
            Toast.dismiss(toast, container);

            // Should not throw
            expect(true).toBe(true);
        });
    });

    describe('Icon Selection', () => {
        it('should show correct icon for success', () => {
            Toast.show('Success', 'success');

            const icon = document.querySelector('.fa-check-circle');
            expect(icon).not.toBeNull();
        });

        it('should show correct icon for error', () => {
            Toast.show('Error', 'error');

            const icon = document.querySelector('.fa-exclamation-circle');
            expect(icon).not.toBeNull();
        });

        it('should show correct icon for warning', () => {
            Toast.show('Warning', 'warning');

            const icon = document.querySelector('.fa-exclamation-triangle');
            expect(icon).not.toBeNull();
        });

        it('should show correct icon for info', () => {
            Toast.show('Info', 'info');

            const icon = document.querySelector('.fa-info-circle');
            expect(icon).not.toBeNull();
        });
    });
});
