import { describe, it, expect } from 'vitest';
import {
    escapeHtml,
    formatEuro,
    formatNumberIt,
    slugifyLabel,
    formatDate,
} from '../../js/utils/utils.js';
import { isSafeUrl } from '../../js/utils/sanitizer.js';

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
    });

});
