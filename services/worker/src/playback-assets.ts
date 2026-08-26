import {
  buildTrickplayCues,
  analyzeRepeatedIntro,
  analyzeRepeatedRecap,
  chapterTimelineMarkers,
  creditsMarkerFromBlackSegments,
  playbackMarkerAnalysisVersion,
  type FrameFingerprint,
  type MediaChapter,
  type TimelineMarker,
} from '@boltbytes/contracts';
import { Prisma, PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { updateJobProgress } from './job-progress.js';

type PlaybackAssetJob = { id?: string; accountId: string; payload: Prisma.JsonValue };
type ProcessResult = { stdout: Buffer; stderr: string };

const tileWidth = 320;
const tileHeight = 180;
const columns = 5;
const rows = 5;
const fingerprintIntervalSeconds = 5;
const fingerprintOffsetSeconds = 0;
const fingerprintVersion = 3;

export async function generatePlaybackAssets(prisma: PrismaClient, job: PlaybackAssetJob): Promise<void> {
  const payload = jsonObject(job.payload);
  const mediaId = typeof payload.mediaId === 'string' ? payload.mediaId : null;
  if (!mediaId) throw new Error('media.playback-assets payload requires mediaId');
  const report = (stage: string, percent: number, message?: string) => job.id
    ? updateJobProgress(prisma, job as PlaybackAssetJob & { id: string }, { stage, percent, ...(message ? { message } : {}) })
    : Promise.resolve();
  await report('Forbereder analyse', 3);
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
    await report('Læser tidslinje', 10);
    const probe = await probeTimeline(sourcePath);
    const durationMs = media.file.durationMs ?? probe.durationMs;
    if (!durationMs || durationMs < 1_000) throw new Error('Media duration is unavailable for trickplay');
    const intervalSeconds = Math.max(5, Math.min(30, Math.ceil(durationMs / 1_000 / 240)));
    const cues = buildTrickplayCues({ durationMs, intervalSeconds, columns, rows });
    const expectedSheets = Math.ceil(cues.length / (columns * rows));
    await report('Genererer seek-preview', 25, `${expectedSheets} sprite-ark planlagt`);
    await runProcess('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
      '-vf', `fps=1/${intervalSeconds},scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease,pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2,tile=${columns}x${rows}:nb_frames=${columns * rows}`,
      '-an', '-vsync', '0', '-frames:v', String(expectedSheets), '-q:v', '4',
      resolve(assetDirectory, 'sprite-%03d.jpg'),
    ]);
    const sheetFiles = (await readdir(assetDirectory)).filter((name) => /^sprite-\d{3}\.jpg$/.test(name)).sort();
    if (!sheetFiles.length) throw new Error('FFmpeg did not create any trickplay sheets');

    await report('Vælger repræsentativt preview', 52, 'Undgår sorte åbningsframes');
    const previewSeekSeconds = Math.min(8 * 60, Math.max(5, Math.round(durationMs / 1_000 * 0.08)));
    await runProcess('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(previewSeekSeconds), '-i', sourcePath,
      '-vf', 'thumbnail=120,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black',
      '-frames:v', '1', '-q:v', '3', resolve(assetDirectory, 'preview.jpg'),
    ]).catch(() => undefined);

    await report('Sammenligner episoder', 70, `${sheetFiles.length} sprite-ark genereret`);
    const fingerprint = await createFingerprint(sourcePath, durationMs).catch(() => null);
    const markerResult = await discoverMarkers(prisma, media, sourcePath, durationMs, probe.chapters, fingerprint);
    for (const marker of markerResult.markers) await storeAutomaticMarker(prisma, job.accountId, mediaId, marker);

    await report('Gemmer playback-data', 94, `${markerResult.markers.length} automatiske markører`);
    await prisma.mediaPlaybackAsset.update({
      where: { mediaId },
      data: {
        status: 'ready',
        spriteDirectory: relative(transcodeRoot, assetDirectory).split(sep).join('/'),
        manifest: {
          cues,
          analysis: {
            fingerprintVersion,
            markerAnalysisVersion: playbackMarkerAnalysisVersion,
            preview: 'preview.jpg',
            recap: markerResult.recapAnalysis,
            intro: markerResult.introAnalysis,
          },
        } as unknown as Prisma.InputJsonValue,
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
): Promise<{
  markers: TimelineMarker[];
  recapAnalysis: MarkerAnalysis;
  introAnalysis: MarkerAnalysis;
}> {
  const markers = chapterTimelineMarkers(chapters, durationMs);
  let recapAnalysis = chapterOrEmptyAnalysis('recap', markers);
  let introAnalysis = chapterOrEmptyAnalysis('intro', markers);
  if (media.type === 'episode' && fingerprint && (!markers.some((marker) => marker.kind === 'recap') || !markers.some((marker) => marker.kind === 'intro'))) {
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
      take: 24,
    });
    const siblingAssets = siblings.length ? await prisma.mediaPlaybackAsset.findMany({
      where: { mediaId: { in: siblings.map((sibling) => sibling.id) }, status: 'ready', fingerprint: { not: Prisma.JsonNull } },
      select: { mediaId: true, fingerprint: true },
    }) : [];
    const siblingFingerprints = siblingAssets.flatMap((asset) => {
      const parsed = playbackFingerprint(asset.fingerprint);
      return parsed ? [{ mediaId: asset.mediaId, fingerprint: parsed }] : [];
    });

    if (!markers.some((marker) => marker.kind === 'recap')) {
      const detection = analyzeRepeatedRecap(fingerprint, siblingFingerprints.map((asset) => asset.fingerprint), {
        minimumReferences: 1,
      });
      recapAnalysis = withoutMarker(detection);
      if (detection.marker) markers.push(detection.marker);
      await syncAutomaticMarker(prisma, media.accountId, media.id, 'recap', detection);
    }
    if (!markers.some((marker) => marker.kind === 'intro')) {
      const recapEndSeconds = Math.ceil((markers.find((marker) => marker.kind === 'recap')?.endMs ?? 0) / 1_000);
      const detection = analyzeRepeatedIntro(fingerprint, siblingFingerprints.map((asset) => asset.fingerprint), {
        minimumReferences: 1,
        minimumStartSeconds: recapEndSeconds > 0 ? recapEndSeconds : 0,
        maximumStartSeconds: 10 * 60,
        maximumEndSeconds: 15 * 60,
      });
      introAnalysis = withoutMarker(detection);
      if (detection.marker) markers.push(detection.marker);
      await syncAutomaticMarker(prisma, media.accountId, media.id, 'intro', detection);
    }
    if (!markers.some((marker) => marker.kind === 'recap')) {
      const detection = recapLeadInFromIntro(
        fingerprint,
        markers.find((marker) => marker.kind === 'intro') ?? null,
        siblingFingerprints.length,
      );
      if (detection.marker) {
        recapAnalysis = withoutMarker(detection);
        markers.push(detection.marker);
        await syncAutomaticMarker(prisma, media.accountId, media.id, 'recap', detection);
      }
    }

    for (const sibling of siblingFingerprints) {
      const references = [
        fingerprint,
        ...siblingFingerprints.filter((entry) => entry.mediaId !== sibling.mediaId).map((entry) => entry.fingerprint),
      ];
      let siblingRecapDetection = analyzeRepeatedRecap(sibling.fingerprint, references, {
        minimumReferences: 1,
      });
      const siblingIntroDetection = analyzeRepeatedIntro(sibling.fingerprint, references, {
        minimumReferences: 1,
        minimumStartSeconds: siblingRecapDetection.marker
          ? Math.ceil(siblingRecapDetection.marker.endMs / 1_000)
          : 0,
        maximumStartSeconds: 10 * 60,
        maximumEndSeconds: 15 * 60,
      });
      if (!siblingRecapDetection.marker) {
        const leadInDetection = recapLeadInFromIntro(
          sibling.fingerprint,
          siblingIntroDetection.marker,
          references.length,
        );
        if (leadInDetection.marker) siblingRecapDetection = leadInDetection;
      }
      await syncAutomaticMarker(prisma, media.accountId, sibling.mediaId, 'recap', siblingRecapDetection);
      await syncAutomaticMarker(prisma, media.accountId, sibling.mediaId, 'intro', siblingIntroDetection);
      await mergeMarkerAnalysis(prisma, sibling.mediaId, { recap: siblingRecapDetection, intro: siblingIntroDetection });
    }
  }
  if (!markers.some((marker) => marker.kind === 'credits')) {
    const blackSegments = await detectLateBlackSegments(sourcePath, durationMs).catch(() => []);
    const credits = creditsMarkerFromBlackSegments(blackSegments, durationMs);
    if (credits) markers.push(credits);
    else {
      await prisma.mediaTimelineMarker.deleteMany({
        where: { accountId: media.accountId, mediaId: media.id, kind: 'credits', source: 'automatic' },
      });
    }
  }
  return { markers, recapAnalysis, introAnalysis };
}

