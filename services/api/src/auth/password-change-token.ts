import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

type PasswordChangePayload = {
  v: 1;
  sub: string;
  accountId: string;
  passwordFingerprint: string;
  iat: number;
  exp: number;
};

const prefix = 'password.v1';
const fingerprint = (passwordHash: string) => createHash('sha256').update(passwordHash).digest('base64url');
const sign = (payload: string, secret: string) => createHmac('sha256', secret)
  .update(`boltbytes-media-password-v1.${payload}`)
  .digest();

export function createPasswordChangeToken(
  userId: string,
  accountId: string,
  passwordHash: string,
  secret: string,
  nowMs = Date.now(),
): string {
  const issuedAt = Math.floor(nowMs / 1000);
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    sub: userId,
    accountId,
    passwordFingerprint: fingerprint(passwordHash),
    iat: issuedAt,
    exp: issuedAt + 600,
  } satisfies PasswordChangePayload)).toString('base64url');
  return `${prefix}.${payload}.${sign(payload, secret).toString('base64url')}`;
}

export function verifyPasswordChangeToken(
  token: string,
  passwordHash: string,
  secret: string,
  nowMs = Date.now(),
): PasswordChangePayload | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'password' || parts[1] !== 'v1') return null;
  try {
    const payloadPart = parts[2]!;
    const supplied = Buffer.from(parts[3]!, 'base64url');
    const expected = sign(payloadPart, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as PasswordChangePayload;
    const now = Math.floor(nowMs / 1000);
    if (
      payload.v !== 1
      || !payload.sub
      || !payload.accountId
      || payload.passwordFingerprint !== fingerprint(passwordHash)
      || payload.iat > now + 60
      || payload.exp <= now
    ) return null;
    return payload;
  } catch {
    return null;
  }
}
