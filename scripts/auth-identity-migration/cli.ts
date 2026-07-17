import { basename, dirname, isAbsolute, resolve } from 'node:path';

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.110.7';

import {
  applyMigrationRecord,
  type AuthIdentityInventory,
  buildMigrationPlan,
  type CurrentMigrationRecord,
  type MigrationAdapter,
  type MigrationPlan,
  type MigrationRecord,
  type ProfileInventory,
  rollbackMigrationRecord
} from './core.ts';
import {
  createFailureReport,
  createRedactedReport,
  type MigrationMode,
  type RecordOutcome
} from './report.ts';
import {
  type AuthIdentitySnapshot,
  createSnapshot,
  decodeSnapshotKey,
  decryptSnapshot,
  encryptSnapshot
} from './snapshot.ts';

const PAGE_SIZE = 1_000;

function fileUrlPath(url: URL): string {
  const decoded = decodeURIComponent(url.pathname);
  if (Deno.build.os === 'windows' && /^\/[a-zA-Z]:\//.test(decoded)) {
    return decoded.slice(1);
  }
  return decoded;
}

interface RuntimeConfig {
  mode: MigrationMode;
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  projectRef: string;
  accessToken: string;
  snapshotKey: Uint8Array;
  snapshotPath: string;
  reportPath: string;
}

interface Inventory {
  profiles: ProfileInventory[];
  authUsers: AuthIdentityInventory[];
}

