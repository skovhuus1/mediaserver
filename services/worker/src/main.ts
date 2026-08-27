import { MediaType, Prisma, PrismaClient, SystemJob } from '@prisma/client';
import { HLS_SEGMENT_DURATION_SECONDS, buildDirectStreamHlsArguments, classifyMediaPath, detectVideoSignalProfile, resolveAccurateTranscodeSeek, resolveCpuTranscodeProfile, selectHlsRenditionsForCapacity, sortHlsRenditions } from '@boltbytes/contracts';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { extname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { enrichLibraryMetadata, hasTmdbConfiguration } from './metadata.js';
import {
  claimableWorkerJobTypes,
  resolveWorkerConcurrency,
  type WorkerJobType,
  type WorkerMode,
} from './job-concurrency.js';
import { generatePlaybackAssets } from './playback-assets.js';
import { prepareOfflineDownload } from './offline-downloads.js';
import { deliverPushNotification, queueOfflineReadyNotification } from './push-notifications.js';
import { updateJobProgress, withJobProgress } from './job-progress.js';
import { buildSdrColorMetadataArguments, resolveVideoColorPipeline } from './video-color.js';
import { LibraryChangeDetector, resolveLibraryWatchConfig, type LibraryFileChange } from './library-change-detector.js';
import { importLiveTvEpg, importLiveTvPlaylist } from './live-tv.js';
import { processLiveTvChannelVisibilityJob } from './live-tv-channel-visibility-job.js';
import { processLiveTvRecordingJob } from './live-tv-recordings.js';
import { processLiveTvStreamJobWithFailover } from './live-tv-stream-failover.js';
import { withJobLeaseHeartbeat } from './job-lease.js';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);
const workerMode: WorkerMode = process.env.BB_MEDIA_WORKER_MODE === 'transcode' ? 'transcode' : 'jobs';
const workerId = `${workerMode}-${randomUUID()}`;
const pollIntervalMs = 2_000;
const leaseMs = 60_000;
const transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');
const workerConcurrency = resolveWorkerConcurrency({
  scanMaxConcurrent: process.env.BB_MEDIA_SCAN_MAX_CONCURRENT,
  metadataMaxConcurrent: process.env.BB_MEDIA_METADATA_MAX_CONCURRENT,
  playbackAssetMaxConcurrent: process.env.BB_MEDIA_PLAYBACK_ASSET_MAX_CONCURRENT,
  transcodeMaxConcurrent: process.env.BB_MEDIA_TRANSCODE_MAX_CONCURRENT,
  notificationMaxConcurrent: process.env.BB_MEDIA_NOTIFICATION_MAX_CONCURRENT,
});
const transcodeMaxConcurrent = workerConcurrency.transcodes;
const transcodeStatusKey = 'runtime.transcoder.status';
const libraryWatcherStatusKey = 'runtime.library-watcher.status';
let lastTranscoderHeartbeat = 0;

function legacyLibraryPathCandidate(rootPath: string, configuredPath: string): string | null {
  const root = posix.resolve('/', rootPath);
  const configured = posix.resolve('/', configuredPath);
  if (root === '/') return null;
  const duplicatedRoot = `${root}${root}`;
  if (configured !== duplicatedRoot && !configured.startsWith(`${duplicatedRoot}/`)) return null;
  const candidate = configured.slice(root.length);
  return candidate === root || candidate.startsWith(`${root}/`) ? candidate : null;
}

