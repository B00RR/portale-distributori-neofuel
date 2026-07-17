import { describe, expect, it, vi } from 'vitest';

import {
  AUTH_IDENTITY_CONTRACT_VERSION,
  deriveAuthAlias,
  normalizeUsername,
  parseUsernameIdentity
} from '../../supabase/functions/_shared/auth-identity.ts';
import {
  applySeedIdentityPlan,
  deriveSeedAuthIdentity,
  planSeedIdentityReconciliation
} from '../../scripts/e2e-live-seed.mjs';

describe('username -> Supabase Auth identity contract', () => {
  it('is explicitly versioned', () => {
    expect(AUTH_IDENTITY_CONTRACT_VERSION).toBe(1);
  });

  it.each([
    ['Operator01', 'operator01'],
    [' operator01 ', 'operator01'],
    ['ADMIN.OPERATOR', 'admin.operator']
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it('accepts the exact 3 and 32 character boundaries', () => {
    expect(parseUsernameIdentity('abc').success).toBe(true);
    expect(parseUsernameIdentity('a'.repeat(32)).success).toBe(true);
  });

  it('rejects usernames outside the 3-32 character boundaries', () => {
    expect(parseUsernameIdentity('ab').success).toBe(false);
    expect(parseUsernameIdentity('a'.repeat(33)).success).toBe(false);
  });

  it('accepts only ASCII letters, numbers, dot, underscore and dash', () => {
    expect(parseUsernameIdentity('Admin.01_test-user').success).toBe(true);

    for (const invalid of ['admin operator', 'operator+admin', 'operat\u00f6r', 'admin@neofuel']) {
      expect(parseUsernameIdentity(invalid).success, invalid).toBe(false);
    }
  });

  it('derives the deterministic internal Auth alias', () => {
    expect(deriveAuthAlias(' ADMIN.OPERATOR ')).toBe('admin.operator@neofuel.local');
  });

  it('makes case-only usernames collide on the same alias', () => {
    expect(deriveAuthAlias('Operator01')).toBe(deriveAuthAlias('operator01'));
  });

  it.each([
    'abc',
    'a'.repeat(32),
    'Operator01',
    ' operator01 ',
    'ADMIN.OPERATOR',
    'Admin.01_test-user'
  ])('keeps the Node live-E2E seed coupled for valid input %j', input => {
    const parsed = parseUsernameIdentity(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(deriveSeedAuthIdentity(input)).toEqual({
        username: parsed.data.username,
        email: parsed.data.authAlias
      });
    }
  });

  it.each(['ab', 'a'.repeat(33), 'admin operator', 'operator+admin', 'operatör'])(
    'keeps the Node live-E2E seed coupled for invalid input %j',
    input => {
      expect(parseUsernameIdentity(input).success).toBe(false);
      expect(() => deriveSeedAuthIdentity(input)).toThrow('Invalid E2E username');
    }
  );

  it('rejects a configured seed email that diverges from the canonical alias', () => {
    expect(() => deriveSeedAuthIdentity('e2e-admin', 'e2e-admin@example.invalid')).toThrow(
      'does not match'
    );
  });

  it('accepts only the canonical or known historical E2E email during reconciliation', () => {
    const expected = { username: 'e2e-admin', email: 'e2e-admin@neofuel.local' };

    expect(deriveSeedAuthIdentity('e2e-admin', 'e2e-admin@neofuel.local')).toEqual(expected);
    expect(deriveSeedAuthIdentity('e2e-admin', 'e2e-admin@neofuel.test')).toEqual(expected);
  });
});

describe('live E2E seed identity reconciliation', () => {
  const authId = '00000000-0000-4000-8000-000000000001';
  const identity = deriveSeedAuthIdentity('e2e-admin');
  const legacyAuth = {
    id: authId,
    email: 'e2e-admin@neofuel.test',
    user_metadata: { seed: 'legacy' }
  };
  const legacyProfile = {
    user_id: 7,
    username: 'e2e_admin',
    email: 'e2e-admin@neofuel.test',
    full_name: 'Admin E2E',
    role: 'admin',
    is_active: true,
    created_by_auth: authId
  };

  it('plans a legacy upgrade and an aligned reconciliation on the next inventory', () => {
    const legacyPlan = planSeedIdentityReconciliation({
      identity,
      legacyEmails: ['e2e-admin@neofuel.test'],
      authUsers: [legacyAuth],
      profiles: [legacyProfile]
    });

    expect(legacyPlan).toMatchObject({
      mode: 'migrate',
      previousEmail: 'e2e-admin@neofuel.test',
      authUser: { id: authId },
      profile: { user_id: 7 }
    });

    const alignedPlan = planSeedIdentityReconciliation({
      identity,
      legacyEmails: ['e2e-admin@neofuel.test'],
      authUsers: [{ ...legacyAuth, email: identity.email }],
      profiles: [{ ...legacyProfile, username: identity.username, email: identity.email }]
    });

    expect(alignedPlan).toMatchObject({
      mode: 'aligned',
      authUser: { id: authId },
      profile: { user_id: 7 }
    });
  });

  it('migrates the existing UUID and refreshes only the E2E fixture credentials', async () => {
    const plan = planSeedIdentityReconciliation({
      identity,
      legacyEmails: ['e2e-admin@neofuel.test'],
      authUsers: [legacyAuth],
      profiles: [legacyProfile]
    });
    const operations = {
      createAuthUser: vi.fn(),
      updateAuthUser: vi.fn().mockImplementation(async (_id, update) => ({
        ...legacyAuth,
        email: update.email || legacyAuth.email,
        user_metadata: update.user_metadata
      })),
      deleteAuthUser: vi.fn(),
      upsertProfile: vi.fn().mockImplementation(async (_existing, payload) => ({
        user_id: legacyProfile.user_id,
        ...payload
      }))
    };

    const result = await applySeedIdentityPlan(
      plan,
      { password: 'synthetic-password', role: 'admin', fullName: 'Admin E2E' },
      operations
    );

    expect(operations.createAuthUser).not.toHaveBeenCalled();
    expect(operations.deleteAuthUser).not.toHaveBeenCalled();
    expect(operations.updateAuthUser).toHaveBeenCalledWith(
      authId,
      expect.objectContaining({
        email: 'e2e-admin@neofuel.local',
        password: 'synthetic-password',
        email_confirm: true,
        user_metadata: expect.objectContaining({ username: 'e2e-admin' })
      })
    );
    expect(result.authUser.id).toBe(authId);
    expect(result.profile).toMatchObject({
      user_id: 7,
      created_by_auth: authId,
      email: 'e2e-admin@neofuel.local',
      username: 'e2e-admin'
    });
  });

  it('blocks an alias collision before reconciliation', () => {
    expect(() =>
      planSeedIdentityReconciliation({
        identity,
        legacyEmails: ['e2e-admin@neofuel.test'],
        authUsers: [
          legacyAuth,
          {
            id: '00000000-0000-4000-8000-000000000002',
            email: 'e2e-admin@neofuel.local'
          }
        ],
        profiles: [legacyProfile]
      })
    ).toThrow('Auth collision');
  });

  it('refuses to adopt an Auth identity without its linked E2E profile', () => {
    expect(() =>
      planSeedIdentityReconciliation({
        identity,
        legacyEmails: ['e2e-admin@neofuel.test'],
        authUsers: [legacyAuth],
        profiles: []
      })
    ).toThrow('without linked profile');
  });

  it('refuses a linked profile whose username is not canonical or historically seeded', () => {
    expect(() =>
      planSeedIdentityReconciliation({
        identity,
        legacyEmails: ['e2e-admin@neofuel.test'],
        authUsers: [legacyAuth],
        profiles: [{ ...legacyProfile, username: 'unrelated-admin' }]
      })
    ).toThrow('fixture identity mismatch');
  });

  it('rolls a legacy email back if profile reconciliation fails', async () => {
    const plan = planSeedIdentityReconciliation({
      identity,
      legacyEmails: ['e2e-admin@neofuel.test'],
      authUsers: [legacyAuth],
      profiles: [legacyProfile]
    });
    const updateAuthUser = vi
      .fn()
      .mockResolvedValueOnce({ ...legacyAuth, email: identity.email })
      .mockResolvedValueOnce(legacyAuth);
    const operations = {
      createAuthUser: vi.fn(),
      updateAuthUser,
      deleteAuthUser: vi.fn(),
      upsertProfile: vi.fn().mockRejectedValue(new Error('profile write failed'))
    };

    await expect(
      applySeedIdentityPlan(
        plan,
        { password: 'synthetic-password', role: 'admin', fullName: 'Admin E2E' },
        operations
      )
    ).rejects.toThrow('profile write failed');

    expect(updateAuthUser).toHaveBeenNthCalledWith(
      2,
      authId,
      expect.objectContaining({
        email: 'e2e-admin@neofuel.test',
        user_metadata: { seed: 'legacy' }
      })
    );
  });

  it('deletes only the newly created Auth user when profile creation fails', async () => {
    const plan = planSeedIdentityReconciliation({
      identity,
      legacyEmails: ['e2e-admin@neofuel.test'],
      authUsers: [],
      profiles: []
    });
    const newAuthId = '00000000-0000-4000-8000-000000000003';
    const operations = {
      createAuthUser: vi.fn().mockResolvedValue({ id: newAuthId, email: identity.email }),
      updateAuthUser: vi.fn(),
      deleteAuthUser: vi.fn().mockResolvedValue(undefined),
      upsertProfile: vi.fn().mockRejectedValue(new Error('profile insert failed'))
    };

    await expect(
      applySeedIdentityPlan(
        plan,
        { password: 'synthetic-password', role: 'admin', fullName: 'Admin E2E' },
        operations
      )
    ).rejects.toThrow('profile insert failed');

    expect(operations.deleteAuthUser).toHaveBeenCalledOnce();
    expect(operations.deleteAuthUser).toHaveBeenCalledWith(newAuthId);
    expect(operations.updateAuthUser).not.toHaveBeenCalled();
  });
});
