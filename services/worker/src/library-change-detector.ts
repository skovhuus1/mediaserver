import { watch as chokidarWatch, type ChokidarOptions } from 'chokidar';
import { extname } from 'node:path';

const mediaExtensions = new Set(['.avi', '.m2ts', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.ts', '.webm']);
const watchedEvents = new Set(['add', 'change', 'unlink']);

export type LibraryWatchConfig = {
  enabled: boolean;
  usePolling: boolean;
  pollIntervalMs: number;
  writeStabilityMs: number;
  debounceMs: number;
  refreshIntervalMs: number;
};

export type WatchedLibrary = {
  id: string;
  accountId: string;
  paths: string[];
};

export type LibraryFileChange = {
  libraryId: string;
  accountId: string;
  event: string;
  path: string;
};

type WatchHandle = {
  on(event: 'all', listener: (event: string, path: string) => void): WatchHandle;
  on(event: 'error', listener: (error: unknown) => void): WatchHandle;
  close(): Promise<void>;
};

type WatchFactory = (paths: string[], options: ChokidarOptions) => WatchHandle;
type WatchEntry = {
  signature: string;
  watcher: WatchHandle;
  timer: ReturnType<typeof setTimeout> | null;
  pending: LibraryFileChange | null;
};

export function resolveLibraryWatchConfig(environment: NodeJS.ProcessEnv): LibraryWatchConfig {
  return {
    enabled: booleanValue(environment.BB_MEDIA_WATCH_ENABLED, true),
    usePolling: booleanValue(environment.BB_MEDIA_WATCH_USE_POLLING, false),
    pollIntervalMs: integerValue(environment.BB_MEDIA_WATCH_POLL_INTERVAL_MS, 10_000, 1_000, 300_000),
    writeStabilityMs: integerValue(environment.BB_MEDIA_WATCH_WRITE_STABILITY_MS, 20_000, 2_000, 900_000),
    debounceMs: integerValue(environment.BB_MEDIA_WATCH_DEBOUNCE_MS, 5_000, 1_000, 300_000),
    refreshIntervalMs: integerValue(environment.BB_MEDIA_WATCH_REFRESH_INTERVAL_MS, 60_000, 10_000, 600_000),
  };
}

export function isWatchedMediaChange(event: string, path: string): boolean {
  return watchedEvents.has(event) && mediaExtensions.has(extname(path).toLowerCase());
}

export class LibraryChangeDetector {
  private readonly entries = new Map<string, WatchEntry>();

  constructor(
    private readonly config: LibraryWatchConfig,
    private readonly onChange: (change: LibraryFileChange) => Promise<void>,
    private readonly onError: (error: unknown, libraryId: string) => void,
    private readonly watchFactory: WatchFactory = (paths, options) => chokidarWatch(paths, options) as WatchHandle,
  ) {}

  async sync(libraries: WatchedLibrary[]): Promise<number> {
    const desired = new Map(libraries.flatMap((library) => {
      const paths = [...new Set(library.paths.map((path) => path.trim()).filter(Boolean))].sort();
      return paths.length ? [[library.id, { ...library, paths }] as const] : [];
    }));

    for (const [libraryId, entry] of this.entries) {
      const library = desired.get(libraryId);
      const signature = library ? JSON.stringify(library.paths) : null;
      if (signature === entry.signature) continue;
      if (entry.timer) clearTimeout(entry.timer);
      await entry.watcher.close();
      this.entries.delete(libraryId);
    }

    for (const library of desired.values()) {
      if (this.entries.has(library.id)) continue;
      const signature = JSON.stringify(library.paths);
      const watcher = this.watchFactory(library.paths, {
        persistent: true,
        ignoreInitial: true,
        ignorePermissionErrors: true,
        usePolling: this.config.usePolling,
        interval: this.config.pollIntervalMs,
        binaryInterval: this.config.pollIntervalMs,
        awaitWriteFinish: {
          stabilityThreshold: this.config.writeStabilityMs,
          pollInterval: Math.min(1_000, this.config.pollIntervalMs),
        },
        ignored: (path, stats) => stats?.isFile() === true && !mediaExtensions.has(extname(path).toLowerCase()),
      });
      const entry: WatchEntry = { signature, watcher, timer: null, pending: null };
      watcher.on('all', (event, path) => {
        if (!isWatchedMediaChange(event, path)) return;
        entry.pending = { libraryId: library.id, accountId: library.accountId, event, path };
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          entry.timer = null;
          const pending = entry.pending;
          entry.pending = null;
          if (pending) void this.onChange(pending).catch((error) => this.onError(error, library.id));
        }, this.config.debounceMs);
      });
      watcher.on('error', (error) => this.onError(error, library.id));
      this.entries.set(library.id, entry);
    }
    return this.entries.size;
  }

  async close(): Promise<void> {
    const entries = [...this.entries.values()];
    this.entries.clear();
    for (const entry of entries) {
      if (entry.timer) clearTimeout(entry.timer);
      await entry.watcher.close();
    }
  }
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || !value.trim()) return fallback;
  return /^(?:1|true|yes)$/i.test(value.trim());
}

function integerValue(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}