type MarkerDetection = ReturnType<typeof analyzeRepeatedIntro>;
type MarkerAnalysis = Omit<MarkerDetection, 'marker'>;

function chapterOrEmptyAnalysis(kind: 'intro' | 'recap', markers: readonly TimelineMarker[]): MarkerAnalysis {
  return markers.some((marker) => marker.kind === kind)
    ? { state: 'detected', reason: 'chapter_marker', referenceCount: 0, supportCount: 0, usableFrameRatio: 1, confidence: 1 }
    : { state: 'not-detected', reason: 'no_repeated_sequence', referenceCount: 0, supportCount: 0, usableFrameRatio: 0, confidence: null };
}

function withoutMarker(detection: MarkerDetection): MarkerAnalysis {
  const { marker: _marker, ...analysis } = detection;
  return analysis;
}

export function recapLeadInFromIntro(
  fingerprint: FrameFingerprint,
  intro: TimelineMarker | null,
  referenceCount: number,
): MarkerDetection {
  const introStartMs = intro?.kind === 'intro' ? intro.startMs : 0;
  const minimumRecapMs = 20_000;
  const maximumRecapMs = 4 * 60_000;
  if (introStartMs < minimumRecapMs || introStartMs > maximumRecapMs) {
    return {
      state: 'not-detected',
      reason: 'no_repeated_sequence',
      referenceCount,
      supportCount: 0,
      usableFrameRatio: leadInUsableFrameRatio(fingerprint, introStartMs),
      confidence: null,
      marker: null,
    };
  }
  const usableFrameRatio = leadInUsableFrameRatio(fingerprint, introStartMs);
  if (usableFrameRatio < 0.25) {
    return {
      state: 'not-detected',
      reason: 'low_information',
      referenceCount,
      supportCount: 0,
      usableFrameRatio,
      confidence: null,
      marker: null,
    };
  }
  const confidence = Math.min(0.72, 0.42 + usableFrameRatio * 0.18 + Math.min(0.12, introStartMs / 240_000 * 0.12));
  return {
    state: 'detected',
    reason: 'detected',
    referenceCount,
    supportCount: Math.max(1, Math.min(referenceCount, 1)),
    usableFrameRatio,
    confidence,
    marker: {
      kind: 'recap',
      startMs: 0,
      endMs: introStartMs,
      source: 'automatic',
      confidence,
    },
  };
}

