export type WorkerMode = 'jobs' | 'transcode';

export type WorkerJobType =
  | 'library.scan'
  | 'media.metadata'
  | 'playback.expire-leases'
  | 'playback.transcode';

export type WorkerConcurrencyLimits = {
  scans: number;
  metadata: number;
  maintenance: number;
  transcodes: number;
};

function parseLimit(raw: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  return Math.max(1, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
}

export function resolveWorkerConcurrency(input: {
  scanMaxConcurrent?: string | undefined;
  metadataMaxConcurrent?: string | undefined;
  transcodeMaxConcurrent?: string | undefined;
}): WorkerConcurrencyLimits {
  return {
    scans: parseLimit(input.scanMaxConcurrent, 2, 8),
    metadata: parseLimit(input.metadataMaxConcurrent, 2, 8),
    maintenance: 1,
    transcodes: parseLimit(input.transcodeMaxConcurrent, 1, 16),
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
    return activeCount('playback.transcode') < input.limits.transcodes
      ? ['playback.transcode']
      : [];
  }

  const claimable: WorkerJobType[] = [];
  if (activeCount('library.scan') < input.limits.scans) claimable.push('library.scan');
  if (activeCount('media.metadata') < input.limits.metadata) claimable.push('media.metadata');
  if (activeCount('playback.expire-leases') < input.limits.maintenance) {
    claimable.push('playback.expire-leases');
  }
  return claimable;
}
