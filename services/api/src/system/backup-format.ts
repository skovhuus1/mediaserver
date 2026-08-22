import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { appendFile, open, stat, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

const MAGIC = Buffer.from('BBMEDIA1', 'ascii');
const TAG_BYTES = 16;
const MAX_HEADER_BYTES = 64 * 1024;
const KEY_CONTEXT = Buffer.from('boltbytes-media-backup-v1');

export type BackupHeader = {
  formatVersion: 1;
  cipher: 'AES-256-GCM+HKDF-SHA256';
  createdAt: string;
  schemaVersion: string;
  accountId: string;
  reason: string;
  salt: string;
  iv: string;
};

export async function encryptBackupStream(source: Readable, destination: string, metadata: Omit<BackupHeader, 'formatVersion' | 'cipher' | 'salt' | 'iv'>, configuredKey = process.env.ENCRYPTION_KEY) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header: BackupHeader = { ...metadata, formatVersion: 1, cipher: 'AES-256-GCM+HKDF-SHA256', salt: salt.toString('base64'), iv: iv.toString('base64') };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  if (headerBytes.length > MAX_HEADER_BYTES) throw new Error('backup_header_too_large');
  const prefix = Buffer.alloc(MAGIC.length + 4);
  MAGIC.copy(prefix);
  prefix.writeUInt32BE(headerBytes.length, MAGIC.length);
  await writeFile(destination, Buffer.concat([prefix, headerBytes]), { mode: 0o600 });
  const cipher = createCipheriv('aes-256-gcm', deriveKey(configuredKey, salt), iv);
  cipher.setAAD(headerBytes);
  await pipeline(source, cipher, createWriteStream(destination, { flags: 'a' }));
  await appendFile(destination, cipher.getAuthTag());
  return header;
}

export async function readBackupHeader(path: string): Promise<{ header: BackupHeader; dataOffset: number; size: number }> {
  const file = await open(path, 'r');
  try {
    const prefix = Buffer.alloc(MAGIC.length + 4);
    const prefixRead = await file.read(prefix, 0, prefix.length, 0);
    if (prefixRead.bytesRead !== prefix.length || !prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('backup_format_invalid');
    const headerLength = prefix.readUInt32BE(MAGIC.length);
    if (headerLength < 2 || headerLength > MAX_HEADER_BYTES) throw new Error('backup_header_invalid');
    const headerBytes = Buffer.alloc(headerLength);
    const headerRead = await file.read(headerBytes, 0, headerLength, prefix.length);
    if (headerRead.bytesRead !== headerLength) throw new Error('backup_header_truncated');
    const header = JSON.parse(headerBytes.toString('utf8')) as BackupHeader;
    validateHeader(header);
    const details = await stat(path);
    const dataOffset = prefix.length + headerLength;
    if (details.size <= dataOffset + TAG_BYTES) throw new Error('backup_payload_truncated');
    return { header, dataOffset, size: details.size };
  } finally {
    await file.close();
  }
}

export async function decryptBackupToFile(source: string, destination: string, configuredKey = process.env.ENCRYPTION_KEY) {
  const { header, dataOffset, size } = await readBackupHeader(source);
  const sourceFile = await open(source, 'r');
  const tag = Buffer.alloc(TAG_BYTES);
  try { await sourceFile.read(tag, 0, TAG_BYTES, size - TAG_BYTES); } finally { await sourceFile.close(); }
  const salt = Buffer.from(header.salt, 'base64');
  const iv = Buffer.from(header.iv, 'base64');
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(configuredKey, salt), iv);
  decipher.setAAD(headerBytes);
  decipher.setAuthTag(tag);
  await pipeline(createReadStream(source, { start: dataOffset, end: size - TAG_BYTES - 1 }), decipher, createWriteStream(destination, { mode: 0o600 }));
  return header;
}

function deriveKey(configuredKey: string | undefined, salt: Buffer) {
  if (!configuredKey?.startsWith('base64:')) throw new Error('ENCRYPTION_KEY is not configured');
  const master = Buffer.from(configuredKey.slice(7), 'base64');
  if (master.length !== 32) throw new Error('ENCRYPTION_KEY must contain exactly 32 bytes');
  return Buffer.from(hkdfSync('sha256', master, salt, KEY_CONTEXT, 32));
}

function validateHeader(header: BackupHeader) {
  if (header.formatVersion !== 1 || header.cipher !== 'AES-256-GCM+HKDF-SHA256') throw new Error('backup_version_unsupported');
  if (!header.createdAt || !header.schemaVersion || !header.accountId || !header.reason) throw new Error('backup_header_invalid');
  if (Buffer.from(header.salt, 'base64').length !== 16 || Buffer.from(header.iv, 'base64').length !== 12) throw new Error('backup_crypto_header_invalid');
}
