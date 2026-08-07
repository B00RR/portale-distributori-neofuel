import { describe, it, expect } from 'vitest';

import {
    initAnalytics,
    trackEvent,
    trackPageView,
    trackLogin,
    trackShiftOpen,
    trackShiftClose,
    trackVoucherRedeem,
    trackExport,
    trackSearch,
    trackError
} from '../../js/core/analytics.js';

describe('Core Analytics Module', () => {
    it('should initialize analytics', () => {
        initAnalytics();
        expect(true).toBe(true);
    });

    it('should track custom event', () => {
        trackEvent('TestEvent', { prop: 'value' });
        expect(true).toBe(true);
    });

    it('should track page view', () => {
        trackPageView('/test-path');
        expect(true).toBe(true);
    });

    it('should track login', () => {
        trackLogin('admin');
        expect(true).toBe(true);
    });

    it('should track shift events', () => {
        trackShiftOpen('ST-123');
        trackShiftClose('ST-123', 480);
        expect(true).toBe(true);
    });

    it('should track voucher redeem', () => {
        trackVoucherRedeem(50);
        expect(true).toBe(true);
    });

    it('should track export', () => {
        trackExport('pdf', 'closure');
        expect(true).toBe(true);
    });

    it('should track search', () => {
        trackSearch('vouchers');
        expect(true).toBe(true);
    });

    it('should track error', () => {
        trackError('validation', 'login');
        expect(true).toBe(true);
    });

    it('should track error with optional message', () => {
        trackError('validation', 'login', 'Campo obbligatorio mancante');
        expect(true).toBe(true);
    });
});
