import { describe, it, expect, beforeEach } from 'vitest';
import { FormField, FormFieldOption } from '../../js/ui/components/FormField.js';

describe('FormField Component', () => {

    beforeEach(() => {
        if (!customElements.get('form-field')) {
            customElements.define('form-field', FormField);
        }
    });

    describe('Component Structure', () => {
        it('should be defined as a custom element', () => {
            const element = document.createElement('form-field') as FormField;
            expect(element).toBeInstanceOf(FormField);
        });

        it('should have default properties', () => {
            const element = new FormField();
            expect(element.label).toBe('');
            expect(element.name).toBe('');
            expect(element.type).toBe('text');
            expect(element.value).toBe('');
            expect(element.placeholder).toBe('');
            expect(element.required).toBe(false);
            expect(element.disabled).toBe(false);
            expect(element.error).toBe('');
            expect(element.options).toEqual([]);
            expect(element.rows).toBe(3);
            expect(element.step).toBe('any');
        });
    });

    describe('Text Input', () => {
        it('should render text input by default', () => {
            const element = new FormField();
            element.name = 'username';
            element.label = 'Username';

            expect(() => element.render()).not.toThrow();
        });

        it('should support placeholder', () => {
            const element = new FormField();
            element.placeholder = 'Enter username';
            expect(element.placeholder).toBe('Enter username');
        });

        it('should support value property', () => {
            const element = new FormField();
            element.value = 'John Doe';
            expect(element.value).toBe('John Doe');
        });
    });

    describe('Input Types', () => {
        it('should support text type', () => {
            const element = new FormField();
            element.type = 'text';
            expect(element.type).toBe('text');
        });

        it('should support email type', () => {
            const element = new FormField();
            element.type = 'email';
            expect(element.type).toBe('email');
        });

        it('should support password type', () => {
            const element = new FormField();
            element.type = 'password';
            expect(element.type).toBe('password');
        });

        it('should support number type', () => {
            const element = new FormField();
            element.type = 'number';
            element.value = '42';
            expect(element.type).toBe('number');
        });

        it('should support checkbox type', () => {
            const element = new FormField();
            element.type = 'checkbox';
            expect(element.type).toBe('checkbox');
        });

        it('should support textarea type', () => {
            const element = new FormField();
            element.type = 'textarea';
            expect(element.type).toBe('textarea');
        });

        it('should support select type', () => {
            const element = new FormField();
            element.type = 'select';
            expect(element.type).toBe('select');
        });
    });

    describe('Select Field', () => {
        it('should render select with string options', () => {
            const element = new FormField();
            element.type = 'select';
            element.options = ['Option 1', 'Option 2', 'Option 3'];

            expect(() => element.render()).not.toThrow();
        });

        it('should render select with object options', () => {
            const element = new FormField();
            element.type = 'select';
            element.options = [
                { value: '1', label: 'First' },
                { value: '2', label: 'Second' }
            ];

            expect(() => element.render()).not.toThrow();
        });

        it('should support option selection', () => {
            const element = new FormField();
            element.type = 'select';
            element.options = ['A', 'B', 'C'];
            element.value = 'B';

            expect(element.value).toBe('B');
        });
    });

    describe('Textarea Field', () => {
        it('should render textarea', () => {
            const element = new FormField();
            element.type = 'textarea';
            element.rows = 5;

            expect(() => element.render()).not.toThrow();
        });

        it('should support rows property', () => {
            const element = new FormField();
            element.type = 'textarea';
            element.rows = 10;

            expect(element.rows).toBe(10);
        });
    });

    describe('Number Input', () => {
        it('should support min and max', () => {
            const element = new FormField();
            element.type = 'number';
            element.min = '0';
            element.max = '100';

            expect(element.min).toBe('0');
            expect(element.max).toBe('100');
        });

        it('should support step', () => {
            const element = new FormField();
            element.type = 'number';
            element.step = '0.01';

            expect(element.step).toBe('0.01');
        });
    });

    describe('Required Field', () => {
        it('should not be required by default', () => {
            const element = new FormField();
            expect(element.required).toBe(false);
        });

        it('should support required property', () => {
            const element = new FormField();
            element.required = true;
            expect(element.required).toBe(true);
        });

        it('should render with required label', () => {
            const element = new FormField();
            element.label = 'Email';
            element.required = true;

            expect(() => element.render()).not.toThrow();
        });
    });

    describe('Disabled State', () => {
        it('should not be disabled by default', () => {
            const element = new FormField();
            expect(element.disabled).toBe(false);
        });

        it('should support disabled property', () => {
            const element = new FormField();
            element.disabled = true;
            expect(element.disabled).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should not have error by default', () => {
            const element = new FormField();
            expect(element.error).toBe('');
        });

        it('should support error property', () => {
            const element = new FormField();
            element.error = 'This field is required';
            expect(element.error).toBe('This field is required');
        });

        it('should have setError method', () => {
            const element = new FormField();
            element.setError('Invalid email');
            expect(element.error).toBe('Invalid email');
        });

        it('should have clearError method', () => {
            const element = new FormField();
            element.error = 'Some error';
            element.clearError();
            expect(element.error).toBe('');
        });

        it('should render error message', () => {
            const element = new FormField();
            element.error = 'Error message';

            expect(() => element.render()).not.toThrow();
        });
    });

    describe('Label Rendering', () => {
        it('should render without label if not provided', () => {
            const element = new FormField();
            expect(() => element.render()).not.toThrow();
        });

        it('should render with label', () => {
            const element = new FormField();
            element.label = 'Field Label';

            expect(() => element.render()).not.toThrow();
        });
    });

    describe('getValue Method', () => {
        it('should have getValue method', () => {
            const element = new FormField();
            expect(element.getValue).toBeDefined();
            expect(typeof element.getValue).toBe('function');
        });

        it('should return value when no input', () => {
            const element = new FormField();
            element.value = 'test value';
            const result = element.getValue();
            expect(result).toBe('test value');
        });
    });

    describe('Render Method', () => {
        it('should render without throwing', () => {
            const element = new FormField();
            expect(() => element.render()).not.toThrow();
        });

        it('should render all input types', () => {
            const types = ['text', 'email', 'password', 'number', 'checkbox', 'textarea', 'select'];

            types.forEach(type => {
                const element = new FormField();
                element.type = type;
                if (type === 'select') {
                    element.options = ['Option 1'];
                }
                expect(() => element.render()).not.toThrow();
            });
        });

        it('should render with all properties set', () => {
            const element = new FormField();
            element.label = 'Test Field';
            element.name = 'test';
            element.type = 'text';
            element.value = 'value';
            element.placeholder = 'Enter text';
            element.required = true;
            element.disabled = false;
            element.error = '';

            expect(() => element.render()).not.toThrow();
        });
    });

    describe('Inheritance', () => {
        it('should have emit method from BaseComponent', () => {
            const element = new FormField();
            expect(element.emit).toBeDefined();
            expect(typeof element.emit).toBe('function');
        });
    });
});
