/**
 * Canonical user-role taxonomy shared by authentication, routing and validation.
 */
export const USER_ROLES = [
  'admin',
  'super_admin',
  'full_admin',
  'operator',
  'accounting',
  'billing'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLES = [
  'admin',
  'super_admin',
  'full_admin'
] as const satisfies readonly UserRole[];

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const BACKOFFICE_ROLES = [
  'admin',
  'super_admin',
  'full_admin',
  'accounting',
  'billing'
] as const satisfies readonly UserRole[];

export type BackofficeRole = (typeof BACKOFFICE_ROLES)[number];

const USER_ROLE_SET: ReadonlySet<string> = new Set(USER_ROLES);
const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);
const BACKOFFICE_ROLE_SET: ReadonlySet<string> = new Set(BACKOFFICE_ROLES);

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && USER_ROLE_SET.has(role);
}

export function normalizeUserRole(role: unknown): UserRole | null {
  if (typeof role !== 'string') {
    return null;
  }

  const normalized = role.trim();
  return isUserRole(normalized) ? normalized : null;
}

export function isBackofficeRole(role: unknown): role is BackofficeRole {
  return typeof role === 'string' && BACKOFFICE_ROLE_SET.has(role);
}

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === 'string' && ADMIN_ROLE_SET.has(role);
}
