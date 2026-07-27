import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  cleanupLiveE2EData,
  deriveSeedAuthIdentity,
  seedLiveE2EData,
  validateLiveE2EConfig
} from '../../scripts/e2e-live-seed.mjs';
import { resolveE2ECredentials } from '../../e2e/helpers/mock-supabase.js';

function createValidBaseEnv() {
  return {
    E2E_SUPABASE_MODE: 'live',
    ALLOW_E2E_SEED: '1',
    E2E_TARGET_PROJECT_REF: 'disposable-ref',
    VITE_SUPABASE_URL: 'https://disposable-ref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    E2E_ALLOWED_PROJECT_REFS: 'disposable-ref,other-disposable',
    PRODUCTION_SUPABASE_PROJECT_REF: 'production-ref',
    TEST_ADMIN_USERNAME: 'e2e-admin',
    TEST_ADMIN_PASSWORD: 'secure-admin-pass-123',
    TEST_OPERATOR_USERNAME: 'e2e-operator',
    TEST_OPERATOR_PASSWORD: 'secure-operator-pass-123',
    E2E_RUN_ID: 'run-alpha-101'
  };
}

describe('Issue #309 live E2E seed preflight safety guards', () => {
  it('validates a correct disposable configuration', () => {
    const validEnv = createValidBaseEnv();
    const config = validateLiveE2EConfig(validEnv);

    expect(config).toMatchObject({
      supabaseUrl: 'https://disposable-ref.supabase.co',
      serviceRoleKey: 'test-service-role-key',
      targetRef: 'disposable-ref',
      adminUsername: 'e2e-admin',
      operatorUsername: 'e2e-operator',
      runId: 'run-alpha-101'
    });
  });

  it('rejects execution when E2E_SUPABASE_MODE is not live', () => {
    const env = { ...createValidBaseEnv(), E2E_SUPABASE_MODE: 'mock' };
    expect(() => validateLiveE2EConfig(env)).toThrow('E2E_SUPABASE_MODE must be set to "live"');
  });

  it('rejects execution when ALLOW_E2E_SEED opt-in is missing, false, or true', () => {
    for (const invalidOptIn of [undefined, '', '0', 'false', 'true', 'invalid']) {
      const env = { ...createValidBaseEnv(), ALLOW_E2E_SEED: invalidOptIn };
      expect(() => validateLiveE2EConfig(env)).toThrow('ALLOW_E2E_SEED=1 is required');
    }
  });

  it('rejects missing or placeholder E2E_TARGET_PROJECT_REF', () => {
    for (const invalidRef of [
      undefined,
      '',
      '   ',
      'your-target-project-ref-here',
      'your-project-ref-here'
    ]) {
      const env = { ...createValidBaseEnv(), E2E_TARGET_PROJECT_REF: invalidRef };
      expect(() => validateLiveE2EConfig(env)).toThrow(/E2E_TARGET_PROJECT_REF/);
    }
  });

  it('rejects missing or placeholder PRODUCTION_SUPABASE_PROJECT_REF', () => {
    for (const invalidProdRef of [undefined, '', '   ', 'your-production-ref-here']) {
      const env = { ...createValidBaseEnv(), PRODUCTION_SUPABASE_PROJECT_REF: invalidProdRef };
      expect(() => validateLiveE2EConfig(env)).toThrow(/PRODUCTION_SUPABASE_PROJECT_REF/);
    }
  });

  it('rejects arbitrary or non-supabase domains', () => {
    for (const invalidUrl of [
      'https://localhost',
      'http://127.0.0.1:54321',
      'https://custom-domain.com',
      'https://sub.domain.supabase.co'
    ]) {
      const env = {
        ...createValidBaseEnv(),
        E2E_TARGET_PROJECT_REF: 'disposable-ref',
        VITE_SUPABASE_URL: invalidUrl
      };
      expect(() => validateLiveE2EConfig(env)).toThrow(
        /VITE_SUPABASE_URL must use HTTPS|Supabase URL host must be a valid \*\.supabase\.co domain|Target project ref mismatch/
      );
    }
  });

  it('rejects missing or invalid Supabase URL before any network attempt', () => {
    for (const invalidUrl of [
      undefined,
      '',
      'your-project-url-here',
      'not-a-url',
      'ftp://test.co'
    ]) {
      const env = {
        ...createValidBaseEnv(),
        VITE_SUPABASE_URL: invalidUrl,
        SUPABASE_URL: undefined
      };
      expect(() => validateLiveE2EConfig(env)).toThrow(/VITE_SUPABASE_URL/);
    }
  });

  it('rejects missing or placeholder service role key', () => {
    for (const invalidKey of [undefined, '', '   ', 'your-service-role-key-here']) {
      const env = { ...createValidBaseEnv(), SUPABASE_SERVICE_ROLE_KEY: invalidKey };
      expect(() => validateLiveE2EConfig(env)).toThrow('SUPABASE_SERVICE_ROLE_KEY is required');
    }
  });

  it('rejects mismatch between declared target project ref and URL host ref', () => {
    const env = {
      ...createValidBaseEnv(),
      VITE_SUPABASE_URL: 'https://actual-host-ref.supabase.co',
      E2E_TARGET_PROJECT_REF: 'mismatched-target-ref'
    };
    expect(() => validateLiveE2EConfig(env)).toThrow('Target project ref mismatch');
  });

  it('rejects target project ref not included in allowed project refs', () => {
    const env = {
      ...createValidBaseEnv(),
      VITE_SUPABASE_URL: 'https://unauthorized-ref.supabase.co',
      E2E_TARGET_PROJECT_REF: 'unauthorized-ref',
      E2E_ALLOWED_PROJECT_REFS: 'allowed-ref-1,allowed-ref-2'
    };
    expect(() => validateLiveE2EConfig(env)).toThrow(
      'Target project ref is not in the allowed project refs list'
    );
  });

  it('ALWAYS rejects production project ref even if explicitly listed in allowlist', () => {
    const env = {
      ...createValidBaseEnv(),
      E2E_TARGET_PROJECT_REF: 'production-ref',
      VITE_SUPABASE_URL: 'https://production-ref.supabase.co',
      PRODUCTION_SUPABASE_PROJECT_REF: 'production-ref',
      E2E_ALLOWED_PROJECT_REFS: 'production-ref,disposable-ref'
    };
    expect(() => validateLiveE2EConfig(env)).toThrow(
      'Execution rejected: target project ref is identified as production'
    );
  });

  it('rejects the immutable production project even when the configured production ref is wrong', () => {
    const env = {
      ...createValidBaseEnv(),
      E2E_TARGET_PROJECT_REF: 'ahlmgafaurossyghimxc',
      VITE_SUPABASE_URL: 'https://ahlmgafaurossyghimxc.supabase.co',
      PRODUCTION_SUPABASE_PROJECT_REF: 'typo-not-production',
      E2E_ALLOWED_PROJECT_REFS: 'ahlmgafaurossyghimxc'
    };

    expect(() => validateLiveE2EConfig(env)).toThrow(
      'Execution rejected: target project ref is identified as production'
    );
  });

  it('requires HTTPS even for an otherwise valid Supabase host', () => {
    const env = {
      ...createValidBaseEnv(),
      VITE_SUPABASE_URL: 'http://disposable-ref.supabase.co'
    };

    expect(() => validateLiveE2EConfig(env)).toThrow('VITE_SUPABASE_URL must use HTTPS');
  });

  it('rejects missing admin or operator credentials without applying fallbacks', () => {
    const credKeys = [
      'TEST_ADMIN_USERNAME',
      'TEST_ADMIN_PASSWORD',
      'TEST_OPERATOR_USERNAME',
      'TEST_OPERATOR_PASSWORD'
    ];

    for (const key of credKeys) {
      const env = { ...createValidBaseEnv(), [key]: '' };
      expect(() => validateLiveE2EConfig(env)).toThrow(new RegExp(`${key} is required`));
    }
  });

  it('rejects missing or invalid run ID', () => {
    for (const invalidRunId of [
      undefined,
      '',
      '   ',
      'a',
      'run id with spaces',
      'run!@#',
      'a'.repeat(33)
    ]) {
      const env = { ...createValidBaseEnv(), E2E_RUN_ID: invalidRunId };
      expect(() => validateLiveE2EConfig(env)).toThrow(/E2E_RUN_ID is required/);
    }
  });

  it('ensures distinct namespace derivation between different test runs', () => {
    const adminIdentityRun1 = deriveSeedAuthIdentity('e2e-admin', null, 'run-101');
    const adminIdentityRun2 = deriveSeedAuthIdentity('e2e-admin', null, 'run-102');

    expect(adminIdentityRun1.username).toBe('e2e-admin_run-101');
    expect(adminIdentityRun2.username).toBe('e2e-admin_run-102');
    expect(adminIdentityRun1.email).toBe('e2e-admin_run-101@neofuel.local');
    expect(adminIdentityRun2.email).toBe('e2e-admin_run-102@neofuel.local');
    expect(adminIdentityRun1.username).not.toBe(adminIdentityRun2.username);
  });

  it('never outputs passwords, service keys, tokens, or PII in error messages', () => {
    const secretPassword = 'SUPER_SECRET_ADMIN_PASSWORD_99';
    const secretRoleKey = 'SUPER_SECRET_SERVICE_ROLE_KEY_88';

    const env = {
      ...createValidBaseEnv(),
      TEST_ADMIN_PASSWORD: secretPassword,
      SUPABASE_SERVICE_ROLE_KEY: secretRoleKey,
      E2E_TARGET_PROJECT_REF: 'production-ref',
      VITE_SUPABASE_URL: 'https://production-ref.supabase.co',
      PRODUCTION_SUPABASE_PROJECT_REF: 'production-ref'
    };

    let thrownError = null;
    try {
      validateLiveE2EConfig(env);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    const errorMsg = thrownError?.message || '';
    expect(errorMsg).not.toContain(secretPassword);
    expect(errorMsg).not.toContain(secretRoleKey);
  });
});

describe('Issue #309 Finding 2: Seed preflight collision protection & zero write operations', () => {
  it('fails preflight and performs zero write operations when Auth collision exists', async () => {
    const env = createValidBaseEnv();

    const existingAuthUsers = [
      {
        id: 'auth-existing-1',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];

    const mockOperations = {
      createAuthUser: vi.fn(),
      updateAuthUser: vi.fn(),
      deleteAuthUser: vi.fn(),
      upsertProfile: vi.fn()
    };
    const mockCreateStation = vi.fn();

    await expect(
      seedLiveE2EData({
        env,
        listAuthUsers: async () => existingAuthUsers,
        listAppUsers: async () => [],
        findStationByName: async () => null,
        operations: mockOperations,
        createStation: mockCreateStation
      })
    ).rejects.toThrow('E2E seed preflight failed: Auth collision detected');

    expect(mockOperations.createAuthUser).not.toHaveBeenCalled();
    expect(mockOperations.upsertProfile).not.toHaveBeenCalled();
    expect(mockCreateStation).not.toHaveBeenCalled();
  });

  it('fails preflight and performs zero write operations when Profile collision exists', async () => {
    const env = createValidBaseEnv();

    const existingProfiles = [
      {
        user_id: 99,
        username: 'e2e-operator_run-alpha-101',
        email: 'e2e-operator_run-alpha-101@neofuel.local'
      }
    ];

    const mockOperations = {
      createAuthUser: vi.fn(),
      updateAuthUser: vi.fn(),
      deleteAuthUser: vi.fn(),
      upsertProfile: vi.fn()
    };
    const mockCreateStation = vi.fn();

    await expect(
      seedLiveE2EData({
        env,
        listAuthUsers: async () => [],
        listAppUsers: async () => existingProfiles,
        findStationByName: async () => null,
        operations: mockOperations,
        createStation: mockCreateStation
      })
    ).rejects.toThrow('E2E seed preflight failed: profile collision detected');

    expect(mockOperations.createAuthUser).not.toHaveBeenCalled();
    expect(mockOperations.upsertProfile).not.toHaveBeenCalled();
    expect(mockCreateStation).not.toHaveBeenCalled();
  });

  it('fails preflight and performs zero write operations when Station collision exists', async () => {
    const env = createValidBaseEnv();

    const existingStation = {
      station_id: 10,
      station_name: 'Stazione E2E [run-alpha-101]',
      location: 'E2E [E2E_RUN:run-alpha-101]'
    };

    const mockOperations = {
      createAuthUser: vi.fn(),
      updateAuthUser: vi.fn(),
      deleteAuthUser: vi.fn(),
      upsertProfile: vi.fn()
    };
    const mockCreateStation = vi.fn();

    await expect(
      seedLiveE2EData({
        env,
        listAuthUsers: async () => [],
        listAppUsers: async () => [],
        findStationByName: async () => existingStation,
        operations: mockOperations,
        createStation: mockCreateStation
      })
    ).rejects.toThrow('E2E seed preflight failed: station collision detected');

    expect(mockOperations.createAuthUser).not.toHaveBeenCalled();
    expect(mockOperations.upsertProfile).not.toHaveBeenCalled();
    expect(mockCreateStation).not.toHaveBeenCalled();
  });
});

describe('Issue #309 Finding 4: Seed mid-execution failure compensation', () => {
  it('triggers fail-closed compensation when station creation fails mid-seed', async () => {
    const env = createValidBaseEnv();

    const createdAuthUsers = [];
    const createdProfiles = [];
    const deletedAuthIds = [];
    const deletedUserIds = [];

    const mockOperations = {
      createAuthUser: vi.fn().mockImplementation(async input => {
        const u = { id: `auth-id-${createdAuthUsers.length + 1}`, ...input };
        createdAuthUsers.push(u);
        return u;
      }),
      updateAuthUser: vi.fn(),
      deleteAuthUser: vi.fn().mockImplementation(async id => {
        deletedAuthIds.push(id);
      }),
      upsertProfile: vi.fn().mockImplementation(async (_existing, payload) => {
        const p = { user_id: createdProfiles.length + 1, ...payload };
        createdProfiles.push(p);
        return p;
      })
    };

    const mockCreateStation = vi
      .fn()
      .mockRejectedValue(new Error('Database connection lost during station creation'));

    const mockDeleteProfile = vi.fn().mockImplementation(async (_sb, userId) => {
      deletedUserIds.push(userId);
    });

    await expect(
      seedLiveE2EData({
        env,
        listAuthUsers: async () => [],
        listAppUsers: async () => [],
        findStationByName: async () => null,
        operations: mockOperations,
        createStation: mockCreateStation,
        deleteProfile: mockDeleteProfile
      })
    ).rejects.toThrow('E2E seed execution failed');

    expect(createdAuthUsers).toHaveLength(2); // Admin + Operator auth created before failure
    expect(createdProfiles).toHaveLength(2); // Admin + Operator profiles created before failure
    expect(deletedUserIds).toHaveLength(2); // Both profiles cleaned up by compensation
    expect(deletedAuthIds).toHaveLength(2); // Both Auth users cleaned up by compensation
  });
});

describe('Issue #309 Finding 3: Strict cleanup safety & preflight validation', () => {
  it('returns skipped when E2E_SUPABASE_MODE is mock', async () => {
    const env = { E2E_SUPABASE_MODE: 'mock' };
    const seedResult = await seedLiveE2EData({ env });
    const cleanupResult = await cleanupLiveE2EData({ env });

    expect(seedResult).toEqual({ skipped: true, reason: 'E2E_SUPABASE_MODE is not live' });
    expect(cleanupResult).toEqual({ skipped: true, reason: 'E2E_SUPABASE_MODE is not live' });
  });

  it('is an idempotent no-op when no fixtures exist', async () => {
    const env = createValidBaseEnv();

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue([]),
      listAppUsers: vi.fn().mockResolvedValue([]),
      findStationByName: vi.fn().mockResolvedValue(null)
    };

    const result = await cleanupLiveE2EData({ env, operations: mockCleanupOperations });
    expect(result).toEqual({
      skipped: false,
      runId: 'run-alpha-101',
      deletedAuthCount: 0,
      deletedProfileCount: 0,
      deletedStation: false
    });
  });

  it('fails preflight and performs zero deletes when Auth metadata is spoofed', async () => {
    const env = createValidBaseEnv();

    const spoofedAuthUser = {
      id: 'auth-spoofed-1',
      email: 'unrelated-user@otherdomain.com',
      user_metadata: { e2e_run_id: 'run-alpha-101' }
    };

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue([spoofedAuthUser]),
      listAppUsers: vi.fn().mockResolvedValue([]),
      findStationByName: vi.fn().mockResolvedValue(null),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: Auth user metadata mismatch'
    );

    expect(mockCleanupOperations.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('fails preflight and performs zero deletes when created_by_auth mismatches', async () => {
    const env = createValidBaseEnv();

    const authUsers = [
      {
        id: 'auth-admin-id',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-operator-id',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];
    const profiles = [
      {
        user_id: 1,
        username: 'e2e-admin_run-alpha-101',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        created_by_auth: 'different-auth-id-mismatch'
      },
      {
        user_id: 2,
        username: 'e2e-operator_run-alpha-101',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-operator-id'
      }
    ];

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue(authUsers),
      listAppUsers: vi.fn().mockResolvedValue(profiles),
      findStationByName: vi.fn().mockResolvedValue(null),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: profile mismatch or missing linked Auth user'
    );

    expect(mockCleanupOperations.deleteProfile).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('fails preflight when in a partial state (Auth user without profile)', async () => {
    const env = createValidBaseEnv();

    const authUsers = [
      {
        id: 'auth-admin-id',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-operator-id',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue(authUsers),
      listAppUsers: vi.fn().mockResolvedValue([]),
      findStationByName: vi.fn().mockResolvedValue(null),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: profile mismatch or missing linked Auth user'
    );

    expect(mockCleanupOperations.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('fails preflight and performs zero deletes when station location marker mismatches', async () => {
    const env = createValidBaseEnv();

    const stationWithWrongMarker = {
      station_id: 42,
      station_name: 'Stazione E2E [run-alpha-101]',
      location: 'Wrong Location Without Marker'
    };

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue([]),
      listAppUsers: vi.fn().mockResolvedValue([]),
      findStationByName: vi.fn().mockResolvedValue(stationWithWrongMarker),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: station location marker mismatch'
    );

    expect(mockCleanupOperations.deleteStation).not.toHaveBeenCalled();
  });

  it('sanitizes external delete errors in cleanup without exposing raw error text', async () => {
    const env = createValidBaseEnv();

    const authUsers = [
      {
        id: 'auth-admin-id',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-operator-id',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];
    const profiles = [
      {
        user_id: 1,
        username: 'e2e-admin_run-alpha-101',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-admin-id'
      },
      {
        user_id: 2,
        username: 'e2e-operator_run-alpha-101',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-operator-id'
      }
    ];
    const station = {
      station_id: 42,
      station_name: 'Stazione E2E [run-alpha-101]',
      location: 'E2E [E2E_RUN:run-alpha-101]'
    };

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue(authUsers),
      listAppUsers: vi.fn().mockResolvedValue(profiles),
      findStationByName: vi.fn().mockResolvedValue(station),
      listStationAssignments: vi.fn().mockResolvedValue([
        { station_id: 42, user_id: 1 },
        { station_id: 42, user_id: 2 }
      ]),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi
        .fn()
        .mockRejectedValue(
          new Error('Foreign key violation during profile delete with key secret-123')
        ),
      deleteAuthUser: vi.fn()
    };

    let thrown = null;
    try {
      await cleanupLiveE2EData({ env, operations: mockCleanupOperations });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).not.toBeNull();
    expect(thrown.message).toBe('E2E cleanup execution failed');
    expect(thrown.message).not.toContain('Foreign key violation');
    expect(thrown.message).not.toContain('secret-123');
  });

  it('performs exact cleanup and passes post-condition checks', async () => {
    const env = createValidBaseEnv();

    let authUsersStore = [
      {
        id: 'auth-admin-id',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-operator-id',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];
    let appUsersStore = [
      {
        user_id: 1,
        username: 'e2e-admin_run-alpha-101',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-admin-id'
      },
      {
        user_id: 2,
        username: 'e2e-operator_run-alpha-101',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-operator-id'
      }
    ];
    let stationStore = {
      station_id: 42,
      station_name: 'Stazione E2E [run-alpha-101]',
      location: 'E2E [E2E_RUN:run-alpha-101]'
    };

    let assignmentStore = [
      { station_id: 42, user_id: 1 },
      { station_id: 42, user_id: 2 }
    ];
    const deletedAssignments = [];

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockImplementation(async () => authUsersStore),
      listAppUsers: vi.fn().mockImplementation(async () => appUsersStore),
      findStationByName: vi
        .fn()
        .mockImplementation(async name =>
          stationStore?.station_name === name ? stationStore : null
        ),
      listStationAssignments: vi.fn().mockImplementation(async () => assignmentStore),
      deleteExactStationAssignment: vi.fn().mockImplementation(async (sId, uId) => {
        deletedAssignments.push({ sId, uId });
        assignmentStore = assignmentStore.filter(
          assignment => assignment.station_id !== sId || assignment.user_id !== uId
        );
      }),
      deleteStation: vi.fn().mockImplementation(async () => {
        stationStore = null;
      }),
      deleteProfile: vi.fn().mockImplementation(async userId => {
        appUsersStore = appUsersStore.filter(p => p.user_id !== userId);
      }),
      deleteAuthUser: vi.fn().mockImplementation(async authId => {
        authUsersStore = authUsersStore.filter(u => u.id !== authId);
      })
    };

    const cleanupResult = await cleanupLiveE2EData({ env, operations: mockCleanupOperations });

    expect(cleanupResult).toEqual({
      skipped: false,
      runId: 'run-alpha-101',
      deletedAuthCount: 2,
      deletedProfileCount: 2,
      deletedStation: true
    });

    expect(deletedAssignments).toHaveLength(2);
    expect(deletedAssignments).toContainEqual({ sId: 42, uId: 1 });
    expect(deletedAssignments).toContainEqual({ sId: 42, uId: 2 });
  });

  it('fails before deletes when the station has an unknown assignment', async () => {
    const env = createValidBaseEnv();
    const authUsers = [
      {
        id: 'auth-admin-id',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-operator-id',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];
    const profiles = [
      {
        user_id: 1,
        username: 'e2e-admin_run-alpha-101',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-admin-id'
      },
      {
        user_id: 2,
        username: 'e2e-operator_run-alpha-101',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-operator-id'
      }
    ];
    const operations = {
      listAuthUsers: vi.fn().mockResolvedValue(authUsers),
      listAppUsers: vi.fn().mockResolvedValue(profiles),
      findStationByName: vi.fn().mockResolvedValue({
        station_id: 42,
        station_name: 'Stazione E2E [run-alpha-101]',
        location: 'E2E [E2E_RUN:run-alpha-101]'
      }),
      listStationAssignments: vi.fn().mockResolvedValue([
        { station_id: 42, user_id: 1 },
        { station_id: 42, user_id: 2 },
        { station_id: 42, user_id: 999 }
      ]),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations })).rejects.toThrow(
      'Cleanup preflight failed: station assignment graph mismatch'
    );
    expect(operations.deleteExactStationAssignment).not.toHaveBeenCalled();
    expect(operations.deleteStation).not.toHaveBeenCalled();
  });
});

describe('Issue #309 Finding 1: Credential Resolution Unit Tests', () => {
  it('resolves live credentials matching seeded namespaced identity exactly', () => {
    const liveEnv = createValidBaseEnv();

    const seededAdmin = deriveSeedAuthIdentity(
      liveEnv.TEST_ADMIN_USERNAME,
      undefined,
      liveEnv.E2E_RUN_ID
    );
    const loginAdmin = resolveE2ECredentials('admin', liveEnv);

    expect(loginAdmin.username).toBe(seededAdmin.username);
    expect(loginAdmin.username).toBe('e2e-admin_run-alpha-101');
    expect(loginAdmin.password).toBe(liveEnv.TEST_ADMIN_PASSWORD);

    const seededOperator = deriveSeedAuthIdentity(
      liveEnv.TEST_OPERATOR_USERNAME,
      undefined,
      liveEnv.E2E_RUN_ID
    );
    const loginOperator = resolveE2ECredentials('operator', liveEnv);

    expect(loginOperator.username).toBe(seededOperator.username);
    expect(loginOperator.username).toBe('e2e-operator_run-alpha-101');
    expect(loginOperator.password).toBe(liveEnv.TEST_OPERATOR_PASSWORD);
  });

  it('throws in live mode when credentials or run ID are missing (no fallbacks)', () => {
    const baseEnv = createValidBaseEnv();

    expect(() => resolveE2ECredentials('admin', { ...baseEnv, TEST_ADMIN_USERNAME: '' })).toThrow(
      'TEST_ADMIN_USERNAME is required'
    );

    expect(() => resolveE2ECredentials('admin', { ...baseEnv, TEST_ADMIN_PASSWORD: '' })).toThrow(
      'TEST_ADMIN_PASSWORD is required'
    );

    expect(() => resolveE2ECredentials('admin', { ...baseEnv, E2E_RUN_ID: '' })).toThrow(
      'E2E_RUN_ID is required'
    );
  });

  it('resolves hermetic default credentials in mock mode', () => {
    const mockEnv = { E2E_SUPABASE_MODE: 'mock' };

    const adminCreds = resolveE2ECredentials('admin', mockEnv);
    expect(adminCreds).toEqual({
      username: 'e2e-admin',
      password: 'password-e2e-admin'
    });

    const operatorCreds = resolveE2ECredentials('operator', mockEnv);
    expect(operatorCreds).toEqual({
      username: 'e2e-operator',
      password: 'password-e2e-operator'
    });
  });
});

describe('Issue #309 Finding 2: Additional preflight zero-delete tests', () => {
  it('fails preflight and performs 0 deletes when station location contains marker as substring', async () => {
    const env = createValidBaseEnv();

    const stationWithSubstringMarker = {
      station_id: 10,
      station_name: 'Stazione E2E [run-alpha-101]',
      location: 'E2E [E2E_RUN:run-alpha-101] extra text'
    };

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue([]),
      listAppUsers: vi.fn().mockResolvedValue([]),
      findStationByName: vi.fn().mockResolvedValue(stationWithSubstringMarker),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: station location marker mismatch'
    );

    expect(mockCleanupOperations.deleteStation).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteProfile).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('fails preflight and performs 0 deletes when duplicate Auth users exist for runId', async () => {
    const env = createValidBaseEnv();

    const authUsers = [
      {
        id: 'auth-admin-1',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-admin-2',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-operator-1',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue(authUsers),
      listAppUsers: vi.fn().mockResolvedValue([]),
      findStationByName: vi.fn().mockResolvedValue(null),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: Auth user metadata mismatch or unauthorized identity'
    );

    expect(mockCleanupOperations.deleteStation).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteProfile).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('fails preflight and performs 0 deletes when duplicate profiles exist', async () => {
    const env = createValidBaseEnv();

    const authUsers = [
      {
        id: 'auth-admin-id',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      },
      {
        id: 'auth-operator-id',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        user_metadata: { e2e_run_id: 'run-alpha-101' }
      }
    ];
    const profiles = [
      {
        user_id: 1,
        username: 'e2e-admin_run-alpha-101',
        email: 'e2e-admin_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-admin-id'
      },
      {
        user_id: 2,
        username: 'e2e-operator_run-alpha-101',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-operator-id'
      },
      {
        user_id: 3,
        username: 'e2e-operator_run-alpha-101',
        email: 'e2e-operator_run-alpha-101@neofuel.local',
        created_by_auth: 'auth-operator-id'
      }
    ];
    const station = {
      station_id: 42,
      station_name: 'Stazione E2E [run-alpha-101]',
      location: 'E2E [E2E_RUN:run-alpha-101]'
    };

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue(authUsers),
      listAppUsers: vi.fn().mockResolvedValue(profiles),
      findStationByName: vi.fn().mockResolvedValue(station),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: profile mismatch or missing linked Auth user'
    );

    expect(mockCleanupOperations.deleteStation).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteProfile).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('fails preflight and performs 0 deletes when state is partial (station only)', async () => {
    const env = createValidBaseEnv();

    const stationOnly = {
      station_id: 42,
      station_name: 'Stazione E2E [run-alpha-101]',
      location: 'E2E [E2E_RUN:run-alpha-101]'
    };

    const mockCleanupOperations = {
      listAuthUsers: vi.fn().mockResolvedValue([]),
      listAppUsers: vi.fn().mockResolvedValue([]),
      findStationByName: vi.fn().mockResolvedValue(stationOnly),
      deleteExactStationAssignment: vi.fn(),
      deleteStation: vi.fn(),
      deleteProfile: vi.fn(),
      deleteAuthUser: vi.fn()
    };

    await expect(cleanupLiveE2EData({ env, operations: mockCleanupOperations })).rejects.toThrow(
      'Cleanup preflight failed: Auth user metadata mismatch or unauthorized identity'
    );

    expect(mockCleanupOperations.deleteStation).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteProfile).not.toHaveBeenCalled();
    expect(mockCleanupOperations.deleteAuthUser).not.toHaveBeenCalled();
  });
});

describe('Issue #309 Finding 3: Secret and PII Sanitization Tests', () => {
  it('never exposes passwords, service keys, URLs, project refs, emails, or UUIDs in external operation errors', async () => {
    const env = createValidBaseEnv();

    const piiErrorText =
      'DB error: password=SECRET_PASS_999, serviceRoleKey=SECRET_KEY_777, url=https://abc.supabase.co, ref=my-project-ref, email=user@domain.com, uuid=12345678-1234-1234-1234-1234567890ab';

    const mockOperations = {
      createAuthUser: vi.fn().mockRejectedValue(new Error(piiErrorText)),
      updateAuthUser: vi.fn(),
      deleteAuthUser: vi.fn(),
      upsertProfile: vi.fn()
    };

    let thrownSeedErr = null;
    try {
      await seedLiveE2EData({
        env,
        listAuthUsers: async () => [],
        listAppUsers: async () => [],
        findStationByName: async () => null,
        operations: mockOperations
      });
    } catch (err) {
      thrownSeedErr = err;
    }

    expect(thrownSeedErr).not.toBeNull();
    const seedMsg = thrownSeedErr?.message || '';
    expect(seedMsg).toBe('E2E seed execution failed');
    expect(seedMsg).not.toContain('SECRET_PASS_999');
    expect(seedMsg).not.toContain('SECRET_KEY_777');
    expect(seedMsg).not.toContain('https://abc.supabase.co');
    expect(seedMsg).not.toContain('my-project-ref');
    expect(seedMsg).not.toContain('user@domain.com');
    expect(seedMsg).not.toContain('12345678-1234-1234-1234-1234567890ab');
  });
});

describe('Issue #309 live command scope', () => {
  it('runs only the deterministic live shell smoke specification', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['test:e2e:live']).toContain('critical-flows.spec.js');
    expect(packageJson.scripts['test:e2e:live']).not.toContain('data-driven.spec.js');
    expect(packageJson.scripts['test:e2e:live']).not.toContain('closure-integration.spec.js');
  });
});
