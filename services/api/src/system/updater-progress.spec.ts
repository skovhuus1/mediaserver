import { describe, expect, it } from 'vitest';
import {
  isActiveRunnerState,
  parseRunnerProgress,
  readUpdateProgress,
} from './updater-progress';

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

  it('parses a marker wrapped in terminal colour codes', () => {
    expect(parseRunnerProgress(
      '\u001b[91mBB_UPDATE_PROGRESS|65|failed|2026-07-29T19:48:34Z|Docker build fejlede\u001b[0m',
    )).toMatchObject({
      state: 'failed',
      phase: 'failed',
      percent: 65,
      error: 'Docker build fejlede',
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

describe('updater runner state', () => {
  it.each(['created', 'running', 'restarting', 'paused'])(
    'blocks reset while runner state is %s',
    (state) => {
      expect(isActiveRunnerState(state)).toBe(true);
    },
  );

  it.each(['exited', 'dead', 'removing', '', null])(
    'allows reset when runner state is %s',
    (state) => {
      expect(isActiveRunnerState(state)).toBe(false);
    },
  );
});
