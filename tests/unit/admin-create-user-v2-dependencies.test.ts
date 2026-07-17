import { describe, expect, it, vi } from 'vitest';
import {
  AuthUserAlreadyExistsError,
  AuthUserCreationAmbiguousError
} from '../../supabase/functions/admin_create_user_v2/handler.ts';
import { createSupabaseDependencies } from '../../supabase/functions/admin_create_user_v2/dependencies.ts';

const provisioningMetadata = {
  provisioning_request_id: 'request-304-test',
  provisioning_origin: 'admin_create_user_v2' as const
};

function makeProfileQuery(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, maybeSingle };
}

describe('admin_create_user_v2 Supabase dependencies', () => {
  it('verifies the bearer token and loads authorization only from the database profile', async () => {
    const profileQuery = makeProfileQuery({
      data: { role: 'admin', is_active: true },
      error: null
    });
    const callerClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'caller-auth-id', user_metadata: { role: 'root' } } },
          error: null
        })
      }
    };
    const serviceClient = {
      from: vi.fn().mockReturnValue(profileQuery),
      rpc: vi.fn(),
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
          updateUserById: vi.fn()
        }
      }
    };
    const dependencies = createSupabaseDependencies(callerClient, serviceClient);

    const profile = await dependencies.getCallerProfile('Bearer verified-token');

    expect(callerClient.auth.getUser).toHaveBeenCalledWith('verified-token');
    expect(serviceClient.from).toHaveBeenCalledWith('users');
    expect(profileQuery.select).toHaveBeenCalledWith('role, is_active');
    expect(profileQuery.eq).toHaveBeenCalledWith('created_by_auth', 'caller-auth-id');
    expect(profile).toEqual({ role: 'admin', is_active: true });
  });

  it('maps a definitive duplicate Auth error without exposing or deleting an existing user', async () => {
    const callerClient = { auth: { getUser: vi.fn() } };
    const createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'already registered' }
    });
    const serviceClient = {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        admin: {
          createUser,
          deleteUser: vi.fn(),
          updateUserById: vi.fn()
        }
      }
    };
    const dependencies = createSupabaseDependencies(callerClient, serviceClient);

    await expect(
      dependencies.createAuthUser({
        email: 'duplicate@neofuel.local',
        password: 'StrongPassword123!',
        user_metadata: {},
        app_metadata: provisioningMetadata
      })
    ).rejects.toBeInstanceOf(AuthUserAlreadyExistsError);
    expect(serviceClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('accepts a created Auth UUID even when the response omits the synthetic email', async () => {
    const callerClient = { auth: { getUser: vi.fn() } };
    const serviceClient = {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: '55555555-5555-4555-8555-555555555555' } },
            error: null
          }),
          deleteUser: vi.fn(),
          updateUserById: vi.fn()
        }
      }
    };
    const dependencies = createSupabaseDependencies(callerClient, serviceClient);

    await expect(
      dependencies.createAuthUser({
        email: 'synthetic@neofuel.local',
        password: 'StrongPassword123!',
        user_metadata: {},
        app_metadata: provisioningMetadata
      })
    ).resolves.toEqual({
      id: '55555555-5555-4555-8555-555555555555',
      emailConfirmed: false
    });
    expect(serviceClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email_confirm: false, app_metadata: provisioningMetadata })
    );
  });

  it('marks createUser transport errors returned in result.error as ambiguous', async () => {
    const callerClient = { auth: { getUser: vi.fn() } };
    const serviceClient = {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { code: 'retryable_fetch_error', message: 'network timeout' }
          }),
          deleteUser: vi.fn(),
          updateUserById: vi.fn()
        }
      }
    };
    const dependencies = createSupabaseDependencies(callerClient, serviceClient);

    await expect(
      dependencies.createAuthUser({
        email: 'ambiguous-result@neofuel.local',
        password: 'StrongPassword123!',
        user_metadata: {},
        app_metadata: provisioningMetadata
      })
    ).rejects.toBeInstanceOf(AuthUserCreationAmbiguousError);
  });

  it('marks thrown createUser transport failures as ambiguous', async () => {
    const callerClient = { auth: { getUser: vi.fn() } };
    const serviceClient = {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        admin: {
          createUser: vi.fn().mockRejectedValue(new Error('network timeout')),
          deleteUser: vi.fn(),
          updateUserById: vi.fn()
        }
      }
    };
    const dependencies = createSupabaseDependencies(callerClient, serviceClient);

    await expect(
      dependencies.createAuthUser({
        email: 'ambiguous@neofuel.local',
        password: 'StrongPassword123!',
        user_metadata: {},
        app_metadata: provisioningMetadata
      })
    ).rejects.toBeInstanceOf(AuthUserCreationAmbiguousError);
  });

  it('disables only the supplied new Auth identity as compensation fallback', async () => {
    const callerClient = { auth: { getUser: vi.fn() } };
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const serviceClient = {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
          updateUserById
        }
      }
    };
    const dependencies = createSupabaseDependencies(callerClient, serviceClient);

    await dependencies.disableAuthUser('44444444-4444-4444-8444-444444444444');

    expect(updateUserById).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444', {
      ban_duration: '876000h'
    });
  });
});
