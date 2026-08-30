import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TranscodeStreamService } from './transcode-stream.service';

const generation = '33333333-3333-4333-8333-333333333333';

describe('HLS stream generations', () => {
  it('returns and persists a unique generation when a stream job is queued', async () => {
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const service = new TranscodeStreamService({ systemJob: { create } } as never);

    const createdGeneration = await service.enqueue('session-1', 'account-1', {
      streamMode: 'transcode',
      maxVideoResolution: 1080,
      maxVideoBitrate: 8_000,
      preserveHdr: false,
      adaptiveQuality: {
        mode: 'auto',
        effectiveMaxHeight: 1080,
        effectiveMaxBitrate: 8_000_000,
        estimatedBandwidth: null,
        renditions: [],
      },
      hdrMode: 'auto',
      startupPolicy: 'baseline_first',
      startPositionMs: 1_200_000,
    });

    expect(createdGeneration).toMatch(/^[0-9a-f-]{36}$/);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: createdGeneration,
        payload: expect.objectContaining({
          generationId: createdGeneration,
          startPositionMs: 1_200_000,
          startupPolicy: 'baseline_first',
        }),
      }),
    });
  });

  it('does not report a stale legacy playlist as ready for a new forward-seek generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'boltbytes-hls-generation-'));
    try {
      const legacyRoot = join(root, 'session-1');
      await mkdir(legacyRoot, { recursive: true });
      await writeFile(join(legacyRoot, 'master.m3u8'), '#EXTM3U\nstream.m3u8\n');
      await writeFile(
        join(legacyRoot, 'stream.m3u8'),
        '#EXTM3U\nsegment00000.ts\nsegment00001.ts\nsegment00002.ts\n',
      );
      await Promise.all([0, 1, 2].map((index) => writeFile(
        join(legacyRoot, `segment${String(index).padStart(5, '0')}.ts`),
        '',
      )));

      const prisma = {
        systemJob: {
          findFirst: vi.fn().mockResolvedValue({
            id: generation,
            accountId: 'account-1',
            status: 'queued',
            payload: { sessionId: 'session-1', generationId: generation, streamMode: 'transcode' },
            attempts: [],
          }),
        },
      };
      const service = new TranscodeStreamService(prisma as never);
      Object.defineProperty(service, 'transcodeRoot', { value: root });
      Object.defineProperty(service, 'validSession', {
        value: vi.fn().mockResolvedValue({ id: 'session-1', accountId: 'account-1', method: 'transcode' }),
      });

      await expect(service.status('session-1', 'token', generation)).resolves.toEqual({
        state: 'queued',
        message: 'Waiting for an HLS worker',
        readySegments: 0,
        requiredSegments: 3,
        producerLeadMs: 0,
        startupPolicy: 'stable',
        startupVariantIndex: 0,
        readyVariants: 0,
        variantCount: 0,
        allVariantsReady: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('starts baseline-first playback after a safe lowest-rendition lead', async () => {
    const root = await mkdtemp(join(tmpdir(), 'boltbytes-hls-baseline-'));
    try {
      const generationRoot = join(root, 'session-1', generation);
      await mkdir(generationRoot, { recursive: true });
      await writeFile(join(generationRoot, 'master.m3u8'), '#EXTM3U\nstream_0.m3u8\nstream_1.m3u8\n');
      await writeFile(
        join(generationRoot, 'stream_0.m3u8'),
        '#EXTM3U\nsegment_0_00000.ts\nsegment_0_00001.ts\nsegment_0_00002.ts\n',
      );
      await Promise.all([0, 1, 2].map((index) => writeFile(
        join(generationRoot, `segment_0_${String(index).padStart(5, '0')}.ts`),
        'baseline',
      )));

      const prisma = {
        systemJob: {
          findFirst: vi.fn().mockResolvedValue({
            id: generation,
            accountId: 'account-1',
            status: 'running',
            payload: {
              sessionId: 'session-1',
              generationId: generation,
              streamMode: 'transcode',
              startupPolicy: 'baseline_first',
            },
            attempts: [],
          }),
        },
      };
      const service = new TranscodeStreamService(prisma as never);
      Object.defineProperty(service, 'transcodeRoot', { value: root });
      Object.defineProperty(service, 'validSession', {
        value: vi.fn().mockResolvedValue({ id: 'session-1', accountId: 'account-1', method: 'transcode' }),
      });

      await expect(service.status('session-1', 'token', generation)).resolves.toEqual({
        state: 'ready',
        message: 'Transcoded HLS is ready',
        readySegments: 3,
        requiredSegments: 3,
        producerLeadMs: 6_000,
        startupPolicy: 'baseline_first',
        startupVariantIndex: 0,
        readyVariants: 1,
        variantCount: 2,
        allVariantsReady: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
