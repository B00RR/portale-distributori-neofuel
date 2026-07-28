import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { isDbAvailable, pool, getServiceRoleClient } from './setup';

describe('Ephemeral Storage Integration Tests (#318)', () => {
  const testUuid = crypto.randomUUID();
  const testPrefix = `__issue318_verification/${testUuid}`;
  const validPath = `${testPrefix}/test_valid.jpg`;
  const invalidMimePath = `${testPrefix}/test_invalid_mime.txt`;
  const oversizePath = `${testPrefix}/test_too_large.jpg`;

  const cleanupStorageObjects = async () => {
    if (!isDbAvailable) return;
    try {
      const client = getServiceRoleClient();
      await client.storage.from('voucher-photo').remove([validPath, invalidMimePath, oversizePath]);
    } catch {
      // Ignore errors during cleanup attempt
    }
  };

  afterEach(async () => {
    await cleanupStorageObjects();
  });

  it('1. verifies DB schema has exact file_size_limit and allowed_mime_types for target buckets post-migration', async () => {
    if (!isDbAvailable) return;

    const result = await pool.query<{
      id: string;
      file_size_limit: string | number | null;
      allowed_mime_types: string[] | null;
    }>(`
      SELECT id, file_size_limit, allowed_mime_types
      FROM storage.buckets
      WHERE id IN ('system', 'voucher-photo', 'fattura-uploads')
      ORDER BY id;
    `);

    const bucketsMap = new Map(result.rows.map(r => [r.id, r]));

    // system: 1 MB (1048576 bytes), application/json
    const systemBucket = bucketsMap.get('system');
    expect(systemBucket).toBeDefined();
    expect(Number(systemBucket!.file_size_limit)).toBe(1048576);
    expect(systemBucket!.allowed_mime_types).toEqual(['application/json']);

    // voucher-photo: 5 MB (5242880 bytes), image MIMEs
    const voucherPhotoBucket = bucketsMap.get('voucher-photo');
    expect(voucherPhotoBucket).toBeDefined();
    expect(Number(voucherPhotoBucket!.file_size_limit)).toBe(5242880);
    expect(voucherPhotoBucket!.allowed_mime_types).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]);

    // fattura-uploads: 10 MB (10485760 bytes), pdf + image MIMEs
    const fatturaUploadsBucket = bucketsMap.get('fattura-uploads');
    expect(fatturaUploadsBucket).toBeDefined();
    expect(Number(fatturaUploadsBucket!.file_size_limit)).toBe(10485760);
    expect(fatturaUploadsBucket!.allowed_mime_types).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]);
  });

  it('2. exercises Storage API locale with getServiceRoleClient() to verify mime and size limit enforcement on voucher-photo', async () => {
    if (!isDbAvailable) return;

    const client = getServiceRoleClient();

    // Check if Storage API HTTP endpoint is reachable
    let isStorageApiReachable = true;
    try {
      const { error: healthError } = await client.storage.from('voucher-photo').list(testPrefix);
      if (
        healthError &&
        (healthError.message.includes('fetch failed') ||
          healthError.message.includes('ECONNREFUSED'))
      ) {
        isStorageApiReachable = false;
      }
    } catch {
      isStorageApiReachable = false;
    }

    if (!isStorageApiReachable) {
      if (process.env.CI) {
        throw new Error('Storage API service endpoint not running or unreachable during CI run.');
      }
      console.warn(
        '⚠️ Storage API service endpoint not running locally; skipping live HTTP Storage API upload test.'
      );
      return;
    }

    // A. Small payload with allowed MIME (image/jpeg) MUST succeed
    const smallJpegBuffer = Buffer.from('fake-jpeg-binary-header-data', 'utf-8');
    const { data: validData, error: validError } = await client.storage
      .from('voucher-photo')
      .upload(validPath, smallJpegBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    expect(validError).toBeNull();
    expect(validData).not.toBeNull();
    expect(validData?.path).toContain('test_valid.jpg');

    // B. Small payload with disallowed MIME (text/plain) MUST be rejected
    const smallTextBuffer = Buffer.from('plain-text-payload', 'utf-8');
    const { data: invalidMimeData, error: invalidMimeError } = await client.storage
      .from('voucher-photo')
      .upload(invalidMimePath, smallTextBuffer, {
        contentType: 'text/plain',
        upsert: true
      });

    expect(invalidMimeError).not.toBeNull();
    expect(invalidMimeData).toBeNull();

    // C. Oversize payload (5 * 1024 * 1024 + 1 bytes) with allowed MIME (image/jpeg) MUST be rejected
    const oversizeSize = 5 * 1024 * 1024 + 1;
    const oversizeBuffer = Buffer.alloc(oversizeSize);
    const { data: oversizeData, error: oversizeError } = await client.storage
      .from('voucher-photo')
      .upload(oversizePath, oversizeBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    expect(oversizeError).not.toBeNull();
    expect(oversizeData).toBeNull();

    // 3. Verify via read-only DB query that ONLY the allowed object is present
    const { rows: testObjects } = await pool.query<{ name: string }>(
      `SELECT name FROM storage.objects WHERE bucket_id = 'voucher-photo' AND name LIKE $1`,
      [`${testPrefix}/%`]
    );

    expect(testObjects.length).toBe(1);
    expect(testObjects[0].name).toBe(validPath);

    // 4. Cleanup via Storage API (never direct SQL table delete)
    await cleanupStorageObjects();

    // 5. Verify no test objects remain post-cleanup
    const { rows: remaining } = await pool.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id = 'voucher-photo' AND name LIKE $1`,
      [`${testPrefix}/%`]
    );

    expect(Number(remaining[0].count)).toBe(0);
  });
});
