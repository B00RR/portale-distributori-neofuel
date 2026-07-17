import { deriveAuthAlias } from '../../supabase/functions/_shared/auth-identity.ts';

export interface ProfileInventory {
  userId: number;
  username: string;
  email: string | null;
  role: string;
  isActive: boolean | null;
  authUserId: string | null;
}

export interface AuthIdentityInventory {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
}

export type MigrationRecordState = 'legacy' | 'auth_aligned' | 'profile_aligned' | 'aligned';

export interface MigrationRecord {
  state: MigrationRecordState;
  authUserId: string;
  userId: number;
  username: string;
  role: string;
  isActive: boolean | null;
  emailConfirmedAt: string | null;
  expectedAlias: string;
  previousAuthEmail: string;
  previousProfileEmail: string;
}

export type MigrationBlockerCode =
  | 'invalid_username'
  | 'alias_collision'
  | 'alias_occupied'
  | 'profile_without_auth'
  | 'auth_without_profile'
  | 'duplicate_profile_auth_link'
  | 'missing_auth_email'
  | 'missing_profile_email'
  | 'unexplained_email_mismatch';

export interface MigrationBlocker {
  code: MigrationBlockerCode;
  subject: string;
}

export interface MigrationPlan {
  records: MigrationRecord[];
  blockers: MigrationBlocker[];
}

export interface CurrentMigrationRecord {
  authUserId: string;
  userId: number;
  username: string;
  authEmail: string | null;
  profileEmail: string | null;
  role: string;
  isActive: boolean | null;
  emailConfirmedAt: string | null;
}

export interface MigrationAdapter {
  updateAuthEmail(authUserId: string, email: string): Promise<void>;
  updateProfileEmail(
    userId: number,
    authUserId: string,
    previousEmail: string,
    email: string
  ): Promise<void>;
  readRecord(authUserId: string, userId: number): Promise<CurrentMigrationRecord>;
}

export type ApplyResult = 'applied' | 'noop';
export type RollbackResult = 'rolled_back' | 'noop';

export class MigrationSagaError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'MigrationSagaError';
    this.code = code;
  }
}

function emailCollisionKey(email: string): string {
  return email.trim().toLowerCase();
}

function pushBlocker(
  blockers: MigrationBlocker[],
  seen: Set<string>,
  code: MigrationBlockerCode,
  subject: string
): void {
  const key = `${code}:${subject}`;
  if (seen.has(key)) return;
  seen.add(key);
  blockers.push({ code, subject });
}

function assertRecordInvariant(
  current: CurrentMigrationRecord,
  record: MigrationRecord,
  authEmail: string,
  profileEmail: string
): void {
  const valid =
    current.authUserId === record.authUserId &&
    current.userId === record.userId &&
    current.username === record.username &&
    current.authEmail === authEmail &&
    current.profileEmail === profileEmail &&
    current.role === record.role &&
    current.isActive === record.isActive &&
    current.emailConfirmedAt === record.emailConfirmedAt;

  if (!valid) {
    throw new MigrationSagaError('postcondition_failed');
  }
}

async function readSafely(
  adapter: MigrationAdapter,
  record: MigrationRecord
): Promise<CurrentMigrationRecord | null> {
  try {
    return await adapter.readRecord(record.authUserId, record.userId);
  } catch {
    return null;
  }
}

