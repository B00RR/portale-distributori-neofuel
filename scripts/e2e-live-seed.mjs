import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

dotenv.config({ quiet: true });

const LIVE_MODE = process.env.E2E_SUPABASE_MODE === 'live';
const INTERNAL_AUTH_DOMAIN = 'neofuel.local';

const env = {
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  adminUsername: process.env.TEST_ADMIN_USERNAME || 'e2e-admin',
  adminConfiguredEmail: process.env.TEST_ADMIN_EMAIL,
  adminPassword:
    process.env.TEST_ADMIN_PASSWORD || process.env.TEST_USER_PASS || 'password-e2e-admin',
  operatorUsername: process.env.TEST_OPERATOR_USERNAME || 'e2e-operator',
  operatorConfiguredEmail: process.env.TEST_OPERATOR_EMAIL,
  operatorPassword:
    process.env.TEST_OPERATOR_PASSWORD || process.env.TEST_USER_PASS || 'password-e2e-operator',
  stationName: process.env.TEST_STATION_NAME || 'Stazione E2E Neofuel',
  stationLocation: process.env.TEST_STATION_LOCATION || 'E2E'
};

function requireLiveEnv() {
  const missing = [];
  if (!env.supabaseUrl || env.supabaseUrl === 'your-project-url-here') {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!env.serviceRoleKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (missing.length > 0) {
    throw new Error(
      `Live E2E seeding requires ${missing.join(', ')}. ` +
        'Use E2E_SUPABASE_MODE=mock for hermetic tests or provide live Supabase credentials.'
    );
  }
}

function createAdminClient() {
  requireLiveEnv();
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
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

export function deriveSeedAuthIdentity(input, configuredEmail) {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (trimmed.length < 3 || trimmed.length > 32 || !/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error('Invalid E2E username');
  }
  const username = trimmed.toLowerCase();
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

function assertCompatibleSeedPlans(plans) {
  for (let index = 0; index < plans.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < plans.length; otherIndex += 1) {
      const left = plans[index];
      const right = plans[otherIndex];
      if (left.authUser && right.authUser && left.authUser.id === right.authUser.id) {
        throw new Error('E2E seed roles resolve to the same Auth identity');
      }
      if (left.profile && right.profile && left.profile.user_id === right.profile.user_id) {
        throw new Error('E2E seed roles resolve to the same application profile');
      }
      if (left.candidateEmails.some(email => right.candidateEmails.includes(email))) {
        throw new Error('E2E seed roles have overlapping identity emails');
      }
    }
  }
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

      // A lost REST response can be ambiguous. Re-read by immutable Auth UUID
      // before compensating a mutation that may actually have committed.
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

  if (!authUser) {
    authUser = await operations.createAuthUser({
      email: plan.identity.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        ...previousMetadata,
        username: plan.identity.username,
        full_name: input.fullName,
        role: input.role
      }
    });
    createdAuthUser = true;
  } else {
    const update = {
      password: input.password,
      email_confirm: true,
      user_metadata: {
        ...previousMetadata,
        username: plan.identity.username,
        full_name: input.fullName,
        role: input.role
      }
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

async function ensureStation(supabase) {
  const stationPayload = {
    station_name: env.stationName,
    location: env.stationLocation,
    is_active: true,
    allow_partial_closure: true,
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: selectError } = await supabase
    .from('fuel_stations')
    .select('station_id')
    .eq('station_name', env.stationName)
    .maybeSingle();
  if (selectError) {
    throw selectError;
  }

  if (existing?.station_id) {
    const { data, error } = await supabase
      .from('fuel_stations')
      .update(stationPayload)
      .eq('station_id', existing.station_id)
      .select('station_id')
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

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

export async function seedLiveE2EData({ force = false } = {}) {
  if (!force && !LIVE_MODE) {
    return { skipped: true, reason: 'E2E_SUPABASE_MODE is not live' };
  }

  const supabase = createAdminClient();
  const adminIdentity = deriveSeedAuthIdentity(env.adminUsername, env.adminConfiguredEmail);
  const operatorIdentity = deriveSeedAuthIdentity(
    env.operatorUsername,
    env.operatorConfiguredEmail
  );
  const [authUsers, profiles] = await Promise.all([
    listAuthUsers(supabase),
    listAppUsers(supabase)
  ]);

  // Complete both identity preflights before the first write. This prevents a
  // partial admin migration when the operator alias is already occupied.
  const adminPlan = planSeedIdentityReconciliation({
    identity: adminIdentity,
    legacyEmails: [env.adminConfiguredEmail, `${adminIdentity.username}@neofuel.test`],
    authUsers,
    profiles
  });
  const operatorPlan = planSeedIdentityReconciliation({
    identity: operatorIdentity,
    legacyEmails: [env.operatorConfiguredEmail, `${operatorIdentity.username}@neofuel.test`],
    authUsers,
    profiles
  });
  assertCompatibleSeedPlans([adminPlan, operatorPlan]);

  const operations = createSeedOperations(supabase);
  const adminResult = await applySeedIdentityPlan(
    adminPlan,
    {
      password: env.adminPassword,
      role: 'admin',
      fullName: 'Admin E2E'
    },
    operations
  );
  const operatorResult = await applySeedIdentityPlan(
    operatorPlan,
    {
      password: env.operatorPassword,
      role: 'operator',
      fullName: 'Operatore E2E'
    },
    operations
  );

  const station = await ensureStation(supabase);
  await ensureStationAssignment(supabase, adminResult.profile.user_id, station.station_id);
  await ensureStationAssignment(supabase, operatorResult.profile.user_id, station.station_id);

  return {
    skipped: false,
    stationId: station.station_id,
    adminUserId: adminResult.profile.user_id,
    operatorUserId: operatorResult.profile.user_id
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedLiveE2EData({ force: true })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