async function resolveConfiguredLibraryPath(
  rootPath: string,
  configuredPath: { id: string; path: string },
): Promise<string> {
  try {
    return await realpath(configuredPath.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const candidate = legacyLibraryPathCandidate(rootPath, configuredPath.path);
    if (!candidate) throw error;
    const repairedPath = await realpath(candidate);
    if (!isWithin(rootPath, repairedPath)) {
      throw new Error(`Repaired library path escapes storage root: ${configuredPath.path}`);
    }
    await prisma.libraryPath.update({
      where: { id: configuredPath.id },
      data: { path: candidate },
    });
    console.log(
      JSON.stringify({
        level: 'info',
        component: 'worker',
        message: 'Repaired legacy duplicated library path',
        libraryPathId: configuredPath.id,
        previousPath: configuredPath.path,
        repairedPath: candidate,
      }),
    );
    return repairedPath;
  }
}
let stopping = false;
let lastLibraryScheduleCheck = 0;
let lastLibraryWatchSync = 0;
let libraryChangeDetector: LibraryChangeDetector | null = null;
const libraryWatchConfig = resolveLibraryWatchConfig(process.env);
type LibraryWatcherRuntime = {
  enabled: boolean;
  state: 'active' | 'degraded' | 'disabled' | 'idle';
  mode: 'native' | 'polling';
  watchedLibraryCount: number;
  monitoredPaths: string[];
  workerId: string;
  pollIntervalMs: number;
  writeStabilityMs: number;
  debounceMs: number;
  refreshIntervalMs: number;
  lastHeartbeatAt: string;
  lastSuccessfulSyncAt: string | null;
  lastFileEvent: { libraryId: string; event: string; path: string; at: string; queuedScan: boolean } | null;
  lastError: { libraryId: string | null; message: string; at: string } | null;
};
const libraryWatcherRuntime = new Map<string, LibraryWatcherRuntime>();
const libraryWatcherAccountsByLibrary = new Map<string, string>();

type ClaimedJob = SystemJob & { attemptNumber: number };
type ProbeMetadata = {
  raw: Prisma.InputJsonValue;
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  bitrate: number | null;
};

const mediaExtensions = new Set(['.avi', '.m2ts', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.ts', '.webm']);
const staleWorkerLeaseSweepMs = 30_000;
let lastStaleWorkerLeaseSweep = 0;

async function claimNextJob(allowedTypes: readonly WorkerJobType[]): Promise<ClaimedJob | null> {
  if (allowedTypes.length === 0) return null;
  return prisma.$transaction(async (tx) => {
    if (workerMode === 'transcode') {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:transcode-capacity'),
          hashtext('global')
        )::text AS lock_result
      `;
      const running = await tx.systemJob.count({
        where: {
          type: { in: ['playback.transcode', 'offline.prepare', 'live-tv.stream', 'live-tv.record'] },
          status: 'running',
          leaseExpiresAt: { gt: new Date() },
        },
      });
      if (running >= transcodeMaxConcurrent) return null;
    }
    const typeFilter = Prisma.sql`type IN (${Prisma.join(allowedTypes)})`;
    const rows = await tx.$queryRaw<SystemJob[]>`
      SELECT
        id,
        account_id AS "accountId",
        type,
        status,
        payload,
        available_at AS "availableAt",
        locked_at AS "lockedAt",
        lease_expires_at AS "leaseExpiresAt",
        worker_id AS "workerId",
        attempt_count AS "attemptCount",
        max_attempts AS "maxAttempts",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM system_jobs
      WHERE
        (
          status = 'queued'
          OR (status = 'running' AND lease_expires_at <= NOW())
        )
        AND (
          type <> 'media.playback-assets'
          OR NOT EXISTS (
            SELECT 1
            FROM system_settings AS setting
            WHERE setting.account_id = system_jobs.account_id
              AND setting.key = 'runtime.playback-analysis.paused'
              AND setting.value = 'true'::jsonb
          )
        )
        AND (
          type <> 'media.playback-assets'
          OR NOT EXISTS (
            SELECT 1
            FROM system_settings AS schedule
            WHERE schedule.account_id = system_jobs.account_id
              AND schedule.key = 'runtime.playback-analysis.schedule'
              AND schedule.value->>'enabled' = 'true'
          )
          OR EXISTS (
            SELECT 1
            FROM system_settings AS schedule
            CROSS JOIN LATERAL jsonb_array_elements(schedule.value->'windows') AS window_entry(value)
            WHERE schedule.account_id = system_jobs.account_id
              AND schedule.key = 'runtime.playback-analysis.schedule'
              AND schedule.value->>'enabled' = 'true'
              AND (
                (window_entry.value->>'start')::time = (window_entry.value->>'end')::time
                OR (
                  (window_entry.value->>'start')::time < (window_entry.value->>'end')::time
                  AND (NOW() AT TIME ZONE (schedule.value->>'timezone'))::time >= (window_entry.value->>'start')::time
                  AND (NOW() AT TIME ZONE (schedule.value->>'timezone'))::time < (window_entry.value->>'end')::time
                )
                OR (
                  (window_entry.value->>'start')::time > (window_entry.value->>'end')::time
                  AND (
                    (NOW() AT TIME ZONE (schedule.value->>'timezone'))::time >= (window_entry.value->>'start')::time
                    OR (NOW() AT TIME ZONE (schedule.value->>'timezone'))::time < (window_entry.value->>'end')::time
                  )
                )
              )
          )
        )
        AND ${typeFilter}
        AND available_at <= NOW()
        AND attempt_count < max_attempts
      ORDER BY available_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const job = rows[0];
    if (!job) return null;
    const attemptNumber = job.attemptCount + 1;
    const updated = await tx.systemJob.update({
      where: { id: job.id },
      data: {
        status: 'running',
        workerId,
        lockedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + leaseMs),
        attemptCount: attemptNumber,
        attempts: {
          create: {
            number: attemptNumber,
            status: 'running',
          },
        },
      },
    });
    return { ...updated, attemptNumber };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function processJob(job: ClaimedJob): Promise<void> {
  switch (job.type) {
    case 'library.scan':
      await scanLibrary(job);
      return;
    case 'media.metadata':
      await enrichMetadata(job);
      return;
    case 'media.playback-assets':
      await generatePlaybackAssets(prisma, job);
      return;
    case 'playback.transcode':
      await transcodePlayback(job);
      return;
    case 'offline.prepare':
      await prepareOfflineDownload(prisma, job, transcodeRoot, () => renewJobLease(job.id));
      await queueOfflineReadyNotification(prisma, job);
      return;
    case 'notification.push':
      await deliverPushNotification(prisma, job);
      return;
    case 'playback.expire-leases':
      await expirePlaybackLeases();
      return;
    case 'live-tv.import':
      await importLiveTvPlaylist(prisma, job, () => renewJobLease(job.id));
      return;
    case 'live-tv.epg':
      await importLiveTvEpg(prisma, job, () => renewJobLease(job.id));
      return;
    case 'live-tv.channel-visibility':
      await processLiveTvChannelVisibilityJob(prisma, job, () => renewJobLease(job.id));
      return;
    case 'live-tv.stream':
      await processLiveTvStreamJobWithFailover(prisma, job, transcodeRoot, () => renewJobLease(job.id));
      return;
    case 'live-tv.record':
      await processLiveTvRecordingJob(prisma, job, () => renewJobLease(job.id));
      return;
    default:
      throw new Error(`Unsupported job type: ${job.type}`);
  }
}

async function scanLibrary(job: ClaimedJob): Promise<void> {
  const payload = asJsonObject(job.payload);
  const libraryId = typeof payload.libraryId === 'string' ? payload.libraryId : null;
  const scanId = typeof payload.scanId === 'string' ? payload.scanId : null;
  if (!libraryId || !scanId) throw new Error('library.scan payload requires libraryId and scanId');
  const scan = await prisma.libraryScan.findFirst({ where: { id: scanId, libraryId, accountId: job.accountId } });
  if (!scan) throw new Error('Library scan ledger row was not found');
  const library = await prisma.library.findFirst({
    where: { id: libraryId, accountId: job.accountId },
    include: { paths: true, storageRoot: true },
  });
  if (!library) throw new Error('Library was not found for scan job');

  await prisma.libraryScan.update({
    where: { id: scan.id },
    data: {
      status: 'running',
      startedAt: new Date(),
      finishedAt: null,
      error: null,
      filesSeen: 0,
      filesCreated: 0,
      filesUpdated: 0,
      filesMissing: 0,
      errors: 0,
    },
  });
  await updateJobProgress(prisma, job, { stage: 'Gennemgår bibliotek', current: 0, total: null, message: library.name });

  let filesSeen = 0;
  let filesCreated = 0;
  let filesUpdated = 0;
  let errors = 0;
  let lastLeaseRenewal = 0;
  let lastProgressUpdate = 0;
  const discovered = new Set<string>();

  try {
    const rootPath = await realpath(library.storageRoot.mountPath);
    for (const configuredPath of library.paths) {
      const libraryPath = await resolveConfiguredLibraryPath(rootPath, configuredPath);
      if (!isWithin(rootPath, libraryPath)) throw new Error(`Library path escapes storage root: ${configuredPath.path}`);
      await walkMediaFiles(
        libraryPath,
        configuredPath.recursive,
        async (absolutePath) => {
          if (Date.now() - lastLeaseRenewal > 20_000) {
            await renewJobLease(job.id);
            lastLeaseRenewal = Date.now();
          }
          const resolvedPath = await realpath(absolutePath);
          if (!isWithin(rootPath, resolvedPath)) {
            errors += 1;
            return;
          }
          const relativePath = relative(rootPath, resolvedPath).split(sep).join('/');
          const libraryRelativePath = relative(libraryPath, resolvedPath).split(sep).join('/');
          if (discovered.has(relativePath)) return;
          discovered.add(relativePath);
          filesSeen += 1;
          const fileStat = await stat(resolvedPath);
          const existingFile = await prisma.mediaFile.findUnique({
            where: { libraryId_relativePath: { libraryId: library.id, relativePath } },
            select: { id: true, sizeBytes: true, modifiedAt: true, status: true },
          });
          if (
            existingFile
            && existingFile.status !== 'missing'
            && existingFile.sizeBytes === BigInt(fileStat.size)
            && existingFile.modifiedAt.getTime() === fileStat.mtime.getTime()
          ) {
            await prisma.mediaFile.update({
              where: { id: existingFile.id },
              data: { lastSeenScanId: scan.id },
            });
            await prisma.libraryScan.update({
              where: { id: scan.id },
              data: { filesSeen, filesCreated, filesUpdated, errors },
            });
            return;
          }
          let probe: ProbeMetadata | null = null;
          try {
            probe = await probeFile(resolvedPath);
          } catch {
            errors += 1;
          }
          const created = await upsertScannedFile({
            accountId: job.accountId,
            libraryId: library.id,
            storageRootId: library.storageRootId,
            libraryType: library.type,
            scanId: scan.id,
            absolutePath: resolvedPath,
            relativePath,
            libraryRelativePath,
            sizeBytes: fileStat.size,
            modifiedAt: fileStat.mtime,
            probe,
          });
          if (created) filesCreated += 1;
          else filesUpdated += 1;
          await prisma.libraryScan.update({
            where: { id: scan.id },
            data: { filesSeen, filesCreated, filesUpdated, errors },
          });
          if (Date.now() - lastProgressUpdate > 1_000) {
            await updateJobProgress(prisma, job, { stage: 'Scanner mediefiler', current: filesSeen, total: null, message: `${filesCreated} nye · ${filesUpdated} opdateret · ${errors} fejl` });
            lastProgressUpdate = Date.now();
          }
        },
        () => { errors += 1; },
      );
    }

    const missing = await prisma.mediaFile.updateMany({
      where: {
        libraryId: library.id,
        status: { not: 'missing' },
        OR: [
          { lastSeenScanId: null },
          { lastSeenScanId: { not: scan.id } },
        ],
      },
      data: { status: 'missing' },
    });
    await updateJobProgress(prisma, job, { stage: 'Afstemmer bibliotek', current: filesSeen, total: filesSeen, percent: 98, message: `${missing.count} manglende filer` });
    await prisma.libraryScan.update({
      where: { id: scan.id },
      data: {
        status: 'completed',
        filesSeen,
        filesCreated,
        filesUpdated,
        filesMissing: missing.count,
        errors,
        finishedAt: new Date(),
      },
    });
    if (await hasTmdbConfiguration(prisma, job.accountId)) {
      const activeJobs = await prisma.systemJob.findMany({
        where: { accountId: job.accountId, type: 'media.metadata', status: { in: ['queued', 'running'] } },
        select: { payload: true },
      });
      const alreadyQueued = activeJobs.some(({ payload }) => {
        const activePayload = asJsonObject(payload);
        return activePayload.libraryId === library.id || typeof activePayload.libraryId !== 'string';
      });
      if (!alreadyQueued) {
        await prisma.systemJob.create({
          data: {
            accountId: job.accountId,
            type: 'media.metadata',
            status: 'queued',
            payload: { libraryId: library.id, onlyMissing: true, requestedBy: 'library.scan' },
            maxAttempts: 3,
          },
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown library scan failure';
    await prisma.libraryScan.update({
      where: { id: scan.id },
      data: { status: 'failed', error: message.slice(0, 2_000), errors: errors + 1, finishedAt: new Date() },
    });
    throw error;
  }
}

async function transcodePlayback(job: ClaimedJob): Promise<void> {
  const payload = asJsonObject(job.payload);
  const streamMode = payload.streamMode === 'direct_stream'
    ? 'direct_stream'
    : payload.streamMode === 'subtitle_only'
      ? 'subtitle_only'
      : 'transcode';
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
  if (!sessionId) throw new Error('playback.transcode payload requires sessionId');
  const session = await prisma.playbackSession.findFirst({
    where: { id: sessionId, accountId: job.accountId },
    include: {
      media: {
        include: {
          file: { include: { storageRoot: true } },
        },
      },
    },
  });
  if (!session || (streamMode !== 'subtitle_only' && session.method !== streamMode)) {
    throw new Error('HLS playback session was not found or changed method');
  }
  if (!['reserving', 'active', 'paused'].includes(session.status) || session.leaseExpiresAt <= new Date()) return;
  const file = session.media.file;
  if (!file || file.status !== 'ready') throw new Error('HLS source file is unavailable');

  const mediaRoot = await realpath(file.storageRoot.mountPath);
  const inputPath = await realpath(resolve(mediaRoot, ...file.relativePath.split('/')));
  if (!isWithin(mediaRoot, inputPath)) throw new Error('Transcode source escapes its storage root');

  await mkdir(transcodeRoot, { recursive: true });
  const generationId = typeof payload.generationId === 'string' && payload.generationId === job.id
    ? payload.generationId
    : null;
  const sessionOutputPath = resolve(transcodeRoot, session.id);
  const outputPath = generationId ? resolve(sessionOutputPath, generationId) : sessionOutputPath;
  if (!isWithin(transcodeRoot, outputPath)) throw new Error('Transcode output escapes its storage root');
  if (streamMode === 'subtitle_only') {
    await mkdir(sessionOutputPath, { recursive: true });
    await removeSubtitleArtifacts(sessionOutputPath);
  } else if (generationId) {
    await mkdir(sessionOutputPath, { recursive: true });
    await rm(outputPath, { recursive: true, force: true });
    await mkdir(outputPath, { recursive: true });
    await removeSubtitleArtifacts(sessionOutputPath);
  } else {
    await rm(outputPath, { recursive: true, force: true });
    await mkdir(outputPath, { recursive: true });
  }
  const subtitleOutputPath = generationId ? sessionOutputPath : outputPath;

  const sourceVideo = detectVideoSignalProfile(file.probe);
  const adaptive = asJsonObject(payload.adaptiveQuality);
  const requestedRenditions = Array.isArray(adaptive.renditions)
    ? adaptive.renditions.map(asJsonObject).flatMap((rendition) => {
        const width = finiteInteger(rendition.width);
        const height = finiteInteger(rendition.height);
        const bitrate = finiteInteger(rendition.bitrate);
        if (!width || !height || !bitrate) return [];
        return [{
          width: evenDimension(width),
          height: evenDimension(height),
          bitrate: Math.max(500_000, Math.min(50_000_000, bitrate)),
          hdr: rendition.hdr === true,
        }];
      })
    : [];
  const fallbackHeight = Math.max(
    240,
    Math.min(2160, finiteInteger(payload.maxVideoResolution) ?? 1080),
  );
  const renditionCandidates = sortHlsRenditions((requestedRenditions.length > 0
    ? requestedRenditions
    : [{
        height: evenDimension(Math.min(file.height ?? fallbackHeight, fallbackHeight)),
        width: evenDimension(
          file.width && file.height
            ? file.width * (Math.min(file.height, fallbackHeight) / file.height)
            : fallbackHeight * (16 / 9),
        ),
        bitrate: Math.max(
          500_000,
          Math.min(50_000_000, (finiteInteger(payload.maxVideoBitrate) ?? 8_000) * 1_000),
        ),
        hdr: payload.preserveHdr === true && sourceVideo.hdr !== null,
      }]).slice(0, 4));
  const cpuProfile = resolveCpuTranscodeProfile({
    availableThreads: availableParallelism(),
    renditionCount: renditionCandidates.length,
    configuredThreads: process.env.BB_MEDIA_CPU_TRANSCODE_THREADS,
    configuredRenditions: process.env.BB_MEDIA_MAX_TRANSCODE_RENDITIONS,
    configuredPreset: process.env.BB_MEDIA_CPU_TRANSCODE_PRESET,
    configuredMaxHeight: process.env.BB_MEDIA_MAX_TRANSCODE_HEIGHT
      ?? (/^(?:true|1|yes)$/i.test(process.env.BB_MEDIA_GPU_ENABLED?.trim() ?? '') ? 2160 : 1080),
  });
  const renditions = selectHlsRenditionsForCapacity(renditionCandidates, {
    maxHeight: cpuProfile.maxHeight,
    maxRenditions: cpuProfile.maxRenditions,
  });
  const preserveHdrRequested =
    payload.preserveHdr === true
    && payload.hdrMode !== 'force_sdr'
    && sourceVideo.hdr !== null
    && renditions.every((rendition) => rendition.hdr);
  const subtitleTrackId =
    typeof payload.subtitleTrackId === 'string' ? payload.subtitleTrackId : null;
  const selectedAudioStreamIndex = finiteInteger(payload.audioStreamIndex);
  const availableAudioStreamIndexes = audioStreamIndexes(file.probe);
  const hasAudio = availableAudioStreamIndexes.length > 0 || Boolean(file.audioCodec);
  if (
    selectedAudioStreamIndex !== null
    && !availableAudioStreamIndexes.includes(selectedAudioStreamIndex)
  ) {
    throw new Error(
      'audio_track_invalid: selected audio track is not available in the source file',
    );
  }
  const audioInput = selectedAudioStreamIndex === null
    ? '0:a:0'
    : `0:${selectedAudioStreamIndex}`;
  const startPositionMs = Math.max(0, finiteInteger(payload.startPositionMs) ?? 0);
  const seek = resolveAccurateTranscodeSeek(startPositionMs);
  const inputSeekArguments = seek.inputSeekSeconds > 0
    ? ['-ss', seek.inputSeekSeconds.toFixed(3)]
    : [];
  const outputSeekArguments = seek.outputSeekSeconds > 0
    ? ['-ss', seek.outputSeekSeconds.toFixed(3)]
    : [];
  const burnInStreamIndex = subtitleTrackId
    ? finiteInteger(subtitleTrackId.match(/\d+/)?.[0])
    : null;
  if (
    subtitleTrackId
    && (
      burnInStreamIndex === null
      || !imageSubtitleStreamIndexes(file.probe).includes(burnInStreamIndex)
    )
  ) {
    throw new Error(
      'subtitle_burn_in_track_invalid: selected track is not a supported image subtitle',
    );
  }
  const availableSubtitleTrackIds: string[] = [];
  const unavailableSubtitleTrackIds: string[] = [];
  for (const streamIndex of textSubtitleStreamIndexes(file.probe)) {
    const trackId = `embedded-${streamIndex}`;
    try {
      const subtitleCancelled = await runFfmpeg(job.id, session.id, [
        '-hide_banner',
        '-loglevel', 'warning',
        '-nostdin',
        '-y',
        '-i', inputPath,
        '-map', `0:${streamIndex}`,
        '-c:s', 'webvtt',
        '-f', 'webvtt',
        resolve(subtitleOutputPath, `embedded-${streamIndex}.vtt`),
      ]);
      if (subtitleCancelled) {
        await rm(outputPath, { recursive: true, force: true });
        return;
      }
      availableSubtitleTrackIds.push(trackId);
    } catch (error) {
      await rm(resolve(subtitleOutputPath, `embedded-${streamIndex}.vtt`), { force: true });
      unavailableSubtitleTrackIds.push(trackId);
      console.warn(JSON.stringify({
        level: 'warn',
        component: 'transcoder',
        message: 'Skipped an embedded subtitle track that FFmpeg could not convert',
        sessionId,
        streamIndex,
        error: error instanceof Error ? error.message : 'Unknown subtitle conversion failure',
      }));
    }
  }
  const subtitleManifest = resolve(subtitleOutputPath, 'subtitle-status.json');
  const subtitleManifestTemporary = resolve(subtitleOutputPath, `subtitle-status-${job.id}.tmp`);
  await writeFile(subtitleManifestTemporary, JSON.stringify({
    availableTrackIds: availableSubtitleTrackIds,
    unavailableTrackIds: unavailableSubtitleTrackIds,
  }), 'utf8');
  await rename(subtitleManifestTemporary, subtitleManifest);

  if (streamMode === 'subtitle_only') return;

  if (streamMode === 'direct_stream') {
    const audioMode = payload.audioMode === 'aac' ? 'aac' : 'copy';
    const encoder = hasAudio ? `copy+audio:${audioMode}` : 'copy';
    await publishTranscoderStatus({
      accountId: job.accountId,
      state: 'remuxing',
      backend: 'software',
      encoder,
      sessionId: session.id,
      jobId: job.id,
      lastError: null,
    });
    await annotateTranscodeJob(job, 'software', encoder);
    const directStreamArguments = buildDirectStreamHlsArguments({
      inputPath,
      variantPlaylistPath: resolve(outputPath, 'stream_%v.m3u8'),
      segmentFilename: resolve(outputPath, 'segment_%v_%05d.m4s'),
      videoCodec: file.videoCodec,
      hasAudio,
      audioMode,
      audioStreamIndex: selectedAudioStreamIndex,
    });
    const inputArgumentIndex = directStreamArguments.indexOf('-i');
    if (inputSeekArguments.length && inputArgumentIndex >= 0) {
      directStreamArguments.splice(inputArgumentIndex, 0, ...inputSeekArguments);
    }
    const cancelled = await runFfmpeg(
      job.id,
      session.id,
      directStreamArguments,
      () => publishTranscoderStatus({
        accountId: job.accountId,
        state: 'remuxing',
        backend: 'software',
        encoder,
        sessionId: session.id,
        jobId: job.id,
        lastError: null,
      }),
    );
    if (cancelled) await rm(outputPath, { recursive: true, force: true });
    else await publishTranscoderStatus({
      accountId: job.accountId,
      state: 'ready',
      backend: 'software',
      encoder,
      sessionId: session.id,
      jobId: job.id,
      lastError: null,
    });
    return;
  }

  const nvenc = await availableNvencEncoders();
  const requestedNvenc = preserveHdrRequested ? nvenc.hevc : nvenc.h264;
  const hardwareEncoder = preserveHdrRequested ? 'hevc_nvenc' : 'h264_nvenc';
  const softwareEncoder = preserveHdrRequested ? 'libx265' : 'libx264';
  const subtitleInput = burnInStreamIndex === null
    ? '[0:v:0]setpts=PTS-STARTPTS[subtitlePrepared]'
    : `[0:v:0]setpts=PTS-STARTPTS[videoBase];[0:${burnInStreamIndex}]setpts=PTS-STARTPTS[subtitleBase];[videoBase][subtitleBase]overlay=eof_action=pass:shortest=0[subtitlePrepared]`;
  const videoColor = resolveVideoColorPipeline({
    sourceIsHdr: sourceVideo.hdr !== null,
    preserveHdr: preserveHdrRequested,
  });
  const splitOutputs = renditions.map((_, index) => `[split${index}]`).join('');
  const scaleOutputs = renditions.map((rendition, index) =>
    `[split${index}]scale=w=${rendition.width}:h=${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2[v${index}]`,
  );
  const audioOutputs = renditions.map((_, index) => `[a${index}]`).join('');
  const filterComplex = [
    subtitleInput,
    videoColor.filter,
    `[prepared]split=${renditions.length}${splitOutputs}`,
    ...scaleOutputs,
    ...(hasAudio
      ? [`[${audioInput}]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS,asplit=${renditions.length}${audioOutputs}`]
      : []),
  ].join(';');
  const streamMaps = renditions.flatMap((_, index) => [
    '-map', `[v${index}]`,
    ...(hasAudio ? ['-map', `[a${index}]`] : []),
  ]);
  const streamArguments = (videoEncoder: string) => renditions.flatMap((rendition, index) => {
    const bitrateKbps = Math.round(rendition.bitrate / 1_000);
    return [
      `-c:v:${index}`, videoEncoder,
      ...(videoEncoder === 'libx264' || videoEncoder === 'libx265' ? [
        `-preset:v:${index}`, cpuProfile.preset,
        `-threads:v:${index}`, String(cpuProfile.threadsPerRendition),
      ] : []),
      `-b:v:${index}`, `${bitrateKbps}k`,
      `-maxrate:v:${index}`, `${bitrateKbps}k`,
      `-bufsize:v:${index}`, `${bitrateKbps * 2}k`,
      `-pix_fmt:v:${index}`, videoColor.outputPixelFormat,
      ...buildSdrColorMetadataArguments(index, videoColor.toneMappedToSdr),
      `-force_key_frames:v:${index}`, `expr:gte(t,n_forced*${HLS_SEGMENT_DURATION_SECONDS})`,
      ...(hasAudio ? [
        `-c:a:${index}`, 'aac',
        `-b:a:${index}`, '160k',
        `-ac:a:${index}`, '2',
      ] : []),
    ];
  });
  const variantMap = renditions.map((_, index) =>
    hasAudio ? `v:${index},a:${index},name:${index}` : `v:${index},name:${index}`,
  ).join(' ');
  const transcodeArguments = (videoEncoder: string) => [
    '-hide_banner',
    '-loglevel', 'warning',
    '-nostdin',
    '-y',
    ...inputSeekArguments,
    '-i', inputPath,
    ...outputSeekArguments,
    '-filter_complex_threads', String(cpuProfile.filterThreads),
    '-filter_complex', filterComplex,
    ...streamMaps,
    ...streamArguments(videoEncoder),
    '-f', 'hls',
    '-hls_time', String(HLS_SEGMENT_DURATION_SECONDS),
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+temp_file',
    '-avoid_negative_ts', 'make_zero',
    '-var_stream_map', variantMap,
    '-master_pl_name', 'master.m3u8',
    '-hls_segment_filename', resolve(outputPath, 'segment_%v_%05d.ts'),
    resolve(outputPath, 'stream_%v.m3u8'),
  ];
  let selectedEncoder = requestedNvenc ? hardwareEncoder : softwareEncoder;
  await publishTranscoderStatus({
    accountId: job.accountId,
    state: 'transcoding',
    backend: requestedNvenc ? 'nvenc' : 'software',
    encoder: selectedEncoder,
    sessionId: session.id,
    jobId: job.id,
    lastError: null,
  });
  await annotateTranscodeJob(job, requestedNvenc ? 'nvenc' : 'software', selectedEncoder);
  let cancelled: boolean;
  try {
    cancelled = await runFfmpeg(job.id, session.id, transcodeArguments(selectedEncoder), () => publishTranscoderStatus({
      accountId: job.accountId,
      state: 'transcoding',
      backend: selectedEncoder.includes('_nvenc') ? 'nvenc' : 'software',
      encoder: selectedEncoder,
      sessionId: session.id,
      jobId: job.id,
      lastError: null,
    }));
  } catch (error) {
    if (!requestedNvenc || !(error instanceof FfmpegExecutionError)) throw error;
    console.warn(JSON.stringify({
      level: 'warn',
      component: 'transcoder',
      message: 'NVENC failed; retrying the session with software encoding',
      sessionId: session.id,
      encoder: selectedEncoder,
      error: error instanceof Error ? error.message : 'Unknown NVENC failure',
    }));
    await removeHlsArtifacts(outputPath);
    selectedEncoder = softwareEncoder;
    await publishTranscoderStatus({
      accountId: job.accountId,
      state: 'fallback',
      backend: 'software',
      encoder: selectedEncoder,
      sessionId: session.id,
      jobId: job.id,
      lastError: error instanceof Error ? error.message : 'Unknown NVENC failure',
    });
    await annotateTranscodeJob(job, 'software', selectedEncoder);
    cancelled = await runFfmpeg(job.id, session.id, transcodeArguments(selectedEncoder), () => publishTranscoderStatus({
      accountId: job.accountId,
      state: 'transcoding',
      backend: 'software',
      encoder: selectedEncoder,
      sessionId: session.id,
      jobId: job.id,
      lastError: null,
    }));
  }
  if (cancelled) await rm(outputPath, { recursive: true, force: true });
  else await publishTranscoderStatus({
    accountId: job.accountId,
    state: 'ready',
    backend: selectedEncoder.includes('_nvenc') ? 'nvenc' : 'software',
    encoder: selectedEncoder,
    sessionId: session.id,
    jobId: job.id,
    lastError: null,
  });
}

function textSubtitleStreamIndexes(probe: Prisma.JsonValue | null): number[] {
  const root = asJsonObject(probe);
  const streams = Array.isArray(root.streams) ? root.streams.map(asJsonObject) : [];
  const codecs = new Set(['ass', 'mov_text', 'ssa', 'srt', 'subrip', 'webvtt']);
  return streams.flatMap((stream) => {
    if (stream.codec_type !== 'subtitle' || typeof stream.codec_name !== 'string') return [];
    if (!codecs.has(stream.codec_name.toLowerCase())) return [];
    const index = finiteInteger(stream.index);
    return index === null ? [] : [index];
  });
}

function audioStreamIndexes(probe: Prisma.JsonValue | null): number[] {
  const root = asJsonObject(probe);
  const streams = Array.isArray(root.streams) ? root.streams.map(asJsonObject) : [];
  return streams.flatMap((stream) => {
    if (stream.codec_type !== 'audio') return [];
    const index = finiteInteger(stream.index);
    return index === null ? [] : [index];
  });
}

function evenDimension(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function imageSubtitleStreamIndexes(probe: Prisma.JsonValue | null): number[] {
  const root = asJsonObject(probe);
  const streams = Array.isArray(root.streams) ? root.streams.map(asJsonObject) : [];
  const codecs = new Set(['dvb_subtitle', 'dvd_subtitle', 'hdmv_pgs_subtitle', 'pgssub', 'vobsub']);
  return streams.flatMap((stream) => {
    if (stream.codec_type !== 'subtitle' || typeof stream.codec_name !== 'string') return [];
    if (!codecs.has(stream.codec_name.toLowerCase())) return [];
    const index = finiteInteger(stream.index);
    return index === null ? [] : [index];
  });
}

type NvencCapabilities = { h264: boolean; hevc: boolean; gpuName: string | null; checkedAt: string };
let nvencEncoderCache: Promise<NvencCapabilities> | null = null;

function availableNvencEncoders(): Promise<NvencCapabilities> {
  if (nvencEncoderCache) return nvencEncoderCache;
  nvencEncoderCache = (async () => {
    const runtimeVisible =
      Boolean(process.env.NVIDIA_VISIBLE_DEVICES)
      && process.env.NVIDIA_VISIBLE_DEVICES !== 'void';
    if (!runtimeVisible) {
      return { h264: false, hevc: false, gpuName: null, checkedAt: new Date().toISOString() };
    }
    const [encoderResult, gpuResult] = await Promise.all([
      execFileAsync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 300_000 }).catch(() => ({ stdout: '', stderr: '' })),
      execFileAsync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 20_000 }).catch(() => ({ stdout: '', stderr: '' })),
    ]);
    const advertised = `${encoderResult.stdout}${encoderResult.stderr}`;
    const h264 = /\bh264_nvenc\b/.test(advertised) && await smokeNvencEncoder('h264_nvenc');
    const hevc = /\bhevc_nvenc\b/.test(advertised) && await smokeNvencEncoder('hevc_nvenc');
    return {
      h264,
      hevc,
      gpuName: gpuResult.stdout.trim().split(/\r?\n/)[0] || null,
      checkedAt: new Date().toISOString(),
    };
  })();
  return nvencEncoderCache;
}

async function smokeNvencEncoder(encoder: 'h264_nvenc' | 'hevc_nvenc'): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-f', 'lavfi', '-i', 'color=c=black:s=128x72:d=0.1',
      '-frames:v', '1', '-c:v', encoder, '-f', 'null', '-',
    ], { timeout: 15_000, maxBuffer: 100_000 });
    return true;
  } catch {
    return false;
  }
}

async function publishTranscoderStatus(runtime: {
  accountId: string;
  state: string;
  backend: 'nvenc' | 'software';
  encoder: string | null;
  sessionId: string | null;
  jobId: string | null;
  lastError: string | null;
}): Promise<void> {
  const capabilities = nvencEncoderCache ? await nvencEncoderCache : {
    h264: false,
    hevc: false,
    gpuName: null,
    checkedAt: new Date().toISOString(),
  };
  const telemetry = await nvidiaTelemetry();
  const { accountId, ...status } = runtime;
  const value = {
    ...status,
    capabilities,
    telemetry,
    cpuProfile: resolveCpuTranscodeProfile({
      availableThreads: availableParallelism(),
      renditionCount: Number.parseInt(process.env.BB_MEDIA_MAX_TRANSCODE_RENDITIONS?.trim() || '4', 10) || 4,
      configuredThreads: process.env.BB_MEDIA_CPU_TRANSCODE_THREADS,
      configuredRenditions: process.env.BB_MEDIA_MAX_TRANSCODE_RENDITIONS,
      configuredPreset: process.env.BB_MEDIA_CPU_TRANSCODE_PRESET,
      configuredMaxHeight: process.env.BB_MEDIA_MAX_TRANSCODE_HEIGHT
        ?? (/^(?:true|1|yes)$/i.test(process.env.BB_MEDIA_GPU_ENABLED?.trim() ?? '') ? 2160 : 1080),
    }),
    maxConcurrent: transcodeMaxConcurrent,
    workerId,
    updatedAt: new Date().toISOString(),
  };
  await prisma.systemSetting.upsert({
    where: { accountId_key: { accountId, key: transcodeStatusKey } },
    create: {
      accountId,
      key: transcodeStatusKey,
      value,
    },
    update: { value },
  }).catch(() => undefined);
}

async function annotateTranscodeJob(
  job: ClaimedJob,
  backend: 'nvenc' | 'software',
  encoder: string,
): Promise<void> {
  const payload = {
    ...asJsonObject(job.payload),
    transcodeBackend: backend,
    transcodeEncoder: encoder,
  };
  await prisma.systemJob.update({
    where: { id: job.id },
    data: { payload },
  });
  job.payload = payload;
}

async function removeHlsArtifacts(outputPath: string): Promise<void> {
  const entries = await readdir(outputPath, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() || /^(?:master|stream_|segment_|init_)/.test(entry.name))
    .map((entry) => rm(resolve(outputPath, entry.name), { recursive: true, force: true })));
}

async function removeSubtitleArtifacts(outputPath: string): Promise<void> {
  const entries = await readdir(outputPath, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && /^(?:embedded-\d+\.vtt|subtitle-status(?:-[^.]+)?\.(?:json|tmp))$/.test(entry.name))
    .map((entry) => rm(resolve(outputPath, entry.name), { force: true })));
}

