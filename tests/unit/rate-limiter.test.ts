import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { isRateLimited, resetRateLimit, getRemainingAttempts, cleanupRateLimits } from '../../js/utils/rate-limiter.js';

describe('Rate Limiter Module', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clear all rate limits before each test
    vi.useFakeTimers();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('isRateLimited', () => {
    it('should not be rate limited on first attempt', () => {
      const result = isRateLimited('test-key', 5, 60000);

      expect(result).toBe(false);
    });

    it('should track multiple attempts', () => {
      isRateLimited('key1', 3, 60000); // 1st
      isRateLimited('key1', 3, 60000); // 2nd
      const result = isRateLimited('key1', 3, 60000); // 3rd

      expect(result).toBe(false); // 3rd is still allowed
    });

    it('should block when max attempts exceeded', () => {
      isRateLimited('key2', 3, 60000); // 1st
      isRateLimited('key2', 3, 60000); // 2nd
      isRateLimited('key2', 3, 60000); // 3rd
      const result = isRateLimited('key2', 3, 60000); // 4th - should block

      expect(result).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should reset after time window expires', () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00'));

      isRateLimited('key3', 2, 60000); // 1st
      isRateLimited('key3', 2, 60000); // 2nd
      const blocked = isRateLimited('key3', 2, 60000); // 3rd - blocked
      expect(blocked).toBe(true);

      // Advance time past window
      vi.setSystemTime(new Date('2024-01-01T12:02:00')); // 2 min later

      const afterExpiry = isRateLimited('key3', 2, 60000);
      expect(afterExpiry).toBe(false); // Should be reset
    });

    it('should handle different keys independently', () => {
      isRateLimited('keyA', 2, 60000);
      isRateLimited('keyA', 2, 60000);
      isRateLimited('keyA', 2, 60000); // keyA blocked

      const keyBResult = isRateLimited('keyB', 2, 60000);
      expect(keyBResult).toBe(false); // keyB is fine
    });

    it('should use default values', () => {
      const result = isRateLimited('default-test');
      expect(result).toBe(false);
    });

    it('should work with custom window sizes', () => {
      const result = isRateLimited('custom-window', 10, 5000);
      expect(result).toBe(false);
    });
    describe('isRateLimited edge cases', () => {
      it('should block immediately if maxAttempts is 0', () => {
        expect(isRateLimited('zero-attempts', 0, 60000)).toBe(true);
      });

      it('should block immediately if maxAttempts is negative', () => {
        expect(isRateLimited('negative-attempts', -1, 60000)).toBe(true);
      });

      it('should handle exact timestamp boundary correctly', () => {
        vi.setSystemTime(new Date('2024-01-01T12:00:00.000'));
        isRateLimited('boundary', 1, 1000); // limit 1, window 1s

        // At exact expiry (1000ms), now === resetTime, which means NOT strictly greater.
        vi.setSystemTime(new Date('2024-01-01T12:00:01.000')); // Exactly +1000ms
        expect(isRateLimited('boundary', 1, 1000)).toBe(true);

        // Strictly greater
        vi.setSystemTime(new Date('2024-01-01T12:00:01.001')); // +1001ms
        expect(isRateLimited('boundary', 1, 1000)).toBe(false);
      });
    });
  });

  describe('resetRateLimit', () => {
    it('should reset specific key', () => {
      isRateLimited('reset-key', 2, 60000);
      isRateLimited('reset-key', 2, 60000);
      isRateLimited('reset-key', 2, 60000); // Now blocked

      resetRateLimit('reset-key');

      const afterReset = isRateLimited('reset-key', 2, 60000);
      expect(afterReset).toBe(false);
    });

    it('should not affect other keys', () => {
      isRateLimited('key-a', 1, 60000);
      isRateLimited('key-b', 1, 60000);

      resetRateLimit('key-a');

      const keyB = isRateLimited('key-b', 1, 60000); // 2nd attempt
      expect(keyB).toBe(true); // Should still be blocked
    });

    it('should handle non-existent keys', () => {
      expect(() => resetRateLimit('non-existent')).not.toThrow();
    });
  });

  describe('getRemainingAttempts', () => {
    it('should return max attempts for new key', () => {
      const remaining = getRemainingAttempts('new-key', 5);

      expect(remaining).toBe(5);
    });

    it('should decrease with each attempt', () => {
      isRateLimited('countdown', 5, 60000); // 1st
      const after1 = getRemainingAttempts('countdown', 5);
      expect(after1).toBe(4);

      isRateLimited('countdown', 5, 60000); // 2nd
      const after2 = getRemainingAttempts('countdown', 5);
      expect(after2).toBe(3);
    });

    it('should return 0 when rate limited', () => {
      isRateLimited('zero-test', 2, 60000); // 1st
      isRateLimited('zero-test', 2, 60000); // 2nd
      isRateLimited('zero-test', 2, 60000); // 3rd - blocked

      const remaining = getRemainingAttempts('zero-test', 2);
      expect(remaining).toBe(0);
    });

    it('should reset to max after window expires', () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00'));

      isRateLimited('expiry-test', 5, 60000);
      const before = getRemainingAttempts('expiry-test', 5);
      expect(before).toBe(4);

      vi.setSystemTime(new Date('2024-01-01T12:02:00'));

      const after = getRemainingAttempts('expiry-test', 5);
      expect(after).toBe(5);
    });
  });

  describe('cleanupRateLimits', () => {
    it('should remove expired entries', () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00'));

      isRateLimited('cleanup1', 5, 60000);
      isRateLimited('cleanup2', 5, 60000);

      // Age one entry
      vi.setSystemTime(new Date('2024-01-01T12:02:00'));

      cleanupRateLimits();

      // Both should be cleaned up after expiry
      const remaining = getRemainingAttempts('cleanup1', 5);
      expect(remaining).toBe(5); // Reset
    });

    it('should not throw on empty store', () => {
      expect(() => cleanupRateLimits()).not.toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should handle login rate limiting scenario', () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00'));

      // First 3 login attempts
      expect(isRateLimited('login:user123', 3, 300000)).toBe(false);
      expect(isRateLimited('login:user123', 3, 300000)).toBe(false);
      expect(isRateLimited('login:user123', 3, 300000)).toBe(false);

      // 4th attempt - blocked
      expect(isRateLimited('login:user123', 3, 300000)).toBe(true);

      // 5 minutes later - still blocked
      vi.setSystemTime(new Date('2024-01-01T12:05:00'));
      expect(isRateLimited('login:user123', 3, 300000)).toBe(true);

      // After window (6 min) - reset
      vi.setSystemTime(new Date('2024-01-01T12:06:00'));
      expect(isRateLimited('login:user123', 3, 300000)).toBe(false);
    });

    it('should handle successful reset on correct attempt', () => {
      isRateLimited('voucher:abc', 3, 60000);
      isRateLimited('voucher:abc', 3, 60000);

      // Successful redemption
      resetRateLimit('voucher:abc');

      // Should be able to start fresh
      expect(getRemainingAttempts('voucher:abc', 3)).toBe(3);
    });
  });
});
