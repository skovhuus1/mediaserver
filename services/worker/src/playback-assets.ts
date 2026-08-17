import {
  buildTrickplayCues,
  chapterTimelineMarkers,
  creditsMarkerFromBlackSegments,
  detectRepeatedIntro,
  type FrameFingerprint,
  type MediaChapter,
  type TimelineMarker,
} from '@boltbytes/contracts';
import { Prisma, PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

type PlaybackAssetJob = { accountId: string; payload: Prisma.JsonValue };
type ProcessResult = { stdout: Buffer; stderr: string };

const tileWidth = 320;
const tileHeight = 180;
const columns = 5;
const rows = 5;
const fingerprintIntervalSeconds = 5;
const fingerprintOffsetSeconds = 15;

export async function generatePlaybackAssets(prisma: PrismaClient, job: PlaybackAssetJob): Promise<void> {
  const payload = jsonObject(job.payload);
  const mediaId = typeof payload.mediaId === 'string' ? payload.mediaId : null;
  if (!mediaId) throw new Error('media.playback-assets payload requires mediaId');
  const media = await prisma.mediaItem.findFirst({
    where: { id: mediaId, accountId: job.accountId },
    include: { file: { include: { storageRoot: true } } },
  });
  if (!media?.file || media.file.status !== 'ready') throw new Error('Media has no readable scanned file');
  const storageRoot = await realpath(media.file.storageRoot.mountPath);
  const sourcePath = await realpath(resolve(storageRoot, media.file.relativePath));
  if (!isWithin(storageRoot, sourcePath)) throw new Error('Media path escapes its storage root');
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) throw new Error('Media path is not a file');

  const transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');
  const assetDirectory = resolve(transcodeRoot, 'playback-assets', job.accountId, mediaId);
  if (!isWithin(transcodeRoot, assetDirectory)) throw new Error('Playback asset path escapes transcode root');
  await prisma.mediaPlaybackAsset.upsert({
    where: { mediaId },
    create: { accountId: job.accountId, mediaId, status: 'generating', sourceModifiedAt: media.file.modifiedAt },
    update: { status: 'generating', error: null, sourceModifiedAt: media.file.modifiedAt },
  });

  try {
    await rm(assetDirectory, { recursive: true, force: true });
    await mkdir(assetDirectory, { recursive: true });
    const probe = await probeTimeline(sourcePath);
    const durationMs = media.file.durationMs ?? probe.durationMs;
    if (!durationMs || durationMs < 1_000) throw new Error('Media duration is unavailable for trickplay');
    const intervalSeconds = Math.max(5, Math.min(30, Math.ceil(durationMs / 1_000 / 240)));
    const cues = buildTrickplayCues({ durationMs, intervalSeconds, columns, rows });
    const expectedSheets = Math.ceil(cues.length / (columns * rows));
    await runProcess('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
      '-vf', `fps=1/${intervalSeconds},scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease,pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2,tile=${columns}x${rows}:nb_frames=${columns * rows}`,
      '-an', '-vsync', '0', '-frames:v', String(expectedSheets), '-q:v', '4',
      resolve(assetDirectory, 'sprite-%03d.jpg'),
    ]);
    const sheetFiles = (await readdir(assetDirectory)).filter((name) => /^sprite-\d{3}\.jpg$/.test(name)).sort();
    if (!sheetFiles.length) throw new Error('FFmpeg did not create any trickplay sheets');

    const fingerprint = await createFingerprint(sourcePath, durationMs).catch(() => null);
    const automaticMarkers = await discoverMarkers(prisma, media, sourcePath, durationMs, probe.chapters, fingerprint);
    for (const marker of automaticMarkers) await storeAutomaticMarker(prisma, job.accountId, mediaId, marker);

    await prisma.mediaPlaybackAsset.update({
      where: { mediaId },
      data: {
        status: 'ready',
        spriteDirectory: relative(transcodeRoot, assetDirectory).split(sep).join('/'),
        manifest: { cues } as unknown as Prisma.InputJsonValue,
        fingerprint: fingerprint ? fingerprint as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
        intervalSeconds,
        tileWidth,
        tileHeight,
        columns,
        rows,
        frameCount: cues.length,
        sheetCount: sheetFiles.length,
        durationMs,
        sourceModifiedAt: media.file.modifiedAt,
        generatedAt: new Date(),
        error: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Playback asset generation failed';
    await prisma.mediaPlaybackAsset.updateMany({
      where: { accountId: job.accountId, mediaId },
      data: { status: 'failed', error: message.slice(0, 2_000) },
    });
    throw error;
  }
}

async function discoverMarkers(
  prisma: PrismaClient,
  media: { id: string; accountId: string; type: string; seriesMetadataProviderId: string | null; seriesDisplayTitle: string | null; seriesTitle: string | null },
  sourcePath: string,
  durationMs: number,
  chapters: MediaChapter[],
  fingerprint: FrameFingerprint | null,
): Promise<TimelineMarker[]> {
  const markers = chapterTimelineMarkers(chapters, durationMs);
  if (!markers.some((marker) => marker.kind === 'intro') && media.type === 'episode' && fingerprint) {
    const siblings = await prisma.mediaItem.findMany({
      where: {
        accountId: media.accountId,
        type: 'episode',
        id: { not: media.id },
        ...(media.seriesMetadataProviderId
          ? { seriesMetadataProviderId: media.seriesMetadataProviderId }
          : media.seriesDisplayTitle
            ? { seriesDisplayTitle: { equals: media.seriesDisplayTitle, mode: 'insensitive' } }
            : { seriesTitle: { equals: media.seriesTitle ?? '', mode: 'insensitive' } }),
      },
      select: { id: true },
      take: 12,
    });
    const siblingAssets = siblings.length ? await prisma.mediaPlaybackAsset.findMany({
      where: { mediaId: { in: siblings.map((sibling) => sibling.id) }, status: 'ready', fingerprint: { not: Prisma.JsonNull } },
      select: { mediaId: true, fingerprint: true },
    }) : [];
    const siblingFingerprints = siblingAssets.flatMap((asset) => {
      const parsed = playbackFingerprint(asset.fingerprint);
      return parsed ? [{ mediaId: asset.mediaId, fingerprint: parsed }] : [];
    });
    const intro = detectRepeatedIntro(fingerprint, siblingFingerprints.map((asset) => asset.fingerprint));
    if (intro) markers.push(intro);
    for (const sibling of siblingFingerprints) {
      const siblingIntro = detectRepeatedIntro(sibling.fingerprint, [fingerprint]);
      if (siblingIntro) await storeAutomaticMarker(prisma, media.accountId, sibling.mediaId, siblingIntro);
    }
  }
  if (!markers.some((marker) => marker.kind === 'credits')) {
    const blackSegments = await detectLateBlackSegments(sourcePath, durationMs).catch(() => []);
    const credits = creditsMarkerFromBlackSegments(blackSegments, durationMs);
    if (credits) markers.push(credits);
  }
  return markers;
}

async function storeAutomaticMarker(
  prisma: PrismaClient,
  accountId: string,
  mediaId: string,
  marker: TimelineMarker,
): Promise<void> {
  const existing = await prisma.mediaTimelineMarker.findUnique({ where: { mediaId_kind: { mediaId, kind: marker.kind } } });
  if (existing?.source === 'manual') return;
  await prisma.mediaTimelineMarker.upsert({
    where: { mediaId_kind: { mediaId, kind: marker.kind } },
    create: { accountId, mediaId, ...marker },
    update: marker,
  });
}

async function probeTimeline(sourcePath: string): Promise<{ durationMs: number | null; chapters: MediaChapter[] }> {
  const { stdout } = await runProcess('ffprobe', [
    '-v', 'error', '-show_chapters', '-show_entries', 'format=duration:chapter=start_time,end_time:chapter_tags=title',
    '-of', 'json', sourcePath,
  ]);
  const parsed = JSON.parse(stdout.toString('utf8')) as Record<string, unknown>;
  const format = jsonObject(parsed.format);
  const duration = Number(format.duration);
  const chapters = Array.isArray(parsed.chapters) ? parsed.chapters.flatMap((value) => {
    const chapter = jsonObject(value);
    const tags = jsonObject(chapter.tags);
    const start = Number(chapter.start_time);
    const end = Number(chapter.end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{ title: typeof tags.title === 'string' ? tags.title : '', startMs: Math.round(start * 1_000), endMs: Math.round(end * 1_000) }];
  }) : [];
  return { durationMs: Number.isFinite(duration) ? Math.round(duration * 1_000) : null, chapters };
}

async function createFingerprint(sourcePath: string, durationMs: number): Promise<FrameFingerprint> {
  const fingerprintSeconds = Math.max(0, Math.min(15 * 60, durationMs / 1_000 - fingerprintOffsetSeconds));
  const { stdout } = await runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-ss', String(fingerprintOffsetSeconds), '-i', sourcePath,
    '-t', String(fingerprintSeconds), '-vf', `fps=1/${fingerprintIntervalSeconds},scale=9:8:force_original_aspect_ratio=increase,crop=9:8,format=gray`,
    '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
  ]);
  const frameSize = 9 * 8;
  const hashes: string[] = [];
  for (let offset = 0; offset + frameSize <= stdout.length; offset += frameSize) {
    hashes.push(hashFrame(stdout.subarray(offset, offset + frameSize)));
  }
  return { intervalSeconds: fingerprintIntervalSeconds, offsetSeconds: fingerprintOffsetSeconds, hashes };
}

