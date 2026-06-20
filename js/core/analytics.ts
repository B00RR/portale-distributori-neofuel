/**
 * Analytics Configuration
 * Privacy-friendly analytics with Plausible
 */
import { CustomWindow } from '../types.js';

// Accesso sicuro alle variabili d'ambiente Vite
const PLAUSIBLE_ENABLED = import.meta.env.VITE_ANALYTICS_ENABLED === 'true';

/**
 * Initialize analytics tracking
 */
export function initAnalytics(): void {
  if (!PLAUSIBLE_ENABLED) {
    return;
  }

  // Plausible script is loaded via CDN in index.html
  // This module provides helper functions for custom events
}

/**
 * Track a custom event
 * @param {string} eventName - Name of the event
 * @param {Object} props - Event properties (optional)
 */
export function trackEvent(eventName: string, props: Record<string, unknown> = {}): void {
  if (!PLAUSIBLE_ENABLED || !(window as unknown as CustomWindow).plausible) {
    return;
  }

  (window as unknown as CustomWindow).plausible(eventName, { props });
}

/**
 * Track page view (usually automatic, but can be called manually for SPAs)
 * @param {string} path - Page path
 */
export function trackPageView(path: string): void {
  if (!PLAUSIBLE_ENABLED || !(window as unknown as CustomWindow).plausible) {
    return;
  }

  (window as unknown as CustomWindow).plausible('pageview', { u: path });
}

// Predefined event tracking functions

/**
 * Track user login
 * @param {string} role - User role (admin, operator, etc.)
 */
export function trackLogin(role: string): void {
  trackEvent('Login', { role });
}

/**
 * Track shift opening
 * @param {string | number} stationId - Station ID
 */
export function trackShiftOpen(stationId: string | number): void {
  trackEvent('Shift:Open', { station: stationId });
}

/**
 * Track shift closure
 * @param {string | number} stationId - Station ID
 * @param {number} duration - Shift duration in minutes
 */
export function trackShiftClose(stationId: string | number, duration: number): void {
  trackEvent('Shift:Close', { station: stationId, duration: Math.round(duration) });
}

/**
 * Track voucher redemption
 * @param {number} amount - Voucher amount
 */
export function trackVoucherRedeem(amount: number): void {
  trackEvent('Voucher:Redeem', { amount: Math.round(amount) });
}

/**
 * Track export action
 * @param {string} type - Export type (pdf, excel)
 * @param {string} section - What was exported (closure, vouchers, etc.)
 */
export function trackExport(type: string, section: string): void {
  trackEvent('Export', { type, section });
}

/**
 * Track search
 * @param {string} section - Where search was performed
 */
export function trackSearch(section: string): void {
  trackEvent('Search', { section });
}

/**
 * Track error
 * @param {string} type - Error type
 * @param {string} context - Where error occurred
 */
export function trackError(type: string, context: string): void {
  trackEvent('Error', { type, context });
}
