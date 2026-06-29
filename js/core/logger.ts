/**
 * Secure Logger Module
 * Provides safe logging that respects privacy and security rules.
 * - Never logs full objects or sensitive data
 * - Strips PII from error messages
 * - Production mode strips detailed logs
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LoggerConfig {
  isProduction: boolean;
  serviceName: string;
}

const config: LoggerConfig = {
  isProduction: import.meta.env.PROD || false,
  serviceName: 'neofuel'
};

// Sensitive patterns to mask
const SENSITIVE_PATTERNS = [
  /email["\s:=]+["']?([^"'\s,}]+)/gi,
  /password["\s:=]+["']?([^"'\s,}]+)/gi,
  /token["\s:=]+["']?([^"'\s,}]+)/gi,
  /api[_-]?key["\s:=]+["']?([^"'\s,}]+)/gi,
  /secret["\s:=]+["']?([^"'\s,}]+)/gi
];

/**
 * Mask sensitive data in a string
 */
function maskSensitive(input: string): string {
  let result = input;
  SENSITIVE_PATTERNS.forEach(pattern => {
    result = result.replace(pattern, (match, value) => {
      if (value && value.length > 4) {
        return match.replace(value, value.substring(0, 2) + '***');
      }
      return match.replace(value, '***');
    });
  });
  return result;
}

/**
 * Safely stringify an error for logging
 */
function safeErrorString(error: unknown): string {
  if (error instanceof Error) {
    return maskSensitive(error.message);
  }
  if (typeof error === 'string') {
    return maskSensitive(error);
  }
  // For objects, only log a generic descriptor
  return '[Object]';
}

/**
 * Generate a unique error ID for user-facing messages
 */
function generateErrorId(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Log with context (only in development)
 */
function log(level: LogLevel, context: string, message: string, errorId?: string): void {
  if (config.isProduction && level === 'debug') {
    return; // Skip debug logs in production
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${config.serviceName}][${context}]`;
  const logMessage = errorId ? `${prefix} ${message} (ID: ${errorId})` : `${prefix} ${message}`;

  switch (level) {
    case 'error':
      console.error(`${timestamp} ERROR ${logMessage}`);
      break;
    case 'warn':
      console.warn(`${timestamp} WARN ${logMessage}`);
      break;
    case 'info':
      // eslint-disable-next-line no-console -- logger backend must delegate to console
      console.info(`${timestamp} INFO ${logMessage}`);
      break;
    case 'debug':
      // eslint-disable-next-line no-console -- logger backend must delegate to console
      console.debug(`${timestamp} DEBUG ${logMessage}`);
      break;
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map(arg => {
      if (arg instanceof Error) {
        return safeErrorString(arg);
      }
      if (typeof arg === 'string') {
        return maskSensitive(arg);
      }
      if (typeof arg === 'number' || typeof arg === 'boolean') {
        return String(arg);
      }
      return '[Object]';
    })
    .join(' ');
}

// ========== PUBLIC API ==========

export const logger = {
  /**
   * Log an error safely (no full objects, masked sensitive data)
   * Returns an error ID for user-facing messages
   */
  error(context: string, ...args: unknown[]): string {
    const errorId = generateErrorId();
    const safeMessage = formatArgs(args);
    log('error', context, safeMessage, errorId);
    return errorId;
  },

  /**
   * Log a warning
   */
  warn(context: string, ...args: unknown[]): void {
    log('warn', context, formatArgs(args));
  },

  /**
   * Log info (non-sensitive operational info)
   */
  info(context: string, ...args: unknown[]): void {
    log('info', context, formatArgs(args));
  },

  /**
   * Log debug (development only)
   */
  debug(context: string, ...args: unknown[]): void {
    log('debug', context, formatArgs(args));
  },

  /**
   * Get a user-friendly error message
   */
  getUserMessage(errorId: string): string {
    return `Si è verificato un errore. Riferimento: ${errorId}`;
  }
};

export default logger;
