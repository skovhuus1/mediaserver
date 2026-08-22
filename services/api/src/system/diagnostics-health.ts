export type DiagnosticState = 'ok' | 'warning' | 'error';

export type DiagnosticCheck = {
  id: string;
  group: string;
  label: string;
  state: DiagnosticState;
  summary: string;
  details?: Record<string, string | number | boolean | null>;
  latencyMs?: number | null;
};

export function storageDiagnosticState(freeBytes: number, usedPercent: number): DiagnosticState {
  if (freeBytes < 2 * 1024 ** 3 || usedPercent >= 98) return 'error';
  if (freeBytes < 20 * 1024 ** 3 || usedPercent >= 90) return 'warning';
  return 'ok';
}

export function summarizeDiagnostics(checks: DiagnosticCheck[]) {
  const counts = {
    ok: checks.filter((check) => check.state === 'ok').length,
    warning: checks.filter((check) => check.state === 'warning').length,
    error: checks.filter((check) => check.state === 'error').length,
  };
  return {
    state: counts.error > 0 ? 'error' as const : counts.warning > 0 ? 'warning' as const : 'ok' as const,
    counts,
  };
}
