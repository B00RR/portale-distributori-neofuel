import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    escapeHtml,
    formatEuro,
    formatNumberIt,
    slugifyLabel,
    formatDate,
    debounce,
    formatLitri,
    formatGunCounter,
    parseGunCounter,
    parseNumberFlexible,
    base64ToArrayBuffer
} from '../../js/utils/utils.js';

describe('Utils Module', () => {

    describe('escapeHtml (Security)', () => {
        it('should escape simple script tags', () => {
            const input = '<script>alert(1)</script>';
            const output = escapeHtml(input);
            expect(output).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        });

        it('should escape quotes and ampersands', () => {
            const input = '" & \'';
            const output = escapeHtml(input);
            expect(output).toBe('&quot; &amp; &#039;');
        });

        it('should handle null or undefined safely', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
        });

        it('should handle numbers by converting to string', () => {
            expect(escapeHtml(123)).toBe('123');
        });
    });

    describe('Formatting', () => {
        it('formatEuro should format currency correctly', () => {
            expect(formatEuro(1000)).toBe('€ 1.000,00');
            expect(formatEuro(10.5)).toBe('€ 10,50');
            expect(formatEuro(0)).toBe('€ 0,00');
        });

        it('formatNumberIt should format local numbers', () => {
            expect(formatNumberIt(1234.56, 2)).toBe('1.234,56');
            expect(formatNumberIt(1234.56, 0)).toBe('1.235'); // Rounding check
        });

        it('formatDate should return empty string for invalid dates', () => {
            expect(formatDate(null)).toBe('');
            expect(formatDate('invalid-date')).toBe('invalid-date'); // Fallback behavior
        });

        it('formatLitri should format liters with 2 decimals', () => {
            expect(formatLitri(1234.567)).toBe('1.234,57');
            expect(formatLitri(100)).toBe('100,00');
            expect(formatLitri('250.5')).toBe('250,50');
        });

        it('formatGunCounter should format with 2 decimals', () => {
            expect(formatGunCounter(1234.567)).toBe('1.234,57');
            expect(formatGunCounter(0)).toBe('0,00');
            expect(formatGunCounter('999.99')).toBe('999,99');
        });
    });

    describe('slugifyLabel', () => {
        it('should create url-safe slugs', () => {
            expect(slugifyLabel('Hello World!')).toBe('hello-world');
            expect(slugifyLabel('  Trim Me  ')).toBe('trim-me');
            expect(slugifyLabel('Chiusura Turno 1')).toBe('chiusura-turno-1');
        });

        it('should fallback to default if empty', () => {
            expect(slugifyLabel('')).toBe('chiusura');
            expect(slugifyLabel(null)).toBe('chiusura');
        });

        it('should handle special characters', () => {
            expect(slugifyLabel('Test@#$%123')).toBe('test-123');
            expect(slugifyLabel('---multiple---dashes---')).toBe('multiple-dashes');
        });
    });

    describe('parseGunCounter', () => {
        it('should parse Italian format numbers', () => {
            expect(parseGunCounter('1.234,56')).toBe(1234.56);
            expect(parseGunCounter('1,5')).toBe(1.5);
            expect(parseGunCounter('100')).toBe(100);
        });

        it('should handle null/undefined as zero', () => {
            expect(parseGunCounter(null)).toBe(0);
            expect(parseGunCounter(undefined)).toBe(0);
            expect(parseGunCounter('')).toBe(0);
        });

        it('should handle numeric inputs', () => {
            expect(parseGunCounter(1234.56)).toBe(1234.56);
            expect(parseGunCounter(0)).toBe(0);
        });

        it('should return zero for invalid input', () => {
            expect(parseGunCounter('invalid')).toBe(0);
            expect(parseGunCounter(NaN)).toBe(0);
            expect(parseGunCounter(Infinity)).toBe(0);
        });
    });

    describe('parseNumberFlexible', () => {
        it('should parse various number formats', () => {
            expect(parseNumberFlexible('1.234,56')).toBeCloseTo(1234.56, 2);
            expect(parseNumberFlexible('1234.56')).toBeCloseTo(1234.56, 2);
            expect(parseNumberFlexible('100')).toBe(100);
        });

        it('should handle null/undefined/empty as zero', () => {
            expect(parseNumberFlexible(null)).toBe(0);
            expect(parseNumberFlexible(undefined)).toBe(0);
            expect(parseNumberFlexible('')).toBe(0);
            expect(parseNumberFlexible('   ')).toBe(0);
        });

        it('should handle numeric inputs directly', () => {
            expect(parseNumberFlexible(42)).toBe(42);
            expect(parseNumberFlexible(3.14)).toBeCloseTo(3.14, 2);
        });
    });

    describe('base64ToArrayBuffer', () => {
        it('should convert valid base64 to ArrayBuffer', () => {
            const base64 = btoa('Hello World');
            const result = base64ToArrayBuffer(base64);

            expect(result).toBeInstanceOf(ArrayBuffer);
            expect(result).not.toBeNull();

            // Decode back to verify
            const bytes = new Uint8Array(result as ArrayBuffer);
            const decoded = String.fromCharCode(...Array.from(bytes));
            expect(decoded).toBe('Hello World');
        });

        it('should return null for empty/null/undefined input', () => {
            expect(base64ToArrayBuffer(null)).toBeNull();
            expect(base64ToArrayBuffer(undefined)).toBeNull();
            expect(base64ToArrayBuffer('')).toBeNull();
            expect(base64ToArrayBuffer('   ')).toBeNull();
        });

        it('should handle base64 with whitespace', () => {
            const base64 = btoa('Test');
            const withSpaces = `${base64.slice(0, 2)} ${base64.slice(2)}`;
            const result = base64ToArrayBuffer(withSpaces);
            expect(result).toBeInstanceOf(ArrayBuffer);
        });
    });

    describe('debounce', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should delay function execution', () => {
            const mockFn = vi.fn();
            const debouncedFn = debounce(mockFn, 100);

            debouncedFn();
            expect(mockFn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(50);
            expect(mockFn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(50);
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should reset timer on multiple calls', () => {
            const mockFn = vi.fn();
            const debouncedFn = debounce(mockFn, 100);

            debouncedFn();
            vi.advanceTimersByTime(50);

            debouncedFn(); // Reset timer
            vi.advanceTimersByTime(50);
            expect(mockFn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(50);
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should pass arguments correctly', () => {
            const mockFn = vi.fn();
            const debouncedFn = debounce(mockFn, 100);

            debouncedFn('arg1', 'arg2');
            vi.advanceTimersByTime(100);

            expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
        });
    });

});
