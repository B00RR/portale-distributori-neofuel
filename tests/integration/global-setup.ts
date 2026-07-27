import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export const DB_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';

export async function runSqlFile(pool: pg.Pool, filepath: string): Promise<void> {
  const content = fs.readFileSync(filepath, 'utf-8');
  await pool.query(content);
}

export async function applyAllMigrations(pool: pg.Pool): Promise<string[]> {
  const migrationsDir = path.resolve(process.cwd(), 'sql', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  for (const filename of files) {
    const filepath = path.join(migrationsDir, filename);
    try {
      await runSqlFile(pool, filepath);
    } catch (err: any) {
      const message = err?.message || String(err);
      throw new Error(`Migration ${filename} failed: ${message}`, { cause: err });
    }
    applied.push(filename);
  }
  return applied;
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const pool = new Pool({
    connectionString: DB_URL,
    connectionTimeoutMillis: 2000
  });

  try {
    await pool.query('SELECT 1');
    process.env.INTEGRATION_DB_AVAILABLE = 'true';
  } catch {
    process.env.INTEGRATION_DB_AVAILABLE = 'false';
    if (process.env.CI) {
      await pool.end().catch(() => {});
      throw new Error(`Failed to connect to ephemeral database at ${DB_URL} during CI run.`);
    } else {
      console.warn('⚠️ Ephemeral DB connection unavailable locally. Integration tests will be skipped locally.');
      await pool.end().catch(() => {});
      return async () => {};
    }
  }

  try {
    // 1. Base schema setup
    const baseSchemaFile = path.resolve(process.cwd(), 'tests', 'integration', 'fixtures', '00_base_schema.sql');
    await runSqlFile(pool, baseSchemaFile);

    // 2. Apply all canonical migrations
    await applyAllMigrations(pool);

    // 3. Populate test seed
    const seedFile = path.resolve(process.cwd(), 'tests', 'integration', 'fixtures', 'test-seed.sql');
    await runSqlFile(pool, seedFile);
  } finally {
    await pool.end().catch(() => {});
  }

  return async () => {};
}