async function nvidiaTelemetry(): Promise<{
  utilizationPercent: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  temperatureCelsius: number;
} | null> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu',
      '--format=csv,noheader,nounits',
    ], { encoding: 'utf8', timeout: 10_000, maxBuffer: 20_000 });
    const values = stdout.trim().split(/\r?\n/)[0]?.split(',').map((value) => Number.parseInt(value.trim(), 10));
    if (!values || values.length < 4 || values.some((value) => !Number.isFinite(value))) return null;
    return {
      utilizationPercent: values[0]!,
      memoryUsedMiB: values[1]!,
      memoryTotalMiB: values[2]!,
      temperatureCelsius: values[3]!,
    };
  } catch {
    return null;
  }
}

async function publishIdleTranscoderStatus(): Promise<void> {
  const capabilities = await availableNvencEncoders();
  const nvencAvailable = capabilities.h264 || capabilities.hevc;
  const accounts = await prisma.account.findMany({ select: { id: true } });
  await Promise.all(accounts.map(({ id }) => publishTranscoderStatus({
    accountId: id,
    state: 'idle',
    backend: nvencAvailable ? 'nvenc' : 'software',
    encoder: capabilities.h264 ? 'h264_nvenc' : capabilities.hevc ? 'hevc_nvenc' : null,
    sessionId: null,
    jobId: null,
    lastError: null,
  })));
}

class FfmpegExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfmpegExecutionError';
  }
}

async function runFfmpeg(
  jobId: string,
  sessionId: string,
  args: string[],
  onHeartbeat?: () => Promise<void>,
): Promise<boolean> {
  return new Promise<boolean>((resolveProcess, rejectProcess) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let cancelled = false;
    let leaseFailure: Error | null = null;
    let checking = false;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      void Promise.all([
        renewJobLease(jobId),
        prisma.systemJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        }),
        prisma.playbackSession.findUnique({
          where: { id: sessionId },
          select: { status: true, leaseExpiresAt: true },
        }),
        onHeartbeat?.() ?? Promise.resolve(),
      ]).then(([, currentJob, session]) => {
        if (
          currentJob?.status !== 'running'
          || !session
          || !['reserving', 'active', 'paused'].includes(session.status)
          || session.leaseExpiresAt <= new Date()
        ) {
          cancelled = true;
          child.kill('SIGTERM');
        }
      }).catch((error: unknown) => {
        leaseFailure = error instanceof Error ? error : new Error('Unable to renew transcode lease');
        child.kill('SIGTERM');
      }).finally(() => {
        checking = false;
      });
    }, 10_000);
    child.once('error', (error) => {
      clearInterval(timer);
      rejectProcess(new FfmpegExecutionError(`Unable to start FFmpeg: ${error.message}`));
    });
    child.once('close', (code) => {
      clearInterval(timer);
      if (leaseFailure) {
        rejectProcess(leaseFailure);
        return;
      }
      if (cancelled) {
        resolveProcess(true);
        return;
      }
      if (code !== 0) {
        rejectProcess(new FfmpegExecutionError(`FFmpeg exited with code ${code}: ${stderr.trim() || 'no diagnostic output'}`));
        return;
      }
      resolveProcess(false);
    });
  });
}