interface CommandResult {
  ok: boolean;
  report: Record<string, unknown>;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function parseMode(args: readonly string[]): MigrationMode {
  if (args.length === 0) return 'dry-run';
  if (args.length !== 1) throw new Error('invalid_arguments');
  const mode = args[0];
  if (mode === 'dry-run' || mode === 'apply' || mode === 'verify' || mode === 'rollback') {
    return mode;
  }
  throw new Error('invalid_mode');
}

function comparablePath(value: string): string {
  return resolve(value).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
}

export async function resolveExternalArtifactPath(
  path: string,
  variableName: string
): Promise<string> {
  const errorPrefix = variableName.toLowerCase();
  if (!isAbsolute(path)) throw new Error(`${errorPrefix}_must_be_absolute`);

  const absolutePath = resolve(path);
  try {
    const targetInfo = await Deno.lstat(absolutePath);
    if (targetInfo.isSymlink) {
      throw new Error(`${errorPrefix}_must_not_be_symlink`);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  let realParent: string;
  try {
    realParent = await Deno.realPath(dirname(absolutePath));
  } catch {
    throw new Error(`${errorPrefix}_parent_unavailable`);
  }
  const canonicalPath = resolve(realParent, basename(absolutePath));
  const repositoryRoot = comparablePath(
    await Deno.realPath(fileUrlPath(new URL('../../', import.meta.url)))
  );
  const artifact = comparablePath(canonicalPath);
  if (artifact === repositoryRoot || artifact.startsWith(`${repositoryRoot}/`)) {
    throw new Error(`${errorPrefix}_must_be_outside_repository`);
  }
  return canonicalPath;
}

export function assertDistinctArtifactPaths(snapshotPath: string, reportPath: string): void {
  if (comparablePath(snapshotPath) === comparablePath(reportPath)) {
    throw new Error('artifact_paths_must_be_distinct');
  }
}

export async function assertArtifactDoesNotExist(path: string, errorCode: string): Promise<void> {
  try {
    await Deno.lstat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  throw new Error(errorCode);
}

async function loadConfig(args: readonly string[]): Promise<RuntimeConfig> {
  const mode = parseMode(args);
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const projectRef = requiredEnv('SUPABASE_PROJECT_REF');
  const changeWindowPreflight = requiresChangeWindowPreflight(mode);
  const anonKey = changeWindowPreflight ? requiredEnv('SUPABASE_ANON_KEY') : '';
  const accessToken = changeWindowPreflight ? requiredEnv('SUPABASE_ACCESS_TOKEN') : '';
  const snapshotKey = decodeSnapshotKey(requiredEnv('AUTH_IDENTITY_SNAPSHOT_KEY_BASE64'));
  const snapshotPathInput = requiredEnv('AUTH_IDENTITY_SNAPSHOT_PATH');
  const reportPathInput = requiredEnv('AUTH_IDENTITY_REPORT_PATH');

  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error('invalid_supabase_url');
  }
  if (url.protocol !== 'https:' || url.hostname !== `${projectRef}.supabase.co`) {
    throw new Error('project_target_mismatch');
  }

  const snapshotPath = await resolveExternalArtifactPath(
    snapshotPathInput,
    'AUTH_IDENTITY_SNAPSHOT_PATH'
  );
  const reportPath = await resolveExternalArtifactPath(
    reportPathInput,
    'AUTH_IDENTITY_REPORT_PATH'
  );
  assertDistinctArtifactPaths(snapshotPath, reportPath);
  await assertArtifactDoesNotExist(reportPath, 'report_path_must_not_exist');
  if (mode === 'dry-run') {
    await assertArtifactDoesNotExist(snapshotPath, 'snapshot_path_must_not_exist');
  }

  return {
    mode,
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    projectRef,
    accessToken,
    snapshotKey,
    snapshotPath,
    reportPath
  };
}

function createServiceClient(config: RuntimeConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

async function verifySignupDisabled(config: RuntimeConfig): Promise<void> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${config.projectRef}/config/auth`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: 'application/json'
      }
    }
  );
  if (!response.ok) throw new Error('auth_config_read_failed');

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('auth_config_invalid');
  }
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { disable_signup?: unknown }).disable_signup !== true
  ) {
    throw new Error('public_signup_not_disabled');
  }
}

async function verifyAnonCannotReadUsers(config: RuntimeConfig): Promise<void> {
  const anonClient = createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  const { error } = await anonClient.from('users').select('user_id').limit(1);
  if (!error) throw new Error('anonymous_users_select_not_denied');
  if (error.code !== '42501') {
    throw new Error('anonymous_users_select_probe_failed');
  }
}

function throwOnSupabaseError(error: unknown, code: string): void {
  if (error) throw new Error(code);
}

async function readProfiles(client: SupabaseClient): Promise<ProfileInventory[]> {
  const profiles: ProfileInventory[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('users')
      .select('user_id, username, email, role, is_active, created_by_auth')
      .order('user_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    throwOnSupabaseError(error, 'profile_inventory_failed');
    if (!data) throw new Error('profile_inventory_failed');

    for (const row of data) {
      if (
        !Number.isSafeInteger(row.user_id) ||
        typeof row.username !== 'string' ||
        (typeof row.email !== 'string' && row.email !== null) ||
        typeof row.role !== 'string' ||
        (typeof row.is_active !== 'boolean' && row.is_active !== null) ||
        (typeof row.created_by_auth !== 'string' && row.created_by_auth !== null)
      ) {
        throw new Error('profile_inventory_invalid');
      }
      profiles.push({
        userId: row.user_id,
        username: row.username,
        email: row.email,
        role: row.role,
        isActive: row.is_active,
        authUserId: row.created_by_auth
      });
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return profiles;
}

async function readAuthUsers(client: SupabaseClient): Promise<AuthIdentityInventory[]> {
  const authUsers: AuthIdentityInventory[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE
    });
    throwOnSupabaseError(error, 'auth_inventory_failed');
    if (!data) throw new Error('auth_inventory_failed');

    for (const user of data.users) {
      authUsers.push({
        id: user.id,
        email: user.email ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null
      });
    }

    if (data.users.length < PAGE_SIZE) break;
    page += 1;
  }
  return authUsers;
}

async function readInventory(client: SupabaseClient): Promise<Inventory> {
  const [profiles, authUsers] = await Promise.all([readProfiles(client), readAuthUsers(client)]);
  return { profiles, authUsers };
}

function recordKey(record: Pick<MigrationRecord, 'authUserId' | 'userId'>): string {
  return `${record.authUserId}:${record.userId}`;
}

function effectiveSnapshotRecords(
  snapshot: AuthIdentitySnapshot,
  config: RuntimeConfig,
  inventory: Inventory,
  plan: MigrationPlan
): MigrationRecord[] {
  if (
    snapshot.projectRef !== config.projectRef ||
    snapshot.profileCount !== inventory.profiles.length ||
    snapshot.authIdentityCount !== inventory.authUsers.length ||
    snapshot.records.length !== plan.records.length
  ) {
    throw new Error('snapshot_inventory_mismatch');
  }

  const currentByKey = new Map(plan.records.map(record => [recordKey(record), record]));
  const snapshotKeys = new Set(snapshot.records.map(recordKey));
  if (snapshotKeys.size !== snapshot.records.length || currentByKey.size !== plan.records.length) {
    throw new Error('snapshot_inventory_mismatch');
  }

  return snapshot.records.map(snapshotRecord => {
    const current = currentByKey.get(recordKey(snapshotRecord));
    if (
      !current ||
      current.username !== snapshotRecord.username ||
      current.role !== snapshotRecord.role ||
      current.isActive !== snapshotRecord.isActive ||
      current.emailConfirmedAt !== snapshotRecord.emailConfirmedAt ||
      current.expectedAlias !== snapshotRecord.expectedAlias
    ) {
      throw new Error('snapshot_immutable_mismatch');
    }

    const currentAuthEmail = current.previousAuthEmail;
    const currentProfileEmail = current.previousProfileEmail;
    const previousAuthEmail = snapshotRecord.previousAuthEmail;
    const previousProfileEmail = snapshotRecord.previousProfileEmail;
    const expectedAlias = snapshotRecord.expectedAlias;
    const authAtPrevious = currentAuthEmail === previousAuthEmail;
    const profileAtPrevious = currentProfileEmail === previousProfileEmail;
    const authAtAlias = currentAuthEmail === expectedAlias;
    const profileAtAlias = currentProfileEmail === expectedAlias;

    if ((!authAtPrevious && !authAtAlias) || (!profileAtPrevious && !profileAtAlias)) {
      throw new Error('snapshot_mutable_mismatch');
    }

    let state: MigrationRecord['state'];
    if (authAtAlias && profileAtAlias) state = 'aligned';
    else if (authAtAlias) state = 'auth_aligned';
    else if (profileAtAlias) state = 'profile_aligned';
    else state = 'legacy';

    return { ...snapshotRecord, state };
  });
}

function assertSnapshotPreviousState(snapshot: AuthIdentitySnapshot, plan: MigrationPlan): void {
  const currentByKey = new Map(plan.records.map(record => [recordKey(record), record]));
  for (const snapshotRecord of snapshot.records) {
    const current = currentByKey.get(recordKey(snapshotRecord));
    if (
      !current ||
      current.previousAuthEmail !== snapshotRecord.previousAuthEmail ||
      current.previousProfileEmail !== snapshotRecord.previousProfileEmail
    ) {
      throw new Error('rollback_verification_failed');
    }
  }
}

function createAdapter(client: SupabaseClient): MigrationAdapter {
  return {
    async updateAuthEmail(authUserId, email): Promise<void> {
      const { data, error } = await client.auth.admin.updateUserById(authUserId, { email });
      throwOnSupabaseError(error, 'auth_email_update_failed');
      if (
        !data.user ||
        data.user.id !== authUserId ||
        !data.user.email ||
        data.user.email !== email
      ) {
        throw new Error('auth_email_update_unverified');
      }
    },

    async updateProfileEmail(userId, authUserId, previousEmail, email): Promise<void> {
      const { data, error } = await client
        .from('users')
        .update({ email, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('created_by_auth', authUserId)
        .eq('email', previousEmail)
        .select('user_id, created_by_auth, email');
      throwOnSupabaseError(error, 'profile_email_update_failed');
      if (
        !data ||
        data.length !== 1 ||
        data[0]?.user_id !== userId ||
        data[0]?.created_by_auth !== authUserId ||
        data[0]?.email !== email
      ) {
        throw new Error('profile_email_compare_and_swap_failed');
      }
    },

    async readRecord(authUserId, userId): Promise<CurrentMigrationRecord> {
      const [authResult, profileResult] = await Promise.all([
        client.auth.admin.getUserById(authUserId),
        client
          .from('users')
          .select('user_id, username, email, role, is_active, created_by_auth')
          .eq('user_id', userId)
          .eq('created_by_auth', authUserId)
          .maybeSingle()
      ]);
      throwOnSupabaseError(authResult.error, 'auth_record_read_failed');
      throwOnSupabaseError(profileResult.error, 'profile_record_read_failed');
      if (!authResult.data.user || !profileResult.data) {
        throw new Error('record_missing');
      }
      return {
        authUserId: authResult.data.user.id,
        userId: profileResult.data.user_id,
        username: profileResult.data.username,
        authEmail: authResult.data.user.email ?? null,
        profileEmail: profileResult.data.email,
        role: profileResult.data.role,
        isActive: profileResult.data.is_active,
        emailConfirmedAt: authResult.data.user.email_confirmed_at ?? null
      };
    }
  };
}

async function readSnapshot(config: RuntimeConfig): Promise<AuthIdentitySnapshot> {
  let serialized: string;
  try {
    serialized = await Deno.readTextFile(config.snapshotPath);
  } catch {
    throw new Error('snapshot_read_failed');
  }
  return decryptSnapshot(serialized, config.snapshotKey);
}

async function writeSnapshot(
  config: RuntimeConfig,
  inventory: Inventory,
  plan: MigrationPlan
): Promise<void> {
  const snapshot = createSnapshot(
    config.projectRef,
    inventory.profiles.length,
    inventory.authUsers.length,
    plan.records
  );
  const encrypted = await encryptSnapshot(snapshot, config.snapshotKey);
  try {
    await Deno.writeTextFile(config.snapshotPath, encrypted, {
      createNew: true
    });
    if (Deno.build.os !== 'windows') {
      await Deno.chmod(config.snapshotPath, 0o600);
    }
  } catch {
    throw new Error('snapshot_write_failed');
  }
}

async function writeReport(
  config: RuntimeConfig | null,
  report: Record<string, unknown>
): Promise<void> {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (config?.reportPath) {
    try {
      await Deno.writeTextFile(config.reportPath, serialized, {
        createNew: true
      });
      if (Deno.build.os !== 'windows') {
        await Deno.chmod(config.reportPath, 0o600);
      }
    } catch {
      throw new Error('report_write_failed');
    }
  }
  await Deno.stdout.write(new TextEncoder().encode(serialized));
}

function assertPlanSafe(plan: MigrationPlan): void {
  if (plan.blockers.length > 0) throw new Error('inventory_blocked');
}

async function runDryRun(
  config: RuntimeConfig,
  inventory: Inventory,
  plan: MigrationPlan
): Promise<CommandResult> {
  const report = await createRedactedReport('dry-run', config.projectRef, plan);
  if (plan.blockers.length > 0) return { ok: false, report };
  if (
    plan.records.some(
      record => record.state === 'auth_aligned' || record.state === 'profile_aligned'
    )
  ) {
    throw new Error('partial_state_requires_existing_snapshot');
  }
  await writeSnapshot(config, inventory, plan);
  return { ok: true, report };
}

async function runApply(
  config: RuntimeConfig,
  inventory: Inventory,
  plan: MigrationPlan,
  adapter: MigrationAdapter
): Promise<CommandResult> {
  assertPlanSafe(plan);
  const snapshot = await readSnapshot(config);
  const records = effectiveSnapshotRecords(snapshot, config, inventory, plan);
  const outcomes: RecordOutcome[] = [];

  for (const record of records) {
    const result = await applyMigrationRecord(record, adapter);
    outcomes.push({ record, status: result });
  }

  const postInventory = await readInventory(createServiceClient(config));
  const postPlan = buildMigrationPlan(postInventory.profiles, postInventory.authUsers);
  assertPlanSafe(postPlan);
  const postRecords = effectiveSnapshotRecords(snapshot, config, postInventory, postPlan);
  if (postRecords.some(record => record.state !== 'aligned')) {
    throw new Error('apply_verification_failed');
  }

  return {
    ok: true,
    report: await createRedactedReport(
      'apply',
      config.projectRef,
      { records, blockers: [] },
      outcomes
    )
  };
}

async function runVerify(
  config: RuntimeConfig,
  inventory: Inventory,
  plan: MigrationPlan
): Promise<CommandResult> {
  assertPlanSafe(plan);
  const snapshot = await readSnapshot(config);
  const records = effectiveSnapshotRecords(snapshot, config, inventory, plan);
  if (records.some(record => record.state !== 'aligned')) {
    throw new Error('verification_failed');
  }
  const outcomes = records.map(record => ({ record, status: 'verified' }));
  return {
    ok: true,
    report: await createRedactedReport(
      'verify',
      config.projectRef,
      { records, blockers: [] },
      outcomes
    )
  };
}

async function runRollback(
  config: RuntimeConfig,
  inventory: Inventory,
  plan: MigrationPlan,
  adapter: MigrationAdapter
): Promise<CommandResult> {
  assertPlanSafe(plan);
  const snapshot = await readSnapshot(config);
  const effectiveRecords = effectiveSnapshotRecords(snapshot, config, inventory, plan);
  const effectiveByKey = new Map(effectiveRecords.map(record => [recordKey(record), record]));
  const outcomes: RecordOutcome[] = [];

  for (const snapshotRecord of [...snapshot.records].reverse()) {
    const currentState = effectiveByKey.get(recordKey(snapshotRecord));
    if (!currentState) throw new Error('snapshot_inventory_mismatch');
    const result = await rollbackMigrationRecord(snapshotRecord, adapter);
    outcomes.push({ record: currentState, status: result });
  }

  const postInventory = await readInventory(createServiceClient(config));
  const postPlan = buildMigrationPlan(postInventory.profiles, postInventory.authUsers);
  assertPlanSafe(postPlan);
  effectiveSnapshotRecords(snapshot, config, postInventory, postPlan);
  assertSnapshotPreviousState(snapshot, postPlan);

  return {
    ok: true,
    report: await createRedactedReport(
      'rollback',
      config.projectRef,
      { records: effectiveRecords, blockers: [] },
      outcomes
    )
  };
}

export function requiresChangeWindowPreflight(mode: MigrationMode): boolean {
  return mode !== 'rollback';
}

async function execute(config: RuntimeConfig): Promise<CommandResult> {
  if (requiresChangeWindowPreflight(config.mode)) {
    await verifySignupDisabled(config);
    await verifyAnonCannotReadUsers(config);
  }
  const client = createServiceClient(config);
  const inventory = await readInventory(client);
  const plan = buildMigrationPlan(inventory.profiles, inventory.authUsers);

  if (config.mode === 'dry-run') return runDryRun(config, inventory, plan);
  const adapter = createAdapter(client);
  if (config.mode === 'apply') {
    return runApply(config, inventory, plan, adapter);
  }
  if (config.mode === 'verify') return runVerify(config, inventory, plan);
  return runRollback(config, inventory, plan, adapter);
}

export async function runAuthIdentityMigration(args = Deno.args): Promise<number> {
  let config: RuntimeConfig | null = null;
  try {
    config = await loadConfig(args);
    const result = await execute(config);
    await writeReport(config, result.report);
    return result.ok ? 0 : 2;
  } catch (error) {
    const report = await createFailureReport(
      config?.mode ?? 'dry-run',
      config?.projectRef ?? null,
      error
    );
    try {
      await writeReport(config, report);
    } catch {
      await Deno.stdout.write(
        new TextEncoder().encode(
          `${JSON.stringify({
            format: 'neofuel-auth-identity-migration-report',
            version: 1,
            status: 'failed',
            error_code: 'report_write_failed'
          })}\n`
        )
      );
    }
    return 1;
  }
}

if (import.meta.main) {
  Deno.exitCode = await runAuthIdentityMigration();
}
