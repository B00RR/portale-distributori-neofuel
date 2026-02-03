import { describe, it, expect } from 'vitest';
import {
    Validators,
    validateForm,
    formatErrorMessages
} from '../../js/shared/validators.js';

describe('Validators', () => {

    describe('Validators.required', () => {
        it('should return true for non-empty string', () => {
            expect(Validators.required('hello')).toBe(true);
        });

        it('should return error for null', () => {
            expect(Validators.required(null)).toBe('Campo obbligatorio');
        });

        it('should return error for undefined', () => {
            expect(Validators.required(undefined)).toBe('Campo obbligatorio');
        });

        it('should return error for empty string', () => {
            expect(Validators.required('')).toBe('Campo obbligatorio');
        });

        it('should return error for whitespace-only string', () => {
            expect(Validators.required('   ')).toBe('Campo obbligatorio');
        });

        it('should return true for number zero', () => {
            expect(Validators.required(0)).toBe(true);
        });

        it('should return true for boolean false', () => {
            expect(Validators.required(false)).toBe(true);
        });
    });

    describe('Validators.email', () => {
        it('should return true for valid email', () => {
            expect(Validators.email('test@example.com')).toBe(true);
        });

        it('should return true for empty value (optional)', () => {
            expect(Validators.email('')).toBe(true);
            expect(Validators.email(null)).toBe(true);
            expect(Validators.email(undefined)).toBe(true);
        });

        it('should return error for invalid email format', () => {
            expect(Validators.email('notanemail')).toBe('Email non valida');
            expect(Validators.email('test@')).toBe('Email non valida');
            expect(Validators.email('@example.com')).toBe('Email non valida');
            expect(Validators.email('test @example.com')).toBe('Email non valida');
        });

        it('should accept various valid email formats', () => {
            expect(Validators.email('user+tag@domain.co.uk')).toBe(true);
            expect(Validators.email('firstname.lastname@company.com')).toBe(true);
            expect(Validators.email('email@subdomain.example.com')).toBe(true);
        });
    });

    describe('Validators.minLength', () => {
        it('should return true when length meets minimum', () => {
            const validator = Validators.minLength(5);
            expect(validator('hello')).toBe(true);
            expect(validator('hello world')).toBe(true);
        });

        it('should return error when length is too short', () => {
            const validator = Validators.minLength(10);
            expect(validator('short')).toBe('Minimo 10 caratteri');
        });

        it('should return true for empty value (optional)', () => {
            const validator = Validators.minLength(5);
            expect(validator('')).toBe(true);
            expect(validator(null)).toBe(true);
            expect(validator(undefined)).toBe(true);
        });

        it('should work with numbers converted to strings', () => {
            const validator = Validators.minLength(3);
            expect(validator(12345)).toBe(true); // '12345' has 5 chars
            expect(validator(12)).toBe('Minimo 3 caratteri'); // '12' has 2 chars
        });
    });

    describe('Validators.number', () => {
        it('should return true for valid numbers', () => {
            expect(Validators.number(123)).toBe(true);
            expect(Validators.number('456')).toBe(true);
            expect(Validators.number(0)).toBe(true);
            expect(Validators.number(-10)).toBe(true);
            expect(Validators.number(3.14)).toBe(true);
        });

        it('should return true for empty value (optional)', () => {
            expect(Validators.number('')).toBe(true);
            expect(Validators.number(null)).toBe(true);
            expect(Validators.number(undefined)).toBe(true);
        });

        it('should return error for non-numeric values', () => {
            expect(Validators.number('abc')).toBe('Deve essere un numero');
            expect(Validators.number('12abc')).toBe('Deve essere un numero');
        });

        it('should return error for Infinity and NaN', () => {
            expect(Validators.number(Infinity)).toBe('Deve essere un numero');
            expect(Validators.number(NaN)).toBe('Deve essere un numero');
        });
    });

    describe('Validators.minValue', () => {
        it('should return true when value meets minimum', () => {
            const validator = Validators.minValue(10);
            expect(validator(10)).toBe(true);
            expect(validator(15)).toBe(true);
            expect(validator('20')).toBe(true);
        });

        it('should return error when value is below minimum', () => {
            const validator = Validators.minValue(100);
            expect(validator(50)).toBe('Deve essere almeno 100');
            expect(validator('75')).toBe('Deve essere almeno 100');
        });

        it('should return true for empty value (optional)', () => {
            const validator = Validators.minValue(10);
            expect(validator('')).toBe(true);
            expect(validator(null)).toBe(true);
            expect(validator(undefined)).toBe(true);
        });

        it('should work with decimal numbers', () => {
            const validator = Validators.minValue(5.5);
            expect(validator(5.6)).toBe(true);
            expect(validator(5.4)).toBe('Deve essere almeno 5.5');
        });
    });

    describe('Validators.maxValue', () => {
        it('should return true when value is below maximum', () => {
            const validator = Validators.maxValue(100);
            expect(validator(50)).toBe(true);
            expect(validator(100)).toBe(true);
            expect(validator('75')).toBe(true);
        });

        it('should return error when value exceeds maximum', () => {
            const validator = Validators.maxValue(50);
            expect(validator(100)).toBe('Non può superare 50');
            expect(validator('65')).toBe('Non può superare 50');
        });

        it('should return true for empty value (optional)', () => {
            const validator = Validators.maxValue(100);
            expect(validator('')).toBe(true);
            expect(validator(null)).toBe(true);
            expect(validator(undefined)).toBe(true);
        });

        it('should work with decimal numbers', () => {
            const validator = Validators.maxValue(10.5);
            expect(validator(10.4)).toBe(true);
            expect(validator(10.6)).toBe('Non può superare 10.5');
        });
    });

    describe('validateForm', () => {
        it('should return null when all validations pass', () => {
            const data = {
                name: 'John Doe',
                email: 'john@example.com',
                age: 25
            };

            const schema = {
                name: [Validators.required, Validators.minLength(3)],
                email: [Validators.required, Validators.email],
                age: [Validators.required, Validators.number, Validators.minValue(18)]
            };

            const errors = validateForm(data, schema);
            expect(errors).toBeNull();
        });

        it('should return errors object when validations fail', () => {
            const data = {
                name: '',
                email: 'invalid-email',
                age: 15
            };

            const schema = {
                name: [Validators.required],
                email: [Validators.email],
                age: [Validators.minValue(18)]
            };

            const errors = validateForm(data, schema);
            expect(errors).not.toBeNull();
            expect(errors!.name).toBe('Campo obbligatorio');
            expect(errors!.email).toBe('Email non valida');
            expect(errors!.age).toBe('Deve essere almeno 18');
        });

        it('should stop at first failed rule for each field', () => {
            const data = {
                password: ''
            };

            const schema = {
                password: [Validators.required, Validators.minLength(8)]
            };

            const errors = validateForm(data, schema);
            expect(errors).not.toBeNull();
            // Should only show 'Campo obbligatorio', not minLength error
            expect(errors!.password).toBe('Campo obbligatorio');
        });

        it('should handle empty schema', () => {
            const data = { anything: 'value' };
            const schema = {};

            const errors = validateForm(data, schema);
            expect(errors).toBeNull();
        });
    });

    describe('formatErrorMessages', () => {
        it('should return empty string for null errors', () => {
            expect(formatErrorMessages(null)).toBe('');
        });

        it('should format single error', () => {
            const errors = { name: 'Campo obbligatorio' };
            expect(formatErrorMessages(errors)).toBe('Campo obbligatorio');
        });

        it('should format multiple errors with newlines', () => {
            const errors = {
                name: 'Campo obbligatorio',
                email: 'Email non valida',
                age: 'Deve essere almeno 18'
            };

            const result = formatErrorMessages(errors);
            expect(result).toContain('Campo obbligatorio');
            expect(result).toContain('Email non valida');
            expect(result).toContain('Deve essere almeno 18');
            expect(result.split('\n').length).toBe(3);
        });
    });
});
