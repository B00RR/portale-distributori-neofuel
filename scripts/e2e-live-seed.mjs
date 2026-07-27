import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

dotenv.config({ quiet: true });

const INTERNAL_AUTH_DOMAIN = 'neofuel.local';
const IMMUTABLE_PRODUCTION_PROJECT_REFS = new Set(['ahlmgafaurossyghimxc']);

const PLACEHOLDER_PATTERNS = [
  'your-project-url-here',
  'your-service-role-key-here',
  'your-target-project-ref-here',
  'your-target-ref-here',
  'your-production-ref-here',
  'your-disposable-ref-1',
  'your-disposable-ref-2',
  'your-project-ref-here'
];

function isPlaceholder(val) {
  if (!val || typeof val !== 'string') return true;
  const lower = val.trim().toLowerCase();
  return (
    PLACEHOLDER_PATTERNS.includes(lower) || lower.startsWith('your-') || lower.endsWith('-here')
  );
}

function sanitizeErrorMessage(err) {
  if (!err) return 'Unknown error';
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/https?:\/\/[^\s]+/g, '[REDACTED_URL]')
    .replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_=]*/g, '[REDACTED_TOKEN]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
      '[REDACTED_UUID]'
    );
}

export function validateLiveE2EConfig(env = process.env) {
  if (env.E2E_SUPABASE_MODE !== 'live') {
    throw new Error('E2E_SUPABASE_MODE must be set to "live" for live E2E seed');
  }

  const allowOptIn = env.ALLOW_E2E_SEED;
  if (allowOptIn !== '1') {
    throw new Error('ALLOW_E2E_SEED=1 is required to execute live E2E seed');
  }

  const declaredTargetRef = env.E2E_TARGET_PROJECT_REF ? env.E2E_TARGET_PROJECT_REF.trim() : '';
  if (!declaredTargetRef) {
    throw new Error('E2E_TARGET_PROJECT_REF is required for live E2E seed');
  }
  if (isPlaceholder(declaredTargetRef)) {
    throw new Error('E2E_TARGET_PROJECT_REF contains invalid placeholder value');
  }

  const prodRefRaw =
    env.PRODUCTION_SUPABASE_PROJECT_REF ||
    env.SUPABASE_PRODUCTION_PROJECT_REF ||
    env.E2E_PRODUCTION_PROJECT_REF;
  const declaredProdRef = prodRefRaw ? prodRefRaw.trim() : '';
  if (!declaredProdRef) {
    throw new Error('PRODUCTION_SUPABASE_PROJECT_REF is required for live E2E seed');
  }
  if (isPlaceholder(declaredProdRef)) {
    throw new Error('PRODUCTION_SUPABASE_PROJECT_REF contains invalid placeholder value');
  }

  const rawUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  if (!rawUrl || isPlaceholder(rawUrl)) {
    throw new Error('VITE_SUPABASE_URL is required for live E2E seed');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('VITE_SUPABASE_URL must use HTTPS');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'VITE_SUPABASE_URL must use HTTPS') {
      throw error;
    }
    throw new Error('VITE_SUPABASE_URL must be a valid HTTPS URL');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const parts = hostname.split('.');
  if (parts.length !== 3 || parts[1] !== 'supabase' || parts[2] !== 'co') {
    throw new Error('Supabase URL host must be a valid *.supabase.co domain');
  }
  const hostProjectRef = parts[0];

  const targetRef = declaredTargetRef.toLowerCase();
  if (targetRef !== hostProjectRef) {
    throw new Error(
      'Target project ref mismatch: declared target project ref does not match URL host ref'
    );
  }

  const prodRef = declaredProdRef.toLowerCase();
  if (targetRef === prodRef || IMMUTABLE_PRODUCTION_PROJECT_REFS.has(targetRef)) {
    throw new Error('Execution rejected: target project ref is identified as production');
  }

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || !serviceRoleKey.trim() || isPlaceholder(serviceRoleKey)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for live E2E seed');
  }

  const allowlistRaw = env.E2E_ALLOWED_PROJECT_REFS || env.E2E_ALLOWED_PROJECT_REF_ALLOWLIST || '';
  const allowlist = allowlistRaw
    .split(',')
    .map(r => r.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    throw new Error(
      'E2E_ALLOWED_PROJECT_REFS is required and must specify allowed disposable project refs'
    );
  }

  if (!allowlist.includes(targetRef)) {
    throw new Error('Target project ref is not in the allowed project refs list');
  }

  const adminUsername = env.TEST_ADMIN_USERNAME;
  const adminPassword = env.TEST_ADMIN_PASSWORD;
  const operatorUsername = env.TEST_OPERATOR_USERNAME;
  const operatorPassword = env.TEST_OPERATOR_PASSWORD;

  if (!adminUsername || !adminUsername.trim()) {
    throw new Error('TEST_ADMIN_USERNAME is required for live E2E seed');
  }
  if (!adminPassword || !adminPassword.trim()) {
    throw new Error('TEST_ADMIN_PASSWORD is required for live E2E seed');
  }
  if (!operatorUsername || !operatorUsername.trim()) {
    throw new Error('TEST_OPERATOR_USERNAME is required for live E2E seed');
  }
  if (!operatorPassword || !operatorPassword.trim()) {
    throw new Error('TEST_OPERATOR_PASSWORD is required for live E2E seed');
  }

  const runId = env.E2E_RUN_ID ? env.E2E_RUN_ID.trim() : '';
  if (!runId || !/^[a-zA-Z0-9_-]{3,32}$/.test(runId)) {
    throw new Error(
      'E2E_RUN_ID is required and must be a valid 3-32 character alphanumeric/dash string'
    );
  }

  return {
    supabaseUrl: parsedUrl.toString().replace(/\/$/, ''),
    serviceRoleKey: serviceRoleKey.trim(),
    targetRef,
    adminUsername: adminUsername.trim(),
    adminPassword: adminPassword.trim(),
    operatorUsername: operatorUsername.trim(),
    operatorPassword: operatorPassword.trim(),
    runId,
    stationName: env.TEST_STATION_NAME ? env.TEST_STATION_NAME.trim() : `Stazione E2E`,
    stationLocation: env.TEST_STATION_LOCATION ? env.TEST_STATION_LOCATION.trim() : 'E2E'
  };
}

function createAdminClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function listAuthUsers(supabase) {
  const users = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      return users;
    }
    page += 1;
  }
}

async function listAppUsers(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, email, full_name, role, is_active, created_by_auth');
  if (error) {
    throw error;
  }
  return data || [];
}

async function findStationByName(supabase, stationName) {
  const { data, error } = await supabase
    .from('fuel_stations')
    .select('station_id, station_name, location')
    .eq('station_name', stationName)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function listStationAssignments(supabase) {
  const { data, error } = await supabase.from('user_stations').select('station_id, user_id');
  if (error) {
    throw error;
  }
  return data || [];
}

export function deriveSeedAuthIdentity(input, configuredEmail, runId) {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (trimmed.length < 3 || trimmed.length > 32 || !/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error('Invalid E2E username');
  }
  let username = trimmed.toLowerCase();
  if (runId) {
    const trimmedRunId = typeof runId === 'string' ? runId.trim().toLowerCase() : '';
    if (trimmedRunId) {
      const namespaced = `${username}_${trimmedRunId}`;
      if (namespaced.length > 32) {
        throw new Error('Namespaced E2E username exceeds 32 characters');
      }
      username = namespaced;
    }
  }
  const email = `${username}@${INTERNAL_AUTH_DOMAIN}`;
  const historicalEmail = `${username}@neofuel.test`;
  if (configuredEmail && ![email, historicalEmail].includes(configuredEmail.trim().toLowerCase())) {
    throw new Error('Configured E2E email does not match the username Auth alias');
  }
  return { username, email };
}

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizedLooseUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function historicalUsernameFromEmail(email) {
  return (
    normalizedEmail(email)
      .split('@')[0]
      ?.replace(/[^a-zA-Z0-9_]/g, '_') || ''
  );
}

function uniqueBy(items, key) {
  return [...new Map(items.map(item => [key(item), item])).values()];
}

export function planSeedIdentityReconciliation({
  identity,
  legacyEmails = [],
  authUsers,
  profiles
}) {
  const candidateEmails = [
    identity.email,
    ...legacyEmails.map(normalizedEmail).filter(Boolean)
  ].filter((email, index, values) => values.indexOf(email) === index);

  const authMatches = uniqueBy(
    authUsers.filter(user => candidateEmails.includes(normalizedEmail(user.email))),
    user => user.id
  );
  if (authMatches.length > 1) {
    throw new Error(`E2E Auth collision for ${identity.username}`);
  }

  const authUser = authMatches[0] || null;
  const profileMatches = uniqueBy(
    profiles.filter(
      profile =>
        (authUser && profile.created_by_auth === authUser.id) ||
        candidateEmails.includes(normalizedEmail(profile.email)) ||
        normalizedLooseUsername(profile.username) === identity.username
    ),
    profile => profile.user_id
  );
  if (profileMatches.length > 1) {
    throw new Error(`E2E profile collision for ${identity.username}`);
  }

  const profile = profileMatches[0] || null;
  if (profile && !authUser) {
    throw new Error(`E2E profile without matching Auth identity for ${identity.username}`);
  }
  if (authUser && !profile) {
    throw new Error(`E2E Auth identity without linked profile for ${identity.username}`);
  }
  if (profile && profile.created_by_auth !== authUser.id) {
    throw new Error(`E2E profile/Auth mismatch for ${identity.username}`);
  }
  if (
    profile &&
    (!candidateEmails.includes(normalizedEmail(profile.email)) ||
      ![
        identity.username,
        ...candidateEmails.map(historicalUsernameFromEmail).filter(Boolean)
      ].includes(normalizedLooseUsername(profile.username)))
  ) {
    throw new Error(`E2E fixture identity mismatch for ${identity.username}`);
  }

  const mode = !authUser ? 'create' : authUser.email === identity.email ? 'aligned' : 'migrate';

  return {
    identity,
    candidateEmails,
    mode,
    authUser,
    profile,
    previousEmail: authUser?.email || null
  };
}

function profileMatchesPayload(profile, payload) {
  return (
    profile?.created_by_auth === payload.created_by_auth &&
    profile.email === payload.email &&
    profile.username === payload.username &&
    profile.full_name === payload.full_name &&
    profile.role === payload.role &&
    profile.is_active === true
  );
}

function createSeedOperations(supabase) {
  return {
    async createAuthUser(input) {
      const { data, error } = await supabase.auth.admin.createUser(input);
      if (error) throw error;
      return data.user;
    },

    async updateAuthUser(authUserId, input) {
      const { data, error } = await supabase.auth.admin.updateUserById(authUserId, input);
      if (error) throw error;
      return data.user;
    },

    async deleteAuthUser(authUserId) {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) throw error;
    },

    async upsertProfile(existingProfile, payload) {
      const query = existingProfile
        ? supabase
            .from('users')
            .update(payload)
            .eq('user_id', existingProfile.user_id)
            .eq('created_by_auth', payload.created_by_auth)
        : supabase.from('users').insert(payload);
      const { data, error } = await query
        .select('user_id, username, email, full_name, role, is_active, created_by_auth')
        .single();
      if (!error) return data;

      const { data: reconciled, error: reconcileError } = await supabase
        .from('users')
        .select('user_id, username, email, full_name, role, is_active, created_by_auth')
        .eq('created_by_auth', payload.created_by_auth)
        .maybeSingle();
      if (!reconcileError && profileMatchesPayload(reconciled, payload)) {
        return reconciled;
      }
      throw error;
    }
  };
}

