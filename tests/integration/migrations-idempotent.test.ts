import { describe, it, expect } from 'vitest';
import { isDbAvailable, applyAllMigrations } from './setup';

describe('Migrations Idempotency Integration Test', () => {
  it('applies all migrations in sql/migrations/*.sql a second time without throwing errors', async () => {
    if (!isDbAvailable) return;
    const appliedFiles = await applyAllMigrations();

    expect(appliedFiles).not.toBeNull();
    expect(appliedFiles.length).toBeGreaterThan(0);
  });
});
