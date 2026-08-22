import { describe, expect, it } from 'vitest';
import { storageDiagnosticState, summarizeDiagnostics } from './diagnostics-health';

describe('system diagnostics health', () => {
  it('prioritizes errors over warnings in the aggregate state', () => {
    expect(summarizeDiagnostics([
      { id: 'db', group: 'core', label: 'Database', state: 'ok', summary: 'Ready' },
      { id: 'disk', group: 'storage', label: 'Storage', state: 'warning', summary: 'Low space' },
      { id: 'worker', group: 'workers', label: 'Worker', state: 'error', summary: 'Offline' },
    ])).toEqual({ state: 'error', counts: { ok: 1, warning: 1, error: 1 } });
  });

  it('uses both absolute free space and utilization for storage severity', () => {
    expect(storageDiagnosticState(50 * 1024 ** 3, 65)).toBe('ok');
    expect(storageDiagnosticState(10 * 1024 ** 3, 70)).toBe('warning');
    expect(storageDiagnosticState(100 * 1024 ** 3, 98)).toBe('error');
  });
});
