import { join } from 'node:path';

import {
  assertArtifactDoesNotExist,
  assertDistinctArtifactPaths,
  requiresChangeWindowPreflight,
  resolveExternalArtifactPath
} from './cli.ts';

function localPath(url: URL): string {
  const decoded = decodeURIComponent(url.pathname);
  return Deno.build.os === 'windows' && /^\/[a-zA-Z]:\//.test(decoded) ? decoded.slice(1) : decoded;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function expectCode(
  operation: () => unknown | Promise<unknown>,
  code: string
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error && error.message === code) return;
    throw error;
  }
  throw new Error(`expected_${code}`);
}

Deno.test('artifact paths are canonical, outside the repository and distinct', async () => {
  const temporaryDirectory = await Deno.makeTempDir({
    prefix: 'issue-305-path-test-'
  });
  try {
    const canonical = await resolveExternalArtifactPath(
      join(temporaryDirectory, '.', 'snapshot.enc.json'),
      'AUTH_IDENTITY_SNAPSHOT_PATH'
    );
    assert(canonical === join(temporaryDirectory, 'snapshot.enc.json'), 'path_not_canonical');

    const existingReport = join(temporaryDirectory, 'existing-report.json');
    await Deno.writeTextFile(existingReport, '{}');
    await expectCode(
      () => assertArtifactDoesNotExist(existingReport, 'report_path_must_not_exist'),
      'report_path_must_not_exist'
    );
    await assertArtifactDoesNotExist(
      join(temporaryDirectory, 'new-report.json'),
      'report_path_must_not_exist'
    );

    await expectCode(
      () =>
        resolveExternalArtifactPath(
          localPath(new URL('../../package.json', import.meta.url)),
          'AUTH_IDENTITY_SNAPSHOT_PATH'
        ),
      'auth_identity_snapshot_path_must_be_outside_repository'
    );

    await expectCode(
      () =>
        assertDistinctArtifactPaths(canonical, join(temporaryDirectory, '.', 'snapshot.enc.json')),
      'artifact_paths_must_be_distinct'
    );
  } finally {
    await Deno.remove(temporaryDirectory, { recursive: true });
  }
});

Deno.test('rollback remains available without ancillary change-window preflights', () => {
  assert(requiresChangeWindowPreflight('dry-run'), 'dry_run_preflight_required');
  assert(requiresChangeWindowPreflight('apply'), 'apply_preflight_required');
  assert(requiresChangeWindowPreflight('verify'), 'verify_preflight_required');
  assert(!requiresChangeWindowPreflight('rollback'), 'rollback_preflight_must_be_bypassed');
});
