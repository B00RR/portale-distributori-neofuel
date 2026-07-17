import type { MigrationRecord } from './core.ts';

const SNAPSHOT_AAD = 'neofuel-auth-identity-migration-snapshot-v1';
const SNAPSHOT_FORMAT = 'neofuel-auth-identity-migration';
const SNAPSHOT_VERSION = 1;

export interface AuthIdentitySnapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;
  projectRef: string;
  profileCount: number;
  authIdentityCount: number;
  records: MigrationRecord[];
}

export interface EncryptedSnapshotEnvelope {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  algorithm: 'AES-256-GCM';
  createdAt: string;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    throw new Error('invalid_snapshot_encoding');
  }
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function parseSnapshot(value: unknown): AuthIdentitySnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid_snapshot');
  }
  const candidate = value as Partial<AuthIdentitySnapshot>;
  if (
    candidate.format !== SNAPSHOT_FORMAT ||
    candidate.version !== SNAPSHOT_VERSION ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.projectRef !== 'string' ||
    !Number.isSafeInteger(candidate.profileCount) ||
    !Number.isSafeInteger(candidate.authIdentityCount) ||
    !Array.isArray(candidate.records)
  ) {
    throw new Error('invalid_snapshot');
  }

  for (const record of candidate.records) {
    if (
      !record ||
      typeof record !== 'object' ||
      typeof record.authUserId !== 'string' ||
      !Number.isSafeInteger(record.userId) ||
      typeof record.username !== 'string' ||
      typeof record.role !== 'string' ||
      (typeof record.isActive !== 'boolean' && record.isActive !== null) ||
      (typeof record.emailConfirmedAt !== 'string' && record.emailConfirmedAt !== null) ||
      typeof record.expectedAlias !== 'string' ||
      typeof record.previousAuthEmail !== 'string' ||
      typeof record.previousProfileEmail !== 'string' ||
      !['legacy', 'auth_aligned', 'profile_aligned', 'aligned'].includes(record.state)
    ) {
      throw new Error('invalid_snapshot_record');
    }
  }

  return candidate as AuthIdentitySnapshot;
}

function parseEnvelope(serialized: string): EncryptedSnapshotEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('invalid_snapshot_envelope');
  }
  if (!value || typeof value !== 'object') {
    throw new Error('invalid_snapshot_envelope');
  }
  const candidate = value as Partial<EncryptedSnapshotEnvelope>;
  if (
    candidate.format !== SNAPSHOT_FORMAT ||
    candidate.version !== SNAPSHOT_VERSION ||
    candidate.algorithm !== 'AES-256-GCM' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.iv !== 'string' ||
    typeof candidate.ciphertext !== 'string'
  ) {
    throw new Error('invalid_snapshot_envelope');
  }
  return candidate as EncryptedSnapshotEnvelope;
}

export function createSnapshot(
  projectRef: string,
  profileCount: number,
  authIdentityCount: number,
  records: readonly MigrationRecord[],
  createdAt = new Date().toISOString()
): AuthIdentitySnapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    createdAt,
    projectRef,
    profileCount,
    authIdentityCount,
    records: records.map(record => ({ ...record }))
  };
}

export function decodeSnapshotKey(base64Key: string): Uint8Array {
  const key = base64ToBytes(base64Key);
  if (key.byteLength !== 32) {
    throw new Error('snapshot_key_must_be_32_bytes');
  }
  return key;
}

export async function encryptSnapshot(
  snapshot: AuthIdentitySnapshot,
  keyBytes: Uint8Array
): Promise<string> {
  if (keyBytes.byteLength !== 32) {
    throw new Error('snapshot_key_must_be_32_bytes');
  }
  const key = await crypto.subtle.importKey('raw', asArrayBuffer(keyBytes), 'AES-GCM', false, [
    'encrypt'
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const additionalData = new TextEncoder().encode(SNAPSHOT_AAD);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(additionalData)
    },
    key,
    asArrayBuffer(plaintext)
  );
  const envelope: EncryptedSnapshotEnvelope = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    algorithm: 'AES-256-GCM',
    createdAt: snapshot.createdAt,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptSnapshot(
  serialized: string,
  keyBytes: Uint8Array
): Promise<AuthIdentitySnapshot> {
  if (keyBytes.byteLength !== 32) {
    throw new Error('snapshot_key_must_be_32_bytes');
  }
  const envelope = parseEnvelope(serialized);
  const key = await crypto.subtle.importKey('raw', asArrayBuffer(keyBytes), 'AES-GCM', false, [
    'decrypt'
  ]);
  const additionalData = new TextEncoder().encode(SNAPSHOT_AAD);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asArrayBuffer(base64ToBytes(envelope.iv)),
        additionalData: asArrayBuffer(additionalData)
      },
      key,
      asArrayBuffer(base64ToBytes(envelope.ciphertext))
    );
  } catch {
    throw new Error('snapshot_authentication_failed');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('invalid_snapshot');
  }
  return parseSnapshot(decoded);
}
