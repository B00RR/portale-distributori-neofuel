import { parseUsernameIdentity } from '../_shared/auth-identity.ts';

export interface CallerProfile {
  role: string;
  is_active: boolean | null;
}

export interface AuthUserInput {
  email: string;
  password: string;
  user_metadata: Record<string, unknown>;
  app_metadata: {
    provisioning_request_id: string;
    provisioning_origin: 'admin_create_user_v2';
  };
}

export interface CreatedAuthUser {
  id: string;
  emailConfirmed: boolean;
}

export interface AuthProvisioningState extends CreatedAuthUser {
  provisioningRequestId: string | null;
}

export interface ProfileInput {
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: true;
  created_by_auth: string;
}

export type ProfileState = 'match' | 'absent' | 'mismatch';
export type CompensationOutcome = 'deleted' | 'disabled' | 'unconfirmed' | 'failed' | 'unknown';

export interface ProvisioningFailureEvent {
  requestId: string;
  authUserId?: string;
  phase: 'auth_create' | 'profile_create' | 'auth_confirm';
  compensation: CompensationOutcome;
}

export interface AdminCreateUserDependencies {
  getCallerProfile(authHeader: string): Promise<CallerProfile | null>;
  createAuthUser(input: AuthUserInput): Promise<CreatedAuthUser>;
  lookupAuthUser(email: string): Promise<AuthProvisioningState | null>;
  createProfile(input: ProfileInput): Promise<void>;
  getProfileState(input: ProfileInput): Promise<ProfileState>;
  confirmAuthUser(authUserId: string): Promise<void>;
  deleteAuthUser(authUserId: string): Promise<void>;
  disableAuthUser(authUserId: string): Promise<void>;
  reportProvisioningFailure(event: ProvisioningFailureEvent): void;
}

export class AuthUserAlreadyExistsError extends Error {
  constructor() {
    super('Auth user already exists');
    this.name = 'AuthUserAlreadyExistsError';
  }
}

export class AuthUserCreationAmbiguousError extends Error {
  constructor() {
    super('Auth user creation outcome is ambiguous');
    this.name = 'AuthUserCreationAmbiguousError';
  }
}

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'full_admin']);
// Keep in sync with js/shared/roles.ts and public.users.users_role_check.
const ALLOWED_NEW_USER_ROLES = new Set([
  'admin',
  'super_admin',
  'full_admin',
  'operator',
  'accounting',
  'billing'
]);

const REQUEST_ID_RE = /^[a-zA-Z0-9._:-]{1,128}$/;

interface CreateUserBody {
  username: string;
  authAlias: string;
  password: string;
  full_name: string;
  role: string;
}

function parseCreateUserBody(body: unknown): CreateUserBody | null {
  if (typeof body !== 'object' || body === null) return null;

  const username = 'username' in body ? body.username : undefined;
  const password = 'password' in body ? body.password : undefined;
  const fullName = 'full_name' in body ? body.full_name : undefined;
  const role = 'role' in body ? body.role : undefined;

  const usernameIdentity = parseUsernameIdentity(username);
  const normalizedFullName = typeof fullName === 'string' ? fullName.trim() : '';
  if (
    !usernameIdentity.success ||
    typeof password !== 'string' ||
    password.length < 12 ||
    password.trim().toLowerCase() === usernameIdentity.data.username.trim().toLowerCase() ||
    normalizedFullName.length < 2 ||
    normalizedFullName.length > 100 ||
    typeof role !== 'string' ||
    !ALLOWED_NEW_USER_ROLES.has(role)
  ) {
    return null;
  }

  return {
    username: usernameIdentity.data.username,
    authAlias: usernameIdentity.data.authAlias,
    password,
    full_name: normalizedFullName,
    role
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id')?.trim() ?? '';
  return REQUEST_ID_RE.test(supplied) ? supplied : crypto.randomUUID();
}

async function compensateAuthUser(
  dependencies: AdminCreateUserDependencies,
  authUser: CreatedAuthUser
): Promise<Exclude<CompensationOutcome, 'unknown'>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await dependencies.deleteAuthUser(authUser.id);
      return 'deleted';
    } catch {
      // Retry once before falling back to a disabled identity.
    }
  }

  try {
    await dependencies.disableAuthUser(authUser.id);
    return 'disabled';
  } catch {
    // Newly created identities are deliberately unconfirmed until the profile commits.
    return authUser.emailConfirmed ? 'failed' : 'unconfirmed';
  }
}

