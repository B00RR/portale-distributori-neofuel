// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatEuro, escapeHtml, createRateLimiter, formatLitri } from '../js/utils/utils.js';

describe('Global Utilities Standard Suite', () => {

    describe('formatEuro (Currency)', () => {
        it('formats integers', () => {
            expect(formatEuro(100)).toBe('€ 100,00');
        });

        it('formats decimals', () => {
            expect(formatEuro(100.5)).toBe('€ 100,50');
            expect(formatEuro(100.556)).toBe('€ 100,56'); // Rounding check
        });

        it('handles zero and null', () => {
            expect(formatEuro(0)).toBe('€ 0,00');
            expect(formatEuro(null)).toBe('€ 0,00');
            expect(formatEuro(undefined)).toBe('€ 0,00');
        });

        it('handles negative values', () => {
            expect(formatEuro(-1250.50)).toBe('€ -1.250,50');
        });
    });

    describe('formatLitri (Volume)', () => {
        it('formats with 2 decimals', () => {
            expect(formatLitri(50)).toBe('50,00');
            expect(formatLitri(50.123)).toBe('50,12');
        });
    });

    describe('escapeHtml (Security)', () => {
        it('sanitizes standard XSS vectors', () => {
            const input = '<script>alert("hacked")</script>';
            expect(escapeHtml(input)).toBe('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;');
        });

        it('sanitizes attributes', () => {
            const input = '" onmouseover="alert(1)"';
            const escaped = escapeHtml(input);
            expect(escaped).toContain('&quot;');
        });

        it('handles null/undefined', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
        });
    });

    describe('Rate Limiter (Stability)', () => {
        it('allows calls within limit', () => {
            const limiter = createRateLimiter(2, 1000);
            expect(limiter.check()).toBe(true);
            expect(limiter.check()).toBe(true);
        });

        it('blocks calls exceeding limit', () => {
            const limiter = createRateLimiter(2, 1000);
            limiter.check();
            limiter.check();
            expect(limiter.check()).toBe(false);
        });

        it('resets after window expires (simulated)', async () => {
            // Mocking time would be better, but basic logic check here
            const limiter = createRateLimiter(1, 10);
            limiter.check();
            expect(limiter.check()).toBe(false);

            await new Promise(r => setTimeout(r, 15));
            expect(limiter.check()).toBe(true);
        });
    });
});
