import { describe, it, expect, vi } from 'vitest';
import {
  getISODate,
  getItalianBusinessDate,
  getItalianBusinessDayEndUtc
} from '../../js/utils/utils.js';

describe('Italian business date helpers (#324)', () => {
  it('getISODate returns YYYY-MM-DD in Europe/Rome', () => {
    const romeMidnight = new Date('2024-12-31T23:00:00.000Z'); // 2025-01-01 00:00 Italy
    expect(getISODate(romeMidnight)).toBe('2025-01-01');
  });

  it('getItalianBusinessDate returns today in Italy', () => {
    expect(getItalianBusinessDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getItalianBusinessDayEndUtc ends at 23:59:59 Italy', () => {
    const end = getItalianBusinessDayEndUtc();
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}T22:59:59\.999Z|...:59:59\.999Z$/);
  });
});