export interface AdminCreateUserOptions {
  maintenanceMode?: boolean;
}

export function createAdminUserHandler(
  dependencies: AdminCreateUserDependencies,
  options: AdminCreateUserOptions = {}
) {
  return async (request: Request): Promise<Response> => {
    if (options.maintenanceMode) {
      return jsonResponse({ error: 'Provisioning temporaneamente sospeso' }, 503);
    }

    const correlationId = requestId(request);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Autenticazione richiesta' }, 401);
    }

    const callerProfile = await dependencies.getCallerProfile(authHeader);
    if (
      !callerProfile ||
      callerProfile.is_active !== true ||
      !ADMIN_ROLES.has(callerProfile.role)
    ) {
      return jsonResponse({ error: 'Permessi insufficienti' }, 403);
    }

    let parsedBody: CreateUserBody | null;
    try {
      parsedBody = parseCreateUserBody(await request.json());
    } catch {
      parsedBody = null;
    }
    if (!parsedBody) {
      return jsonResponse({ error: 'Dati utente non validi' }, 400);
    }

    const email = parsedBody.authAlias;
    let authUser: CreatedAuthUser;
    try {
      authUser = await dependencies.createAuthUser({
        email,
        password: parsedBody.password,
        user_metadata: {
          username: parsedBody.username,
          full_name: parsedBody.full_name
        },
        app_metadata: {
          provisioning_request_id: correlationId,
          provisioning_origin: 'admin_create_user_v2'
        }
      });
    } catch (error) {
      let existing: AuthProvisioningState | null;
      try {
        existing = await dependencies.lookupAuthUser(email);
      } catch {
        existing = null;
      }

      if (existing?.provisioningRequestId === correlationId) {
        authUser = existing;
      } else if (error instanceof AuthUserAlreadyExistsError || existing) {
        return jsonResponse({ error: 'Username già esistente' }, 409);
      } else {
        dependencies.reportProvisioningFailure({
          requestId: correlationId,
          phase: 'auth_create',
          compensation: 'unknown'
        });
        return jsonResponse(
          {
            error:
              error instanceof AuthUserCreationAmbiguousError
                ? 'Esito creazione Auth non verificabile'
                : 'Creazione Auth non completata'
          },
          503
        );
      }
    }

    const profileInput: ProfileInput = {
      username: parsedBody.username,
      email,
      full_name: parsedBody.full_name,
      role: parsedBody.role,
      is_active: true,
      created_by_auth: authUser.id
    };

    try {
      await dependencies.createProfile(profileInput);
    } catch {
      let profileState: ProfileState | null;
      try {
        profileState = await dependencies.getProfileState(profileInput);
      } catch {
        profileState = null;
      }

      if (profileState !== 'match') {
        const compensation =
          profileState === 'absent'
            ? await compensateAuthUser(dependencies, authUser)
            : authUser.emailConfirmed
              ? 'failed'
              : 'unconfirmed';
        dependencies.reportProvisioningFailure({
          requestId: correlationId,
          authUserId: authUser.id,
          phase: 'profile_create',
          compensation
        });
        return jsonResponse({ error: 'Provisioning utente non completato' }, 503);
      }
    }

    if (!authUser.emailConfirmed) {
      try {
        await dependencies.confirmAuthUser(authUser.id);
      } catch {
        let reconciled: AuthProvisioningState | null = null;
        try {
          reconciled = await dependencies.lookupAuthUser(email);
        } catch {
          // Keep the identity unconfirmed and fail closed.
        }
        if (reconciled?.id !== authUser.id || !reconciled.emailConfirmed) {
          dependencies.reportProvisioningFailure({
            requestId: correlationId,
            authUserId: authUser.id,
            phase: 'auth_confirm',
            compensation: 'unconfirmed'
          });
          return jsonResponse({ error: 'Attivazione utente non completata' }, 503);
        }
      }
    }

    return jsonResponse({ success: true, user_id: authUser.id }, 201);
  };
}
