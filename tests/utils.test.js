/**
 * Unit tests per js/utils/utils.js
 * Eseguire con: npx vitest run
 */
import { describe, it, expect } from 'vitest';
import {
    escapeHtml,
    formatEuro,
    formatLitri,
    formatNumberIt,
    debounce,
    throttle,
    createRateLimiter,
    formatDate
} from '../js/utils/utils.js';

describe('escapeHtml', () => {
    it('dovrebbe escapare caratteri HTML pericolosi', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    it('dovrebbe gestire stringhe vuote', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('dovrebbe gestire null/undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});

describe('formatNumberIt', () => {
    it('dovrebbe formattare numeri in formato italiano', () => {
        expect(formatNumberIt(1234.56, 2)).toMatch(/1\.234,56|1,234\.56/);
    });

    it('dovrebbe gestire numeri negativi', () => {
        const result = formatNumberIt(-1234.56, 2);
        expect(result).toContain('1');
    });

    it('dovrebbe gestire lo zero', () => {
        expect(formatNumberIt(0, 2)).toMatch(/0,00|0\.00/);
    });
});

describe('formatEuro', () => {
    it('dovrebbe formattare importi in euro', () => {
        const result = formatEuro(1234.56);
        expect(result).toContain('€');
        expect(result).toContain('1');
    });

    it('dovrebbe gestire valori non numerici', () => {
        expect(formatEuro(null)).toContain('€');
        expect(formatEuro(undefined)).toContain('€');
        expect(formatEuro(NaN)).toContain('€');
    });
});

describe('formatLitri', () => {
    it('dovrebbe formattare litri correttamente', () => {
        const result = formatLitri(1234.567);
        expect(result).toContain('L');
    });
});

describe('formatDate', () => {
    it('dovrebbe formattare date valide', () => {
        const result = formatDate('2025-12-22');
        expect(result).toMatch(/22|12|2025/);
    });

    it('dovrebbe gestire date invalide', () => {
        expect(formatDate('')).toBe('');
        expect(formatDate(null)).toBe('');
    });
});

describe('debounce', () => {
    it('dovrebbe ritardare l\'esecuzione', async () => {
        let counter = 0;
        const debouncedFn = debounce(() => counter++, 50);

        debouncedFn();
        debouncedFn();
        debouncedFn();

        expect(counter).toBe(0);

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(counter).toBe(1);
    });
});

describe('throttle', () => {
    it('dovrebbe limitare le chiamate', async () => {
        let counter = 0;
        const throttledFn = throttle(() => counter++, 50);

        throttledFn();
        throttledFn();
        throttledFn();

        expect(counter).toBe(1);

        await new Promise(resolve => setTimeout(resolve, 100));
        throttledFn();
        expect(counter).toBe(2);
    });
});

describe('createRateLimiter', () => {
    it('dovrebbe limitare le chiamate nella finestra temporale', () => {
        const limiter = createRateLimiter(3, 1000);

        expect(limiter.check()).toBe(true);
        expect(limiter.check()).toBe(true);
        expect(limiter.check()).toBe(true);
        expect(limiter.check()).toBe(false); // 4th call blocked
    });

    it('dovrebbe resettare correttamente', () => {
        const limiter = createRateLimiter(2, 1000);

        limiter.check();
        limiter.check();
        expect(limiter.check()).toBe(false);

        limiter.reset();
        expect(limiter.check()).toBe(true);
    });
});
