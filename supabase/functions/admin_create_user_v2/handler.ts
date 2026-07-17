export interface CallerProfile {
  role: string;
  is_active: boolean | null;
}

export interface AuthUserInput {
  email: string;
  password: string;
  user_metadata: Record<string, unknown>;
}

export interface CreatedAuthUser {
  id: string;
}

export interface ProfileInput {
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: true;
  created_by_auth: string;
}

export type CompensationOutcome = 'deleted' | 'disabled' | 'failed' | 'unknown';

export interface ProvisioningFailureEvent {
  requestId: string;
  authUserId?: string;
  phase: 'auth_create' | 'profile_create';
  compensation: CompensationOutcome;
}

export interface AdminCreateUserDependencies {
  getCallerProfile(authHeader: string): Promise<CallerProfile | null>;
  createAuthUser(input: AuthUserInput): Promise<CreatedAuthUser>;
  createProfile(input: ProfileInput): Promise<void>;
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

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const INTERNAL_EMAIL_DOMAIN = 'neofuel.local';
const MAX_REQUEST_ID_LENGTH = 128;

interface CreateUserBody {
  username: string;
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

  const normalizedFullName = typeof fullName === 'string' ? fullName.trim() : '';
  if (
    typeof username !== 'string' ||
    !USERNAME_RE.test(username.trim()) ||
    typeof password !== 'string' ||
    password.length < 6 ||
    normalizedFullName.length < 2 ||
    normalizedFullName.length > 100 ||
    typeof role !== 'string' ||
    !ALLOWED_NEW_USER_ROLES.has(role)
  ) {
    return null;
  }

  const normalizedUsername = username.trim().toLowerCase();
  return {
    username: normalizedUsername,
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
  return (
    request.headers.get('x-request-id')?.slice(0, MAX_REQUEST_ID_LENGTH) || crypto.randomUUID()
  );
}

async function compensateAuthUser(
  dependencies: AdminCreateUserDependencies,
  authUserId: string
): Promise<Exclude<CompensationOutcome, 'unknown'>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await dependencies.deleteAuthUser(authUserId);
      return 'deleted';
    } catch {
      // Retry once before falling back to a fail-closed disabled identity.
    }
  }

  try {
    await dependencies.disableAuthUser(authUserId);
    return 'disabled';
  } catch {
    return 'failed';
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

    const email = `${parsedBody.username}@${INTERNAL_EMAIL_DOMAIN}`;
    let authUser: CreatedAuthUser;
    try {
      authUser = await dependencies.createAuthUser({
        email,
        password: parsedBody.password,
        user_metadata: {
          username: parsedBody.username,
          full_name: parsedBody.full_name
        }
      });
    } catch (error) {
      if (error instanceof AuthUserAlreadyExistsError) {
        return jsonResponse({ error: 'Username già esistente' }, 409);
      }

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

    try {
      await dependencies.createProfile({
        username: parsedBody.username,
        email,
        full_name: parsedBody.full_name,
        role: parsedBody.role,
        is_active: true,
        created_by_auth: authUser.id
      });
    } catch {
      const compensation = await compensateAuthUser(dependencies, authUser.id);
      dependencies.reportProvisioningFailure({
        requestId: correlationId,
        authUserId: authUser.id,
        phase: 'profile_create',
        compensation
      });
      return jsonResponse({ error: 'Provisioning utente non completato' }, 500);
    }

    return jsonResponse({ success: true, user_id: authUser.id }, 201);
  };
}
