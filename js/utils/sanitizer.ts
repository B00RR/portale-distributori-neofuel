/**
 * Advanced HTML Sanitization Utilities
 * OWASP Compliant - XSS Prevention
 *
 * @module sanitizer
 * @security CRITICAL - All functions in this module handle untrusted input
 */

import { logger } from '../core/logger.js';

/**
 * Sanitizes HTML by escaping all special characters
 * Use this for any user-generated content before injecting into innerHTML
 *
 * @param html - Raw HTML string (potentially unsafe)
 * @returns Sanitized HTML with all special characters escaped
 * @example
 * sanitizeHtml('<script>alert("XSS")</script>')
 * // => '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
export function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html; // textContent automatically escapes
  return div.innerHTML;
}

/**
 * Safe wrapper for innerHTML with automatic escaping
 * Use this instead of direct innerHTML assignment
 *
 * @param element - Target DOM element
 * @param content - Content to set (will be escaped if allowHtml is false)
 * @param allowHtml - If true, allows HTML (but still escaped). If false, uses textContent
 * @example
 * setInnerHTML(element, userInput, false); // Safest: no HTML allowed
 * setInnerHTML(element, trustedContent, true); // Only use with trusted content
 */
export function setInnerHTML(
  element: HTMLElement | null,
  content: string,
  allowHtml: boolean = false
): void {
  if (!element) {
    return;
  }

  if (allowHtml) {
    // Still sanitize even when allowing HTML
    // eslint-disable-next-line no-unsanitized/property -- il contenuto e' gia' sanitizzato da sanitizeHtml() (escape completo via textContent)
    element.innerHTML = sanitizeHtml(content);
  } else {
    // Safest: no HTML at all, pure text
    element.textContent = content;
  }
}

/**
 * Sink HTML centralizzato ed esclusivo dell'applicazione (Issue #351).
 *
 * Assegna la stringa HTML fornita a `element.innerHTML` passando per un unico
 * punto di iniezione verificabile e protetto da regole linter (`no-unsanitized/property`)
 * e test di architettura (`tests/unit/sanitizer.test.ts`).
 *
 * CONTRATTO DI SICUREZZA:
 * 1. Questa funzione NON sanitizza automaticamente il markup a runtime: l'HTML
 *    deve rappresentare una struttura statica fidata.
 * 2. Tutti i valori o dati dinamici dell'utente (es. nomi, note, stringhe di input)
 *    DEVONO essere preventivamente trattati con `escapeHtml()` prima di essere
 *    interpolati nella stringa HTML.
 * 3. Per inserire testo puro senza tag HTML, usare `element.textContent` o
 *    `setInnerHTML(element, content, false)`.
 *
 * @param element - Elemento DOM di destinazione (no-op se null)
 * @param html - Markup HTML fidato con valori dinamici gia' convertiti via `escapeHtml()`
 * @example
 * setSafeHTML(container, `<p>Cliente: ${escapeHtml(nomeCliente)}</p>`);
 */
export function setSafeHTML(element: HTMLElement | null, html: string): void {
  if (!element) {
    return;
  }
  // eslint-disable-next-line no-unsanitized/property -- sink centralizzato unico; i valori dinamici sono gia' escaped dal chiamante (vedi contratto di sicurezza JSDoc / issue #351)
  element.innerHTML = html;
}

/**
 * Validates and sanitizes localStorage data
 * Prevents JSON injection and data corruption
 *
 * @param key - localStorage key
 * @param defaultValue - Default value if key doesn't exist or is invalid
 * @returns Parsed and validated data or defaultValue
 * @example
 * const settings = getSafeLocalStorage<UserSettings>('user_settings', DEFAULT_SETTINGS);
 */
export function getSafeLocalStorage<T = unknown>(
  key: string,
  defaultValue: T | null = null
): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return defaultValue;
    }

    const parsed = JSON.parse(raw) as T;

    // Basic validation: ensure it's not null/undefined
    if (parsed == null) {
      logger.warn('sanitizer', 'Valore null/undefined in localStorage', key);
      return defaultValue;
    }

    return parsed;
  } catch (error) {
    // Recoverable: corrupt/non-JSON value -> fall back. Log a single masked line
    // via the logger (no raw stack trace) instead of console.error.
    logger.warn('sanitizer', 'Parsing localStorage fallito per chiave', key, error);
    return defaultValue;
  }
}

/**
 * Safely sets localStorage data with JSON serialization
 *
 * @param key - localStorage key
 * @param value - Value to store (will be JSON stringified)
 * @returns true if successful, false otherwise
 */
export function setSafeLocalStorage<T>(key: string, value: T): boolean {
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    logger.error('sanitizer', 'Salvataggio localStorage fallito per chiave', key, error);
    return false;
  }
}

/**
 * Validates URL to prevent javascript: and data: protocol attacks
 *
 * @param url - URL to validate
 * @returns true if URL is safe (http/https), false otherwise
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmedUrl = url.trim().toLowerCase();

  // Block dangerous protocols
  if (
    // eslint-disable-next-line no-script-url -- il literale serve a rilevare e bloccare il protocollo pericoloso
    trimmedUrl.startsWith('javascript:') ||
    trimmedUrl.startsWith('data:') ||
    trimmedUrl.startsWith('vbscript:') ||
    trimmedUrl.startsWith('file:')
  ) {
    logger.warn(
      'sanitizer',
      `Bloccato protocollo URL pericoloso: ${trimmedUrl.substring(0, 20)}...`
    );
    return false;
  }

  // Allow only http/https or relative URLs
  return (
    trimmedUrl.startsWith('http://') ||
    trimmedUrl.startsWith('https://') ||
    trimmedUrl.startsWith('/') ||
    trimmedUrl.startsWith('#') ||
    trimmedUrl.startsWith('?')
  );
}

/**
 * Creates a safe link element with XSS protection
 *
 * @param url - URL for the link
 * @param text - Link text (will be escaped)
 * @param newTab - If true, opens in new tab with rel="noopener noreferrer"
 * @returns Safe anchor element or null if URL is unsafe
 */
export function createSafeLink(
  url: string,
  text: string,
  newTab: boolean = false
): HTMLAnchorElement | null {
  if (!isSafeUrl(url)) {
    return null;
  }

  const link = document.createElement('a');
  link.href = url;
  link.textContent = text; // Auto-escapes

  if (newTab) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer'; // Security: prevent window.opener access
  }

  return link;
}

/**
 * Sanitizes filename for safe file operations
 * Prevents directory traversal attacks
 *
 * @param filename - Filename to sanitize
 * @returns Safe filename with dangerous characters removed
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'untitled';
  }

  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Remove special chars
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.{2,}/g, '.') // Replace multiple dots with single
    .substring(0, 255); // Limit length
}

/**
 * Escapes PostgreSQL LIKE/ILIKE metacharacters (%, _, \) in user input so it
 * can be embedded in a pattern without acting as a wildcard (#251/#255).
 *
 * @param value - Raw user input destined for a LIKE/ILIKE pattern
 * @returns The input with %, _ and \ escaped
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
