import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

type JsonRecord = Record<string, unknown>;

export type WatcherLibrary = {
  id: string;
  name: string;
  autoScanEnabled: boolean;
  scanIntervalMinutes: number;
  lastScheduledScanAt: Date | null;
  paths: Array<{ path: string }>;
};

export type LibraryWatcherStatus = {
  state: 'active' | 'degraded' | 'disabled' | 'idle' | 'offline';
  enabled: boolean;
  stale: boolean;
  mode: 'native' | 'polling';
  workerId: string | null;
  configuredLibraryCount: number;
  watchedLibraryCount: number;
  monitoredPaths: Array<{ libraryId: string; libraryName: string; path: string }>;
  lastHeartbeatAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastAutoScanAt: string | null;
  lastFileEvent: { libraryId: string; event: string; path: string; at: string; queuedScan: boolean } | null;
  lastError: { libraryId: string | null; message: string; at: string } | null;
  configuration: { pollIntervalMs: number | null; writeStabilityMs: number | null; debounceMs: number | null; refreshIntervalMs: number | null };
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function timestamp(value: unknown): string | null {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

export function resolveLibraryWatcherStatus(
  persisted: unknown,
  libraries: WatcherLibrary[],
  now = new Date(),
): LibraryWatcherStatus {
  const runtime = record(persisted);
  const rawEvent = record(runtime.lastFileEvent);
  const rawError = record(runtime.lastError);
  const configured = libraries.filter((library) => library.autoScanEnabled && library.paths.length > 0);
  const monitoredPaths = configured.flatMap((library) => library.paths.map(({ path }) => ({
    libraryId: library.id,
    libraryName: library.name,
    path,
  })));
  const enabled = runtime.enabled !== false;
  const mode = runtime.mode === 'polling' ? 'polling' : 'native';
  const lastHeartbeatAt = timestamp(runtime.lastHeartbeatAt);
  const refreshIntervalMs = integer(runtime.refreshIntervalMs);
  const heartbeatMaxAgeMs = Math.min(1_800_000, Math.max(120_000, (refreshIntervalMs ?? 60_000) * 3));
  const heartbeatMs = lastHeartbeatAt ? Date.parse(lastHeartbeatAt) : Number.NaN;
  const stale = enabled && configured.length > 0 && (
    !Number.isFinite(heartbeatMs)
    || heartbeatMs > now.getTime() + 5_000
    || now.getTime() - heartbeatMs > heartbeatMaxAgeMs
  );
  const watchedLibraryCount = integer(runtime.watchedLibraryCount) ?? 0;
  const lastFileEventAt = timestamp(rawEvent.at);
  const lastErrorAt = timestamp(rawError.at);
  const lastAutoScanAt = configured.reduce<Date | null>((latest, library) => {
    if (!library.lastScheduledScanAt) return latest;
    return !latest || library.lastScheduledScanAt > latest ? library.lastScheduledScanAt : latest;
  }, null);
  const state = !enabled
    ? 'disabled'
    : configured.length === 0
      ? 'idle'
      : stale
        ? 'offline'
        : runtime.state === 'degraded' || watchedLibraryCount !== configured.length
          ? 'degraded'
          : 'active';

  return {
    state,
    enabled,
    stale,
    mode,
    workerId: text(runtime.workerId),
    configuredLibraryCount: configured.length,
    watchedLibraryCount,
    monitoredPaths,
    lastHeartbeatAt,
    lastSuccessfulSyncAt: timestamp(runtime.lastSuccessfulSyncAt),
    lastAutoScanAt: lastAutoScanAt?.toISOString() ?? null,
    lastFileEvent: lastFileEventAt && text(rawEvent.libraryId) && text(rawEvent.event) && text(rawEvent.path)
      ? {
          libraryId: text(rawEvent.libraryId)!,
          event: text(rawEvent.event)!,
          path: text(rawEvent.path)!,
          at: lastFileEventAt,
          queuedScan: rawEvent.queuedScan === true,
        }
      : null,
    lastError: lastErrorAt && text(rawError.message)
      ? { libraryId: text(rawError.libraryId), message: text(rawError.message)!, at: lastErrorAt }
      : null,
    configuration: {
      pollIntervalMs: integer(runtime.pollIntervalMs),
      writeStabilityMs: integer(runtime.writeStabilityMs),
      debounceMs: integer(runtime.debounceMs),
      refreshIntervalMs,
    },
  };
}

export async function inspectLibraryWatcherPaths(
  paths: LibraryWatcherStatus['monitoredPaths'],
  inspect: (path: string) => Promise<{ readable: boolean; directory: boolean }> = async (path) => {
    await access(path, constants.R_OK);
    const details = await stat(path);
    return { readable: true, directory: details.isDirectory() };
  },
) {
  return Promise.all(paths.map(async (entry) => {
    try {
      const result = await inspect(entry.path);
      return { ...entry, ...result, error: result.directory ? null : 'Stien er ikke en mappe' };
    } catch (error) {
      return {
        ...entry,
        readable: false,
        directory: false,
        error: error instanceof Error ? error.message : 'Stien kunne ikke læses',
      };
    }
  }));
}