async function enrichMetadata(job: ClaimedJob): Promise<void> {
  const payload = asJsonObject(job.payload);
  const mediaType = payload.mediaType === 'movie' || payload.mediaType === 'series'
    ? payload.mediaType
    : 'all';
  await enrichLibraryMetadata(prisma, {
    accountId: job.accountId,
    ...(typeof payload.libraryId === 'string' ? { libraryId: payload.libraryId } : {}),
    ...(typeof payload.mediaId === 'string' ? { mediaId: payload.mediaId } : {}),
    ...(typeof payload.seriesTitle === 'string' ? { seriesTitle: payload.seriesTitle } : {}),
    onlyMissing: payload.onlyMissing === true,
    force: payload.force === true,
    mediaType,
    onProgress: async (progress) => {
      await renewJobLease(job.id);
      await updateJobProgress(prisma, job, { stage: 'Henter metadata', current: progress.completed, total: progress.total, percent: progress.total > 0 ? (progress.completed / progress.total) * 100 : 100, message: `${progress.matched} matchet · ${progress.unmatched} uden match` });
    },
  });
}

async function upsertScannedFile(input: {
  accountId: string;
  libraryId: string;
  storageRootId: string;
  libraryType: 'movie' | 'series' | 'mixed';
  scanId: string;
  absolutePath: string;
  relativePath: string;
  libraryRelativePath: string;
  sizeBytes: number;
  modifiedAt: Date;
  probe: ProbeMetadata | null;
}): Promise<boolean> {
  const existing = await prisma.mediaFile.findUnique({
    where: { libraryId_relativePath: { libraryId: input.libraryId, relativePath: input.relativePath } },
  });
  const classification = classifyMediaPath(input.libraryType, input.libraryRelativePath);
  const mediaType: MediaType = classification.type;
  const fileData = {
    accountId: input.accountId,
    libraryId: input.libraryId,
    storageRootId: input.storageRootId,
    relativePath: input.relativePath,
    sizeBytes: BigInt(input.sizeBytes),
    modifiedAt: input.modifiedAt,
    status: input.probe ? 'ready' as const : 'unreadable' as const,
    container: input.probe?.container ?? null,
    videoCodec: input.probe?.videoCodec ?? null,
    audioCodec: input.probe?.audioCodec ?? null,
    width: input.probe?.width ?? null,
    height: input.probe?.height ?? null,
    durationMs: input.probe?.durationMs ?? null,
    bitrate: input.probe?.bitrate ?? null,
    probe: input.probe?.raw ?? Prisma.JsonNull,
    lastSeenScanId: input.scanId,
  };
  const mediaData = {
    title: classification.title,
    type: mediaType,
    category: classification.category,
    seriesTitle: classification.seriesTitle,
    seasonNumber: classification.seasonNumber,
    episodeNumber: classification.episodeNumber,
    releaseYear: classification.releaseYear,
    codec: input.probe?.videoCodec ?? null,
    container: input.probe?.container ?? null,
    bitrate: input.probe?.bitrate ?? null,
    width: input.probe?.width ?? null,
    height: input.probe?.height ?? null,
  };
  if (existing) {
    await prisma.$transaction([
      prisma.mediaItem.update({ where: { id: existing.mediaItemId }, data: mediaData }),
      prisma.mediaFile.update({ where: { id: existing.id }, data: fileData }),
    ]);
    return false;
  }
  await prisma.mediaItem.create({
    data: {
      accountId: input.accountId,
      libraryId: input.libraryId,
      ...mediaData,
      file: { create: fileData },
    },
  });
  return true;
}

