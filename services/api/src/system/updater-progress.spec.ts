import { describe, expect, it } from 'vitest';
import { parseRunnerProgress, readUpdateProgress } from './updater-progress';

describe('updater progress', () => {
  it('uses the last structured runner marker and ignores compose output', () => {
    const result = parseRunnerProgress([
      'BB_UPDATE_PROGRESS|65|building|2026-07-28T20:00:00Z|Bygger images',
      '#12 exporting layers',
      'BB_UPDATE_PROGRESS|82|healthcheck|2026-07-28T20:01:00Z|Venter paa health',
    ].join('\n'));
    expect(result).toMatchObject({
      state: 'running',
      phase: 'healthcheck',
      percent: 82,
      message: 'Venter paa health',
    });
  });

  it('maps a failed runner marker to a durable failure', () => {
    expect(parseRunnerProgress(
      'BB_UPDATE_PROGRESS|65|failed|2026-07-28T20:00:00Z|Compose build fejlede',
    )).toMatchObject({
      state: 'failed',
      percent: 65,
      error: 'Compose build fejlede',
    });
  });

  it('sanitizes malformed persisted progress', () => {
    expect(readUpdateProgress({ state: 'unknown', percent: 900 })).toMatchObject({
      state: 'idle',
      percent: 100,
      runId: null,
    });
  });
});
