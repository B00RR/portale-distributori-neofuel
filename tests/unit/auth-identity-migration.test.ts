import { describe, expect, it, vi } from 'vitest';

import {
  applyMigrationRecord,
  buildMigrationPlan,
  rollbackMigrationRecord,
  type AuthIdentityInventory,
  type MigrationAdapter,
  type ProfileInventory
} from '../../scripts/auth-identity-migration/core.ts';
import { createRedactedReport } from '../../scripts/auth-identity-migration/report.ts';
import {
  createSnapshot,
  decryptSnapshot,
  encryptSnapshot
} from '../../scripts/auth-identity-migration/snapshot.ts';

const AUTH_ID = '10101010-1010-4010-8010-101010101010';
const LEGACY_EMAIL = 'legacy-operator@example.invalid';

function profile(overrides: Partial<ProfileInventory> = {}): ProfileInventory {
  return {
    userId: 7,
    username: 'Legacy.Operator',
    email: LEGACY_EMAIL,
    role: 'operator',
    isActive: true,
    authUserId: AUTH_ID,
    ...overrides
  };
}

function authIdentity(overrides: Partial<AuthIdentityInventory> = {}): AuthIdentityInventory {
  return {
    id: AUTH_ID,
    email: LEGACY_EMAIL,
    emailConfirmedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('Auth alias migration plan', () => {
  it('classifies a linked legacy identity without changing UUID, role or active state', () => {
    const plan = buildMigrationPlan([profile()], [authIdentity()]);

    expect(plan.blockers).toEqual([]);
    expect(plan.records).toEqual([
      expect.objectContaining({
        state: 'legacy',
        authUserId: AUTH_ID,
        userId: 7,
        role: 'operator',
        isActive: true,
        expectedAlias: 'legacy.operator@neofuel.local',
        previousAuthEmail: LEGACY_EMAIL,
        previousProfileEmail: LEGACY_EMAIL
      })
    ]);
  });

  it('blocks normalized alias collisions', () => {
    const secondAuthId = '20202020-2020-4020-8020-202020202020';
    const plan = buildMigrationPlan(
      [
        profile({ username: 'Operator01' }),
        profile({
          userId: 8,
          username: 'operator01',
          authUserId: secondAuthId,
          email: 'second-legacy@example.invalid'
        })
      ],
      [authIdentity(), authIdentity({ id: secondAuthId, email: 'second-legacy@example.invalid' })]
    );

    expect(plan.blockers).toContainEqual(expect.objectContaining({ code: 'alias_collision' }));
  });

  it.each(['LEGACY.OPERATOR@neofuel.local', ' legacy.operator@neofuel.local '])(
    'does not treat non-canonical profile email %j as aligned',
    profileEmail => {
      const expectedAlias = 'legacy.operator@neofuel.local';
      const plan = buildMigrationPlan(
        [profile({ email: profileEmail })],
        [authIdentity({ email: expectedAlias })]
      );

      expect(plan.blockers).toEqual([]);
      expect(plan.records[0]?.state).toBe('auth_aligned');
    }
  );

  it.each([
    {
      name: 'invalid username',
      profiles: [profile({ username: 'invalid username' })],
      authUsers: [authIdentity()],
      code: 'invalid_username'
    },
    {
      name: 'profile without Auth identity',
      profiles: [profile()],
      authUsers: [],
      code: 'profile_without_auth'
    },
    {
      name: 'Auth identity without profile',
      profiles: [],
      authUsers: [authIdentity()],
      code: 'auth_without_profile'
    },
    {
      name: 'unexplained email mismatch',
      profiles: [profile({ email: 'profile-only@example.invalid' })],
      authUsers: [authIdentity({ email: 'auth-only@example.invalid' })],
      code: 'unexplained_email_mismatch'
    }
  ])('blocks $name', ({ profiles, authUsers, code }) => {
    const plan = buildMigrationPlan(profiles, authUsers);

    expect(plan.blockers).toContainEqual(expect.objectContaining({ code }));
  });
});

describe('Auth alias migration saga', () => {
  it('updates Auth first, updates the profile second and verifies immutable fields', async () => {
    const record = buildMigrationPlan([profile()], [authIdentity()]).records[0]!;
    const calls: string[] = [];
    const adapter: MigrationAdapter = {
      updateAuthEmail: vi.fn(async (_authUserId, email) => {
        calls.push(`auth:${email}`);
      }),
      updateProfileEmail: vi.fn(async (_userId, _authUserId, _previousEmail, email) => {
        calls.push(`profile:${email}`);
      }),
      readRecord: vi.fn().mockResolvedValue({
        authUserId: AUTH_ID,
        userId: 7,
        username: 'Legacy.Operator',
        authEmail: record.expectedAlias,
        profileEmail: record.expectedAlias,
        role: 'operator',
        isActive: true,
        emailConfirmedAt: '2026-01-01T00:00:00.000Z'
      })
    };

    await expect(applyMigrationRecord(record, adapter)).resolves.toBe('applied');

    expect(calls).toEqual([
      'auth:legacy.operator@neofuel.local',
      'profile:legacy.operator@neofuel.local'
    ]);
    expect(adapter.updateAuthEmail).toHaveBeenCalledWith(AUTH_ID, 'legacy.operator@neofuel.local');
  });

  it('compensates the Auth email and stops when the profile update fails', async () => {
    const record = buildMigrationPlan([profile()], [authIdentity()]).records[0]!;
    const updateAuthEmail = vi.fn().mockResolvedValue(undefined);
    const baseRecord = {
      authUserId: AUTH_ID,
      userId: 7,
      username: 'Legacy.Operator',
      role: 'operator',
      isActive: true,
      emailConfirmedAt: '2026-01-01T00:00:00.000Z'
    };
    const adapter: MigrationAdapter = {
      updateAuthEmail,
      updateProfileEmail: vi.fn().mockRejectedValue(new Error('profile update failed')),
      readRecord: vi
        .fn()
        .mockResolvedValueOnce({
          ...baseRecord,
          authEmail: record.expectedAlias,
          profileEmail: LEGACY_EMAIL
        })
        .mockResolvedValueOnce({
          ...baseRecord,
          authEmail: LEGACY_EMAIL,
          profileEmail: LEGACY_EMAIL
        })
    };

    await expect(applyMigrationRecord(record, adapter)).rejects.toThrow('compensated');

    expect(updateAuthEmail).toHaveBeenNthCalledWith(1, AUTH_ID, record.expectedAlias);
    expect(updateAuthEmail).toHaveBeenNthCalledWith(2, AUTH_ID, LEGACY_EMAIL);
  });

  it('fails closed when a compensation does not restore every immutable field', async () => {
    const record = buildMigrationPlan([profile()], [authIdentity()]).records[0]!;
    const adapter: MigrationAdapter = {
      updateAuthEmail: vi.fn().mockResolvedValue(undefined),
      updateProfileEmail: vi.fn().mockRejectedValue(new Error('profile update failed')),
      readRecord: vi
        .fn()
        .mockResolvedValueOnce({
          authUserId: AUTH_ID,
          userId: 7,
          username: 'Legacy.Operator',
          authEmail: record.expectedAlias,
          profileEmail: LEGACY_EMAIL,
          role: 'operator',
          isActive: true,
          emailConfirmedAt: record.emailConfirmedAt
        })
        .mockResolvedValueOnce({
          authUserId: AUTH_ID,
          userId: 7,
          username: 'Legacy.Operator',
          authEmail: LEGACY_EMAIL,
          profileEmail: LEGACY_EMAIL,
          role: 'operator',
          isActive: true,
          emailConfirmedAt: '2026-02-02T00:00:00.000Z'
        })
    };

    await expect(applyMigrationRecord(record, adapter)).rejects.toThrow('compensation_failed');
  });

  it('is a no-op when Auth and profile already use the expected alias', async () => {
    const expectedAlias = 'legacy.operator@neofuel.local';
    const record = buildMigrationPlan(
      [profile({ email: expectedAlias })],
      [authIdentity({ email: expectedAlias })]
    ).records[0]!;
    const adapter: MigrationAdapter = {
      updateAuthEmail: vi.fn(),
      updateProfileEmail: vi.fn(),
      readRecord: vi.fn()
    };

    await expect(applyMigrationRecord(record, adapter)).resolves.toBe('noop');
    expect(adapter.updateAuthEmail).not.toHaveBeenCalled();
    expect(adapter.updateProfileEmail).not.toHaveBeenCalled();
  });

  it('rolls the profile back before Auth and verifies the previous identity', async () => {
    const record = buildMigrationPlan([profile()], [authIdentity()]).records[0]!;
    const calls: string[] = [];
    const migrated = {
      authUserId: AUTH_ID,
      userId: 7,
      username: 'Legacy.Operator',
      authEmail: record.expectedAlias,
      profileEmail: record.expectedAlias,
      role: 'operator',
      isActive: true,
      emailConfirmedAt: '2026-01-01T00:00:00.000Z'
    };
    const rolledBack = {
      ...migrated,
      authEmail: LEGACY_EMAIL,
      profileEmail: LEGACY_EMAIL
    };
    const adapter: MigrationAdapter = {
      updateAuthEmail: vi.fn(async (_authUserId, email) => {
        calls.push(`auth:${email}`);
      }),
      updateProfileEmail: vi.fn(async (_userId, _authUserId, _previousEmail, email) => {
        calls.push(`profile:${email}`);
      }),
      readRecord: vi.fn().mockResolvedValueOnce(migrated).mockResolvedValueOnce(rolledBack)
    };

    await expect(rollbackMigrationRecord(record, adapter)).resolves.toBe('rolled_back');
    expect(calls).toEqual([`profile:${LEGACY_EMAIL}`, `auth:${LEGACY_EMAIL}`]);
  });

  it('verifies the original migrated state after rollback compensation', async () => {
    const record = buildMigrationPlan([profile()], [authIdentity()]).records[0]!;
    const migrated = {
      authUserId: AUTH_ID,
      userId: 7,
      username: 'Legacy.Operator',
      authEmail: record.expectedAlias,
      profileEmail: record.expectedAlias,
      role: 'operator',
      isActive: true,
      emailConfirmedAt: record.emailConfirmedAt
    };
    const profileRolledBack = { ...migrated, profileEmail: LEGACY_EMAIL };
    const updateProfileEmail = vi.fn().mockResolvedValue(undefined);
    const adapter: MigrationAdapter = {
      updateAuthEmail: vi.fn().mockRejectedValue(new Error('Auth rollback failed')),
      updateProfileEmail,
      readRecord: vi
        .fn()
        .mockResolvedValueOnce(migrated)
        .mockResolvedValueOnce(profileRolledBack)
        .mockResolvedValueOnce(migrated)
    };

    await expect(rollbackMigrationRecord(record, adapter)).rejects.toThrow(
      'rollback_failed_compensated'
    );
    expect(updateProfileEmail).toHaveBeenNthCalledWith(
      2,
      7,
      AUTH_ID,
      LEGACY_EMAIL,
      record.expectedAlias
    );
  });
});

describe('Auth alias migration artifacts', () => {
  it('encrypts the reversible snapshot and rejects tampering', async () => {
    const plan = buildMigrationPlan([profile()], [authIdentity()]);
    const snapshot = createSnapshot('disposable-project-ref', 1, 1, plan.records);
    const key = new Uint8Array(32).fill(7);

    const encrypted = await encryptSnapshot(snapshot, key);
    expect(encrypted).not.toContain(LEGACY_EMAIL);
    expect(encrypted).not.toContain(AUTH_ID);
    await expect(decryptSnapshot(encrypted, key)).resolves.toEqual(snapshot);

    const envelope = JSON.parse(encrypted);
    envelope.ciphertext =
      (envelope.ciphertext.startsWith('A') ? 'B' : 'A') + envelope.ciphertext.slice(1);
    await expect(decryptSnapshot(JSON.stringify(envelope), key)).rejects.toThrow(
      'snapshot_authentication_failed'
    );
  });

  it('redacts project ref, UUID and every email from reports', async () => {
    const plan = buildMigrationPlan([profile()], [authIdentity()]);
    const report = await createRedactedReport('dry-run', 'disposable-project-ref', plan);
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain('disposable-project-ref');
    expect(serialized).not.toContain(AUTH_ID);
    expect(serialized).not.toContain(LEGACY_EMAIL);
    expect(serialized).not.toContain('@neofuel.local');
  });
});
