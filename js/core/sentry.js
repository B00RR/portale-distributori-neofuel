/**
 * Sentry Configuration
 * Production error tracking and monitoring
 */

import * as Sentry from '@sentry/browser';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const ENVIRONMENT = import.meta.env.MODE || 'development';

/**
 * Initialize Sentry error tracking
 * Only active in production if DSN is configured
 */
export function initSentry() {
  // Only initialize if DSN is provided and not in development
  if (!SENTRY_DSN || ENVIRONMENT === 'development') {
    console.info('[Sentry] Skipped initialization (dev mode or missing DSN)');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,

    // Performance monitoring
    tracesSampleRate: 0.1, // 10% of transactions

    // Error filtering
    beforeSend(event, hint) {
      // Don't send errors in development
      if (ENVIRONMENT === 'development') {
        return null;
      }

      // Filter out network errors from ad blockers
      const error = hint.originalException;
      if (error && error.message && error.message.includes('adsbygoogle')) {
        return null;
      }

      return event;
    },

    // Ignore specific errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'chrome-extension://',
      'moz-extension://',

      // Network errors
      'NetworkError',
      'Failed to fetch',

      // Random plugins/extensions
      'Non-Error promise rejection captured'
    ],

    // Release tracking
    release: `neofuel-portal@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`
  });

  console.info('[Sentry] Initialized successfully');
}

/**
 * Set user context for error tracking
 * @param {Object} user - User information
 * @param {string} user.id - User ID
 * @param {string} user.email - User email
 * @param {string} user.role - User role
 */
export function setSentryUser(user) {
  if (!SENTRY_DSN) {return;}

  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role
  });
}

/**
 * Clear user context (on logout)
 */
export function clearSentryUser() {
  if (!SENTRY_DSN) {return;}
  Sentry.setUser(null);
}

/**
 * Manually capture an exception
 * @param {Error} error - Error to capture
 * @param {Object} context - Additional context
 */
export function captureException(error, context = {}) {
  if (!SENTRY_DSN) {
    console.error('[Sentry Debug]', error, context);
    return;
  }

  Sentry.captureException(error, {
    extra: context
  });
}

/**
 * Capture a message (non-error)
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, warning, error)
 */
export function captureMessage(message, level = 'info') {
  if (!SENTRY_DSN) {
    console.log(`[Sentry Debug] ${level}:`, message);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging
 * @param {Object} breadcrumb - Breadcrumb data
 */
export function addBreadcrumb(breadcrumb) {
  if (!SENTRY_DSN) {return;}

  Sentry.addBreadcrumb(breadcrumb);
}
