/**
 * Rate Limiting Utility
 *
 * SECURITY: Client-side rate limiting to prevent API abuse
 * This is a first line of defense - server-side limits should also be enforced
 */

import { logger } from '../core/logger.js';

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

/**
 * Advanced Rate Limiter with IP/User tracking
 * @param key - Unique identifier for rate limiting (e.g., 'login', 'voucher_redeem')
 * @param maxAttempts - Maximum number of attempts within the window
 * @param windowMs - Time window in milliseconds
 * @returns true if rate limit exceeded, false otherwise
 */
export function isRateLimited(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 60000 // 1 minute default
): boolean {
  if (maxAttempts <= 0) {return true;}

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // No entry or window expired - start fresh
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return false;
  }

  if (entry.count >= maxAttempts) {
    // Rate limit exceeded
    logger.warn('rateLimiter', `Blocked: ${key}. Too many attempts.`);
    return true;
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
  return false;
}

/**
 * Reset rate limit for a specific key
 * Useful for successful operations that should reset the counter
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Get remaining attempts before rate limit
 */
export function getRemainingAttempts(
  key: string,
  maxAttempts: number = 5
): number {
  const entry = rateLimitStore.get(key);
  if (!entry || Date.now() > entry.resetTime) {
    return maxAttempts;
  }
  return Math.max(0, maxAttempts - entry.count);
}

/**
 * Cleanup expired entries (call periodically to prevent memory leaks)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000);
}
