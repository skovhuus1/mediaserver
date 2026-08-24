export type WorkerMode = 'jobs' | 'transcode';

export type WorkerJobType =
  | 'library.scan'
  | 'media.metadata'
  | 'media.playback-assets'
  | 'playback.expire-leases'
  | 'playback.transcode'
  | 'offline.prepare'
  | 'notification.push'
  | 'live-tv.import'
  | 'live-tv.epg'
  | 'live-tv.channel-visibility'
  | 'live-tv.stream'
  | 'live-tv.record';

export type WorkerConcurrencyLimits = {
  scans: number;
  metadata: number;
  playbackAssets: number;
  maintenance: number;
  transcodes: number;
  notifications: number;
};

function parseLimit(raw: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  return Math.max(1, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
}

export function resolveWorkerConcurrency(input: {
  scanMaxConcurrent?: string | undefined;
  metadataMaxConcurrent?: string | undefined;
  playbackAssetMaxConcurrent?: string | undefined;
  transcodeMaxConcurrent?: string | undefined;
  notificationMaxConcurrent?: string | undefined;
}): WorkerConcurrencyLimits {
  return {
    scans: parseLimit(input.scanMaxConcurrent, 2, 8),
    metadata: parseLimit(input.metadataMaxConcurrent, 2, 8),
    playbackAssets: parseLimit(input.playbackAssetMaxConcurrent, 2, 8),
    maintenance: 1,
    transcodes: parseLimit(input.transcodeMaxConcurrent, 1, 16),
    notifications: parseLimit(input.notificationMaxConcurrent, 4, 32),
  };
}

export function claimableWorkerJobTypes(input: {
  workerMode: WorkerMode;
  activeJobTypes: readonly string[];
  limits: WorkerConcurrencyLimits;
}): WorkerJobType[] {
  const activeCount = (type: WorkerJobType) => input.activeJobTypes.filter(
    (activeType) => activeType === type,
  ).length;

  if (input.workerMode === 'transcode') {
    const activeTranscodes = activeCount('playback.transcode') + activeCount('offline.prepare') + activeCount('live-tv.stream') + activeCount('live-tv.record');
    return activeTranscodes < input.limits.transcodes
      ? ['playback.transcode', 'offline.prepare', 'live-tv.stream', 'live-tv.record']
      : [];
  }

  const claimable: WorkerJobType[] = [];
  if (activeCount('library.scan') < input.limits.scans) claimable.push('library.scan');
  if (activeCount('media.metadata') < input.limits.metadata) claimable.push('media.metadata');
  if (activeCount('media.playback-assets') < input.limits.playbackAssets) claimable.push('media.playback-assets');
  if (activeCount('playback.expire-leases') < input.limits.maintenance) {
    claimable.push('playback.expire-leases');
  }
  if (activeCount('notification.push') < input.limits.notifications) {
    claimable.push('notification.push');
  }
  if (activeCount('live-tv.import') < 1) claimable.push('live-tv.import');
  if (activeCount('live-tv.epg') < 1) claimable.push('live-tv.epg');
  if (activeCount('live-tv.channel-visibility') < 1) claimable.push('live-tv.channel-visibility');
  return claimable;
}