function leadInUsableFrameRatio(fingerprint: FrameFingerprint, endMs: number): number {
  if (endMs <= 0 || !fingerprint.hashes.length) return 0;
  const intervalMs = Math.max(1, fingerprint.intervalSeconds * 1_000);
  const offsetMs = Math.max(0, fingerprint.offsetSeconds * 1_000);
  let inspected = 0;
  let usable = 0;
  for (let index = 0; index < fingerprint.hashes.length; index += 1) {
    const frameMs = offsetMs + index * intervalMs;
    if (frameMs >= endMs) break;
    inspected += 1;
    const hash = fingerprint.hashes[index];
    if (!hash || /^0+$/.test(hash) || /^f+$/i.test(hash)) continue;
    const quality = fingerprint.quality?.[index];
    if (quality !== undefined && (!Number.isFinite(quality) || quality < 0.12)) continue;
    usable += 1;
  }
  return inspected ? usable / inspected : 0;
}

async function syncAutomaticMarker(
  prisma: PrismaClient,
  accountId: string,
  mediaId: string,
  kind: 'intro' | 'recap',
  detection: MarkerDetection,
): Promise<void> {
  if (detection.marker) await storeAutomaticMarker(prisma, accountId, mediaId, detection.marker);
  else {
    await prisma.mediaTimelineMarker.deleteMany({
      where: { accountId, mediaId, kind, source: 'automatic' },
    });
  }
}

