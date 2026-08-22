import { describe, expect, it } from 'vitest';
import { inspectLibraryWatcherPaths, resolveLibraryWatcherStatus, type WatcherLibrary } from './library-watcher-status';

const now = new Date('2026-08-22T12:00:00.000Z');
const libraries: WatcherLibrary[] = [{
  id: 'library-1',
  name: 'Film',
  autoScanEnabled: true,
  scanIntervalMinutes: 60,
  lastScheduledScanAt: new Date('2026-08-22T11:30:00.000Z'),
  paths: [{ path: '/media/Film' }],
}];

describe('resolveLibraryWatcherStatus', () => {
  it('presents a fresh native watcher with its latest event', () => {
    expect(resolveLibraryWatcherStatus({
      enabled: true,
      mode: 'native',
      state: 'active',
      watchedLibraryCount: 1,
      workerId: 'jobs-1',
      refreshIntervalMs: 60_000,
      lastHeartbeatAt: '2026-08-22T11:59:30.000Z',
      lastSuccessfulSyncAt: '2026-08-22T11:59:30.000Z',
      lastFileEvent: { libraryId: 'library-1', event: 'add', path: '/media/Film/new.mkv', at: '2026-08-22T11:58:00.000Z', queuedScan: true },
    }, libraries, now)).toMatchObject({
      state: 'active',
      stale: false,
      mode: 'native',
      watchedLibraryCount: 1,
      lastAutoScanAt: '2026-08-22T11:30:00.000Z',
      lastFileEvent: { event: 'add', queuedScan: true },
    });
  });

  it('marks an expired heartbeat offline and a disabled watcher explicitly disabled', () => {
    expect(resolveLibraryWatcherStatus({ enabled: true, watchedLibraryCount: 1, lastHeartbeatAt: '2026-08-22T11:50:00.000Z' }, libraries, now).state).toBe('offline');
    expect(resolveLibraryWatcherStatus({ enabled: false }, libraries, now)).toMatchObject({ state: 'disabled', enabled: false, stale: false });
  });

  it('reports configured paths that fail the read probe', async () => {
    const result = await inspectLibraryWatcherPaths([
      { libraryId: 'library-1', libraryName: 'Film', path: '/media/Film' },
    ], async () => { throw new Error('EACCES'); });
    expect(result).toEqual([{ libraryId: 'library-1', libraryName: 'Film', path: '/media/Film', readable: false, directory: false, error: 'EACCES' }]);
  });
});
