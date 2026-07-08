import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    escapeHtml,
    escapeNumber,
    formatNumberIt,
    formatLitri,
    formatGunCounter,
    parseGunCounter,
    parseNumberFlexible,
    formatEuro,
    debounce,
    formatDate,
    getISODate,
    throttle,
    createRateLimiter,
    formatDateTimeSafe,
    formatDateSafe
} from '../../js/utils/utils.js';

describe('Utils Module', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error');
        consoleWarnSpy = vi.spyOn(console, 'warn');
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('escapeHtml', () => {
        it('should escape special characters', () => {
            const input = '<script>alert("XSS")&</script>';
            const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&amp;&lt;/script&gt;';
            expect(escapeHtml(input)).toBe(expected);
        });

        it('should handle null/undefined/numbers', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
            expect(escapeHtml(123)).toBe('123');
        });

        it('should handle single quotes', () => {
            expect(escapeHtml("'text'")).toBe('&#039;text&#039;');
        });
    });

    describe('escapeNumber', () => {
        it('should return number string', () => {
            expect(escapeNumber(123)).toBe('123');
            expect(escapeNumber('456')).toBe('456');
        });

        it('should handle invalid/null', () => {
            expect(escapeNumber(null)).toBe('');
            expect(escapeNumber('')).toBe('');
        });
    });

    describe('Formatting (Italian Locale)', () => {
        it('formatNumberIt should use dots for thousands and commas for decimals', () => {
            // 1234.56 -> 1.234,56
            // But formatNumberIt default digits is 0
            expect(formatNumberIt(1234.56, 2)).toBe('1.234,56');
            expect(formatNumberIt(1000)).toBe('1.000');
        });

        it('formatLitri should always have 2 decimals', () => {
            expect(formatLitri(1234)).toBe('1.234,00');
            expect(formatLitri(10.5)).toBe('10,50');
        });

        it('formatGunCounter should format with 2 decimals', () => {
            // Accept both '1.234,57' (with thousands separator) and '1234,57' (without)
            // CI environments may not have it-IT locale properly configured
            const result = formatGunCounter(1234.567);
            expect(result).toMatch(/^1[.\s\u202F\u00A0]?234,57$/); // Rounded
        });

        it('formatEuro should prepend €', () => {
            expect(formatEuro(10.5)).toBe('€ 10,50');
        });

        it('formatting functions should handle safe defaults for NaN', () => {
            expect(formatNumberIt('abc')).toBe('0');
            expect(formatEuro(NaN)).toBe('€ 0,00');
        });
    });

    describe('Parsing', () => {
        it('parseGunCounter should handle IT format', () => {
            // Flexible check for thousands separator (dot or space)
            expect(parseGunCounter('1.234,56')).toBe(1234.56);
            expect(parseGunCounter('1 234,56')).toBe(1234.56);
            expect(parseGunCounter('1000')).toBe(1000);
            expect(parseGunCounter(10.5)).toBe(10.5);
        });

        it('formatGunCounter should handle IT format with robust spacing check', () => {
            // CI might use narrow non-breaking space or standard space
            const result = formatGunCounter(1234.56);
            expect(result).toMatch(/1[.\s\u202F\u00A0]?234,56/);
        });

        it('parseNumberFlexible should handle various inputs', () => {
            expect(parseNumberFlexible('1.234,56')).toBe(1234.56);
            expect(parseNumberFlexible('1234.56')).toBe(1234.56);
            expect(parseNumberFlexible(null)).toBe(0);
            expect(parseNumberFlexible('invalid')).toBe(0);
            // Cover line 107 (unknown types)
            expect(parseNumberFlexible({} as unknown as number | string | null)).toBe(0);
            expect(parseNumberFlexible(true as unknown as number | string | null)).toBe(0);
        });

        it('formatDate should handle invalid dates', () => {
            expect(formatDate('invalid')).toBe('invalid');
            expect(formatDate(null)).toBe('');

            // Runtime JS can still pass unexpected values even if the TypeScript
            // signature is narrower. Symbol must not crash Date/string fallback.
            const badInput = Symbol('bad date') as unknown as string | number | Date;
            expect(formatDate(badInput)).toBe('');
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('getISODate should return YYYY-MM-DD', () => {
            // This might depend on local timezone of runner, mock Date if needed
            // But simpler:
            expect(getISODate('2023-01-31T12:00:00')).toContain('2023-01-31');
        });
    });

    describe('Safe Date Formatters', () => {
        it('formatDateTimeSafe should format valid dates with time', () => {
            const result = formatDateTimeSafe('2025-12-31T12:00:00Z');
            // Should not equal default fallback
            expect(result).not.toBe('Data non disponibile');
            // Timezone-agnostic: assert it produced an it-IT date+time string
            // (date part with '/' separators and a time part with ':').
            expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
            expect(result).toMatch(/\d{2}:\d{2}/);
        });

        it('formatDateTimeSafe should return fallback for null/undefined', () => {
            expect(formatDateTimeSafe(null)).toBe('Data non disponibile');
            expect(formatDateTimeSafe(undefined)).toBe('Data non disponibile');
        });

        it('formatDateTimeSafe should return fallback for empty string', () => {
            expect(formatDateTimeSafe('')).toBe('Data non disponibile');
        });

        it('formatDateTimeSafe should return fallback for invalid date string', () => {
            expect(formatDateTimeSafe('invalid-date')).toBe('Data non disponibile');
        });

        it('formatDateTimeSafe should accept custom fallback', () => {
            const customFallback = 'N/A';
            expect(formatDateTimeSafe(null, customFallback)).toBe(customFallback);
            expect(formatDateTimeSafe('invalid', customFallback)).toBe(customFallback);
        });

        it('formatDateSafe should format valid dates without time', () => {
            const result = formatDateSafe('2025-12-31');
            // Should not equal default fallback
            expect(result).not.toBe('—');
            // Should include date info
            expect(result).toMatch(/31|2025/);
        });

        it('formatDateSafe should return fallback for null/undefined', () => {
            expect(formatDateSafe(null)).toBe('—');
            expect(formatDateSafe(undefined)).toBe('—');
        });

        it('formatDateSafe should return fallback for empty string', () => {
            expect(formatDateSafe('')).toBe('—');
        });

        it('formatDateSafe should return fallback for invalid date string', () => {
            expect(formatDateSafe('invalid-date')).toBe('—');
        });

        it('formatDateSafe should accept custom fallback', () => {
            const customFallback = 'N/A';
            expect(formatDateSafe(null, customFallback)).toBe(customFallback);
            expect(formatDateSafe('invalid', customFallback)).toBe(customFallback);
        });

        it('formatDateSafe should handle Date objects', () => {
            const date = new Date('2025-06-15');
            const result = formatDateSafe(date);
            expect(result).not.toBe('—');
            expect(result).toMatch(/15|2025|6/);
        });

        it('formatDateTimeSafe should handle Date objects', () => {
            const date = new Date('2025-06-15T14:30:00Z');
            const result = formatDateTimeSafe(date);
            expect(result).not.toBe('Data non disponibile');
            expect(result).toMatch(/15|2025|14|30|6/);
        });
    });

    describe('Timing Utils', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('debounce should delay execution', () => {
            const func = vi.fn();
            const debounced = debounce(func, 100);

            debounced();
            debounced();
            debounced();

            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('throttle should limit execution rate', () => {
            const func = vi.fn();
            const throttled = throttle(func, 100);

            throttled();
            expect(func).toHaveBeenCalledTimes(1);

            throttled();
            throttled();
            expect(func).toHaveBeenCalledTimes(1); // Blocked

            vi.advanceTimersByTime(100);
            throttled();
            expect(func).toHaveBeenCalledTimes(2); // Allowed again
        });
    });

    describe('RateLimiter', () => {
        beforeEach(() => {
            vi.useFakeTimers(); // If RateLimiter uses Date.now(), we need to mock System time?
            // createRateLimiter uses Date.now(). Vitest checks system time.
            vi.setSystemTime(new Date(2023, 1, 1, 12, 0, 0));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should allow calls within limit', () => {
            const limiter = createRateLimiter(2, 60000);
            expect(limiter.check()).toBe(true);
            expect(limiter.check()).toBe(true);
            expect(limiter.check()).toBe(false); // Max reached
        });

        it('should reset window after time passes', () => {
            const limiter = createRateLimiter(1, 1000);
            limiter.check();
            expect(limiter.check()).toBe(false);

            vi.advanceTimersByTime(1001); // Advance time
            expect(limiter.check()).toBe(true);
        });

        it('should provide reset method', () => {
            const limiter = createRateLimiter(1, 1000);
            limiter.check();
            expect(limiter.check()).toBe(false);

            limiter.reset();
            expect(limiter.check()).toBe(true);
        });

        it('getRemainingTime should calculate wait time', () => {
            const limiter = createRateLimiter(1, 10000);
            limiter.check();

            // Currently at T=0. Expires at T=10000.
            // If we advance 1000ms...
            vi.advanceTimersByTime(1000);

            // Time is now T=1000. Remaining should be 9000.
            const remaining = limiter.getRemainingTime();
            expect(remaining).toBe(9000);
        });
    });
});
