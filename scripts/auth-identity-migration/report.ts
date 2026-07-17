import type { MigrationBlocker, MigrationPlan, MigrationRecord } from './core.ts';

export type MigrationMode = 'dry-run' | 'apply' | 'verify' | 'rollback';

export interface RecordOutcome {
  record: MigrationRecord;
  status: string;
}

async function fingerprint(value: string, salt: Uint8Array): Promise<string> {
  const valueBytes = new TextEncoder().encode(value);
  const bytes = new Uint8Array(salt.byteLength + valueBytes.byteLength);
  bytes.set(salt);
  bytes.set(valueBytes, salt.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function redactBlocker(
  blocker: MigrationBlocker,
  salt: Uint8Array
): Promise<Record<string, string>> {
  return {
    code: blocker.code,
    subject_ref: await fingerprint(blocker.subject, salt)
  };
}

async function redactRecord(
  record: MigrationRecord,
  salt: Uint8Array,
  status?: string
): Promise<Record<string, string | boolean | null>> {
  return {
    identity_ref: await fingerprint(`${record.authUserId}:${record.userId}`, salt),
    state: record.state,
    role: record.role,
    is_active: record.isActive,
    ...(status ? { status } : {})
  };
}

export async function createRedactedReport(
  mode: MigrationMode,
  projectRef: string,
  plan: MigrationPlan,
  outcomes: readonly RecordOutcome[] = [],
  generatedAt = new Date().toISOString()
): Promise<Record<string, unknown>> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const outcomeById = new Map(
    outcomes.map(outcome => [
      `${outcome.record.authUserId}:${outcome.record.userId}`,
      outcome.status
    ])
  );
  return {
    format: 'neofuel-auth-identity-migration-report',
    version: 1,
    generated_at: generatedAt,
    mode,
    project_ref: await fingerprint(projectRef, salt),
    record_count: plan.records.length,
    blocker_count: plan.blockers.length,
    blockers: await Promise.all(plan.blockers.map(blocker => redactBlocker(blocker, salt))),
    records: await Promise.all(
      plan.records.map(record =>
        redactRecord(record, salt, outcomeById.get(`${record.authUserId}:${record.userId}`))
      )
    )
  };
}

export async function createFailureReport(
  mode: MigrationMode,
  projectRef: string | null,
  error: unknown,
  generatedAt = new Date().toISOString()
): Promise<Record<string, unknown>> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    format: 'neofuel-auth-identity-migration-report',
    version: 1,
    generated_at: generatedAt,
    mode,
    project_ref: projectRef ? await fingerprint(projectRef, salt) : null,
    status: 'failed',
    error_type: error instanceof Error ? error.name : 'UnknownError',
    error_code:
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : 'operation_failed'
  };
}
