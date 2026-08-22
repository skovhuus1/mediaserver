import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

type EncryptedValue = {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
};

export function encryptSecret(value: string, configuredKey = process.env.ENCRYPTION_KEY): EncryptedValue {
  if (!configuredKey?.startsWith('base64:')) throw new Error('ENCRYPTION_KEY is not configured');
  const key = Buffer.from(configuredKey.slice(7), 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must contain exactly 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export function decryptSecret(value: unknown, configuredKey = process.env.ENCRYPTION_KEY): string {
  if (!isEncryptedValue(value)) throw new Error('encrypted_setting_invalid');
  if (!configuredKey?.startsWith('base64:')) throw new Error('ENCRYPTION_KEY is not configured');
  const key = Buffer.from(configuredKey.slice(7), 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must contain exactly 32 bytes');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function isEncryptedValue(value: unknown): value is EncryptedValue {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EncryptedValue>;
  return candidate.version === 1
    && candidate.algorithm === 'aes-256-gcm'
    && typeof candidate.iv === 'string'
    && typeof candidate.tag === 'string'
    && typeof candidate.ciphertext === 'string';
}
