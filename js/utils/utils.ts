// ==========================================
// UTILITY FUNCTIONS - TypeScript Version
// ==========================================

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
  if (text == null) {return '';}
  return String(text).replace(/[&<>"']/g, (match) => escapeMap[match as EscapeMapKey]);
}

/**
 * Escapes a number for safe HTML attr rendering
 * @param num - Number value to escape
 * @returns Safe string representation of the number
 */
export function escapeNumber(num: number | string | null | undefined): string {
  if (num == null || num === '') {return '';}
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
    useGrouping: true  // Explicitly enable thousands separator
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

/**
 * Parse gun counter from Italian format (e.g., "1.234,567" -> 1234.567)
 */
export function parseGunCounter(value: number | string | null | undefined): number {
  if (value == null || value === '') {return 0;}
  if (typeof value === 'number') {return Number.isFinite(value) ? value : 0;}

  const cleaned = value.toString()
    .replace(/[.\s]/g, '')   // Remove thousand separators (dots or spaces)
    .replace(',', '.');       // Replace comma with dot

  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parse a number flexibly from various formats
 */
export function parseNumberFlexible(value: number | string | null | undefined): number {
  if (value == null || value === '') {return 0;}
  if (typeof value === 'number') {return Number.isFinite(value) ? value : 0;}
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {return 0;}
    if (trimmed.includes(',')) {
      const normalized = trimmed.replace(/\./g, '').replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : 0;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

/**
 * Creates a URL-safe slug from text
 */
export function slugifyLabel(text: string | null | undefined): string {
  return (text || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'chiusura';
}

/**
 * Converts base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string | null | undefined): ArrayBuffer | null {
  const cleaned = (base64 || '').replace(/\s+/g, '');
  if (!cleaned) {return null;}
  const binary = atob(cleaned);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
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
  if (!value) {return '';}
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {return String(value);}
    return new Intl.DateTimeFormat('it-IT').format(date);
  } catch {
    return String(value);
  }
}

/**
 * Gets ISO date string (YYYY-MM-DD) from a date
 */
export function getISODate(date: string | Date | null | undefined): string {
  if (!date) {return '';}
  const d = new Date(date);
  if (isNaN(d.getTime())) {return '';}
  const isoString = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  return isoString || '';
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
      setTimeout(() => { inThrottle = false; }, limit);
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
      if (calls.length === 0) {return 0;}
      const oldest = calls[0];
      if (oldest === undefined) {return 0;}
      const remaining = (oldest + windowMs) - Date.now();
      return Math.max(0, remaining);
    }
  };
}