export async function applySeedIdentityPlan(plan, input, operations) {
  const previousMetadata = plan.authUser?.user_metadata || {};
  let authUser = plan.authUser;
  let createdAuthUser = false;

  const metadata = {
    ...previousMetadata,
    username: plan.identity.username,
    full_name: input.fullName,
    role: input.role
  };
  if (input.runId) {
    metadata.e2e_run_id = input.runId;
  }

  if (!authUser) {
    authUser = await operations.createAuthUser({
      email: plan.identity.email,
      password: input.password,
      email_confirm: true,
      user_metadata: metadata
    });
    createdAuthUser = true;
  } else {
    const update = {
      password: input.password,
      email_confirm: true,
      user_metadata: metadata
    };
    if (plan.mode === 'migrate') {
      update.email = plan.identity.email;
    }
    authUser = await operations.updateAuthUser(authUser.id, update);
  }

  if (!authUser?.id || (plan.authUser && authUser.id !== plan.authUser.id)) {
    throw new Error('E2E Auth reconciliation returned an unexpected identity');
  }

  const profilePayload = {
    email: plan.identity.email,
    username: plan.identity.username,
    full_name: input.fullName,
    role: input.role,
    created_by_auth: authUser.id,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  try {
    const profile = await operations.upsertProfile(plan.profile, profilePayload);
    return { authUser, profile };
  } catch (profileError) {
    try {
      if (createdAuthUser) {
        await operations.deleteAuthUser(authUser.id);
      } else {
        const rollback = { user_metadata: previousMetadata };
        if (plan.mode === 'migrate') {
          rollback.email = plan.previousEmail;
        }
        await operations.updateAuthUser(authUser.id, rollback);
      }
    } catch (compensationError) {
      const message =
        compensationError instanceof Error
          ? compensationError.message
          : 'unknown compensation error';
      throw new Error(
        `E2E profile reconciliation failed and Auth compensation failed: ${message}`,
        {
          cause: profileError
        }
      );
    }
    throw profileError;
  }
}

async function createStation(supabase, stationName, location) {
  const stationPayload = {
    station_name: stationName,
    location,
    is_active: true,
    allow_partial_closure: true,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('fuel_stations')
    .insert(stationPayload)
    .select('station_id')
    .single();
  if (error) {
    throw error;
  }
  return data;
}

async function ensureStationAssignment(supabase, userId, stationId) {
  const { error } = await supabase.from('user_stations').upsert(
    {
      user_id: userId,
      station_id: stationId,
      assigned_at: new Date().toISOString()
    },
    { onConflict: 'user_id,station_id' }
  );
  if (error) {
    throw error;
  }
}

async function deleteExactStationAssignment(supabase, stationId, userId) {
  const { error } = await supabase
    .from('user_stations')
    .delete()
    .eq('station_id', stationId)
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
}

async function deleteStation(supabase, stationId) {
  const { error } = await supabase.from('fuel_stations').delete().eq('station_id', stationId);
  if (error) {
    throw error;
  }
}

async function deleteProfile(supabase, userId) {
  const { error } = await supabase.from('users').delete().eq('user_id', userId);
  if (error) {
    throw error;
  }
}

export async function seedLiveE2EData(options = {}) {
  const env = options.env || process.env;
  if (env.E2E_SUPABASE_MODE !== 'live') {
    return { skipped: true, reason: 'E2E_SUPABASE_MODE is not live' };
  }

  const config = validateLiveE2EConfig(env);
  const supabase = options.supabase || createAdminClient(config);

  const adminIdentity = deriveSeedAuthIdentity(
    config.adminUsername,
    env.TEST_ADMIN_EMAIL,
    config.runId
  );
  const operatorIdentity = deriveSeedAuthIdentity(
    config.operatorUsername,
    env.TEST_OPERATOR_EMAIL,
    config.runId
  );

  const stationNameWithRun = `${config.stationName} [${config.runId}]`;
  const stationLocationWithRun = `${config.stationLocation} [E2E_RUN:${config.runId}]`;

  const fetchAuthUsers =
    options.listAuthUsers ||
    (options.operations && options.operations.listAuthUsers) ||
    listAuthUsers;
  const fetchAppUsers =
    options.listAppUsers || (options.operations && options.operations.listAppUsers) || listAppUsers;
  const fetchStationByName =
    options.findStationByName ||
    (options.operations && options.operations.findStationByName) ||
    (async (sb, name) => findStationByName(sb, name));

  const [authUsers, profiles, existingStation] = await Promise.all([
    fetchAuthUsers(supabase),
    fetchAppUsers(supabase),
    fetchStationByName(supabase, stationNameWithRun)
  ]);

  const collidingAuth = authUsers.filter(
    u =>
      normalizedEmail(u.email) === adminIdentity.email ||
      normalizedEmail(u.email) === operatorIdentity.email ||
      u.user_metadata?.e2e_run_id === config.runId
  );
  if (collidingAuth.length > 0) {
    throw new Error('E2E seed preflight failed: Auth collision detected');
  }

  const collidingProfiles = profiles.filter(
    p =>
      normalizedEmail(p.email) === adminIdentity.email ||
      normalizedEmail(p.email) === operatorIdentity.email ||
      normalizedLooseUsername(p.username) === adminIdentity.username ||
      normalizedLooseUsername(p.username) === operatorIdentity.username
  );
  if (collidingProfiles.length > 0) {
    throw new Error('E2E seed preflight failed: profile collision detected');
  }

  if (existingStation) {
    throw new Error('E2E seed preflight failed: station collision detected');
  }

  const operations = options.operations || createSeedOperations(supabase);
  const createdAuthIds = [];
  const createdUserIds = [];
  let createdStationId = null;
  const createdAssignments = [];

  try {
    const adminAuth = await operations.createAuthUser({
      email: adminIdentity.email,
      password: config.adminPassword,
      email_confirm: true,
      user_metadata: {
        username: adminIdentity.username,
        full_name: 'Admin E2E',
        role: 'admin',
        e2e_run_id: config.runId
      }
    });
    createdAuthIds.push(adminAuth.id);

    const adminProfile = await operations.upsertProfile(null, {
      email: adminIdentity.email,
      username: adminIdentity.username,
      full_name: 'Admin E2E',
      role: 'admin',
      created_by_auth: adminAuth.id,
      is_active: true,
      updated_at: new Date().toISOString()
    });
    createdUserIds.push(adminProfile.user_id);

    const operatorAuth = await operations.createAuthUser({
      email: operatorIdentity.email,
      password: config.operatorPassword,
      email_confirm: true,
      user_metadata: {
        username: operatorIdentity.username,
        full_name: 'Operatore E2E',
        role: 'operator',
        e2e_run_id: config.runId
      }
    });
    createdAuthIds.push(operatorAuth.id);

    const operatorProfile = await operations.upsertProfile(null, {
      email: operatorIdentity.email,
      username: operatorIdentity.username,
      full_name: 'Operatore E2E',
      role: 'operator',
      created_by_auth: operatorAuth.id,
      is_active: true,
      updated_at: new Date().toISOString()
    });
    createdUserIds.push(operatorProfile.user_id);

    const stationCreator =
      options.createStation ||
      options.ensureStation ||
      (options.operations &&
        (options.operations.createStation || options.operations.ensureStation)) ||
      (async (sb, name, loc) => createStation(sb, name, loc));
    const station = await stationCreator(supabase, stationNameWithRun, stationLocationWithRun);
    createdStationId = station.station_id;

    const assignmentEnsurer =
      options.ensureStationAssignment ||
      (options.operations && options.operations.ensureStationAssignment) ||
      (async (sb, uId, sId) => ensureStationAssignment(sb, uId, sId));

    await assignmentEnsurer(supabase, adminProfile.user_id, station.station_id);
    createdAssignments.push({ userId: adminProfile.user_id, stationId: station.station_id });

    await assignmentEnsurer(supabase, operatorProfile.user_id, station.station_id);
    createdAssignments.push({ userId: operatorProfile.user_id, stationId: station.station_id });

    return {
      skipped: false,
      runId: config.runId,
      adminAuthId: adminAuth.id,
      operatorAuthId: operatorAuth.id,
      adminUserId: adminProfile.user_id,
      operatorUserId: operatorProfile.user_id,
      stationId: station.station_id
    };
  } catch (seedError) {
    try {
      const deleteExactAssignment =
        options.deleteExactStationAssignment ||
        (options.operations && options.operations.deleteExactStationAssignment) ||
        (async (sb, sId, uId) => deleteExactStationAssignment(sb, sId, uId));

      for (const assign of createdAssignments) {
        await deleteExactAssignment(supabase, assign.stationId, assign.userId);
      }

      if (createdStationId) {
        const deleteStationOp =
          options.deleteStation ||
          (options.operations && options.operations.deleteStation) ||
          (async (sb, sId) => deleteStation(sb, sId));
        await deleteStationOp(supabase, createdStationId);
      }

      for (const uId of createdUserIds) {
        const deleteProfileOp =
          options.deleteProfile ||
          (options.operations && options.operations.deleteProfile) ||
          (async (sb, userId) => deleteProfile(sb, userId));
        await deleteProfileOp(supabase, uId);
      }

      for (const aId of createdAuthIds) {
        await operations.deleteAuthUser(aId);
      }
    } catch {
      throw new Error('E2E seed execution failed and compensation cleanup failed');
    }

    throw new Error('E2E seed execution failed');
  }
}

function createCleanupOperations(supabase) {
  return {
    async listAuthUsers() {
      return listAuthUsers(supabase);
    },
    async listAppUsers() {
      return listAppUsers(supabase);
    },
    async findStationByName(name) {
      return findStationByName(supabase, name);
    },
    async listStationAssignments() {
      return listStationAssignments(supabase);
    },
    async deleteExactStationAssignment(stationId, userId) {
      return deleteExactStationAssignment(supabase, stationId, userId);
    },
    async deleteStationAssignments({ stationId, userIds }) {
      if (stationId && userIds && userIds.length > 0) {
        for (const uId of userIds) {
          await deleteExactStationAssignment(supabase, stationId, uId);
        }
      }
    },
    async deleteStation(stationId) {
      return deleteStation(supabase, stationId);
    },
    async deleteProfile(userId) {
      return deleteProfile(supabase, userId);
    },
    async deleteAuthUser(authUserId) {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) throw error;
    }
  };
}

export async function cleanupLiveE2EData(options = {}) {
  const env = options.env || process.env;
  if (env.E2E_SUPABASE_MODE !== 'live') {
    return { skipped: true, reason: 'E2E_SUPABASE_MODE is not live' };
  }

  const config = validateLiveE2EConfig(env);
  const supabase = options.supabase || createAdminClient(config);
  const operations = options.operations || createCleanupOperations(supabase);

  const adminIdentity = deriveSeedAuthIdentity(
    config.adminUsername,
    env.TEST_ADMIN_EMAIL,
    config.runId
  );
  const operatorIdentity = deriveSeedAuthIdentity(
    config.operatorUsername,
    env.TEST_OPERATOR_EMAIL,
    config.runId
  );

  const targetEmails = [adminIdentity.email, operatorIdentity.email];
  const targetUsernames = [adminIdentity.username, operatorIdentity.username];
  const stationNameWithRun = `${config.stationName} [${config.runId}]`;
  const stationLocationWithRun = `${config.stationLocation} [E2E_RUN:${config.runId}]`;

  const [authUsers, profiles, station] = await Promise.all([
    operations.listAuthUsers(),
    operations.listAppUsers(),
    operations.findStationByName(stationNameWithRun)
  ]);

  const matchingAuth = authUsers.filter(
    u =>
      targetEmails.includes(normalizedEmail(u.email)) ||
      u.user_metadata?.e2e_run_id === config.runId
  );
  const matchingProfiles = profiles.filter(
    p =>
      targetEmails.includes(normalizedEmail(p.email)) ||
      targetUsernames.includes(normalizedLooseUsername(p.username))
  );

  const noFixturesFound = matchingAuth.length === 0 && matchingProfiles.length === 0 && !station;
  if (noFixturesFound) {
    return {
      skipped: false,
      runId: config.runId,
      deletedAuthCount: 0,
      deletedProfileCount: 0,
      deletedStation: false
    };
  }

  if (station && station.location !== stationLocationWithRun) {
    throw new Error('Cleanup preflight failed: station location marker mismatch');
  }

  for (const authUser of matchingAuth) {
    const email = normalizedEmail(authUser.email);
    const runIdMeta = authUser.user_metadata?.e2e_run_id;

    if (!targetEmails.includes(email) || runIdMeta !== config.runId) {
      throw new Error(
        'Cleanup preflight failed: Auth user metadata mismatch or unauthorized identity'
      );
    }
  }

  const adminAuths = matchingAuth.filter(u => normalizedEmail(u.email) === adminIdentity.email);
  const operatorAuths = matchingAuth.filter(
    u => normalizedEmail(u.email) === operatorIdentity.email
  );

  if (
    adminAuths.length !== 1 ||
    operatorAuths.length !== 1 ||
    matchingAuth.length !== 2 ||
    adminAuths[0].user_metadata?.e2e_run_id !== config.runId ||
    operatorAuths[0].user_metadata?.e2e_run_id !== config.runId
  ) {
    throw new Error(
      'Cleanup preflight failed: Auth user metadata mismatch or unauthorized identity'
    );
  }

  const adminAuth = adminAuths[0];
  const operatorAuth = operatorAuths[0];

  const adminProfiles = matchingProfiles.filter(
    p =>
      normalizedEmail(p.email) === adminIdentity.email ||
      normalizedLooseUsername(p.username) === adminIdentity.username
  );
  const operatorProfiles = matchingProfiles.filter(
    p =>
      normalizedEmail(p.email) === operatorIdentity.email ||
      normalizedLooseUsername(p.username) === operatorIdentity.username
  );

  if (
    adminProfiles.length !== 1 ||
    operatorProfiles.length !== 1 ||
    matchingProfiles.length !== 2 ||
    adminProfiles[0].created_by_auth !== adminAuth.id ||
    normalizedEmail(adminProfiles[0].email) !== adminIdentity.email ||
    normalizedLooseUsername(adminProfiles[0].username) !== adminIdentity.username ||
    operatorProfiles[0].created_by_auth !== operatorAuth.id ||
    normalizedEmail(operatorProfiles[0].email) !== operatorIdentity.email ||
    normalizedLooseUsername(operatorProfiles[0].username) !== operatorIdentity.username
  ) {
    throw new Error('Cleanup preflight failed: profile mismatch or missing linked Auth user');
  }

  if (!station || station.location !== stationLocationWithRun) {
    throw new Error('Cleanup preflight failed: station location marker mismatch');
  }

  const adminProfile = adminProfiles[0];
  const operatorProfile = operatorProfiles[0];

  let stationAssignments;
  try {
    stationAssignments = await operations.listStationAssignments();
  } catch {
    throw new Error('E2E cleanup inventory failed');
  }

  const expectedUserIds = [adminProfile.user_id, operatorProfile.user_id];
  const expectedAssignmentKeys = new Set(
    expectedUserIds.map(userId => `${station.station_id}:${userId}`)
  );
  const relevantAssignments = stationAssignments.filter(
    assignment =>
      assignment.station_id === station.station_id || expectedUserIds.includes(assignment.user_id)
  );
  const actualAssignmentKeys = relevantAssignments.map(
    assignment => `${assignment.station_id}:${assignment.user_id}`
  );

  if (
    relevantAssignments.length !== expectedAssignmentKeys.size ||
    new Set(actualAssignmentKeys).size !== expectedAssignmentKeys.size ||
    actualAssignmentKeys.some(key => !expectedAssignmentKeys.has(key))
  ) {
    throw new Error('Cleanup preflight failed: station assignment graph mismatch');
  }

  let deletedStation = false;
  let deletedProfileCount = 0;
  let deletedAuthCount = 0;

  try {
    const deleteAssignmentOp =
      operations.deleteExactStationAssignment ||
      (async (sId, uId) => {
        if (operations.deleteStationAssignments) {
          await operations.deleteStationAssignments({ stationId: sId, userIds: [uId] });
        } else {
          await deleteExactStationAssignment(supabase, sId, uId);
        }
      });

    await deleteAssignmentOp(station.station_id, adminProfile.user_id);
    await deleteAssignmentOp(station.station_id, operatorProfile.user_id);

    await operations.deleteStation(station.station_id);
    deletedStation = true;

    await operations.deleteProfile(adminProfile.user_id);
    deletedProfileCount += 1;

    await operations.deleteProfile(operatorProfile.user_id);
    deletedProfileCount += 1;

    await operations.deleteAuthUser(adminAuth.id);
    deletedAuthCount += 1;

    await operations.deleteAuthUser(operatorAuth.id);
    deletedAuthCount += 1;

    const [remAuth, remProfiles, remStation, remAssignments] = await Promise.all([
      operations.listAuthUsers(),
      operations.listAppUsers(),
      operations.findStationByName(stationNameWithRun),
      operations.listStationAssignments()
    ]);

    const lingeringAuth = remAuth.filter(
      u =>
        targetEmails.includes(normalizedEmail(u.email)) ||
        u.user_metadata?.e2e_run_id === config.runId
    );
    const lingeringProfiles = remProfiles.filter(
      p =>
        targetEmails.includes(normalizedEmail(p.email)) ||
        targetUsernames.includes(normalizedLooseUsername(p.username))
    );
    const lingeringAssignments = remAssignments.filter(
      assignment =>
        assignment.station_id === station.station_id || expectedUserIds.includes(assignment.user_id)
    );

    if (
      lingeringAuth.length > 0 ||
      lingeringProfiles.length > 0 ||
      remStation ||
      lingeringAssignments.length > 0
    ) {
      throw new Error('E2E cleanup post-condition failed: fixtures still linger after deletion');
    }
  } catch (cleanupError) {
    if (
      cleanupError instanceof Error &&
      cleanupError.message.startsWith('E2E cleanup post-condition failed:')
    ) {
      throw cleanupError;
    }
    throw new Error('E2E cleanup execution failed');
  }

  return {
    skipped: false,
    runId: config.runId,
    deletedAuthCount,
    deletedProfileCount,
    deletedStation
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedLiveE2EData()
    .then(result => {
      if (result.skipped) {
        console.log(JSON.stringify({ status: 'skipped', reason: result.reason }, null, 2));
      } else {
        console.log(JSON.stringify({ status: 'success', runId: result.runId }, null, 2));
      }
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : 'Error executing live E2E seed');
      process.exit(1);
    });
}
