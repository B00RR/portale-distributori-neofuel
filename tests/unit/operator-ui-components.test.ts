import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../js/ui/ui.js', () => ({
    showInfoModal: vi.fn(),
    closeModal: vi.fn()
}));

import { renderButton, renderInput, renderCard, renderAlert } from '../../js/operator/ui-components.js';

describe('Operator UI Components Module', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="test-container"></div>';
    });

    describe('THE SPECIALIST - DOM Rendering Tests', () => {
        it('should render button in DOM', () => {
            const container = document.getElementById('test-container')!;

            const button = renderButton({
                text: 'Click Me',
                className: 'primary',
                onClick: vi.fn()
            });

            container.appendChild(button);

            const rendered = container.querySelector('button');
            expect(rendered).not.toBeNull();
            expect(rendered?.textContent).toContain('Click Me');
            expect(rendered?.className).toContain('primary');
        });

        it('should render input field in DOM', () => {
            const container = document.getElementById('test-container')!;

            const input = renderInput({
                type: 'text',
                placeholder: 'Enter value',
                name: 'test-input'
            });

            container.appendChild(input);

            const rendered = container.querySelector('input');
            expect(rendered).not.toBeNull();
            expect(rendered?.type).toBe('text');
            expect(rendered?.placeholder).toBe('Enter value');
        });

        it('should render card component in DOM', () => {
            const container = document.getElementById('test-container')!;

            const card = renderCard({
                title: 'Test Card',
                content: 'Card content here',
                footer: 'Footer text'
            });

            container.appendChild(card);

            expect(container.innerHTML).toContain('Test Card');
            expect(container.innerHTML).toContain('Card content here');
        });

        it('should render alert component in DOM', () => {
            const container = document.getElementById('test-container')!;

            const alert = renderAlert({
                type: 'warning',
                message: 'This is a warning'
            });

            container.appendChild(alert);

            expect(container.innerHTML).toContain('This is a warning');
            expect(container.querySelector('.alert')).not.toBeNull();
        });

        it('should handle button click interaction', () => {
            const container = document.getElementById('test-container')!;
            const onClick = vi.fn();

            const button = renderButton({
                text: 'Interactive',
                onClick
            });

            container.appendChild(button);

            const rendered = container.querySelector('button');
            rendered?.click();

            expect(onClick).toHaveBeenCalled();
        });

        it('should handle input value changes', () => {
            const container = document.getElementById('test-container')!;
            const onInput = vi.fn();

            const input = renderInput({
                type: 'text',
                onInput
            });

            container.appendChild(input);

            const rendered = container.querySelector('input') as HTMLInputElement;
            rendered.value = 'test value';
            rendered.dispatchEvent(new Event('input'));

            expect(onInput).toHaveBeenCalled();
        });
    });
});
