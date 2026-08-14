import { describe, expect, it } from 'vitest';
import { resolveTranscoderStatus } from './transcoder-status';

describe('resolveTranscoderStatus', () => {
  const now = new Date('2026-08-12T10:00:00.000Z');

  it('reports a fresh NVENC worker with queue and GPU telemetry', () => {
    expect(resolveTranscoderStatus({
      state: 'transcoding',
      backend: 'nvenc',
      encoder: 'h264_nvenc',
      sessionId: 'session-1',
      updatedAt: '2026-08-12T09:59:45.000Z',
      maxConcurrent: 2,
      capabilities: { h264: true, hevc: true, gpuName: 'NVIDIA T400' },
      telemetry: {
        utilizationPercent: 42,
        memoryUsedMiB: 900,
        memoryTotalMiB: 4096,
        temperatureCelsius: 58,
      },
      cpuProfile: {
        preset: 'veryfast',
        totalThreads: 7,
        filterThreads: 1,
        threadsPerRendition: 2,
        maxHeight: 1080,
        maxRenditions: 3,
      },
    }, { running: 1, queued: 3 }, now)).toMatchObject({
      state: 'transcoding',
      available: true,
      stale: false,
      backend: 'nvenc',
      encoder: 'h264_nvenc',
      gpuName: 'NVIDIA T400',
      h264Nvenc: true,
      hevcNvenc: true,
      maxConcurrent: 2,
      running: 1,
      queued: 3,
      sessionId: 'session-1',
      cpuProfile: { preset: 'veryfast', totalThreads: 7, maxHeight: 1080, maxRenditions: 3 },
    });
  });

  it('marks an expired heartbeat offline without hiding durable queue load', () => {
    expect(resolveTranscoderStatus({
      state: 'idle',
      backend: 'software',
      updatedAt: '2026-08-12T09:58:00.000Z',
    }, { running: 0, queued: 4 }, now)).toMatchObject({
      state: 'offline',
      available: false,
      stale: true,
      queued: 4,
    });
  });

  it('treats malformed persisted status as an offline software-neutral default', () => {
    expect(resolveTranscoderStatus('invalid', { running: 0, queued: 0 }, now)).toEqual({
      state: 'offline',
      available: false,
      stale: true,
      backend: null,
      encoder: null,
      gpuName: null,
      h264Nvenc: false,
      hevcNvenc: false,
      telemetry: null,
      cpuProfile: null,
      maxConcurrent: 1,
      running: 0,
      queued: 0,
      sessionId: null,
      updatedAt: null,
      lastError: null,
    });
  });
});
