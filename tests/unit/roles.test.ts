import { describe, expect, it } from 'vitest';

import {
  ADMIN_ROLES,
  BACKOFFICE_ROLES,
  USER_ROLES,
  isAdminRole,
  isBackofficeRole,
  isUserRole,
  normalizeUserRole
} from '../../js/shared/roles.js';

describe('shared role taxonomy', () => {
  it('keeps full_admin in both the user and backoffice role sets', () => {
    expect(USER_ROLES).toContain('full_admin');
    expect(ADMIN_ROLES).toContain('full_admin');
    expect(BACKOFFICE_ROLES).toContain('full_admin');
    expect(isUserRole('full_admin')).toBe(true);
    expect(isAdminRole('full_admin')).toBe(true);
    expect(isBackofficeRole('full_admin')).toBe(true);
  });

  it('normalizes trusted string roles and rejects unknown values', () => {
    expect(normalizeUserRole('  full_admin  ')).toBe('full_admin');
    expect(normalizeUserRole('owner')).toBeNull();
    expect(normalizeUserRole(null)).toBeNull();
  });

  it('does not classify operators as backoffice users', () => {
    expect(isUserRole('operator')).toBe(true);
    expect(isAdminRole('operator')).toBe(false);
    expect(isBackofficeRole('operator')).toBe(false);
  });

  it('keeps accounting and billing in backoffice without granting admin privileges', () => {
    expect(isBackofficeRole('accounting')).toBe(true);
    expect(isBackofficeRole('billing')).toBe(true);
    expect(isAdminRole('accounting')).toBe(false);
    expect(isAdminRole('billing')).toBe(false);
  });
});
