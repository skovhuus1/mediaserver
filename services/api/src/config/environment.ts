export type Environment = {
  nodeEnv: string;
  apiPort: number;
  databaseUrl: string;
  redisUrl: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlDays: number;
  encryptionKey: string;
  sessionLeaseSeconds: number;
};

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
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5555')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    jwtSecret,
    jwtAccessTtlSeconds: boundedInteger('JWT_ACCESS_TTL_SECONDS', 900, 60, 86400),
    jwtRefreshTtlDays: boundedInteger('JWT_REFRESH_TTL_DAYS', 30, 1, 365),
    encryptionKey,
    sessionLeaseSeconds: boundedInteger('SESSION_LEASE_SECONDS', 90, 15, 300),
  };
}
