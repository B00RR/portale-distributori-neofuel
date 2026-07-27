import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/database.types';

const { Pool } = pg;

export const DB_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';

export const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IjEyNzA0MSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNTc5ODgwODAwLCJleHAiOjE5MDU0NTY4MDB9.0';
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IjEyNzA0MSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE1Nzk4ODA4MDAsImV4cCI6MTkwNTQ1NjgwMH0.0';
export const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';

export const ADMIN_UUID = '11111111-1111-1111-1111-111111111111';
export const OPERATOR1_UUID = '22222222-2222-2222-2222-222222222222';
export const OPERATOR2_UUID = '33333333-3333-3333-3333-333333333333';
export const INACTIVE_UUID = '44444444-4444-4444-4444-444444444444';
export const NOPROFILE_UUID = '55555555-5555-5555-5555-555555555555';

export let pool: pg.Pool;
export let isDbAvailable = false;

export function createTestJwt(userUuid: string, role: string = 'authenticated', email?: string): string {
  return jwt.sign(
    {
      sub: userUuid,
      role,
      email: email || `${role}@neofuel.test`,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    SUPABASE_JWT_SECRET
  );
}

export function createTestSupabaseClient(token?: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  });
}

export const getAnonClient = (): SupabaseClient<Database> => createTestSupabaseClient();

export const getAdminClient = (): SupabaseClient<Database> =>
  createTestSupabaseClient(createTestJwt(ADMIN_UUID, 'authenticated', 'admin@neofuel.test'));

export const getOperator1Client = (): SupabaseClient<Database> =>
  createTestSupabaseClient(createTestJwt(OPERATOR1_UUID, 'authenticated', 'op1@neofuel.test'));

export const getOperator2Client = (): SupabaseClient<Database> =>
  createTestSupabaseClient(createTestJwt(OPERATOR2_UUID, 'authenticated', 'op2@neofuel.test'));

export const getInactiveClient = (): SupabaseClient<Database> =>
  createTestSupabaseClient(createTestJwt(INACTIVE_UUID, 'authenticated', 'inactive@neofuel.test'));

export const getNoProfileClient = (): SupabaseClient<Database> =>
  createTestSupabaseClient(createTestJwt(NOPROFILE_UUID, 'authenticated', 'noprofile@neofuel.test'));

export const getServiceRoleClient = (): SupabaseClient<Database> =>
  createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

export async function runSqlFile(filepath: string): Promise<void> {
  if (!isDbAvailable) return;
  const content = fs.readFileSync(filepath, 'utf-8');
  await pool.query(content);
}

export async function applyAllMigrations(): Promise<string[]> {
  const migrationsDir = path.resolve(process.cwd(), 'sql', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  if (!isDbAvailable) return applied;

  for (const filename of files) {
    const filepath = path.join(migrationsDir, filename);
    await runSqlFile(filepath);
    applied.push(filename);
  }
  return applied;
}

export async function resetDatabaseState(): Promise<void> {
  if (!isDbAvailable) return;
  const seedFile = path.resolve(process.cwd(), 'tests', 'integration', 'fixtures', 'test-seed.sql');
  await runSqlFile(seedFile);
}

beforeAll(async () => {
  pool = new Pool({
    connectionString: DB_URL,
    connectionTimeoutMillis: 2000
  });

  try {
    await pool.query('SELECT 1');
    isDbAvailable = true;
  } catch {
    isDbAvailable = false;
    if (process.env.CI) {
      throw new Error(`Failed to connect to ephemeral database at ${DB_URL} during CI run.`);
    } else {
      console.warn('⚠️ Ephemeral DB connection unavailable locally. Integration tests will be skipped locally.');
      return;
    }
  }

  // 1. Base schema setup
  const baseSchemaFile = path.resolve(process.cwd(), 'tests', 'integration', 'fixtures', '00_base_schema.sql');
  await runSqlFile(baseSchemaFile);

  // 2. Apply all canonical migrations
  await applyAllMigrations();

  // 3. Populate test seed
  await resetDatabaseState();
});

beforeEach(async () => {
  if (isDbAvailable) {
    await resetDatabaseState();
  }
});

afterAll(async () => {
  if (pool) {
    await pool.end().catch(() => {});
  }
});
