import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

dotenv.config({ quiet: true });

const LIVE_MODE = process.env.E2E_SUPABASE_MODE === 'live';

const env = {
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  adminEmail: process.env.TEST_ADMIN_EMAIL || 'e2e-admin@neofuel.test',
  adminPassword:
    process.env.TEST_ADMIN_PASSWORD || process.env.TEST_USER_PASS || 'password-e2e-admin',
  operatorEmail: process.env.TEST_OPERATOR_EMAIL || 'e2e-operator@neofuel.test',
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

async function findAuthUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const user = data.users.find(
      candidate => candidate.email?.toLowerCase() === email.toLowerCase()
    );
    if (user) {
      return user;
    }

    if (data.users.length < perPage) {
      return null;
    }
    page += 1;
  }
}

async function ensureAuthUser(supabase, { email, password, role, fullName }) {
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role }
    });
    if (error) {
      throw error;
    }
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });
  if (error) {
    throw error;
  }
  return data.user;
}

function usernameFromEmail(email) {
  return email.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '_') || 'e2e_user';
}

async function ensureAppUser(supabase, authUser, role, fullName) {
  const payload = {
    email: authUser.email,
    username: usernameFromEmail(authUser.email || fullName),
    full_name: fullName,
    role,
    created_by_auth: authUser.id,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: selectError } = await supabase
    .from('users')
    .select('user_id')
    .eq('email', authUser.email)
    .maybeSingle();
  if (selectError) {
    throw selectError;
  }

  if (existing?.user_id) {
    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('user_id', existing.user_id)
      .select('user_id')
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  const { data, error } = await supabase.from('users').insert(payload).select('user_id').single();
  if (error) {
    throw error;
  }
  return data;
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
  const station = await ensureStation(supabase);

  const adminAuth = await ensureAuthUser(supabase, {
    email: env.adminEmail,
    password: env.adminPassword,
    role: 'admin',
    fullName: 'Admin E2E'
  });
  const operatorAuth = await ensureAuthUser(supabase, {
    email: env.operatorEmail,
    password: env.operatorPassword,
    role: 'operator',
    fullName: 'Operatore E2E'
  });

  const adminUser = await ensureAppUser(supabase, adminAuth, 'admin', 'Admin E2E');
  const operatorUser = await ensureAppUser(supabase, operatorAuth, 'operator', 'Operatore E2E');

  await ensureStationAssignment(supabase, adminUser.user_id, station.station_id);
  await ensureStationAssignment(supabase, operatorUser.user_id, station.station_id);

  return {
    skipped: false,
    stationId: station.station_id,
    adminUserId: adminUser.user_id,
    operatorUserId: operatorUser.user_id
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
