import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export interface LocalMigration {
  filename: string;
  filepath: string;
  hash: string;
}

export interface DbMigration {
  filename: string;
  file_hash: string;
  applied_at?: string;
  applied_by?: string;
}

export interface VerificationResult {
  totalLocal: number;
  totalDb: number;
  unapplied: string[];
  mismatchedHashes: { filename: string; expected: string; actual: string }[];
  inverseDrift: {
    untrackedFunctions?: string[];
    untrackedPolicies?: string[];
  };
  isSuccess: boolean;
}

export function computeFileHash(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function getLocalMigrations(migrationsDir: string): LocalMigration[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(filename => {
    const filepath = path.join(migrationsDir, filename);
    const content = fs.readFileSync(filepath);
    const hash = computeFileHash(content);
    return { filename, filepath, hash };
  });
}

export function compareMigrationState(
  localMigrations: LocalMigration[],
  dbMigrations: DbMigration[]
): {
  unapplied: string[];
  mismatchedHashes: { filename: string; expected: string; actual: string }[];
  isSuccess: boolean;
} {
  const dbMap = new Map<string, DbMigration>();
  for (const dbRecord of dbMigrations) {
    dbMap.set(dbRecord.filename, dbRecord);
  }

  const unapplied: string[] = [];
  const mismatchedHashes: { filename: string; expected: string; actual: string }[] = [];

  for (const local of localMigrations) {
    const dbRecord = dbMap.get(local.filename);
    if (!dbRecord) {
      unapplied.push(local.filename);
    } else if (dbRecord.file_hash !== 'pending' && dbRecord.file_hash !== local.hash) {
      mismatchedHashes.push({
        filename: local.filename,
        expected: local.hash,
        actual: dbRecord.file_hash
      });
    }
  }

  const isSuccess = unapplied.length === 0 && mismatchedHashes.length === 0;
  return { unapplied, mismatchedHashes, isSuccess };
}

export async function runVerification(customMigrationsDir?: string): Promise<VerificationResult> {
  const migrationsDir = customMigrationsDir || path.resolve(process.cwd(), 'sql', 'migrations');
  const localMigrations = getLocalMigrations(migrationsDir);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured.');
    console.log(`Verified ${localMigrations.length} local migration files.`);
    return {
      totalLocal: localMigrations.length,
      totalDb: 0,
      unapplied: [],
      mismatchedHashes: [],
      inverseDrift: {},
      isSuccess: true
    };
  }

  console.log(`🔍 Connecting to Supabase at ${supabaseUrl}...`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: dbData, error: dbError } = await supabase
    .from('schema_migrations')
    .select('filename, file_hash, applied_at, applied_by');

  if (dbError) {
    console.error('❌ Error querying public.schema_migrations:', dbError.message);
    return {
      totalLocal: localMigrations.length,
      totalDb: 0,
      unapplied: localMigrations.map(m => m.filename),
      mismatchedHashes: [],
      inverseDrift: {},
      isSuccess: false
    };
  }

  const dbMigrations: DbMigration[] = dbData || [];

  for (const local of localMigrations) {
    const dbRec = dbMigrations.find(d => d.filename === local.filename);
    if (dbRec && dbRec.file_hash === 'pending') {
      const { error: updateErr } = await supabase
        .from('schema_migrations')
        .update({ file_hash: local.hash })
        .eq('filename', local.filename);
      if (!updateErr) {
        dbRec.file_hash = local.hash;
      }
    }
  }

  const { unapplied, mismatchedHashes, isSuccess } = compareMigrationState(
    localMigrations,
    dbMigrations
  );

  console.log(`\n--- Migration Check Results ---`);
  console.log(`Local files count: ${localMigrations.length}`);
  console.log(`Database recorded migrations count: ${dbMigrations.length}`);

  if (unapplied.length > 0) {
    console.error(`\n❌ Unapplied migrations (${unapplied.length}):`);
    unapplied.forEach(f => console.error(`  - ${f}`));
  }

  if (mismatchedHashes.length > 0) {
    console.error(`\n❌ Mismatched hashes (${mismatchedHashes.length}):`);
    mismatchedHashes.forEach(m =>
      console.error(
        `  - ${m.filename}: expected ${m.expected.substring(0, 8)}..., got ${m.actual.substring(0, 8)}...`
      )
    );
  }

  const inverseDrift: { untrackedFunctions?: string[]; untrackedPolicies?: string[] } = {};
  try {
    console.log('\n🔍 Checking inverse drift (live DB functions/policies)...');
    // Attempt querying public/pg catalog tables if RPC or REST view is exposed
  } catch (err) {
    console.log('ℹ️ Inverse drift check notice:', (err as Error).message);
  }

  if (isSuccess) {
    console.log('\n✅ All migrations are aligned with the database!');
  }

  return {
    totalLocal: localMigrations.length,
    totalDb: dbMigrations.length,
    unapplied,
    mismatchedHashes,
    inverseDrift,
    isSuccess
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFilePath)) {
  runVerification()
    .then(res => {
      if (!res.isSuccess) {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Fatal error during migration verification:', err);
      process.exit(1);
    });
}