async function probeFile(path: string): Promise<ProbeMetadata> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    path,
  ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  const raw = JSON.parse(stdout) as unknown;
  const root = asJsonObject(raw);
  const format = asJsonObject(root.format);
  const streams = Array.isArray(root.streams) ? root.streams.map(asJsonObject) : [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const durationSeconds = finiteNumber(format.duration);
  return {
    raw: raw as Prisma.InputJsonValue,
    container: typeof format.format_name === 'string' ? format.format_name.split(',')[0] ?? null : null,
    videoCodec: typeof video?.codec_name === 'string' ? video.codec_name : null,
    audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : null,
    width: finiteInteger(video?.width),
    height: finiteInteger(video?.height),
    durationMs: durationSeconds === null ? null : clampInteger(durationSeconds * 1000),
    bitrate: finiteInteger(format.bit_rate),
  };
}

async function walkMediaFiles(
  startPath: string,
  recursive: boolean,
  onFile: (path: string) => Promise<void>,
  onError: (error: unknown) => void,
): Promise<void> {
  const pending = [startPath];
  while (pending.length) {
    const directory = pending.shift();
    if (!directory) continue;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      onError(error);
      continue;
    }
    for (const entry of entries) {
      const path = `${directory}${sep}${entry.name}`;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (recursive) pending.push(path);
        continue;
      }
      if (!entry.isFile() || !mediaExtensions.has(extname(entry.name).toLowerCase())) continue;
      try {
        await onFile(path);
      } catch (error) {
        onError(error);
      }
    }
  }
}

async function renewJobLease(jobId: string): Promise<void> {
  const result = await prisma.systemJob.updateMany({
    where: { id: jobId, workerId, status: 'running' },
    data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
  });
  if (result.count !== 1) throw new Error('Worker lost the job lease');
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function finiteInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number === null ? null : clampInteger(number);
}

