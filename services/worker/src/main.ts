import { MediaType, Prisma, PrismaClient, SystemJob } from '@prisma/client';
import { classifyMediaPath, detectVideoSignalProfile } from '@boltbytes/contracts';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import { extname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { enrichLibraryMetadata, hasTmdbConfiguration } from './metadata.js';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);
const workerMode = process.env.BB_MEDIA_WORKER_MODE === 'transcode' ? 'transcode' : 'jobs';
const workerId = `${workerMode}-${randomUUID()}`;
const pollIntervalMs = 2_000;
const leaseMs = 60_000;
const transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');

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

async function claimNextJob(): Promise<ClaimedJob | null> {
  return prisma.$transaction(async (tx) => {
    const typeFilter = workerMode === 'transcode'
      ? Prisma.sql`type = 'playback.transcode'`
      : Prisma.sql`type <> 'playback.transcode'`;
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
    case 'playback.transcode':
      await transcodePlayback(job);
      return;
    case 'playback.expire-leases':
      await expirePlaybackLeases();
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

  let filesSeen = 0;
  let filesCreated = 0;
  let filesUpdated = 0;
  let errors = 0;
  let lastLeaseRenewal = 0;
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
  if (!session || session.method !== 'transcode') throw new Error('Transcode playback session was not found');
  if (!['reserving', 'active', 'paused'].includes(session.status) || session.leaseExpiresAt <= new Date()) return;
  const file = session.media.file;
  if (!file || file.status !== 'ready') throw new Error('Transcode source file is unavailable');

  const mediaRoot = await realpath(file.storageRoot.mountPath);
  const inputPath = await realpath(resolve(mediaRoot, ...file.relativePath.split('/')));
  if (!isWithin(mediaRoot, inputPath)) throw new Error('Transcode source escapes its storage root');

  await mkdir(transcodeRoot, { recursive: true });
  const outputPath = resolve(transcodeRoot, session.id);
  if (!isWithin(transcodeRoot, outputPath)) throw new Error('Transcode output escapes its storage root');
  await rm(outputPath, { recursive: true, force: true });
  await mkdir(outputPath, { recursive: true });

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
  const renditions = (requestedRenditions.length > 0
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
      }]).slice(0, 4);
  const preserveHdrRequested =
    payload.preserveHdr === true
    && payload.hdrMode !== 'force_sdr'
    && sourceVideo.hdr !== null
    && renditions.every((rendition) => rendition.hdr);
  for (const streamIndex of textSubtitleStreamIndexes(file.probe)) {
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
        resolve(outputPath, `embedded-${streamIndex}.vtt`),
      ]);
      if (subtitleCancelled) {
        await rm(outputPath, { recursive: true, force: true });
        return;
      }
    } catch (error) {
      await rm(resolve(outputPath, `embedded-${streamIndex}.vtt`), { force: true });
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

  const nvenc = await availableNvencEncoders();
  const videoEncoder = preserveHdrRequested
    ? nvenc.hevc ? 'hevc_nvenc' : 'libx265'
    : nvenc.h264 ? 'h264_nvenc' : 'libx264';
  const inputLabel = sourceVideo.hdr && !preserveHdrRequested
    ? '[0:v:0]zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p[prepared]'
    : '[0:v:0]null[prepared]';
  const splitOutputs = renditions.map((_, index) => `[split${index}]`).join('');
  const scaleOutputs = renditions.map((rendition, index) =>
    `[split${index}]scale=w=${rendition.width}:h=${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2[v${index}]`,
  );
  const filterComplex = [
    inputLabel,
    `[prepared]split=${renditions.length}${splitOutputs}`,
    ...scaleOutputs,
  ].join(';');
  const streamMaps = renditions.flatMap((_, index) => [
    '-map', `[v${index}]`,
    '-map', '0:a:0?',
  ]);
  const streamArguments = renditions.flatMap((rendition, index) => {
    const bitrateKbps = Math.round(rendition.bitrate / 1_000);
    return [
      `-c:v:${index}`, videoEncoder,
      `-b:v:${index}`, `${bitrateKbps}k`,
      `-maxrate:v:${index}`, `${bitrateKbps}k`,
      `-bufsize:v:${index}`, `${bitrateKbps * 2}k`,
      `-pix_fmt:v:${index}`, preserveHdrRequested ? 'p010le' : 'yuv420p',
      `-force_key_frames:v:${index}`, 'expr:gte(t,n_forced*4)',
      `-c:a:${index}`, 'aac',
      `-b:a:${index}`, '160k',
      `-ac:a:${index}`, '2',
    ];
  });
  const variantMap = renditions.map((_, index) => `v:${index},a:${index},name:${index}`).join(' ');
  const cancelled = await runFfmpeg(job.id, session.id, [
    '-hide_banner',
    '-loglevel', 'warning',
    '-nostdin',
    '-y',
    '-i', inputPath,
    '-filter_complex', filterComplex,
    ...streamMaps,
    ...streamArguments,
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+temp_file',
    '-var_stream_map', variantMap,
    '-master_pl_name', 'master.m3u8',
    '-hls_segment_filename', resolve(outputPath, 'segment_%v_%05d.ts'),
    resolve(outputPath, 'stream_%v.m3u8'),
  ]);
  if (cancelled) await rm(outputPath, { recursive: true, force: true });
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

function evenDimension(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

let nvencEncoderCache: Promise<{ h264: boolean; hevc: boolean }> | null = null;

function availableNvencEncoders(): Promise<{ h264: boolean; hevc: boolean }> {
  if (nvencEncoderCache) return nvencEncoderCache;
  nvencEncoderCache = new Promise((resolveEncoders) => {
    const runtimeVisible =
      Boolean(process.env.NVIDIA_VISIBLE_DEVICES)
      && process.env.NVIDIA_VISIBLE_DEVICES !== 'void';
    if (!runtimeVisible) {
      resolveEncoders({ h264: false, hevc: false });
      return;
    }
    const child = spawn('ffmpeg', ['-hide_banner', '-encoders'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output = `${output}${chunk}`.slice(-250_000);
    });
    child.stderr.on('data', (chunk: string) => {
      output = `${output}${chunk}`.slice(-250_000);
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolveEncoders({ h264: false, hevc: false });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveEncoders({
        h264: code === 0 && /\bh264_nvenc\b/.test(output),
        hevc: code === 0 && /\bhevc_nvenc\b/.test(output),
      });
    });
  });
  return nvencEncoderCache;
}

async function runFfmpeg(jobId: string, sessionId: string, args: string[]): Promise<boolean> {
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
        prisma.playbackSession.findUnique({
          where: { id: sessionId },
          select: { status: true, leaseExpiresAt: true },
        }),
      ]).then(([, session]) => {
        if (!session || !['reserving', 'active', 'paused'].includes(session.status) || session.leaseExpiresAt <= new Date()) {
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
      rejectProcess(error);
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
        rejectProcess(new Error(`FFmpeg exited with code ${code}: ${stderr.trim() || 'no diagnostic output'}`));
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
    onlyMissing: payload.onlyMissing === true,
    mediaType,
    onProgress: () => renewJobLease(job.id),
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

async function finishJob(job: ClaimedJob): Promise<void> {
  await prisma.$transaction([
    prisma.jobAttempt.update({
      where: { jobId_number: { jobId: job.id, number: job.attemptNumber } },
      data: { status: 'completed', endedAt: new Date() },
    }),
    prisma.systemJob.update({
      where: { id: job.id },
      data: { status: 'completed', workerId: null, lockedAt: null, leaseExpiresAt: null },
    }),
  ]);
}

async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown worker failure';
  const terminal = job.attemptNumber >= job.maxAttempts;
  await prisma.$transaction([
    prisma.jobAttempt.update({
      where: { jobId_number: { jobId: job.id, number: job.attemptNumber } },
      data: { status: 'failed', error: message.slice(0, 2_000), endedAt: new Date() },
    }),
    prisma.systemJob.update({
      where: { id: job.id },
      data: {
        status: terminal ? 'failed' : 'queued',
        availableAt: terminal ? job.availableAt : new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** job.attemptNumber)),
        workerId: null,
        lockedAt: null,
        leaseExpiresAt: null,
      },
    }),
  ]);
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

async function loop(): Promise<void> {
  await prisma.$connect();
  if (workerMode === 'jobs') await ensureRecurringLeaseJob();
  console.info(JSON.stringify({ level: 'info', component: 'worker', workerId, workerMode, message: 'Worker started' }));
  while (!stopping) {
    const job = await claimNextJob();
    if (!job) {
      await delay(pollIntervalMs);
      continue;
    }
    try {
      await processJob(job);
      await finishJob(job);
      await rescheduleRecurringJob(job);
    } catch (error) {
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
  await prisma.$disconnect();
  process.exitCode = 1;
});
