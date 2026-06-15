/**
 * Application Constants
 * 
 * Enterprise-grade constants file containing all configuration values.
 * Following best practices: no magic numbers, centralized configuration.
 * 
 * @module constants
 */

// ============================================================================
// FINANCIAL CONSTANTS
// ============================================================================

/**
 * Maximum acceptable cash discrepancy in EUR for shift closure validation
 * @constant
 * @type {number}
 * @default 5.00
 */
export const CASH_DISCREPANCY_TOLERANCE_EUR = 5.00;

/**
 * Minimum tolerance for floating point comparisons in Euro calculations
 * @constant
 * @type {number}
 * @default 0.01
 */
export const FINANCIAL_CALCULATION_TOLERANCE_EUR = 0.01;

// ============================================================================
// RATE LIMITING CONSTANTS
// ============================================================================

/**
 * Maximum login attempts allowed within the time window
 * @constant
 * @type {number}
 * @default 5
 */
export const RATE_LIMIT_LOGIN_MAX_ATTEMPTS = 5;

/**
 * Time window in milliseconds for login rate limiting
 * @constant
 * @type {number}
 * @default 60000 (1 minute)
 */
export const RATE_LIMIT_LOGIN_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Maximum voucher redemption attempts within the time window
 * @constant
 * @type {number}
 * @default 10
 */
export const RATE_LIMIT_VOUCHER_MAX_ATTEMPTS = 10;

/**
 * Time window in milliseconds for voucher redemption rate limiting
 * @constant
 * @type {number}
 * @default 60000 (1 minute)
 */
export const RATE_LIMIT_VOUCHER_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Rate limit automatic cleanup interval in milliseconds
 * @constant
 * @type {number}
 * @default 300000 (5 minutes)
 */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CACHE CONSTANTS
// ============================================================================

/**
 * Default cache Time-To-Live in milliseconds
 * @constant
 * @type {number}
 * @default 300000 (5 minutes)
 */
export const CACHE_DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cache cleanup interval in milliseconds
 * @constant
 * @type {number}
 * @default 600000 (10 minutes)
 */
export const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// UI/UX CONSTANTS
// ============================================================================

/**
 * Default timeout for loading states in milliseconds
 * @constant
 * @type {number}
 * @default 30000 (30 seconds)
 */
export const DEFAULT_LOADING_TIMEOUT_MS = 30 * 1000; // 30 seconds

/**
 * Toast notification display duration in milliseconds
 * @constant
 * @type {number}
 * @default 3000 (3 seconds)
 */
export const TOAST_DISPLAY_DURATION_MS = 3 * 1000; // 3 seconds

/**
 * Debounce delay for search inputs in milliseconds
 * @constant
 * @type {number}
 * @default 300
 */
export const SEARCH_DEBOUNCE_DELAY_MS = 300;

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

/**
 * Minimum password length for user accounts
 * @constant
 * @type {number}
 * @default 8
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Maximum file upload size in bytes
 * @constant
 * @type {number}
 * @default 5242880 (5 MB)
 */
export const MAX_FILE_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Allowed file extensions for uploads
 * @constant
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_FILE_EXTENSIONS = Object.freeze([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.xlsx',
  '.csv'
] as const);

// ============================================================================
// PAGINATION CONSTANTS
// ============================================================================

/**
 * Default number of items per page
 * @constant
 * @type {number}
 * @default 20
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Available page size options
 * @constant
 * @type {ReadonlyArray<number>}
 */
export const PAGE_SIZE_OPTIONS = Object.freeze([10, 20, 50, 100] as const);

// ============================================================================
// RETRY CONSTANTS
// ============================================================================

/**
 * Maximum number of retry attempts for failed API calls
 * @constant
 * @type {number}
 * @default 3
 */
export const MAX_API_RETRY_ATTEMPTS = 3;

/**
 * Initial retry delay in milliseconds (exponential backoff)
 * @constant
 * @type {number}
 * @default 1000 (1 second)
 */
export const RETRY_INITIAL_DELAY_MS = 1000; // 1 second

/**
 * Retry delay multiplier for exponential backoff
 * @constant
 * @type {number}
 * @default 2
 */
export const RETRY_BACKOFF_MULTIPLIER = 2;

// ============================================================================
// LOGGING CONSTANTS
// ============================================================================

/**
 * Maximum number of error logs to keep in memory
 * @constant
 * @type {number}
 * @default 100
 */
export const MAX_ERROR_LOG_ENTRIES = 100;

/**
 * Environment check for development mode
 * @constant
 * @type {boolean}
 */
export const IS_DEVELOPMENT = import.meta.env?.MODE === 'development' ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost');

/**
 * Environment check for production mode
 * @constant
 * @type {boolean}
 */
export const IS_PRODUCTION = !IS_DEVELOPMENT;

// ============================================================================
// SECURITY CONSTANTS
// ============================================================================

/**
 * Session timeout in milliseconds
 * @constant
 * @type {number}
 * @default 3600000 (1 hour)
 */
export const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

/**
 * CSRF token header name
 * @constant
 * @type {string}
 */
export const CSRF_TOKEN_HEADER = 'X-CSRF-Token';

/**
 * Maximum allowed concurrent sessions per user
 * @constant
 * @type {number}
 * @default 3
 */
export const MAX_CONCURRENT_SESSIONS = 3;
