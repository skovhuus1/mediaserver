import { describe, expect, it } from 'vitest';
import { withJobProgress } from '../src/job-progress';

describe('worker job progress', () => {
  it('preserves job targeting while replacing progress', () => {
    const payload = withJobProgress({ mediaId: 'media-1', progress: { stage: 'old' } }, { stage: 'Genererer sprites', percent: 45, current: 9, total: 20 }) as Record<string, unknown>;
    expect(payload.mediaId).toBe('media-1');
    expect(payload.progress).toMatchObject({ stage: 'Genererer sprites', percent: 45, current: 9, total: 20 });
  });
});
