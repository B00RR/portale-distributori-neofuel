import {
  AuthUserAlreadyExistsError,
  AuthUserCreationAmbiguousError,
  type AdminCreateUserDependencies,
  type AuthProvisioningState,
  type AuthUserInput,
  type CallerProfile,
  type CreatedAuthUser,
  type ProfileInput,
  type ProfileState
} from './handler.ts';

interface SupabaseError {
  message: string;
  code?: string;
}

interface AuthUser {
  id: string;
  email?: string;
}

interface ProfileRecord extends CallerProfile {
  username?: string;
  email?: string;
  full_name?: string;
  created_by_auth?: string;
}

interface AuthLookupRow {
  id: string;
  email_confirmed_at: string | null;
  provisioning_request_id: string | null;
}

export interface CallerClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: AuthUser | null };
      error: SupabaseError | null;
    }>;
  };
}

interface ProfileEqQuery {
  maybeSingle(): Promise<{
    data: ProfileRecord | null;
    error: SupabaseError | null;
  }>;
}

interface ProfileSelectQuery {
  select(columns: string): {
    eq(column: string, value: string): ProfileEqQuery;
  };
}

interface ProfileInsertQuery {
  insert(input: ProfileInput): Promise<{
    error: SupabaseError | null;
  }>;
}

export interface ServiceClient {
  from(table: string): ProfileSelectQuery & ProfileInsertQuery;
  rpc(
    functionName: string,
    args: Record<string, unknown>
  ): Promise<{
    data: AuthLookupRow[] | null;
    error: SupabaseError | null;
  }>;
  auth: {
    admin: {
      createUser(input: AuthUserInput & { email_confirm: false }): Promise<{
        data: { user: AuthUser | null };
        error: SupabaseError | null;
      }>;
      deleteUser(userId: string): Promise<{
        error: SupabaseError | null;
      }>;
      updateUserById(
        userId: string,
        input: { ban_duration: string } | { email_confirm: true }
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
      return profile ? { role: profile.role, is_active: profile.is_active } : null;
    },

    async createAuthUser(input: AuthUserInput): Promise<CreatedAuthUser> {
      let result: Awaited<ReturnType<ServiceClient['auth']['admin']['createUser']>>;
      try {
        result = await serviceClient.auth.admin.createUser({
          ...input,
          email_confirm: false
        });
      } catch {
        throw new AuthUserCreationAmbiguousError();
      }

      if (result.error) {
        if (isDuplicateAuthError(result.error)) {
          throw new AuthUserAlreadyExistsError();
        }
        throw new AuthUserCreationAmbiguousError();
      }
      if (!result.data.user) {
        throw new AuthUserCreationAmbiguousError();
      }
      return { id: result.data.user.id, emailConfirmed: false };
    },

    async lookupAuthUser(email: string): Promise<AuthProvisioningState | null> {
      const { data, error } = await serviceClient.rpc('lookup_auth_user_for_provisioning', {
        p_email: email
      });
      throwOnError(error, 'Auth reconciliation lookup failed');
      const row = data?.[0];
      if (!row) return null;
      return {
        id: row.id,
        emailConfirmed: Boolean(row.email_confirmed_at),
        provisioningRequestId: row.provisioning_request_id
      };
    },

    async createProfile(input: ProfileInput): Promise<void> {
      const { error } = await serviceClient.from('users').insert(input);
      throwOnError(error, 'profile creation failed');
    },

    async getProfileState(input: ProfileInput): Promise<ProfileState> {
      const { data, error } = await serviceClient
        .from('users')
        .select('username, email, full_name, role, is_active, created_by_auth')
        .eq('created_by_auth', input.created_by_auth)
        .maybeSingle();
      throwOnError(error, 'profile reconciliation lookup failed');
      if (!data) return 'absent';
      return data.username === input.username &&
        data.email === input.email &&
        data.full_name === input.full_name &&
        data.role === input.role &&
        data.is_active === true &&
        data.created_by_auth === input.created_by_auth
        ? 'match'
        : 'mismatch';
    },

    async confirmAuthUser(authUserId: string): Promise<void> {
      const { error } = await serviceClient.auth.admin.updateUserById(authUserId, {
        email_confirm: true
      });
      throwOnError(error, 'Auth confirmation failed');
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
