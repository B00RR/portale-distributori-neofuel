import { createClient } from 'jsr:@supabase/supabase-js@2.110.7';

import { deriveAuthAlias } from '../../supabase/functions/_shared/auth-identity.ts';
import { runAuthIdentityMigration } from './cli.ts';

const REQUIRED_ACKNOWLEDGEMENT = 'issue-305-disposable-only';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function assertAnonCannotRead(url: string, anonKey: string): Promise<void> {
  const anonClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  const { error } = await anonClient.from('users').select('user_id').limit(1);
  if (!error) throw new Error('anonymous_users_select_not_denied');
}

async function runDisposableSmoke(): Promise<void> {
  if (requiredEnv('ALLOW_DISPOSABLE_AUTH_SMOKE') !== REQUIRED_ACKNOWLEDGEMENT) {
    throw new Error('disposable_acknowledgement_missing');
  }

  const url = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requiredEnv('SUPABASE_ANON_KEY');
  const projectRef = requiredEnv('SUPABASE_PROJECT_REF');
  const productionProjectRef = requiredEnv('PRODUCTION_SUPABASE_PROJECT_REF');
  const password = requiredEnv('AUTH_IDENTITY_SMOKE_PASSWORD');
  if (projectRef === productionProjectRef) {
    throw new Error('production_target_refused');
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== `${projectRef}.supabase.co`) {
    throw new Error('project_target_mismatch');
  }

  const serviceClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  const [profilesResult, authResult] = await Promise.all([
    serviceClient.from('users').select('user_id', {
      count: 'exact',
      head: true
    }),
    serviceClient.auth.admin.listUsers({ page: 1, perPage: 1 })
  ]);
  if (profilesResult.error || authResult.error) {
    throw new Error('disposable_inventory_failed');
  }
  if ((profilesResult.count ?? 0) !== 0 || authResult.data.users.length !== 0) {
    throw new Error('disposable_project_not_empty');
  }
  await assertAnonCannotRead(url, anonKey);

  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const username = `smoke_${suffix}`;
  const legacyEmail = `${username}@example.invalid`;
  const expectedAlias = deriveAuthAlias(username);
  let authUserId: string | null = null;
  let userId: number | null = null;
  let stationId: number | null = null;
  let assignmentCreated = false;
  const temporaryDirectory = await Deno.makeTempDir({
    prefix: 'neofuel-issue-305-'
  });
  const previousSnapshotPath = Deno.env.get('AUTH_IDENTITY_SNAPSHOT_PATH');
  const previousReportPath = Deno.env.get('AUTH_IDENTITY_REPORT_PATH');
  const previousSnapshotKey = Deno.env.get('AUTH_IDENTITY_SNAPSHOT_KEY_BASE64');

  try {
    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email: legacyEmail,
      password,
      email_confirm: true
    });
    if (createError || !created.user) {
      throw new Error('disposable_auth_seed_failed');
    }
    authUserId = created.user.id;

    const { data: profile, error: profileError } = await serviceClient
      .from('users')
      .insert({
        username,
        email: legacyEmail,
        full_name: 'Issue 305 disposable smoke',
        role: 'operator',
        is_active: true,
        created_by_auth: authUserId
      })
      .select('user_id')
      .single();
    if (profileError || !profile) {
      throw new Error('disposable_profile_seed_failed');
    }
    userId = profile.user_id;

    const { data: station, error: stationError } = await serviceClient
      .from('fuel_stations')
      .insert({
        station_name: `Issue 305 disposable ${suffix}`,
        is_active: true
      })
      .select('station_id')
      .single();
    if (stationError || !station) {
      throw new Error('disposable_station_seed_failed');
    }
    stationId = station.station_id;

    const { error: assignmentError } = await serviceClient.from('user_stations').insert({
      user_id: userId,
      station_id: stationId,
      created_by_auth: authUserId
    });
    if (assignmentError) throw new Error('disposable_relation_seed_failed');
    assignmentCreated = true;

    const legacyClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    const legacyLogin = await legacyClient.auth.signInWithPassword({
      email: legacyEmail,
      password
    });
    if (legacyLogin.error || legacyLogin.data.user?.id !== authUserId) {
      throw new Error('legacy_password_precheck_failed');
    }
    await legacyClient.auth.signOut();

    Deno.env.set(
      'AUTH_IDENTITY_SNAPSHOT_PATH',
      `${temporaryDirectory}/issue-305-snapshot.enc.json`
    );
    Deno.env.set(
      'AUTH_IDENTITY_SNAPSHOT_KEY_BASE64',
      bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    );

    let reportSequence = 0;
    const runPhase = async (mode: string, failureCode: string): Promise<void> => {
      reportSequence += 1;
      Deno.env.set(
        'AUTH_IDENTITY_REPORT_PATH',
        `${temporaryDirectory}/issue-305-${reportSequence}-${mode}-report.json`
      );
      if ((await runAuthIdentityMigration([mode])) !== 0) {
        throw new Error(failureCode);
      }
    };

    await runPhase('dry-run', 'disposable_dry_run_failed');
    await runPhase('apply', 'disposable_apply_failed');
    await runPhase('verify', 'disposable_verify_failed');
    await runPhase('apply', 'disposable_idempotent_apply_failed');

    const freshClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    const migratedLogin = await freshClient.auth.signInWithPassword({
      email: expectedAlias,
      password
    });
    if (migratedLogin.error || migratedLogin.data.user?.id !== authUserId) {
      throw new Error('same_password_postcheck_failed');
    }

    const { data: migratedProfile, error: migratedProfileError } = await serviceClient
      .from('users')
      .select('user_id, email, role, is_active, created_by_auth')
      .eq('user_id', userId)
      .eq('created_by_auth', authUserId)
      .single();
    if (
      migratedProfileError ||
      !migratedProfile ||
      migratedProfile.email !== expectedAlias ||
      migratedProfile.role !== 'operator' ||
      migratedProfile.is_active !== true
    ) {
      throw new Error('disposable_profile_postcheck_failed');
    }

    const { data: preservedAssignment, error: assignmentReadError } = await serviceClient
      .from('user_stations')
      .select('user_id, station_id, created_by_auth')
      .eq('user_id', userId)
      .eq('station_id', stationId)
      .eq('created_by_auth', authUserId)
      .maybeSingle();
    if (assignmentReadError || !preservedAssignment) {
      throw new Error('disposable_relation_postcheck_failed');
    }
    await assertAnonCannotRead(url, anonKey);
    await freshClient.auth.signOut();

    await runPhase('rollback', 'disposable_rollback_failed');
    const rollbackClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    const rollbackLogin = await rollbackClient.auth.signInWithPassword({
      email: legacyEmail,
      password
    });
    if (rollbackLogin.error || rollbackLogin.data.user?.id !== authUserId) {
      throw new Error('same_password_rollback_postcheck_failed');
    }
    await rollbackClient.auth.signOut();

    await Deno.stdout.write(
      new TextEncoder().encode(
        `${JSON.stringify({
          status: 'passed',
          same_password: true,
          auth_uuid_preserved: true,
          role_preserved: true,
          active_state_preserved: true,
          relations_preserved: true,
          idempotent_apply: true,
          rollback_verified: true,
          anonymous_users_select_denied: true
        })}\n`
      )
    );
  } finally {
    let cleanupFailed = false;
    let assignmentRemoved = !assignmentCreated;
    if (assignmentCreated && userId !== null && stationId !== null) {
      let assignmentDelete = await serviceClient
        .from('user_stations')
        .delete()
        .eq('user_id', userId)
        .eq('station_id', stationId)
        .select('user_id');
      if (assignmentDelete.error || assignmentDelete.data?.length !== 1) {
        assignmentDelete = await serviceClient
          .from('user_stations')
          .delete()
          .eq('user_id', userId)
          .eq('station_id', stationId)
          .select('user_id');
      }
      assignmentRemoved = !assignmentDelete.error && assignmentDelete.data?.length === 1;
      cleanupFailed ||= !assignmentRemoved;
    }

    let profileRemoved = userId === null;
    if (assignmentRemoved && userId !== null && authUserId !== null) {
      const firstDelete = await serviceClient
        .from('users')
        .delete()
        .eq('user_id', userId)
        .eq('created_by_auth', authUserId)
        .select('user_id');
      let profileDelete = firstDelete;
      if (firstDelete.error || firstDelete.data?.length !== 1) {
        profileDelete = await serviceClient
          .from('users')
          .delete()
          .eq('user_id', userId)
          .eq('created_by_auth', authUserId)
          .select('user_id');
      }
      profileRemoved = !profileDelete.error && profileDelete.data?.length === 1;
      cleanupFailed ||= !profileRemoved;
    }
    if (assignmentRemoved && stationId !== null) {
      let stationDelete = await serviceClient
        .from('fuel_stations')
        .delete()
        .eq('station_id', stationId)
        .select('station_id');
      if (stationDelete.error || stationDelete.data?.length !== 1) {
        stationDelete = await serviceClient
          .from('fuel_stations')
          .delete()
          .eq('station_id', stationId)
          .select('station_id');
      }
      cleanupFailed ||= Boolean(stationDelete.error || stationDelete.data?.length !== 1);
    }
    if (authUserId !== null && profileRemoved) {
      let authDelete = await serviceClient.auth.admin.deleteUser(authUserId);
      if (authDelete.error) {
        authDelete = await serviceClient.auth.admin.deleteUser(authUserId);
      }
      cleanupFailed ||= Boolean(authDelete.error);
    }
    if (previousSnapshotPath === undefined) {
      Deno.env.delete('AUTH_IDENTITY_SNAPSHOT_PATH');
    } else Deno.env.set('AUTH_IDENTITY_SNAPSHOT_PATH', previousSnapshotPath);
    if (previousReportPath === undefined) {
      Deno.env.delete('AUTH_IDENTITY_REPORT_PATH');
    } else Deno.env.set('AUTH_IDENTITY_REPORT_PATH', previousReportPath);
    if (previousSnapshotKey === undefined) {
      Deno.env.delete('AUTH_IDENTITY_SNAPSHOT_KEY_BASE64');
    } else {
      Deno.env.set('AUTH_IDENTITY_SNAPSHOT_KEY_BASE64', previousSnapshotKey);
    }
    try {
      await Deno.remove(temporaryDirectory, { recursive: true });
    } catch {
      cleanupFailed = true;
    }
    if (cleanupFailed) throw new Error('disposable_cleanup_failed');
  }
}

if (import.meta.main) {
  try {
    await runDisposableSmoke();
  } catch (error) {
    const errorCode =
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : 'disposable_smoke_failed';
    await Deno.stdout.write(
      new TextEncoder().encode(
        `${JSON.stringify({
          status: 'failed',
          error_type: error instanceof Error ? error.name : 'UnknownError',
          error_code: errorCode
        })}\n`
      )
    );
    Deno.exit(1);
  }
}