export function buildMigrationPlan(
  profiles: readonly ProfileInventory[],
  authUsers: readonly AuthIdentityInventory[]
): MigrationPlan {
  const blockers: MigrationBlocker[] = [];
  const blockerKeys = new Set<string>();
  const records: MigrationRecord[] = [];
  const authById = new Map(authUsers.map(user => [user.id, user]));
  const profilesByAuthId = new Map<string, ProfileInventory[]>();
  const expectedAliasOwners = new Map<string, ProfileInventory[]>();
  const authEmailOwners = new Map<string, AuthIdentityInventory[]>();

  for (const authUser of authUsers) {
    if (authUser.email) {
      const email = emailCollisionKey(authUser.email);
      const owners = authEmailOwners.get(email) ?? [];
      owners.push(authUser);
      authEmailOwners.set(email, owners);
    }
  }

  for (const profile of profiles) {
    if (!profile.authUserId) {
      pushBlocker(blockers, blockerKeys, 'profile_without_auth', `profile:${profile.userId}`);
    } else {
      const linkedProfiles = profilesByAuthId.get(profile.authUserId) ?? [];
      linkedProfiles.push(profile);
      profilesByAuthId.set(profile.authUserId, linkedProfiles);
    }

    try {
      const expectedAlias = deriveAuthAlias(profile.username);
      const owners = expectedAliasOwners.get(expectedAlias) ?? [];
      owners.push(profile);
      expectedAliasOwners.set(expectedAlias, owners);
    } catch {
      pushBlocker(blockers, blockerKeys, 'invalid_username', `profile:${profile.userId}`);
    }
  }

  for (const [authUserId, linkedProfiles] of profilesByAuthId) {
    if (linkedProfiles.length > 1) {
      pushBlocker(blockers, blockerKeys, 'duplicate_profile_auth_link', `auth:${authUserId}`);
    }
  }

  for (const [alias, owners] of expectedAliasOwners) {
    if (owners.length > 1) {
      for (const owner of owners) {
        pushBlocker(blockers, blockerKeys, 'alias_collision', `profile:${owner.userId}`);
      }
    }

    const occupiedBy = authEmailOwners.get(alias) ?? [];
    const intendedIds = new Set(owners.map(owner => owner.authUserId).filter(Boolean));
    for (const authUser of occupiedBy) {
      if (!intendedIds.has(authUser.id)) {
        pushBlocker(blockers, blockerKeys, 'alias_occupied', `auth:${authUser.id}`);
      }
    }
  }

  for (const authUser of authUsers) {
    if (!profilesByAuthId.has(authUser.id)) {
      pushBlocker(blockers, blockerKeys, 'auth_without_profile', `auth:${authUser.id}`);
    }
    if (!authUser.email) {
      pushBlocker(blockers, blockerKeys, 'missing_auth_email', `auth:${authUser.id}`);
    }
  }

  for (const profile of profiles) {
    if (!profile.email) {
      pushBlocker(blockers, blockerKeys, 'missing_profile_email', `profile:${profile.userId}`);
    }

    if (!profile.authUserId || !profile.email) continue;
    const authUser = authById.get(profile.authUserId);
    if (!authUser) {
      pushBlocker(blockers, blockerKeys, 'profile_without_auth', `profile:${profile.userId}`);
      continue;
    }
    if (!authUser.email) continue;

    let expectedAlias: string;
    try {
      expectedAlias = deriveAuthAlias(profile.username);
    } catch {
      continue;
    }

    const authEmail = authUser.email;
    const profileEmail = profile.email;
    let state: MigrationRecordState;
    if (authEmail === expectedAlias && profileEmail === expectedAlias) {
      state = 'aligned';
    } else if (authEmail === profileEmail) {
      state = 'legacy';
    } else if (authEmail === expectedAlias) {
      state = 'auth_aligned';
    } else if (profileEmail === expectedAlias) {
      state = 'profile_aligned';
    } else {
      pushBlocker(blockers, blockerKeys, 'unexplained_email_mismatch', `profile:${profile.userId}`);
      continue;
    }

    records.push({
      state,
      authUserId: authUser.id,
      userId: profile.userId,
      username: profile.username,
      role: profile.role,
      isActive: profile.isActive,
      emailConfirmedAt: authUser.emailConfirmedAt,
      expectedAlias,
      previousAuthEmail: authUser.email,
      previousProfileEmail: profile.email
    });
  }

  records.sort((left, right) => left.userId - right.userId);
  blockers.sort((left, right) => {
    const codeOrder = left.code.localeCompare(right.code);
    return codeOrder === 0 ? left.subject.localeCompare(right.subject) : codeOrder;
  });

  return { records, blockers };
}

export async function applyMigrationRecord(
  record: MigrationRecord,
  adapter: MigrationAdapter
): Promise<ApplyResult> {
  if (record.state === 'aligned') return 'noop';

  let authChanged = false;
  let profileChanged = false;

  try {
    if (record.state !== 'auth_aligned') {
      try {
        await adapter.updateAuthEmail(record.authUserId, record.expectedAlias);
        authChanged = true;
      } catch {
        const current = await readSafely(adapter, record);
        if (current?.authEmail !== record.expectedAlias) {
          throw new MigrationSagaError('auth_update_failed');
        }
        authChanged = true;
      }
    }

    if (record.state !== 'profile_aligned') {
      try {
        await adapter.updateProfileEmail(
          record.userId,
          record.authUserId,
          record.previousProfileEmail,
          record.expectedAlias
        );
        profileChanged = true;
      } catch {
        const current = await readSafely(adapter, record);
        if (current?.profileEmail === record.expectedAlias) {
          profileChanged = true;
        } else {
          throw new MigrationSagaError('profile_update_failed');
        }
      }
    }

    const current = await adapter.readRecord(record.authUserId, record.userId);
    assertRecordInvariant(current, record, record.expectedAlias, record.expectedAlias);
    return 'applied';
  } catch (cause) {
    const compensationErrors: string[] = [];

    if (profileChanged && record.previousProfileEmail !== record.expectedAlias) {
      try {
        await adapter.updateProfileEmail(
          record.userId,
          record.authUserId,
          record.expectedAlias,
          record.previousProfileEmail
        );
      } catch {
        compensationErrors.push('profile');
      }
    }

    if (authChanged && record.previousAuthEmail !== record.expectedAlias) {
      try {
        await adapter.updateAuthEmail(record.authUserId, record.previousAuthEmail);
      } catch {
        compensationErrors.push('auth');
      }
    }

    if (compensationErrors.length > 0) {
      throw new MigrationSagaError('compensation_failed');
    }
    if (authChanged || profileChanged) {
      try {
        const compensated = await adapter.readRecord(record.authUserId, record.userId);
        assertRecordInvariant(
          compensated,
          record,
          record.previousAuthEmail,
          record.previousProfileEmail
        );
      } catch {
        throw new MigrationSagaError('compensation_failed');
      }
      throw new MigrationSagaError('migration_failed_compensated');
    }
    throw cause instanceof MigrationSagaError ? cause : new MigrationSagaError('migration_failed');
  }
}

