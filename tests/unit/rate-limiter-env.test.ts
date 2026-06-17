import { test, expect, vi } from 'vitest';

test('rate limiter sets auto-cleanup interval when window is defined', async () => {
  vi.stubGlobal('window', {});
  vi.useFakeTimers();
  vi.spyOn(globalThis, 'setInterval');
  const { cleanupRateLimits } = await import('../../js/utils/rate-limiter.js');
  expect(setInterval).toHaveBeenCalledWith(cleanupRateLimits, 5 * 60 * 1000);
  vi.unstubAllGlobals();
});
