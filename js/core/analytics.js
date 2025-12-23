/**
 * Analytics Configuration
 * Privacy-friendly analytics with Plausible
 */

// Accesso sicuro alle variabili d'ambiente Vite
const env = import.meta.env || {};
const PLAUSIBLE_DOMAIN = env.VITE_ANALYTICS_DOMAIN || 'neofuel-portal.local';
const PLAUSIBLE_ENABLED = env.VITE_ANALYTICS_ENABLED === 'true';

/**
 * Initialize analytics tracking
 */
export function initAnalytics() {
    if (!PLAUSIBLE_ENABLED) {
        console.info('[Analytics] Disabled');
        return;
    }

    // Plausible script is loaded via CDN in index.html
    // This module provides helper functions for custom events

    console.info('[Analytics] Initialized for domain:', PLAUSIBLE_DOMAIN);
}

/**
 * Track a custom event
 * @param {string} eventName - Name of the event
 * @param {Object} props - Event properties (optional)
 */
export function trackEvent(eventName, props = {}) {
    if (!PLAUSIBLE_ENABLED || !window.plausible) {
        console.debug('[Analytics] Event:', eventName, props);
        return;
    }

    window.plausible(eventName, { props });
}

/**
 * Track page view (usually automatic, but can be called manually for SPAs)
 * @param {string} path - Page path
 */
export function trackPageView(path) {
    if (!PLAUSIBLE_ENABLED || !window.plausible) {
        return;
    }

    window.plausible('pageview', { u: path });
}

// Predefined event tracking functions

/**
 * Track user login
 * @param {string} role - User role (admin, operator, etc.)
 */
export function trackLogin(role) {
    trackEvent('Login', { role });
}

/**
 * Track shift opening
 * @param {string} stationId - Station ID
 */
export function trackShiftOpen(stationId) {
    trackEvent('Shift:Open', { station: stationId });
}

/**
 * Track shift closure
 * @param {string} stationId - Station ID
 * @param {number} duration - Shift duration in minutes
 */
export function trackShiftClose(stationId, duration) {
    trackEvent('Shift:Close', { station: stationId, duration: Math.round(duration) });
}

/**
 * Track voucher redemption
 * @param {number} amount - Voucher amount
 */
export function trackVoucherRedeem(amount) {
    trackEvent('Voucher:Redeem', { amount: Math.round(amount) });
}

/**
 * Track export action
 * @param {string} type - Export type (pdf, excel)
 * @param {string} section - What was exported (closure, vouchers, etc.)
 */
export function trackExport(type, section) {
    trackEvent('Export', { type, section });
}

/**
 * Track search
 * @param {string} section - Where search was performed
 */
export function trackSearch(section) {
    trackEvent('Search', { section });
}

/**
 * Track error
 * @param {string} type - Error type
 * @param {string} context - Where error occurred
 */
export function trackError(type, context) {
    trackEvent('Error', { type, context });
}
