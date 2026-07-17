import {
  AuthUserAlreadyExistsError,
  AuthUserCreationAmbiguousError,
  type AdminCreateUserDependencies,
  type AuthUserInput,
  type CallerProfile,
  type CreatedAuthUser,
  type ProfileInput
} from './handler.ts';

interface SupabaseError {
  message: string;
  code?: string;
}

interface AuthUser {
  id: string;
  email?: string;
}

export interface CallerClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: AuthUser | null };
      error: SupabaseError | null;
    }>;
  };
}

interface ProfileSelectQuery {
  select(columns: string): {
    eq(
      column: string,
      value: string
    ): {
      maybeSingle(): Promise<{
        data: CallerProfile | null;
        error: SupabaseError | null;
      }>;
    };
  };
}

interface ProfileInsertQuery {
  insert(input: ProfileInput): Promise<{
    error: SupabaseError | null;
  }>;
}

export interface ServiceClient {
  from(table: string): ProfileSelectQuery & ProfileInsertQuery;
  auth: {
    admin: {
      createUser(input: AuthUserInput & { email_confirm: boolean }): Promise<{
        data: { user: AuthUser | null };
        error: SupabaseError | null;
      }>;
      deleteUser(userId: string): Promise<{
        error: SupabaseError | null;
      }>;
      updateUserById(
        userId: string,
        input: { ban_duration: string }
      ): Promise<{
        error: SupabaseError | null;
      }>;
    };
  };
}

function bearerToken(authHeader: string): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

function throwOnError(error: SupabaseError | null, operation: string): void {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

function isDuplicateAuthError(error: SupabaseError): boolean {
  return error.code === 'email_exists' || error.code === 'user_already_exists';
}

export function createSupabaseDependencies(
  callerClient: CallerClient,
  serviceClient: ServiceClient
): AdminCreateUserDependencies {
  return {
    async getCallerProfile(authHeader: string): Promise<CallerProfile | null> {
      const token = bearerToken(authHeader);
      if (!token) return null;

      const { data: authData, error: authError } = await callerClient.auth.getUser(token);
      if (authError || !authData.user) return null;

      const { data: profile, error: profileError } = await serviceClient
        .from('users')
        .select('role, is_active')
        .eq('created_by_auth', authData.user.id)
        .maybeSingle();
      throwOnError(profileError, 'caller profile lookup failed');
      return profile;
    },

    async createAuthUser(input: AuthUserInput): Promise<CreatedAuthUser> {
      let result: Awaited<ReturnType<ServiceClient['auth']['admin']['createUser']>>;
      try {
        result = await serviceClient.auth.admin.createUser({
          ...input,
          email_confirm: true
        });
      } catch {
        throw new AuthUserCreationAmbiguousError();
      }

      if (result.error) {
        if (isDuplicateAuthError(result.error)) {
          throw new AuthUserAlreadyExistsError();
        }
        throwOnError(result.error, 'Auth user creation failed');
      }
      if (!result.data.user) {
        throw new AuthUserCreationAmbiguousError();
      }
      return { id: result.data.user.id };
    },

    async createProfile(input: ProfileInput): Promise<void> {
      const { error } = await serviceClient.from('users').insert(input);
      throwOnError(error, 'profile creation failed');
    },

    async deleteAuthUser(authUserId: string): Promise<void> {
      const { error } = await serviceClient.auth.admin.deleteUser(authUserId);
      throwOnError(error, 'Auth compensation failed');
    },

    async disableAuthUser(authUserId: string): Promise<void> {
      const { error } = await serviceClient.auth.admin.updateUserById(authUserId, {
        ban_duration: '876000h'
      });
      throwOnError(error, 'Auth disable fallback failed');
    },

    reportProvisioningFailure(event): void {
      console.warn(
        JSON.stringify({
          event: 'admin_create_user_provisioning_failed',
          request_id: event.requestId,
          phase: event.phase,
          compensation: event.compensation,
          ...(event.authUserId ? { auth_user_id: event.authUserId } : {})
        })
      );
    }
  };
}
