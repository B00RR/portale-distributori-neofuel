/**
 * Analytics Configuration
 * Privacy-friendly analytics with Plausible
 */
import { CustomWindow } from '../types.js';

// Accesso sicuro alle variabili d'ambiente Vite
const env = (import.meta as any).env || {};
const PLAUSIBLE_DOMAIN = env.VITE_ANALYTICS_DOMAIN || 'neofuel-portal.local';
const PLAUSIBLE_ENABLED = env.VITE_ANALYTICS_ENABLED === 'true';

/**
 * Initializes Plausible analytics when enabled via environment configuration.
 *
 * If analytics are disabled by configuration, logs that analytics are disabled and exits;
 * otherwise logs initialization and relies on the Plausible script being present on the page.
 */
export function initAnalytics(): void {
    if (!PLAUSIBLE_ENABLED) {
        console.info('[Analytics] Disabled');
        return;
    }

    // Plausible script is loaded via CDN in index.html
    // This module provides helper functions for custom events

    console.info('[Analytics] Initialized for domain:', PLAUSIBLE_DOMAIN);
}

/**
 * Sends a custom analytics event with optional properties; when analytics is disabled or Plausible is unavailable, logs the event to the console.
 *
 * @param eventName - Event name to record.
 * @param props - Optional key/value properties to include with the event.
 */
export function trackEvent(eventName: string, props: Record<string, any> = {}): void {
    if (!PLAUSIBLE_ENABLED || !(window as unknown as CustomWindow).plausible) {
        console.debug('[Analytics] Event:', eventName, props);
        return;
    }

    (window as unknown as CustomWindow).plausible(eventName, { props });
}

/**
 * Record a manual page view event for single-page application navigation.
 *
 * Sends a 'pageview' event to Plausible with the provided path when analytics are enabled and the Plausible script is present on window.
 *
 * @param path - The page path or URL to report as the `u` value in the Plausible payload
 */
export function trackPageView(path: string): void {
    if (!PLAUSIBLE_ENABLED || !(window as unknown as CustomWindow).plausible) {
        return;
    }

    (window as unknown as CustomWindow).plausible('pageview', { u: path });
}

// Predefined event tracking functions

/**
 * Record a "Login" analytics event containing the user's role.
 *
 * @param role - The user's role (e.g., "admin", "operator")
 */
export function trackLogin(role: string): void {
    trackEvent('Login', { role });
}

/**
 * Record that a shift was opened at a given station.
 *
 * @param stationId - Identifier of the station where the shift was opened
 */
export function trackShiftOpen(stationId: string | number): void {
    trackEvent('Shift:Open', { station: stationId });
}

/**
 * Record a "Shift:Close" analytics event for a specific station.
 *
 * @param stationId - Station identifier (string or number)
 * @param duration - Shift duration in minutes; value is rounded to the nearest integer before sending
 */
export function trackShiftClose(stationId: string | number, duration: number): void {
    trackEvent('Shift:Close', { station: stationId, duration: Math.round(duration) });
}

/**
 * Record a voucher redemption event for analytics.
 *
 * @param amount - Voucher amount in currency units; the value is rounded to the nearest integer when recorded
 */
export function trackVoucherRedeem(amount: number): void {
    trackEvent('Voucher:Redeem', { amount: Math.round(amount) });
}

/**
 * Record an export event with the export format and the exported section.
 *
 * @param type - Export format (e.g., "pdf", "excel")
 * @param section - The data section that was exported (e.g., "closure", "vouchers")
 */
export function trackExport(type: string, section: string): void {
    trackEvent('Export', { type, section });
}

/**
 * Record a "Search" analytics event associated with the UI section where the search occurred.
 *
 * @param section - The UI section or context where the search was performed
 */
export function trackSearch(section: string): void {
    trackEvent('Search', { section });
}

/**
 * Record an error event with a classification and contextual location.
 *
 * @param type - Error classification or identifier (e.g., validation, network, runtime)
 * @param context - Where or in what context the error occurred (e.g., component, action, route)
 */
export function trackError(type: string, context: string): void {
    trackEvent('Error', { type, context });
}