async function storeAutomaticMarker(
  prisma: PrismaClient,
  accountId: string,
  mediaId: string,
  marker: TimelineMarker,
): Promise<void> {
  const existing = await prisma.mediaTimelineMarker.findUnique({ where: { mediaId_kind: { mediaId, kind: marker.kind } } });
  if (existing && existing.source !== 'automatic') return;
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
  const quality: number[] = [];
  for (let offset = 0; offset + frameSize <= stdout.length; offset += frameSize) {
    const frame = stdout.subarray(offset, offset + frameSize);
    hashes.push(hashFrame(frame));
    quality.push(fingerprintFrameQuality(frame));
  }
  return { version: fingerprintVersion, intervalSeconds: fingerprintIntervalSeconds, offsetSeconds: fingerprintOffsetSeconds, hashes, quality };
}

export function fingerprintFrameQuality(frame: Buffer): number {
  if (!frame.length) return 0;
  let sum = 0;
  for (const value of frame) sum += value;
  const mean = sum / frame.length;
  let squaredDifference = 0;
  for (const value of frame) squaredDifference += (value - mean) ** 2;
  const contrast = Math.sqrt(squaredDifference / frame.length);
  const exposure = Math.min(1, mean / 24, (255 - mean) / 24);
  return Math.max(0, Math.min(1, contrast / 34 * exposure));
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
  const quality = Array.isArray(parsed.quality)
    && parsed.quality.length === parsed.hashes.length
    && parsed.quality.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0 && entry <= 1)
    ? parsed.quality as number[]
    : undefined;
  return Number.isFinite(intervalSeconds) && Number.isFinite(offsetSeconds)
    ? {
        version: parsed.version === 3 ? 3 : parsed.version === 2 ? 2 : 1,
        intervalSeconds,
        offsetSeconds,
        hashes: parsed.hashes as string[],
        ...(quality ? { quality } : {}),
      }
    : null;
}

async function mergeMarkerAnalysis(
  prisma: PrismaClient,
  mediaId: string,
  detections: Partial<Record<'intro' | 'recap', MarkerDetection>>,
) {
  const asset = await prisma.mediaPlaybackAsset.findUnique({ where: { mediaId }, select: { manifest: true } });
  if (!asset) return;
  const manifest = jsonObject(asset.manifest);
  const existingAnalysis = jsonObject(manifest.analysis);
  const nextAnalysis: Record<string, unknown> = {
    ...existingAnalysis,
    fingerprintVersion,
    markerAnalysisVersion: playbackMarkerAnalysisVersion,
  };
  for (const [kind, detection] of Object.entries(detections) as Array<['intro' | 'recap', MarkerDetection | undefined]>) {
    if (detection) nextAnalysis[kind] = withoutMarker(detection);
  }
  await prisma.mediaPlaybackAsset.update({
    where: { mediaId },
    data: {
      manifest: {
        ...manifest,
        analysis: nextAnalysis,
      } as Prisma.InputJsonValue,
    },
  });
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