function hashFrame(frame: Buffer): string {
  let hash = 0n;
  let bit = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      if (frame[row * 9 + column]! > frame[row * 9 + column + 1]!) hash |= 1n << bit;
      bit += 1n;
    }
  }
  return hash.toString(16).padStart(16, '0');
}

async function detectLateBlackSegments(sourcePath: string, durationMs: number) {
  const startSeconds = Math.max(0, durationMs / 1_000 - 12 * 60);
  const { stderr } = await runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'info', '-ss', String(startSeconds), '-i', sourcePath,
    '-t', String(Math.min(12 * 60, durationMs / 1_000)), '-vf', 'blackdetect=d=1.2:pic_th=0.94',
    '-an', '-f', 'null', '-',
  ]);
  return [...stderr.matchAll(/black_start:([\d.]+).*?black_end:([\d.]+)/g)].map((match) => {
    const detectedStart = Number(match[1]);
    const detectedEnd = Number(match[2]);
    const offset = detectedStart < startSeconds / 2 ? startSeconds : 0;
    return { startMs: Math.round((offset + detectedStart) * 1_000), endMs: Math.round((offset + detectedEnd) * 1_000) };
  });
}

function playbackFingerprint(value: Prisma.JsonValue): FrameFingerprint | null {
  const parsed = jsonObject(value);
  if (!Array.isArray(parsed.hashes) || !parsed.hashes.every((hash) => typeof hash === 'string')) return null;
  const intervalSeconds = Number(parsed.intervalSeconds);
  const offsetSeconds = Number(parsed.offsetSeconds);
  return Number.isFinite(intervalSeconds) && Number.isFinite(offsetSeconds)
    ? { intervalSeconds, offsetSeconds, hashes: parsed.hashes as string[] }
    : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function runProcess(command: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      const errorText = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) reject(new Error(`${command} exited with ${code}: ${errorText.slice(-2_000)}`));
      else resolveProcess({ stdout: Buffer.concat(stdout), stderr: errorText });
    });
  });
}