function clampInteger(value: number): number {
  return Math.max(0, Math.min(2_147_483_647, Math.round(value)));
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function expirePlaybackLeases(): Promise<number> {
  const now = new Date();
  const expired = await prisma.$transaction(async (tx) => {
    const sessions = await tx.playbackSession.findMany({
      where: {
        status: { in: ['reserving', 'active', 'paused'] },
        leaseExpiresAt: { lte: now },
      },
      select: { id: true },
    });
    if (!sessions.length) return 0;
    const ids = sessions.map(({ id }) => id);
    await tx.playbackSession.updateMany({
      where: { id: { in: ids } },
      data: { status: 'expired', endedAt: now },
    });
    await tx.streamReservation.updateMany({
      where: { playbackSessionId: { in: ids }, releasedAt: null },
      data: { releasedAt: now, reason: 'lease_expired' },
    });
    return ids.length;
  });
  const finished = await prisma.playbackSession.findMany({
    where: {
      method: 'transcode',
      status: { notIn: ['reserving', 'active', 'paused'] },
      endedAt: { lte: new Date(Date.now() - 5 * 60_000) },
    },
    select: { id: true },
  });
  await Promise.all(finished.map(({ id }) => rm(resolve(transcodeRoot, id), { recursive: true, force: true })));
  return expired;
}

async function recoverExpiredWorkerLeases(now = new Date()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.systemJob.findMany({
      where: {
        status: 'running',
        leaseExpiresAt: { lte: now },
      },
      orderBy: { leaseExpiresAt: 'asc' },
      take: 100,
      select: {
        id: true,
        attemptCount: true,
        maxAttempts: true,
      },
    });
    let recovered = 0;
    for (const job of expired) {
      const terminal = job.attemptCount >= job.maxAttempts;
      await tx.jobAttempt.updateMany({
        where: {
          jobId: job.id,
          number: job.attemptCount,
          status: 'running',
        },
        data: {
          status: 'failed',
          error: 'Worker lease expired',
          endedAt: now,
        },
      });
      const updated = await tx.systemJob.updateMany({
        where: {
          id: job.id,
          status: 'running',
          leaseExpiresAt: { lte: now },
        },
        data: terminal
          ? {
              status: 'failed',
              workerId: null,
              lockedAt: null,
              leaseExpiresAt: null,
            }
          : {
              status: 'queued',
              availableAt: now,
              workerId: null,
              lockedAt: null,
              leaseExpiresAt: null,
            },
      });
      recovered += updated.count;
    }
    return recovered;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function finishJob(job: ClaimedJob): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const completed = await tx.systemJob.updateMany({
      where: { id: job.id, status: 'running', workerId },
      data: { status: 'completed', workerId: null, lockedAt: null, leaseExpiresAt: null, payload: withJobProgress(job.payload, { stage: 'Afsluttet', percent: 100 }) },
    });
    if (completed.count !== 1) {
      await tx.jobAttempt.updateMany({
        where: { jobId: job.id, number: job.attemptNumber, status: 'running' },
        data: { status: 'cancelled', error: 'Opgaven blev annulleret', endedAt: new Date() },
      });
      return false;
    }
    await tx.jobAttempt.update({
      where: { jobId_number: { jobId: job.id, number: job.attemptNumber } },
      data: { status: 'completed', endedAt: new Date() },
    });
    return true;
  });
}

async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown worker failure';
  const terminal = job.attemptNumber >= job.maxAttempts;
  await prisma.$transaction(async (tx) => {
    const current = await tx.systemJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (current?.status === 'cancelled') {
      await tx.jobAttempt.updateMany({
        where: { jobId: job.id, number: job.attemptNumber, status: 'running' },
        data: { status: 'cancelled', error: 'Opgaven blev annulleret', endedAt: new Date() },
      });
      await tx.systemJob.update({
        where: { id: job.id },
        data: { workerId: null, lockedAt: null, leaseExpiresAt: null },
      });
      return;
    }
    await tx.jobAttempt.update({
      where: { jobId_number: { jobId: job.id, number: job.attemptNumber } },
      data: { status: 'failed', error: message.slice(0, 2_000), endedAt: new Date() },
    });
    await tx.systemJob.updateMany({
      where: { id: job.id, status: 'running', workerId },
      data: {
        status: terminal ? 'failed' : 'queued',
        availableAt: terminal ? job.availableAt : new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** job.attemptNumber)),
        workerId: null,
        lockedAt: null,
        leaseExpiresAt: null,
      },
    });
  });
}

async function ensureRecurringLeaseJob(): Promise<void> {
  const existing = await prisma.systemJob.findFirst({
    where: { type: 'playback.expire-leases', status: { in: ['queued', 'running'] } },
  });
  if (existing) return;
  const bootstrap = await prisma.systemBootstrap.findUnique({ where: { id: 'singleton' } });
  if (!bootstrap) return;
  await prisma.systemJob.create({
    data: {
      accountId: bootstrap.accountId,
      type: 'playback.expire-leases',
      status: 'queued',
      payload: { recurring: true },
    },
  });
}

