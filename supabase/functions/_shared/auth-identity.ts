/**
 * Versioned contract for application usernames and their Supabase Auth identity.
 *
 * This module is intentionally dependency-free so the browser bundle, Deno Edge
 * Functions and migration tooling all execute exactly the same rules.
 */
export const AUTH_IDENTITY_CONTRACT_VERSION = 1;
export const AUTH_ALIAS_DOMAIN = 'neofuel.local';
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

const USERNAME_CHARACTERS = /^[A-Za-z0-9._-]+$/;

export type UsernameIdentityErrorCode =
  'invalid_type' | 'too_short' | 'too_long' | 'invalid_characters';

export interface UsernameIdentity {
  username: string;
  authAlias: string;
}

export type UsernameIdentityParseResult =
  { success: true; data: UsernameIdentity } | { success: false; code: UsernameIdentityErrorCode };

export function parseUsernameIdentity(input: unknown): UsernameIdentityParseResult {
  if (typeof input !== 'string') {
    return { success: false, code: 'invalid_type' };
  }

  const trimmed = input.trim();
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return { success: false, code: 'too_short' };
  }
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return { success: false, code: 'too_long' };
  }
  if (!USERNAME_CHARACTERS.test(trimmed)) {
    return { success: false, code: 'invalid_characters' };
  }

  const username = trimmed.toLowerCase();
  return {
    success: true,
    data: {
      username,
      authAlias: `${username}@${AUTH_ALIAS_DOMAIN}`
    }
  };
}

export function normalizeUsername(input: string): string {
  const result = parseUsernameIdentity(input);
  if (!result.success) {
    throw new TypeError(`Invalid username (${result.code})`);
  }
  return result.data.username;
}

export function deriveAuthAlias(input: string): string {
  const result = parseUsernameIdentity(input);
  if (!result.success) {
    throw new TypeError(`Invalid username (${result.code})`);
  }
  return result.data.authAlias;
}
