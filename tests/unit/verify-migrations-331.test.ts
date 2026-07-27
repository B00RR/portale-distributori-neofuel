import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  computeFileHash,
  getLocalMigrations,
  compareMigrationState,
  runVerification,
  LocalMigration,
  DbMigration
} from '../../scripts/verify-migrations.js';

describe('verify-migrations (Issue #331)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('computeFileHash', () => {
    it('should compute consistent SHA-256 hash for string content', () => {
      const content = 'SELECT 1;';
      const hash1 = computeFileHash(content);
      const hash2 = computeFileHash(content);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('getLocalMigrations', () => {
    it('should return sorted list of SQL migrations in directory', () => {
      fs.writeFileSync(path.join(tempDir, '20260702_second.sql'), 'SELECT 2;');
      fs.writeFileSync(path.join(tempDir, '20260701_first.sql'), 'SELECT 1;');
      fs.writeFileSync(path.join(tempDir, 'README.txt'), 'Not a migration');

      const migrations = getLocalMigrations(tempDir);

      expect(migrations).toHaveLength(2);
      expect(migrations[0].filename).toBe('20260701_first.sql');
      expect(migrations[1].filename).toBe('20260702_second.sql');
      expect(migrations[0].hash).toBe(computeFileHash('SELECT 1;'));
      expect(migrations[1].hash).toBe(computeFileHash('SELECT 2;'));
    });

    it('should return empty array for non-existent directory', () => {
      const migrations = getLocalMigrations(path.join(tempDir, 'nonexistent'));
      expect(migrations).toEqual([]);
    });
  });

  describe('compareMigrationState', () => {
    const hashA = computeFileHash('SELECT A;');
    const hashB = computeFileHash('SELECT B;');

    const localMigrations: LocalMigration[] = [
      { filename: '001_a.sql', filepath: '/tmp/001_a.sql', hash: hashA },
      { filename: '002_b.sql', filepath: '/tmp/002_b.sql', hash: hashB }
    ];

    it('should return isSuccess true when all local migrations match DB records', () => {
      const dbMigrations: DbMigration[] = [
        { filename: '001_a.sql', file_hash: hashA },
        { filename: '002_b.sql', file_hash: hashB }
      ];

      const result = compareMigrationState(localMigrations, dbMigrations);

      expect(result.isSuccess).toBe(true);
      expect(result.unapplied).toHaveLength(0);
      expect(result.mismatchedHashes).toHaveLength(0);
    });

    it('should flag unapplied migrations', () => {
      const dbMigrations: DbMigration[] = [{ filename: '001_a.sql', file_hash: hashA }];

      const result = compareMigrationState(localMigrations, dbMigrations);

      expect(result.isSuccess).toBe(false);
      expect(result.unapplied).toEqual(['002_b.sql']);
      expect(result.mismatchedHashes).toHaveLength(0);
    });

    it('should flag mismatched migration hashes', () => {
      const dbMigrations: DbMigration[] = [
        { filename: '001_a.sql', file_hash: hashA },
        { filename: '002_b.sql', file_hash: 'different_hash' }
      ];

      const result = compareMigrationState(localMigrations, dbMigrations);

      expect(result.isSuccess).toBe(false);
      expect(result.unapplied).toHaveLength(0);
      expect(result.mismatchedHashes).toEqual([
        {
          filename: '002_b.sql',
          expected: hashB,
          actual: 'different_hash'
        }
      ]);
    });

    it('should handle pending state without flagging mismatch', () => {
      const dbMigrations: DbMigration[] = [
        { filename: '001_a.sql', file_hash: hashA },
        { filename: '002_b.sql', file_hash: 'pending' }
      ];

      const result = compareMigrationState(localMigrations, dbMigrations);

      expect(result.isSuccess).toBe(true);
      expect(result.mismatchedHashes).toHaveLength(0);
    });
  });

  describe('runVerification without DB credentials', () => {
    it('should succeed gracefully when env vars are missing', async () => {
      const origUrl = process.env.SUPABASE_URL;
      const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        const result = await runVerification(tempDir);
        expect(result.isSuccess).toBe(true);
      } finally {
        if (origUrl) process.env.SUPABASE_URL = origUrl;
        if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
      }
    });
  });
});
