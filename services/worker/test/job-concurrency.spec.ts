import { describe, expect, it } from 'vitest';
import { claimableWorkerJobTypes, resolveWorkerConcurrency } from '../src/job-concurrency.js';

describe('worker job concurrency', () => {
  it('applies safe defaults and clamps configured capacity', () => {
    expect(resolveWorkerConcurrency({})).toEqual({
      scans: 2,
      metadata: 2,
      playbackAssets: 2,
      maintenance: 1,
      transcodes: 1,
    });
    expect(resolveWorkerConcurrency({
      scanMaxConcurrent: '99',
      metadataMaxConcurrent: '0',
      playbackAssetMaxConcurrent: '3',
      transcodeMaxConcurrent: '4',
    })).toEqual({
      scans: 8,
      metadata: 1,
      playbackAssets: 3,
      maintenance: 1,
      transcodes: 4,
    });
  });

  it('keeps scan, metadata, and maintenance capacity independent', () => {
    const limits = resolveWorkerConcurrency({
      scanMaxConcurrent: '2',
      metadataMaxConcurrent: '2',
    });

    expect(claimableWorkerJobTypes({
      workerMode: 'jobs',
      activeJobTypes: ['library.scan', 'library.scan', 'media.metadata'],
      limits,
    })).toEqual(['media.metadata', 'media.playback-assets', 'playback.expire-leases']);

    expect(claimableWorkerJobTypes({
      workerMode: 'jobs',
      activeJobTypes: ['media.metadata', 'media.metadata', 'playback.expire-leases'],
      limits,
    })).toEqual(['library.scan', 'media.playback-assets']);
  });

  it('isolates transcode workers from catalog jobs', () => {
    const limits = resolveWorkerConcurrency({ transcodeMaxConcurrent: '2' });
    expect(claimableWorkerJobTypes({
      workerMode: 'transcode',
      activeJobTypes: ['library.scan', 'playback.transcode'],
      limits,
    })).toEqual(['playback.transcode']);
    expect(claimableWorkerJobTypes({
      workerMode: 'transcode',
      activeJobTypes: ['playback.transcode', 'playback.transcode'],
      limits,
    })).toEqual([]);
  });
});
