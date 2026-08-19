import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildServiceAccountAssertion } from './push-notifications.js';

describe('Firebase service account assertion', () => {
  it('creates a bounded RS256 JWT for the messaging scope', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const assertion = buildServiceAccountAssertion({
      project_id: 'boltbytes-test',
      client_email: 'worker@boltbytes-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    }, 1_700_000_000);
    const parts = assertion.split('.');
    expect(parts).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    expect(claims.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(claims.exp - claims.iat).toBe(3600);
  });
});
