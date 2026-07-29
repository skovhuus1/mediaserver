export type UpdateProgressState = 'idle' | 'running' | 'completed' | 'failed';

export type UpdateProgress = {
  runId: string | null;
  state: UpdateProgressState;
  phase: string;
  percent: number;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  previousCommit: string | null;
  targetCommit: string | null;
  error: string | null;
  logTail?: string[];
};

export function idleUpdateProgress(): UpdateProgress {
  return {
    runId: null,
    state: 'idle',
    phase: 'idle',
    percent: 0,
    message: 'Ingen opdatering kører.',
    startedAt: null,
    updatedAt: null,
    previousCommit: null,
    targetCommit: null,
    error: null,
  };
}

export function readUpdateProgress(value: unknown): UpdateProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return idleUpdateProgress();
  const source = value as Record<string, unknown>;
  const state = ['idle', 'running', 'completed', 'failed'].includes(String(source.state))
    ? source.state as UpdateProgressState
    : 'idle';
  return {
    runId: stringOrNull(source.runId),
    state,
    phase: typeof source.phase === 'string' ? source.phase : 'idle',
    percent: clampPercent(source.percent),
    message: typeof source.message === 'string' ? source.message : '',
    startedAt: stringOrNull(source.startedAt),
    updatedAt: stringOrNull(source.updatedAt),
    previousCommit: stringOrNull(source.previousCommit),
    targetCommit: stringOrNull(source.targetCommit),
    error: stringOrNull(source.error),
  };
}

export function parseRunnerProgress(log: string): Pick<UpdateProgress, 'state' | 'phase' | 'percent' | 'message' | 'updatedAt' | 'error'> | null {
  let latest: RegExpExecArray | null = null;
  const ansiPattern = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, 'g');
  const sanitizedLog = log.replace(ansiPattern, '');
  const pattern = /^[^\r\n]*?BB_UPDATE_PROGRESS\|(\d{1,3})\|([a-z0-9-]+)\|([^|]+)\|(.*)$/gm;
  for (let match = pattern.exec(sanitizedLog); match; match = pattern.exec(sanitizedLog)) latest = match;
  if (!latest) return null;
  const phase = latest[2] ?? 'running';
  const message = latest[4] ?? '';
  const state: UpdateProgressState = phase === 'completed' ? 'completed' : phase === 'failed' ? 'failed' : 'running';
  return {
    state,
    phase,
    percent: clampPercent(latest[1]),
    message,
    updatedAt: latest[3] ?? new Date().toISOString(),
    error: state === 'failed' ? message : null,
  };
}

export function isActiveRunnerState(state: string | null | undefined): boolean {
  return ['created', 'running', 'restarting', 'paused'].includes(
    state?.trim().toLowerCase() ?? '',
  );
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function clampPercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}
