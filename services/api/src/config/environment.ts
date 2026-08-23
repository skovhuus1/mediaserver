export type Environment = {
  nodeEnv: string;
  apiPort: number;
  databaseUrl: string;
  redisUrl: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlDays: number;
  castTokenTtlSeconds: number;
  encryptionKey: string;
  sessionLeaseSeconds: number;
  mediaMountPath: string;
  mediaHostPath: string;
};

export function publicUrlOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function readCorsOrigins(rawCorsOrigin: string | undefined, publicUrl: string | undefined): string[] {
  const configured = rawCorsOrigin ?? 'http://localhost:5555';
  const origins = configured
    .split(',')
    .map((origin) => normalizeCorsOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
  const publicOrigin = publicUrlOrigin(publicUrl);
  if (publicOrigin) origins.push(publicOrigin);
  return [...new Set(origins)];
}

export function corsAllowsPublicUrl(corsOrigins: string[], publicUrl: string | null | undefined): boolean {
  const origin = publicUrlOrigin(publicUrl);
  return Boolean(origin && (corsOrigins.includes(origin) || corsOrigins.includes('*')));
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function readEnvironment(): Environment {
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 64) throw new Error('JWT_SECRET must contain at least 64 characters');

  const encryptionKey = required('ENCRYPTION_KEY');
  if (!encryptionKey.startsWith('base64:') || Buffer.from(encryptionKey.slice(7), 'base64').length !== 32) {
    throw new Error('ENCRYPTION_KEY must be base64: followed by exactly 32 decoded bytes');
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    apiPort: boundedInteger('API_PORT', 3001, 1, 65535),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    corsOrigins: readCorsOrigins(process.env.CORS_ORIGIN, process.env.BB_MEDIA_PUBLIC_URL),
    jwtSecret,
    jwtAccessTtlSeconds: boundedInteger('JWT_ACCESS_TTL_SECONDS', 900, 60, 86400),
    jwtRefreshTtlDays: boundedInteger('JWT_REFRESH_TTL_DAYS', 30, 1, 365),
    castTokenTtlSeconds: boundedInteger('CAST_TOKEN_TTL_SECONDS', 21_600, 300, 86_400),
    encryptionKey,
    sessionLeaseSeconds: boundedInteger('SESSION_LEASE_SECONDS', 90, 15, 300),
    mediaMountPath: process.env.MEDIA_MOUNT_PATH?.trim() || process.env.MEDIA_PATH?.trim() || '/media',
    mediaHostPath: process.env.MEDIA_PATH?.trim() || '/media',
  };
}

function normalizeCorsOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === '*') return trimmed;
  return publicUrlOrigin(trimmed) ?? trimmed.replace(/\/+$/u, '');
}
