import { describe, expect, it, vi } from 'vitest';
import { LibraryChangeDetector, isWatchedMediaChange, resolveLibraryWatchConfig } from '../src/library-change-detector.js';

describe('library change detector', () => {
  it('applies conservative defaults and clamps polling configuration', () => {
    expect(resolveLibraryWatchConfig({})).toMatchObject({
      enabled: true,
      usePolling: false,
      pollIntervalMs: 10_000,
      writeStabilityMs: 20_000,
      debounceMs: 5_000,
      refreshIntervalMs: 60_000,
    });
    expect(resolveLibraryWatchConfig({
      BB_MEDIA_WATCH_USE_POLLING: 'true',
      BB_MEDIA_WATCH_POLL_INTERVAL_MS: '1',
    })).toMatchObject({ usePolling: true, pollIntervalMs: 1_000 });
  });

  it('filters non-media and directory events', () => {
    expect(isWatchedMediaChange('add', '/media/Film.mkv')).toBe(true);
    expect(isWatchedMediaChange('change', '/media/Film.MP4')).toBe(true);
    expect(isWatchedMediaChange('addDir', '/media/Film')).toBe(false);
    expect(isWatchedMediaChange('unlink', '/media/poster.jpg')).toBe(false);
  });

  it('coalesces bursts per library and closes changed watcher sets', async () => {
    vi.useFakeTimers();
    const handles: FakeWatchHandle[] = [];
    const onChange = vi.fn().mockResolvedValue(undefined);
    const detector = new LibraryChangeDetector(
      { ...resolveLibraryWatchConfig({}), debounceMs: 1_000 },
      onChange,
      vi.fn(),
      () => {
        const handle = new FakeWatchHandle();
        handles.push(handle);
        return handle;
      },
    );

    await detector.sync([{ id: 'library-1', accountId: 'account-1', paths: ['/media/film'] }]);
    handles[0]!.emitAll('add', '/media/film/A.mkv');
    handles[0]!.emitAll('change', '/media/film/A.mkv');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ event: 'change', libraryId: 'library-1' }));

    await detector.sync([{ id: 'library-1', accountId: 'account-1', paths: ['/media/new-film'] }]);
    expect(handles[0]!.close).toHaveBeenCalledTimes(1);
    expect(handles).toHaveLength(2);
    await detector.close();
    expect(handles[1]!.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

class FakeWatchHandle {
  readonly close = vi.fn().mockResolvedValue(undefined);
  private allListener: ((event: string, path: string) => void) | null = null;

  on(event: 'all' | 'error', listener: ((event: string, path: string) => void) | ((error: unknown) => void)) {
    if (event === 'all') this.allListener = listener as (event: string, path: string) => void;
    return this;
  }

  emitAll(event: string, path: string) {
    this.allListener?.(event, path);
  }
}
