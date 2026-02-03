import { describe, it, expect } from 'vitest';
import { Validators, validateForm, formatErrorMessages } from '../../js/shared/validators.js';

describe('Validators Module', () => {

    describe('Validators.required', () => {
        it('should return true for valid values', () => {
            expect(Validators.required('test')).toBe(true);
            expect(Validators.required(0)).toBe(true);
            expect(Validators.required(false)).toBe(true); // false is present
        });

        it('should return error for empty values', () => {
            expect(Validators.required(null)).toBe('Campo obbligatorio');
            expect(Validators.required(undefined)).toBe('Campo obbligatorio');
            expect(Validators.required('')).toBe('Campo obbligatorio');
            expect(Validators.required('   ')).toBe('Campo obbligatorio');
        });
    });

    describe('Validators.email', () => {
        it('should validate correct emails', () => {
            expect(Validators.email('test@example.com')).toBe(true);
            expect(Validators.email('user.name@domain.co.uk')).toBe(true);
        });

        it('should allow empty if not mandatory (logic check)', () => {
            // Implementation: if (!value) return true
            expect(Validators.email('')).toBe(true);
            expect(Validators.email(null)).toBe(true);
        });

        it('should reject invalid emails', () => {
            expect(Validators.email('plainstring')).toBe('Email non valida');
            expect(Validators.email('@domain.com')).toBe('Email non valida');
            expect(Validators.email('user@')).toBe('Email non valida');
            expect(Validators.email('user@domain')).toBe('Email non valida'); // Require TLD? Regex dependent
        });
    });

    describe('Validators.minLength', () => {
        const min5 = Validators.minLength(5);

        it('should pass if long enough', () => {
            expect(min5('12345')).toBe(true);
            expect(min5('123456')).toBe(true);
        });

        it('should fail if too short', () => {
            expect(min5('1234')).toBe('Minimo 5 caratteri');
        });

        it('should allow empty', () => {
            expect(min5('')).toBe(true);
            expect(min5(null)).toBe(true);
        });
    });

    describe('Validators.number', () => {
        it('should pass for valid numbers', () => {
            expect(Validators.number(123)).toBe(true);
            expect(Validators.number('123')).toBe(true);
            expect(Validators.number('123.45')).toBe(true);
            expect(Validators.number(0)).toBe(true);
        });

        it('should fail for non-numbers', () => {
            expect(Validators.number('abc')).toBe('Deve essere un numero');
            expect(Validators.number('12abc')).toBe('Deve essere un numero');
        });

        it('should allow empty', () => {
            expect(Validators.number('')).toBe(true);
            expect(Validators.number(null)).toBe(true);
        });
    });

    describe('Validators.minValue', () => {
        const min10 = Validators.minValue(10);

        it('should pass if >= min', () => {
            expect(min10(10)).toBe(true);
            expect(min10(11)).toBe(true);
            expect(min10('15')).toBe(true);
        });

        it('should fail if < min', () => {
            expect(min10(9)).toBe('Deve essere almeno 10');
            expect(min10('5')).toBe('Deve essere almeno 10');
        });

        it('should allow empty', () => {
            expect(min10('')).toBe(true);
        });
    });

    describe('Validators.maxValue', () => {
        const max100 = Validators.maxValue(100);

        it('should pass if <= max', () => {
            expect(max100(100)).toBe(true);
            expect(max100(50)).toBe(true);
        });

        it('should fail if > max', () => {
            expect(max100(101)).toBe('Non può superare 100');
        });

        it('should allow empty', () => {
            expect(max100('')).toBe(true);
        });
    });

    describe('validateForm', () => {
        const schema = {
            name: [Validators.required, Validators.minLength(3)],
            age: [Validators.required, Validators.number, Validators.minValue(18)],
            email: [Validators.email]
        };

        it('should return null if valid', () => {
            const data = {
                name: 'John',
                age: 25,
                email: 'john@example.com'
            };
            expect(validateForm(data, schema)).toBeNull();
        });

        it('should return errors for invalid fields', () => {
            const data = {
                name: 'Jo', // Too short
                age: 'not a number',
                email: 'invalid-email'
            };
            const errors = validateForm(data, schema);

            expect(errors).not.toBeNull();
            expect(errors?.name).toBe('Minimo 3 caratteri'); // Should skip required (passed) and hit minLength
            expect(errors?.age).toBe('Deve essere un numero');
            expect(errors?.email).toBe('Email non valida');
        });

        it('should stop at first error per field', () => {
            const data = {
                name: '', // Fails required
            };
            const errors = validateForm(data, schema);

            expect(errors?.name).toBe('Campo obbligatorio');
            // Should NOT return 'Minimo 3 caratteri' because it broke early
        });
    });

    describe('formatErrorMessages', () => {
        it('should join errors with newlines', () => {
            const errors = {
                field1: 'Error 1',
                field2: 'Error 2'
            };
            expect(formatErrorMessages(errors)).toBe('Error 1\nError 2');
        });

        it('should return empty string for null', () => {
            expect(formatErrorMessages(null)).toBe('');
        });
    });

});
