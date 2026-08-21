import { describe, expect, it } from 'vitest';
import { jobReferences, presentJobProgress } from './system-jobs';

describe('system job presentation', () => {
  it('calculates bounded progress from current and total', () => {
    expect(presentJobProgress({ progress: { stage: 'Henter metadata', current: 7, total: 10 } }, 'running')).toMatchObject({ stage: 'Henter metadata', percent: 70, current: 7, total: 10 });
  });
  it('marks completed jobs as complete without trusting stale payload values', () => {
    expect(presentJobProgress({ progress: { percent: 42 } }, 'completed').percent).toBe(100);
  });
  it('only exposes known target references', () => {
    expect(jobReferences({ libraryId: 'library-1', mediaId: 'media-1', secret: 'hidden' })).toEqual({ libraryId: 'library-1', mediaId: 'media-1', scanId: null });
  });
});
