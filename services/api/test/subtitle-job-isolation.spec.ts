import { describe, expect, it } from 'vitest';
import { subtitlePreparationJobFilter } from '../src/playback/subtitle-stream.service';

describe('subtitle preparation job isolation', () => {
  it('only observes the subtitle-only worker job for the active session', () => {
    expect(subtitlePreparationJobFilter('account-1', 'session-1')).toEqual({
      accountId: 'account-1',
      type: 'playback.transcode',
      AND: [
        { payload: { path: ['sessionId'], equals: 'session-1' } },
        { payload: { path: ['streamMode'], equals: 'subtitle_only' } },
      ],
    });
  });
});
