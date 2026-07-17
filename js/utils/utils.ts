// ==========================================
// UTILITY FUNCTIONS - TypeScript Version
// ==========================================

import { logger } from '../core/logger.js';

type EscapeMapKey = '&' | '<' | '>' | '"' | "'";

const escapeMap: Record<EscapeMapKey, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param text - Text to escape
 * @returns Escaped HTML-safe string
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // => '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
export function escapeHtml(text: string | number | null | undefined): string {
  if (text == null) {
    return '';
  }
  return String(text).replace(/[&<>"']/g, match => escapeMap[match as EscapeMapKey]);
}

/**
 * Extracts a human-readable message from an unknown thrown/returned error.
 * Handles native Error instances, Supabase-style plain objects with a `message`
 * field, and any other value (coerced to string).
 * @param error - The caught error of unknown type
 * @returns A best-effort message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Escapes a number for safe HTML attr rendering
 * @param num - Number value to escape
 * @returns Safe string representation of the number
 */
export function escapeNumber(num: number | string | null | undefined): string {
  if (num == null || num === '') {
    return '';
  }
  return String(parseFloat(String(num)));
}

/**
 * Formats a number with Italian locale conventions
 * @param value - Number to format
 * @param fractionDigits - Number of decimal places
 * @returns Formatted string (e.g., "17.153,00")
 */
export function formatNumberIt(value: number | string, fractionDigits: number = 0): string {
  const num = Number(value);
  const safeNum = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true // Explicitly enable thousands separator
  }).format(safeNum);
}

/**
 * Formats liters with 2 decimal places
 */
export function formatLitri(value: number | string): string {
  return formatNumberIt(value, 2);
}

/**
 * Formats gun counter with 2 decimal places
 * @param value - Counter value
 * @returns Formatted string (e.g., "1.234,56")
 */
export function formatGunCounter(value: number | string): string {
  const num = Number(value);
  const safeNum = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeNum);
}

function hasValidGrouping(value: string, separator: '.' | ','): boolean {
  const groups = value.split(separator);
  return (
    groups.length > 1 &&
    (groups[0]?.length ?? 0) >= 1 &&
    (groups[0]?.length ?? 0) <= 3 &&
    groups.slice(1).every(group => group.length === 3)
  );
}

function hasValidNumericCharacters(value: string): boolean {
  if (!value) {
    return false;
  }

  let hasDigit = false;
  let previousWasSeparator = false;

  for (let index = 0; index < value.length; index++) {
    const character = value.charAt(index);
    const isDigit = character >= '0' && character <= '9';

    if (isDigit) {
      hasDigit = true;
      previousWasSeparator = false;
      continue;
    }

    if (character !== '.' && character !== ',') {
      return false;
    }
    if (previousWasSeparator || index === value.length - 1) {
      return false;
    }
    previousWasSeparator = true;
  }

  return hasDigit;
}

/**
 * Normalize the numeric formats accepted by Neofuel forms.
 *
 * A single comma or dot is treated as the decimal separator. When both are
 * present, the right-most one is the decimal separator and the other one is
 * validated as a thousands separator. Repeated separators are accepted only
 * when they form valid groups of three digits.
 */
function parseLocalizedNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }

  const compact = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  const hasSign = compact.startsWith('-') || compact.startsWith('+');
  const unsigned = compact.slice(hasSign ? 1 : 0);
  if (!hasValidNumericCharacters(unsigned)) {
    return 0;
  }

  const sign = compact.startsWith('-') ? '-' : '';
  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');
  let normalized = unsigned;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator: '.' | ',' = lastComma > lastDot ? ',' : '.';
    const groupingSeparator: '.' | ',' = decimalSeparator === ',' ? '.' : ',';
    const decimalIndex = unsigned.lastIndexOf(decimalSeparator);
    const integerPart = unsigned.slice(0, decimalIndex);
    const fractionPart = unsigned.slice(decimalIndex + 1);

    if (
      integerPart.includes(decimalSeparator) ||
      !hasValidGrouping(integerPart, groupingSeparator)
    ) {
      return 0;
    }

    normalized = `${integerPart.replaceAll(groupingSeparator, '') || '0'}.${fractionPart}`;
  } else {
    const separator: '.' | ',' | null = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null;

    if (separator) {
      const occurrences = unsigned.split(separator).length - 1;
      if (occurrences === 1) {
        const separatorIndex = unsigned.indexOf(separator);
        const integerPart = unsigned.slice(0, separatorIndex) || '0';
        const fractionPart = unsigned.slice(separatorIndex + 1);
        normalized = `${integerPart}.${fractionPart}`;
      } else if (hasValidGrouping(unsigned, separator)) {
        normalized = unsigned.replaceAll(separator, '');
      } else {
        return 0;
      }
    }
  }

  const parsed = Number(`${sign}${normalized}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse gun counter from Italian format (e.g., "1.234,567" -> 1234.567)
 */
export function parseGunCounter(value: number | string | null | undefined): number {
  return parseLocalizedNumber(value);
}

/**
 * Parse a number flexibly from various formats
 */
export function parseNumberFlexible(value: number | string | null | undefined): number {
  return parseLocalizedNumber(value);
}

/**
 * Creates a URL-safe slug from text
 */
export function slugifyLabel(text: string | null | undefined): string {
  return (
    (text || '')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'chiusura'
  );
}

/**
 * Converts base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string | null | undefined): ArrayBuffer | null {
  const cleaned = (base64 || '').replace(/\s+/g, '');
  if (!cleaned) {
    return null;
  }
  const binary = atob(cleaned);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric index into a fixed-length Uint8Array
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Formats a value as Euro currency
 */
export function formatEuro(value: number | string): string {
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return `€ ${formatNumberIt(safe, 2)}`;
}

/**
 * Debounce: delays function execution until after wait ms have elapsed since last call
 * @param func - Function to debounce
 * @param wait - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return function executedFunction(...args: Parameters<T>): void {
    const later = (): void => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Formats a date value to Italian format
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'symbol') {
    return '';
  }
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return String(value);
    }
    return new Intl.DateTimeFormat('it-IT').format(date);
  } catch (err) {
    logger.warn('formatDate', 'Impossibile formattare la data', err);
    if (typeof value === 'symbol') {
      return '';
    }
    return String(value);
  }
}

/**
 * Gets ISO date string (YYYY-MM-DD) from a date in the Europe/Rome timezone.
 * This is intended for "business date" pickers and filters so that midnight
 * in Italy maps to the correct calendar day regardless of the browser's local
 * timezone or daylight-saving transitions (#324).
 */
export function getISODate(date: string | Date | null | undefined): string {
  if (!date) {
    return '';
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return '';
  }
  const romeFormatter = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return romeFormatter.format(d);
}

/**
 * Returns today's date as YYYY-MM-DD in the Europe/Rome timezone.
 * Use this for any business-date default (invoice date, shift date, etc.) so
 * that the date matches what Italian operators see on their clocks (#324).
 */
export function getItalianBusinessDate(): string {
  return getISODate(new Date());
}

/**
 * Returns an ISO timestamp representing the end of the current business day
 * (23:59:59.999) in Europe/Rome, expressed in UTC for storage/querying.
 * Useful for voucher expiration and end-of-day cutoffs (#324).
 */
export function getItalianBusinessDayEndUtc(): string {
  const today = getItalianBusinessDate();
  const endOfDayRome = new Date(`${today}T23:59:59.999+02:00`);
  if (Number.isNaN(endOfDayRome.getTime())) {
    // Fallback: let the browser parse a timezone-free string and convert.
    return new Date(`${today}T23:59:59.999Z`).toISOString();
  }
  return endOfDayRome.toISOString();
}

/**
 * Throttle: executes function at most once every `limit` ms
 * @param func - Function to throttle
 * @param limit - Minimum interval in ms
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: unknown, ...args: Parameters<T>): void {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Rate Limiter interface
 */
export interface RateLimiter {
  /** Check if action is allowed */
  check(): boolean;
  /** Reset the counter */
  reset(): void;
  /** Get remaining time before next slot */
  getRemainingTime(): number;
}

/**
 * Rate Limiter for critical actions
 * Prevents too frequent repeated calls
 * @param maxCalls - Maximum number of calls
 * @param windowMs - Time window in ms
 * @returns Rate limiter object
 */
export function createRateLimiter(maxCalls: number = 5, windowMs: number = 60000): RateLimiter {
  const calls: number[] = [];

  return {
    check(): boolean {
      const now = Date.now();
      // Remove calls outside the window
      while (calls.length > 0 && (calls[0] ?? 0) < now - windowMs) {
        calls.shift();
      }

      if (calls.length >= maxCalls) {
        return false;
      }

      calls.push(now);
      return true;
    },

    reset(): void {
      calls.length = 0;
    },

    getRemainingTime(): number {
      if (calls.length === 0) {
        return 0;
      }
      const oldest = calls[0];
      if (oldest === undefined) {
        return 0;
      }
      const remaining = oldest + windowMs - Date.now();
      return Math.max(0, remaining);
    }
  };
}

/**
 * Safely formats a date-time value to Italian locale, handling null/invalid inputs.
 * Used for fields from DB that may be null on partial records.
 * @param value - Date value (string, Date, or falsy)
 * @param fallback - String to return if value is falsy or invalid (default: 'Data non disponibile')
 * @returns Formatted string in locale 'it-IT' or fallback
 * @example
 * formatDateTimeSafe('2025-12-31T23:59:00Z') // => "31/12/2025, 23:59:00"
 * formatDateTimeSafe(null) // => "Data non disponibile"
 * formatDateTimeSafe('') // => "Data non disponibile"
 * formatDateTimeSafe('invalid') // => "Data non disponibile"
 */
export function formatDateTimeSafe(value: unknown, fallback = 'Data non disponibile'): string {
  if (!value) return fallback;
  const d = new Date(value as string | Date);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString('it-IT');
}

/**
 * Safely formats a date value to Italian locale, handling null/invalid inputs.
 * Used for fields from DB that may be null on partial records.
 * @param value - Date value (string, Date, or falsy)
 * @param fallback - String to return if value is falsy or invalid (default: '—')
 * @returns Formatted string in locale 'it-IT' (date only) or fallback
 * @example
 * formatDateSafe('2025-12-31') // => "31/12/2025"
 * formatDateSafe(null) // => "—"
 * formatDateSafe('') // => "—"
 * formatDateSafe('invalid') // => "—"
 */
export function formatDateSafe(value: unknown, fallback = '—'): string {
  if (!value) return fallback;
  const d = new Date(value as string | Date);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString('it-IT');
}
