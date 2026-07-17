import { describe, expect, it, vi } from 'vitest';
import {
  AuthUserAlreadyExistsError,
  createAdminUserHandler,
  type AdminCreateUserDependencies
} from '../../supabase/functions/admin_create_user_v2/handler.ts';

function makeDependencies(
  overrides: Partial<AdminCreateUserDependencies> = {}
): AdminCreateUserDependencies {
  return {
    getCallerProfile: vi.fn().mockResolvedValue(null),
    createAuthUser: vi.fn(),
    createProfile: vi.fn(),
    deleteAuthUser: vi.fn(),
    disableAuthUser: vi.fn(),
    reportProvisioningFailure: vi.fn(),
    ...overrides
  };
}

function makeRequest(
  body: unknown,
  headers: Record<string, string> = { Authorization: 'Bearer test-token' }
): Request {
  return new Request('https://example.test/admin_create_user_v2', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'x-request-id': 'request-304-test'
    },
    body: JSON.stringify(body)
  });
}

const validBody = {
  username: 'new.operator',
  password: 'StrongPassword123!',
  full_name: 'New Operator',
  role: 'operator'
};

describe('admin_create_user_v2 handler', () => {
  it('returns 503 in maintenance mode before auth or service-role work', async () => {
    const dependencies = makeDependencies();
    const handler = createAdminUserHandler(dependencies, { maintenanceMode: true });

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(503);
    expect(dependencies.getCallerProfile).not.toHaveBeenCalled();
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
  });

  it('returns 401 without a bearer token before any dependency call', async () => {
    const dependencies = makeDependencies();
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest(validBody, {}));

    expect(response.status).toBe(401);
    expect(dependencies.getCallerProfile).not.toHaveBeenCalled();
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
  });

  it('rejects a caller without an active database admin profile before privileged work', async () => {
    const dependencies = makeDependencies();
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(403);
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
    expect(dependencies.createProfile).not.toHaveBeenCalled();
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('rejects an inactive admin before privileged work', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: false })
    });
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(403);
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
    expect(dependencies.createProfile).not.toHaveBeenCalled();
  });

  it('fails closed when the admin active flag is null', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: null })
    });
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(403);
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
  });

  it('rejects a missing full name before creating an Auth identity', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: true })
    });
    const handler = createAdminUserHandler(dependencies);
    const { full_name: _fullName, ...bodyWithoutFullName } = validBody;

    const response = await handler(makeRequest(bodyWithoutFullName));

    expect(response.status).toBe(400);
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
    expect(dependencies.createProfile).not.toHaveBeenCalled();
  });

  it('rejects a role outside the server-side allowlist', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: true })
    });
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest({ ...validBody, role: 'root' }));

    expect(response.status).toBe(400);
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
    expect(dependencies.createProfile).not.toHaveBeenCalled();
  });

  it('ignores malicious role metadata and provisions the validated role in the profile only', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: true }),
      createAuthUser: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111'
      }),
      createProfile: vi.fn().mockResolvedValue(undefined)
    });
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest({ ...validBody, user_metadata: { role: 'admin' } }));

    expect(response.status).toBe(201);
    expect(dependencies.createAuthUser).toHaveBeenCalledWith({
      email: 'new.operator@neofuel.local',
      password: validBody.password,
      user_metadata: {
        username: 'new.operator',
        full_name: 'New Operator'
      }
    });
    expect(dependencies.createProfile).toHaveBeenCalledWith({
      username: 'new.operator',
      email: 'new.operator@neofuel.local',
      full_name: 'New Operator',
      role: 'operator',
      is_active: true,
      created_by_auth: '11111111-1111-4111-8111-111111111111'
    });
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('deletes the new Auth identity when profile creation fails', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: true }),
      createAuthUser: vi.fn().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222'
      }),
      createProfile: vi.fn().mockRejectedValue(new Error('profile insert failed')),
      deleteAuthUser: vi.fn().mockResolvedValue(undefined)
    });
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(500);
    expect(dependencies.deleteAuthUser).toHaveBeenCalledOnce();
    expect(dependencies.deleteAuthUser).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222'
    );
    expect(dependencies.reportProvisioningFailure).toHaveBeenCalledWith({
      requestId: 'request-304-test',
      authUserId: '22222222-2222-4222-8222-222222222222',
      phase: 'profile_create',
      compensation: 'deleted'
    });
  });

  it('retries deletion then disables the exact new identity when deletion keeps failing', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: true }),
      createAuthUser: vi.fn().mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333'
      }),
      createProfile: vi.fn().mockRejectedValue(new Error('profile insert failed')),
      deleteAuthUser: vi.fn().mockRejectedValue(new Error('delete failed')),
      disableAuthUser: vi.fn().mockResolvedValue(undefined)
    });
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(500);
    expect(dependencies.deleteAuthUser).toHaveBeenCalledTimes(2);
    expect(dependencies.deleteAuthUser).toHaveBeenNthCalledWith(
      2,
      '33333333-3333-4333-8333-333333333333'
    );
    expect(dependencies.disableAuthUser).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333'
    );
    expect(dependencies.reportProvisioningFailure).toHaveBeenCalledWith({
      requestId: 'request-304-test',
      authUserId: '33333333-3333-4333-8333-333333333333',
      phase: 'profile_create',
      compensation: 'disabled'
    });
  });

  it('returns 409 for a concurrent duplicate without deleting any existing identity', async () => {
    const dependencies = makeDependencies({
      getCallerProfile: vi.fn().mockResolvedValue({ role: 'admin', is_active: true }),
      createAuthUser: vi.fn().mockRejectedValue(new AuthUserAlreadyExistsError())
    });
    const handler = createAdminUserHandler(dependencies);

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(409);
    expect(dependencies.createProfile).not.toHaveBeenCalled();
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled();
    expect(dependencies.disableAuthUser).not.toHaveBeenCalled();
  });
});
