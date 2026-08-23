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
      notifications: 4,
    });
    expect(resolveWorkerConcurrency({
      scanMaxConcurrent: '99',
      metadataMaxConcurrent: '0',
      playbackAssetMaxConcurrent: '3',
      transcodeMaxConcurrent: '4',
      notificationMaxConcurrent: '99',
    })).toEqual({
      scans: 8,
      metadata: 1,
      playbackAssets: 3,
      maintenance: 1,
      transcodes: 4,
      notifications: 32,
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
    })).toEqual([
      'media.metadata',
      'media.playback-assets',
      'playback.expire-leases',
      'notification.push',
      'live-tv.import',
      'live-tv.epg',
    ]);

    expect(claimableWorkerJobTypes({
      workerMode: 'jobs',
      activeJobTypes: ['media.metadata', 'media.metadata', 'playback.expire-leases'],
      limits,
    })).toEqual(['library.scan', 'media.playback-assets', 'notification.push', 'live-tv.import', 'live-tv.epg']);
  });

  it('isolates transcode workers from catalog jobs', () => {
    const limits = resolveWorkerConcurrency({ transcodeMaxConcurrent: '2' });
    expect(claimableWorkerJobTypes({
      workerMode: 'transcode',
      activeJobTypes: ['library.scan', 'playback.transcode'],
      limits,
    })).toEqual(['playback.transcode', 'offline.prepare', 'live-tv.stream', 'live-tv.record']);
    expect(claimableWorkerJobTypes({
      workerMode: 'transcode',
      activeJobTypes: ['playback.transcode', 'playback.transcode'],
      limits,
    })).toEqual([]);
    expect(claimableWorkerJobTypes({
      workerMode: 'transcode',
      activeJobTypes: ['offline.prepare', 'playback.transcode'],
      limits,
    })).toEqual([]);
    expect(claimableWorkerJobTypes({
      workerMode: 'transcode',
      activeJobTypes: ['live-tv.record', 'live-tv.stream'],
      limits,
    })).toEqual([]);
  });
});