export async function rollbackMigrationRecord(
  record: MigrationRecord,
  adapter: MigrationAdapter
): Promise<RollbackResult> {
  const current = await adapter.readRecord(record.authUserId, record.userId);
  const initialAuthEmail = current.authEmail;
  const initialProfileEmail = current.profileEmail;
  if (initialAuthEmail === null || initialProfileEmail === null) {
    throw new MigrationSagaError('rollback_precondition_failed');
  }
  const authIsPrevious = current.authEmail === record.previousAuthEmail;
  const profileIsPrevious = current.profileEmail === record.previousProfileEmail;
  const authIsAlias = current.authEmail === record.expectedAlias;
  const profileIsAlias = current.profileEmail === record.expectedAlias;

  if (authIsPrevious && profileIsPrevious) {
    assertRecordInvariant(current, record, record.previousAuthEmail, record.previousProfileEmail);
    return 'noop';
  }
  if ((!authIsPrevious && !authIsAlias) || (!profileIsPrevious && !profileIsAlias)) {
    throw new MigrationSagaError('rollback_precondition_failed');
  }

  let profileChanged = false;
  let authChanged = false;
  try {
    if (!profileIsPrevious) {
      try {
        await adapter.updateProfileEmail(
          record.userId,
          record.authUserId,
          record.expectedAlias,
          record.previousProfileEmail
        );
        profileChanged = true;
      } catch {
        const observed = await readSafely(adapter, record);
        if (observed?.profileEmail === record.previousProfileEmail) {
          profileChanged = true;
        } else {
          throw new MigrationSagaError('rollback_profile_update_failed');
        }
      }
    }
    if (!authIsPrevious) {
      try {
        await adapter.updateAuthEmail(record.authUserId, record.previousAuthEmail);
        authChanged = true;
      } catch {
        const observed = await readSafely(adapter, record);
        if (observed?.authEmail === record.previousAuthEmail) {
          authChanged = true;
        } else {
          throw new MigrationSagaError('rollback_auth_update_failed');
        }
      }
    }

    const rolledBack = await adapter.readRecord(record.authUserId, record.userId);
    assertRecordInvariant(
      rolledBack,
      record,
      record.previousAuthEmail,
      record.previousProfileEmail
    );
    return 'rolled_back';
  } catch (cause) {
    const compensationErrors: string[] = [];
    if (authChanged && record.previousAuthEmail !== record.expectedAlias) {
      try {
        await adapter.updateAuthEmail(record.authUserId, record.expectedAlias);
      } catch {
        compensationErrors.push('auth');
      }
    }
    if (profileChanged && record.previousProfileEmail !== record.expectedAlias) {
      try {
        await adapter.updateProfileEmail(
          record.userId,
          record.authUserId,
          record.previousProfileEmail,
          record.expectedAlias
        );
      } catch {
        compensationErrors.push('profile');
      }
    }
    if (compensationErrors.length > 0) {
      throw new MigrationSagaError('rollback_compensation_failed');
    }
    if (authChanged || profileChanged) {
      try {
        const compensated = await adapter.readRecord(record.authUserId, record.userId);
        assertRecordInvariant(compensated, record, initialAuthEmail, initialProfileEmail);
      } catch {
        throw new MigrationSagaError('rollback_compensation_failed');
      }
    }
    if (!authChanged && !profileChanged) {
      throw cause instanceof MigrationSagaError ? cause : new MigrationSagaError('rollback_failed');
    }
    throw new MigrationSagaError('rollback_failed_compensated');
  }
}
