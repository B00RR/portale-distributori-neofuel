/**
 * Schema validation tests against REAL Zod.
 *
 * NOTE (#44): the Vitest config only stubs `js/core/zod-client.ts` (the CDN
 * wrapper). `js/core/schemas.ts` imports `z` directly from the `zod` npm package,
 * which is NOT stubbed — so these tests exercise genuine Zod validation. The
 * sanity test at the bottom proves we are NOT hitting a no-op stub (an invalid
 * payload must be rejected).
 */
import { describe, it, expect } from 'vitest';

import {
  LoginSchema,
  CreateUserSchema,
  UpdateUserSchema,
  PriceUpdateSchema,
  ShiftIdSchema,
  BulkExportSchema,
  AssignStationSchema,
  safeParse,
  parse
} from '../../js/core/schemas.js';

describe('Zod Schemas (real validation)', () => {
  describe('LoginSchema', () => {
    it('accepts a valid login and lowercases the email', () => {
      const res = safeParse(LoginSchema, { email: 'USER@Example.COM', password: 'secret1' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.email).toBe('user@example.com');
        expect(res.data.password).toBe('secret1');
      }
    });

    it('rejects an email with surrounding whitespace (real behavior: .email() runs before .trim())', () => {
      // Finding surfaced by real-Zod testing: in `z.string().email().toLowerCase().trim()`
      // the .email() check validates the RAW value, before .trim(), so a padded
      // email is rejected. Documented here; fixing the schema order is out of #44 scope.
      expect(
        safeParse(LoginSchema, { email: '  user@example.com  ', password: 'secret1' }).success
      ).toBe(false);
    });

    it('rejects an invalid email', () => {
      const res = safeParse(LoginSchema, { email: 'not-an-email', password: 'secret1' });
      expect(res.success).toBe(false);
    });

    it('rejects a password shorter than 6 chars (boundary)', () => {
      expect(safeParse(LoginSchema, { email: 'a@b.com', password: '12345' }).success).toBe(false);
      expect(safeParse(LoginSchema, { email: 'a@b.com', password: '123456' }).success).toBe(true);
    });
  });

  describe('CreateUserSchema', () => {
    const base = {
      email: 'a@b.com',
      password: '123456',
      full_name: 'Mario Rossi',
      role: 'operator' as const
    };

    it('accepts a valid user', () => {
      expect(safeParse(CreateUserSchema, base).success).toBe(true);
    });

    it('accepts the canonical full_admin role', () => {
      expect(safeParse(CreateUserSchema, { ...base, role: 'full_admin' }).success).toBe(true);
    });

    it('rejects an invalid role', () => {
      expect(safeParse(CreateUserSchema, { ...base, role: 'hacker' }).success).toBe(false);
    });

    it('rejects a too-short full_name and a too-long one (boundaries)', () => {
      expect(safeParse(CreateUserSchema, { ...base, full_name: 'A' }).success).toBe(false);
      expect(safeParse(CreateUserSchema, { ...base, full_name: 'A'.repeat(101) }).success).toBe(
        false
      );
    });
  });

  describe('UpdateUserSchema', () => {
    it('accepts valid data and rejects an invalid role', () => {
      expect(safeParse(UpdateUserSchema, { full_name: 'Mario Rossi', role: 'admin' }).success).toBe(
        true
      );
      expect(
        safeParse(UpdateUserSchema, { full_name: 'Mario Rossi', role: 'full_admin' }).success
      ).toBe(true);
      expect(safeParse(UpdateUserSchema, { full_name: 'Mario Rossi', role: 'nope' }).success).toBe(
        false
      );
    });
  });

  describe('PriceUpdateSchema', () => {
    const valid = {
      station_id: 1,
      prezzo_benzina: 1.85,
      prezzo_gasolio: 1.79,
      data_validita: '2026-06-25T10:00:00Z'
    };

    it('accepts valid prices', () => {
      expect(safeParse(PriceUpdateSchema, valid).success).toBe(true);
    });

    it('coerces a string station_id to a number', () => {
      const res = safeParse(PriceUpdateSchema, { ...valid, station_id: '42' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.station_id).toBe(42);
      }
    });

    it('rejects negative and out-of-range prices (boundaries)', () => {
      expect(safeParse(PriceUpdateSchema, { ...valid, prezzo_benzina: -0.01 }).success).toBe(false);
      expect(safeParse(PriceUpdateSchema, { ...valid, prezzo_gasolio: 10.01 }).success).toBe(false);
      expect(safeParse(PriceUpdateSchema, { ...valid, prezzo_benzina: 10 }).success).toBe(true); // max inclusive
    });

    it('accepts an optional/nullable gpl price but rejects an out-of-range one', () => {
      expect(safeParse(PriceUpdateSchema, { ...valid, prezzo_gpl: null }).success).toBe(true);
      expect(safeParse(PriceUpdateSchema, { ...valid, prezzo_gpl: 0.9 }).success).toBe(true);
      expect(safeParse(PriceUpdateSchema, { ...valid, prezzo_gpl: 99 }).success).toBe(false);
    });
  });

  describe('ShiftIdSchema', () => {
    it('accepts a numeric id and coerces a string id', () => {
      expect(safeParse(ShiftIdSchema, { id: 7 }).success).toBe(true);
      const res = safeParse(ShiftIdSchema, { id: '7' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.id).toBe(7);
      }
    });
  });

  describe('BulkExportSchema', () => {
    it('accepts last_n and applies the default limit', () => {
      const res = safeParse(BulkExportSchema, { stationId: null, type: 'last_n' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.limit).toBe(10);
      }
    });

    it('rejects a date_range without both dates (refine), accepts it with both', () => {
      expect(safeParse(BulkExportSchema, { stationId: null, type: 'date_range' }).success).toBe(
        false
      );
      expect(
        safeParse(BulkExportSchema, {
          stationId: null,
          type: 'date_range',
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31'
        }).success
      ).toBe(true);
    });

    it('rejects a limit out of [1,100] (boundaries)', () => {
      expect(
        safeParse(BulkExportSchema, { stationId: null, type: 'last_n', limit: 0 }).success
      ).toBe(false);
      expect(
        safeParse(BulkExportSchema, { stationId: null, type: 'last_n', limit: 101 }).success
      ).toBe(false);
      expect(
        safeParse(BulkExportSchema, { stationId: null, type: 'last_n', limit: 100 }).success
      ).toBe(true);
    });
  });

  describe('AssignStationSchema', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';

    it('accepts a valid uuid + positive station id', () => {
      expect(safeParse(AssignStationSchema, { user_id: uuid, station_id: 3 }).success).toBe(true);
    });

    it('rejects a bad uuid and a non-positive station id', () => {
      expect(safeParse(AssignStationSchema, { user_id: 'not-a-uuid', station_id: 3 }).success).toBe(
        false
      );
      expect(safeParse(AssignStationSchema, { user_id: uuid, station_id: 0 }).success).toBe(false);
      expect(safeParse(AssignStationSchema, { user_id: uuid, station_id: -1 }).success).toBe(false);
    });
  });

  describe('helpers', () => {
    it('safeParse returns a joined error string on failure', () => {
      const res = safeParse(LoginSchema, { email: 'bad', password: '1' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(typeof res.error).toBe('string');
        expect(res.error.length).toBeGreaterThan(0);
      }
    });

    it('parse throws on invalid input and returns data on valid input', () => {
      expect(() => parse(LoginSchema, { email: 'bad', password: '1' })).toThrow();
      expect(parse(LoginSchema, { email: 'a@b.com', password: '123456' })).toMatchObject({
        email: 'a@b.com'
      });
    });

    it('SANITY: real validation runs (a no-op stub would let this pass)', () => {
      // If schemas were validated by the no-op stub (parse: x => x || {}),
      // this clearly-invalid payload would be accepted. Real Zod rejects it.
      expect(safeParse(AssignStationSchema, { user_id: 'x', station_id: 'y' }).success).toBe(false);
    });
  });
});
