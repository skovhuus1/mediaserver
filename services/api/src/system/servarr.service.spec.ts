import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeServarrUrl, parseProvider, ServarrService } from './servarr.service';

describe('Servarr integration', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('normalizes base URLs without allowing embedded credentials', () => { expect(normalizeServarrUrl('http://sonarr:8989/')).toBe('http://sonarr:8989'); expect(() => normalizeServarrUrl('http://user:secret@sonarr:8989')).toThrow(BadRequestException); expect(parseProvider('radarr')).toBe('radarr'); expect(() => parseProvider('lidarr')).toThrow(BadRequestException); });
  it('never exposes stored secrets in the overview', async () => { process.env.ENCRYPTION_KEY = `base64:${Buffer.alloc(32, 7).toString('base64')}`; const prisma = { systemSetting: { findUnique: vi.fn().mockResolvedValue(null) }, library: { findMany: vi.fn().mockResolvedValue([]) } }; const service = new ServarrService(prisma as never); const result = await service.overview({ accountId: 'account', sub: 'user', roles: ['admin'] } as never); expect(result.connections).toHaveLength(2); expect(JSON.stringify(result)).not.toContain('apiKey'); expect(JSON.stringify(result)).not.toContain('webhookSecret'); });
  it('rejects a provider response with invalid JSON', async () => { process.env.ENCRYPTION_KEY = `base64:${Buffer.alloc(32, 8).toString('base64')}`; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))); const prisma = { systemSetting: { findUnique: vi.fn().mockResolvedValue(null) } }; const service = new ServarrService(prisma as never); await expect(service.test({ accountId: 'a' } as never, 'sonarr', { url: 'http://sonarr:8989', apiKey: '12345678' })).rejects.toMatchObject({ response: { code: 'servarr_response_invalid' } }); });
});