async function queueDueLibraryScans(): Promise<void> {
  const now = new Date();
  const libraries = await prisma.library.findMany({
    where: { autoScanEnabled: true },
    include: { scans: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  for (const library of libraries) {
    const last = library.lastScheduledScanAt ?? library.scans[0]?.createdAt ?? null;
    if (last && now.getTime() - last.getTime() < library.scanIntervalMinutes * 60_000) continue;
    await queueLibraryScanIfIdle(library, 'scheduler');
  }
}

async function queueLibraryScanIfIdle(
  library: { id: string; accountId: string },
  requestedBy: 'scheduler' | 'filesystem-watcher',
  change?: LibraryFileChange,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:library-scan'),
          hashtext(CAST(${library.id} AS text))
        )::text AS lock_result
      `;
      const active = await tx.libraryScan.findFirst({
        where: { libraryId: library.id, status: { in: ['queued', 'running'] } },
      });
      if (active) return false;
      const scan = await tx.libraryScan.create({
        data: { accountId: library.accountId, libraryId: library.id, status: 'queued' },
      });
      const job = await tx.systemJob.create({
        data: {
          accountId: library.accountId,
          type: 'library.scan',
          status: 'queued',
          payload: {
            libraryId: library.id,
            scanId: scan.id,
            requestedBy,
            ...(change ? { triggerEvent: change.event, triggerPath: change.path.slice(0, 1_000) } : {}),
          },
          maxAttempts: 3,
        },
      });
      await tx.libraryScan.update({ where: { id: scan.id }, data: { jobId: job.id } });
      await tx.library.update({ where: { id: library.id }, data: { lastScheduledScanAt: new Date() } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function syncLibraryChangeDetector(): Promise<void> {
  if (!libraryWatchConfig.enabled) {
    await libraryChangeDetector?.close();
    libraryChangeDetector = null;
    const accounts = await prisma.account.findMany({ select: { id: true } });
    await Promise.all(accounts.map(({ id }) => publishLibraryWatcherStatus(id, {
      enabled: false,
      state: 'disabled',
      watchedLibraryCount: 0,
      monitoredPaths: [],
      lastSuccessfulSyncAt: new Date().toISOString(),
    })));
    return;
  }
  libraryChangeDetector ??= new LibraryChangeDetector(
    libraryWatchConfig,
    async (change) => {
      const queued = await queueLibraryScanIfIdle(
        { id: change.libraryId, accountId: change.accountId },
        'filesystem-watcher',
        change,
      );
      await publishLibraryWatcherStatus(change.accountId, {
        lastFileEvent: {
          libraryId: change.libraryId,
          event: change.event,
          path: change.path.slice(0, 1_000),
          at: new Date().toISOString(),
          queuedScan: queued,
        },
      });
      if (queued) console.info(JSON.stringify({
        level: 'info',
        component: 'library-watcher',
        message: 'Queued library scan after filesystem change',
        libraryId: change.libraryId,
        event: change.event,
        path: change.path,
      }));
    },
    (error, libraryId) => {
      const message = error instanceof Error ? error.message : 'Unknown watcher failure';
      const accountId = libraryWatcherAccountsByLibrary.get(libraryId);
      if (accountId) void publishLibraryWatcherStatus(accountId, {
        state: 'degraded',
        lastError: { libraryId, message, at: new Date().toISOString() },
      }).catch(() => undefined);
      console.warn(JSON.stringify({
        level: 'warn',
        component: 'library-watcher',
        message: 'Library watcher reported an error; scheduled scanning remains active',
        libraryId,
        error: message,
      }));
    },
  );
  const [libraries, accounts] = await Promise.all([
    prisma.library.findMany({
      where: { autoScanEnabled: true },
      select: { id: true, accountId: true, paths: { select: { path: true } } },
    }),
    prisma.account.findMany({ select: { id: true } }),
  ]);
  libraryWatcherAccountsByLibrary.clear();
  for (const library of libraries) libraryWatcherAccountsByLibrary.set(library.id, library.accountId);
  const count = await libraryChangeDetector.sync(libraries.map((library) => ({
    id: library.id,
    accountId: library.accountId,
    paths: library.paths.map((path) => path.path),
  })));
  const synchronizedAt = new Date().toISOString();
  await Promise.all(accounts.map(({ id }) => {
    const accountLibraries = libraries.filter((library) => library.accountId === id && library.paths.length > 0);
    return publishLibraryWatcherStatus(id, {
      enabled: true,
      state: accountLibraries.length > 0 ? 'active' : 'idle',
      watchedLibraryCount: accountLibraries.length,
      monitoredPaths: accountLibraries.flatMap((library) => library.paths.map((entry) => entry.path)),
      lastSuccessfulSyncAt: synchronizedAt,
    });
  }));
  console.info(JSON.stringify({
    level: 'info',
    component: 'library-watcher',
    message: 'Synchronized library filesystem watchers',
    watchedLibraries: count,
    usePolling: libraryWatchConfig.usePolling,
  }));
}

async function publishLibraryWatcherStatus(
  accountId: string,
  patch: Partial<LibraryWatcherRuntime>,
): Promise<void> {
  const current = libraryWatcherRuntime.get(accountId);
  const now = new Date().toISOString();
  const status: LibraryWatcherRuntime = {
    enabled: libraryWatchConfig.enabled,
    state: libraryWatchConfig.enabled ? 'idle' : 'disabled',
    mode: libraryWatchConfig.usePolling ? 'polling' : 'native',
    watchedLibraryCount: 0,
    monitoredPaths: [],
    pollIntervalMs: libraryWatchConfig.pollIntervalMs,
    writeStabilityMs: libraryWatchConfig.writeStabilityMs,
    debounceMs: libraryWatchConfig.debounceMs,
    refreshIntervalMs: libraryWatchConfig.refreshIntervalMs,
    lastSuccessfulSyncAt: null,
    lastFileEvent: null,
    lastError: null,
    ...current,
    ...patch,
    workerId,
    lastHeartbeatAt: now,
  };
  libraryWatcherRuntime.set(accountId, status);
  await prisma.systemSetting.upsert({
    where: { accountId_key: { accountId, key: libraryWatcherStatusKey } },
    create: { accountId, key: libraryWatcherStatusKey, value: status },
    update: { value: status },
  });
}

async function rescheduleRecurringJob(job: ClaimedJob): Promise<void> {
  const payload = job.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const recurringPayload = payload as Prisma.JsonObject;
  if (recurringPayload.recurring !== true) return;
  await prisma.systemJob.create({
    data: {
      accountId: job.accountId,
      type: job.type,
      status: 'queued',
      payload: recurringPayload,
      availableAt: new Date(Date.now() + 30_000),
    },
  });
}

async function executeClaimedJob(job: ClaimedJob): Promise<void> {
  try {
    await withJobLeaseHeartbeat(
      () => processJob(job),
      () => renewJobLease(job.id),
      { leaseMs },
    );
    const completed = await finishJob(job);
    if (completed) await rescheduleRecurringJob(job);
  } catch (error) {
    if (workerMode === 'transcode') {
      const payload = asJsonObject(job.payload);
      await publishTranscoderStatus({
        accountId: job.accountId,
        state: 'failed',
        backend: payload.transcodeBackend === 'nvenc' ? 'nvenc' : 'software',
        encoder: typeof payload.transcodeEncoder === 'string' ? payload.transcodeEncoder : null,
        sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : null,
        jobId: job.id,
        lastError: error instanceof Error ? error.message : 'Unknown transcode failure',
      });
    }
    await failJob(job, error);
    console.error(JSON.stringify({
      level: 'error',
      component: 'worker',
      workerId,
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown worker failure',
    }));
  }
}

async function loop(): Promise<void> {
  await prisma.$connect();
  if (workerMode === 'jobs') {
    await ensureRecurringLeaseJob();
    await syncLibraryChangeDetector();
    lastLibraryWatchSync = Date.now();
  }
  const activeJobs = new Map<string, { type: string; promise: Promise<void> }>();
  console.info(JSON.stringify({
    level: 'info',
    component: 'worker',
    workerId,
    workerMode,
    concurrency: workerConcurrency,
    message: 'Worker started',
  }));
  while (!stopping) {
    if (
      workerMode === 'transcode'
      && activeJobs.size === 0
      && Date.now() - lastTranscoderHeartbeat >= 30_000
    ) {
      lastTranscoderHeartbeat = Date.now();
      await publishIdleTranscoderStatus().catch((error) => console.warn(JSON.stringify({
        level: 'warn',
        component: 'transcoder',
        message: 'Unable to publish transcoder availability',
        error: error instanceof Error ? error.message : 'Unknown status failure',
      })));
    }
    if (workerMode === 'jobs' && Date.now() - lastLibraryScheduleCheck >= 30_000) {
      lastLibraryScheduleCheck = Date.now();
      try {
        await queueDueLibraryScans();
      } catch (error) {
        console.error(JSON.stringify({
          level: 'error',
          component: 'library-scheduler',
          workerId,
          error: error instanceof Error ? error.message : 'Unknown library scheduler failure',
        }));
      }
    }
    if (workerMode === 'jobs' && Date.now() - lastLibraryWatchSync >= libraryWatchConfig.refreshIntervalMs) {
      lastLibraryWatchSync = Date.now();
      try {
        await syncLibraryChangeDetector();
      } catch (error) {
        console.error(JSON.stringify({
          level: 'error',
          component: 'library-watcher',
          workerId,
          message: 'Unable to synchronize library watchers; scheduled scanning remains active',
          error: error instanceof Error ? error.message : 'Unknown watcher synchronization failure',
        }));
      }
    }
    if (Date.now() - lastStaleWorkerLeaseSweep >= staleWorkerLeaseSweepMs) {
      lastStaleWorkerLeaseSweep = Date.now();
      try {
        const recovered = await recoverExpiredWorkerLeases();
        if (recovered > 0) {
          console.warn(JSON.stringify({
            level: 'warn',
            component: 'job-lease-recovery',
            workerId,
            recovered,
          }));
        }
      } catch (error) {
        console.error(JSON.stringify({
          level: 'error',
          component: 'job-lease-recovery',
          workerId,
          error: error instanceof Error ? error.message : 'Unknown stale job lease recovery failure',
        }));
      }
    }
    const allowedTypes = claimableWorkerJobTypes({
      workerMode,
      activeJobTypes: [...activeJobs.values()].map((active) => active.type),
      limits: workerConcurrency,
    });
    const job = await claimNextJob(allowedTypes);
    if (job) {
      const promise = executeClaimedJob(job).finally(() => activeJobs.delete(job.id));
      activeJobs.set(job.id, { type: job.type, promise });
      continue;
    }
    await Promise.race([
      delay(pollIntervalMs),
      ...[...activeJobs.values()].map((active) => active.promise),
    ]);
  }
  await Promise.allSettled([...activeJobs.values()].map((active) => active.promise));
  await libraryChangeDetector?.close();
  await prisma.$disconnect();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true; });
}

void loop().catch(async (error: unknown) => {
  console.error(JSON.stringify({
    level: 'fatal',
    component: 'worker',
    workerId,
    error: error instanceof Error ? error.message : 'Unknown worker startup failure',
  }));
  await libraryChangeDetector?.close();
  await prisma.$disconnect();
  process.exitCode = 1;
});
