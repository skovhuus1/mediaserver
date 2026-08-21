type JsonRecord = Record<string, unknown>;

export type PresentedJobProgress = {
  stage: string;
  percent: number | null;
  current: number | null;
  total: number | null;
  message: string | null;
  updatedAt: string | null;
};

export function jobPayload(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export function presentJobProgress(payloadValue: unknown, status: string): PresentedJobProgress {
  const progress = jobPayload(jobPayload(payloadValue).progress);
  const current = finiteNumber(progress.current);
  const total = finiteNumber(progress.total);
  const storedPercent = finiteNumber(progress.percent);
  const calculatedPercent = total !== null && total > 0 && current !== null ? (current / total) * 100 : null;
  return {
    stage: typeof progress.stage === 'string' ? progress.stage : defaultStage(status),
    percent: status === 'completed' ? 100 : clampPercent(storedPercent ?? calculatedPercent),
    current,
    total,
    message: typeof progress.message === 'string' ? progress.message : null,
    updatedAt: typeof progress.updatedAt === 'string' ? progress.updatedAt : null,
  };
}

export function jobReferences(payloadValue: unknown): { libraryId: string | null; mediaId: string | null; scanId: string | null } {
  const payload = jobPayload(payloadValue);
  return {
    libraryId: typeof payload.libraryId === 'string' ? payload.libraryId : null,
    mediaId: typeof payload.mediaId === 'string' ? payload.mediaId : null,
    scanId: typeof payload.scanId === 'string' ? payload.scanId : null,
  };
}

function defaultStage(status: string): string {
  return status === 'queued' ? 'Venter i kø' : status === 'running' ? 'Arbejder' : status === 'failed' ? 'Fejlet' : 'Afsluttet';
}
function finiteNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function clampPercent(value: number | null): number | null { return value === null ? null : Math.round(Math.max(0, Math.min(100, value))); }
