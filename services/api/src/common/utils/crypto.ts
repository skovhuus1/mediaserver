import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const ALGORITHM = 'aes-256-gcm';

type EncodedValue = {
  iv: string;
  tag: string;
  data: string;
};

export function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new Error('ENCRYPTION_KEY er ikke sat');
  }

  if (raw.startsWith('base64:')) {
    const decoded = Buffer.from(raw.replace('base64:', ''), 'base64');
    if (decoded.length < 32) {
      throw new Error('ENCRYPTION_KEY skal indeholde mindst 32 bytes');
    }
    return decoded.subarray(0, 32);
  }

  const derived = createHash('sha256').update(raw).digest();
  return derived;
}

export function encryptSecret(value: string, keyMaterial: string): string {
  const key = normalizeKey(keyMaterial);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncodedValue = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };

  return JSON.stringify(payload);
}

export function decryptSecret(raw: string | null, keyMaterial: string): string | null {
  if (!raw) {
    return null;
  }

  const key = normalizeKey(keyMaterial);
  try {
    const payload = JSON.parse(raw) as EncodedValue;
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'hex')),
      decipher.final(),
    ]).toString('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

export function isAfterNow(date?: Date | null): boolean {
  if (!date) {
    return false;
  }
  return date.getTime() <= Date.now();
}
