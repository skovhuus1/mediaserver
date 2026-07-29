import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'cast.v1';

type CastTokenPayload = {
  v: 1;
  sid: string;
  token: string;
  iat: number;
  exp: number;
};

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(`boltbytes-media-cast-v1.${payload}`)
    .digest();
}

export function createCastStreamToken(
  sessionId: string,
  streamToken: string,
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): { token: string; expiresAt: Date } {
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    sid: sessionId,
    token: streamToken,
    iat: issuedAt,
    exp: expiresAt,
  } satisfies CastTokenPayload)).toString('base64url');
  const signed = signature(payload, secret).toString('base64url');
  return {
    token: `${PREFIX}.${payload}.${signed}`,
    expiresAt: new Date(expiresAt * 1000),
  };
}

export function resolveStreamToken(
  sessionId: string,
  suppliedToken: string,
  secret: string,
  nowMs = Date.now(),
): string | null {
  if (!suppliedToken.startsWith(`${PREFIX}.`)) return suppliedToken;
  const parts = suppliedToken.split('.');
  if (parts.length !== 4 || parts[0] !== 'cast' || parts[1] !== 'v1') return null;

  try {
    const payloadPart = parts[2]!;
    const suppliedSignature = Buffer.from(parts[3]!, 'base64url');
    const expectedSignature = signature(payloadPart, secret);
    if (
      suppliedSignature.length !== expectedSignature.length
      || !timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Partial<CastTokenPayload>;
    const now = Math.floor(nowMs / 1000);
    if (
      payload.v !== 1
      || payload.sid !== sessionId
      || typeof payload.token !== 'string'
      || payload.token.length < 32
      || typeof payload.iat !== 'number'
      || typeof payload.exp !== 'number'
      || payload.iat > now + 60
      || payload.exp <= now
    ) {
      return null;
    }
    return payload.token;
  } catch {
    return null;
  }
}
