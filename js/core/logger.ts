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
    /secret["\s:=]+["']?([^"'\s,}]+)/gi,
];

/**
 * Masks sensitive substrings found in `input` by redacting detected values.
 *
 * @param input - The string to scan for sensitive data
 * @returns The input string with detected sensitive values redacted (keeps the first two characters when a detected value is longer than 4 characters, otherwise replaces the value with '***')
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
 * Convert an unknown error into a masked, log-safe string.
 *
 * Masks sensitive substrings when `error` is an Error or a string; returns `"[Object]"` for other values.
 *
 * @param error - The error value to convert (an Error instance, a string, or any other value)
 * @returns The masked error message when `error` is an Error or string; `"[Object]"` for other values
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
 * Creates a short user-facing error identifier.
 *
 * @returns A string in the format `ERR-<BASE36_TIMESTAMP>` (uppercase), e.g. `ERR-1L4FZK`
 */
function generateErrorId(): string {
    return `ERR-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Emit a formatted log message for a given level and context.
 *
 * The output is prefixed with the service name and context and includes an ISO timestamp.
 * In production, `debug` level messages are suppressed. When provided, `errorId` is appended to the message.
 *
 * @param errorId - Optional error identifier to include in the log output
 */
function log(level: LogLevel, context: string, message: string, errorId?: string): void {
    if (config.isProduction && level === 'debug') {
        return; // Skip debug logs in production
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${config.serviceName}][${context}]`;
    const logMessage = errorId
        ? `${prefix} ${message} (ID: ${errorId})`
        : `${prefix} ${message}`;

    switch (level) {
        case 'error':
            console.error(`${timestamp} ERROR ${logMessage}`);
            break;
        case 'warn':
            console.warn(`${timestamp} WARN ${logMessage}`);
            break;
        case 'info':
            console.info(`${timestamp} INFO ${logMessage}`);
            break;
        case 'debug':
            console.debug(`${timestamp} DEBUG ${logMessage}`);
            break;
    }
}

// ========== PUBLIC API ==========

export const logger = {
    /**
     * Log an error safely (no full objects, masked sensitive data)
     * Returns an error ID for user-facing messages
     */
    error(context: string, error: unknown): string {
        const errorId = generateErrorId();
        const safeMessage = safeErrorString(error);
        log('error', context, safeMessage, errorId);
        return errorId;
    },

    /**
     * Log a warning
     */
    warn(context: string, message: string): void {
        log('warn', context, maskSensitive(message));
    },

    /**
     * Log info (non-sensitive operational info)
     */
    info(context: string, message: string): void {
        log('info', context, message);
    },

    /**
     * Log debug (development only)
     */
    debug(context: string, message: string): void {
        log('debug', context, message);
    },

    /**
     * Get a user-friendly error message
     */
    getUserMessage(errorId: string): string {
        return `Si è verificato un errore. Riferimento: ${errorId}`;
    }
};

export default logger;