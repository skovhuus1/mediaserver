import { describe, expect, it } from 'vitest';
import { sanitizeCrashContext } from './client-services.service';

describe('client crash sanitization', () => {
  it('redacts credentials and bearer tokens before persistence', () => {
    expect(
      sanitizeCrashContext({
        authorization: 'Bearer secret',
        url: 'https://media.test/file?token=secret-value&part=1',
        nested: { password: 'hidden', value: true },
      }),
    ).toEqual({
      authorization: '[redacted]',
      url: 'https://media.test/file?token=[redacted]&part=1',
      nested: { password: '[redacted]', value: true },
    });
  });
});
