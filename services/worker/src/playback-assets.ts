import {
  buildTrickplayCues,
  analyzePreviousEpisodeRecap,
  analyzeRepeatedIntro,
  chapterTimelineMarkers,
  creditsMarkerFromTailEvidence,
  playbackMarkerAnalysisVersion,
  type FrameFingerprint,
  type CreditsTailSample,
  type MediaChapter,
  type TimelineMarker,
} from '@boltbytes/contracts';
import { Prisma, PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { updateJobProgress } from './job-progress.js';
import { lookupIntroDbMarkers, type TheIntroDbLookupSummary } from './theintrodb.js';

type PlaybackAssetJob = { id?: string; accountId: string; payload: Prisma.JsonValue };
type ProcessResult = { stdout: Buffer; stderr: string };

const tileWidth = 320;
const tileHeight = 180;
const columns = 5;
const rows = 5;
const fingerprintIntervalSeconds = 2;
const fingerprintOffsetSeconds = 0;
const fingerprintVersion = 4;

type PlaybackFingerprintSet = {
  version: 4;
  opening: FrameFingerprint;
  whole: FrameFingerprint;
};

type PlaybackAnalysisCommit = {
  accountId: string;
  mediaId: string;
  markers: TimelineMarker[];
  assetData: Prisma.MediaPlaybackAssetUpdateInput;
};

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

  const previousAsset = await prisma.mediaPlaybackAsset.findUnique({ where: { mediaId } });
  const markerOnlyRequested = payload.analysisScope === 'marker_only'
    && Boolean(previousAsset?.spriteDirectory)
    && previousAsset?.sourceModifiedAt?.getTime() === media.file.modifiedAt.getTime();

  const transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');
  const assetDirectory = resolve(transcodeRoot, 'playback-assets', job.accountId, mediaId);
  if (!isWithin(transcodeRoot, assetDirectory)) throw new Error('Playback asset path escapes transcode root');
  const markerOnly = markerOnlyRequested
    && await trickplayCanBeReused(assetDirectory, previousAsset?.sheetCount ?? 0);
  await prisma.mediaPlaybackAsset.upsert({
    where: { mediaId },
    create: { accountId: job.accountId, mediaId, status: 'generating' },
    update: { status: 'generating', error: null },
  });

  try {
    if (!markerOnly) await rm(assetDirectory, { recursive: true, force: true });
    await mkdir(assetDirectory, { recursive: true });
    await report('Læser tidslinje', 10);
    const probe = await probeTimeline(sourcePath);
    const durationMs = media.file.durationMs ?? probe.durationMs;
    if (!durationMs || durationMs < 1_000) throw new Error('Media duration is unavailable for trickplay');
    const existingManifest = jsonObject(previousAsset?.manifest);
    const intervalSeconds = markerOnly
      ? previousAsset?.intervalSeconds ?? Math.max(5, Math.min(30, Math.ceil(durationMs / 1_000 / 240)))
      : Math.max(5, Math.min(30, Math.ceil(durationMs / 1_000 / 240)));
    const cues = markerOnly && Array.isArray(existingManifest.cues)
      ? existingManifest.cues
      : buildTrickplayCues({ durationMs, intervalSeconds, columns, rows });
    let sheetCount = markerOnly ? previousAsset?.sheetCount ?? 0 : 0;
    if (!markerOnly) {
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
      sheetCount = sheetFiles.length;
      await report('Vælger repræsentativt preview', 52, 'Undgår sorte åbningsframes');
      const previewSeekSeconds = Math.min(8 * 60, Math.max(5, Math.round(durationMs / 1_000 * 0.08)));
      await runProcess('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(previewSeekSeconds), '-i', sourcePath,
        '-vf', 'thumbnail=120,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black',
        '-frames:v', '1', '-q:v', '3', resolve(assetDirectory, 'preview.jpg'),
      ]).catch(() => undefined);
    }

    await report('Sammenligner episoder', 70, markerOnly ? 'Genbruger seek-preview' : `${sheetCount} sprite-ark genereret`);
    const fingerprint = await createFingerprintSet(sourcePath, durationMs).catch(() => null);
    const manualMarkers = await prisma.mediaTimelineMarker.findMany({
      where: { accountId: job.accountId, mediaId, source: 'manual' },
      orderBy: { startMs: 'asc' },
    });
    const markerResult = await discoverMarkers(prisma, media, sourcePath, durationMs, probe.chapters, fingerprint, manualMarkers as TimelineMarker[]);

    await report('Gemmer playback-data', 94, `${markerResult.markers.length} automatiske markører`);
    const analyzedAt = new Date().toISOString();
    await commitPlaybackAnalysis(prisma, {
      accountId: job.accountId,
      mediaId,
      markers: markerResult.markers,
      assetData: {
        status: 'ready',
        manifest: {
          ...existingManifest,
          cues,
          analysis: {
            fingerprintVersion,
            markerAnalysisVersion: playbackMarkerAnalysisVersion,
            analysisScope: markerOnly ? 'marker_only' : 'full',
            analyzedAt,
            preview: 'preview.jpg',
            recap: markerResult.recapAnalysis,
            intro: markerResult.introAnalysis,
            credits: markerResult.creditsAnalysis,
            providers: {
              theintrodb: markerResult.externalProvider,
            },
          },
        } as unknown as Prisma.InputJsonValue,
        fingerprint: fingerprint ? fingerprint as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
        ...(markerOnly ? {} : {
          spriteDirectory: relative(transcodeRoot, assetDirectory).split(sep).join('/'),
          intervalSeconds,
          tileWidth,
          tileHeight,
          columns,
          rows,
          frameCount: cues.length,
          sheetCount,
        }),
        durationMs,
        sourceModifiedAt: media.file!.modifiedAt,
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
  media: {
    id: string;
    accountId: string;
    type: string;
    metadataProvider: string | null;
    metadataProviderId: string | null;
    seriesMetadataProviderId: string | null;
    seriesDisplayTitle: string | null;
    seriesTitle: string | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
  },
  sourcePath: string,
  durationMs: number,
  chapters: MediaChapter[],
  fingerprint: PlaybackFingerprintSet | null,
  manualMarkers: TimelineMarker[],
): Promise<{
  markers: TimelineMarker[];
  recapAnalysis: MarkerAnalysis;
  introAnalysis: MarkerAnalysis;
  creditsAnalysis: MarkerAnalysis;
  externalProvider: TheIntroDbLookupSummary;
}> {
  const markers = prioritizeTimelineMarkers(manualMarkers, chapterTimelineMarkers(chapters, durationMs));
  let recapAnalysis = analysisForMarker('recap', markers);
  let introAnalysis = analysisForMarker('intro', markers);
  let creditsAnalysis = analysisForMarker('credits', markers);
  const hasChapterRecap = markers.some((marker) => marker.kind === 'recap');
  const hasChapterIntro = markers.some((marker) => marker.kind === 'intro');
  const externalLookup = await lookupIntroDbMarkers(media, durationMs);
  for (const marker of externalLookup.markers) {
    if (!markers.some((existing) => existing.kind === marker.kind)) markers.push(marker);
  }
  if (!hasChapterRecap && externalLookup.markers.some((marker) => marker.kind === 'recap')) {
    recapAnalysis = externalMarkerAnalysis('recap', externalLookup);
  }
  if (!hasChapterIntro && externalLookup.markers.some((marker) => marker.kind === 'intro')) {
    introAnalysis = externalMarkerAnalysis('intro', externalLookup);
  }
  if (!markers.some((marker) => marker.kind === 'credits') && externalLookup.markers.some((marker) => marker.kind === 'credits')) {
    creditsAnalysis = externalMarkerAnalysis('credits', externalLookup);
  }
  if (media.type === 'episode' && fingerprint && (!markers.some((marker) => marker.kind === 'recap') || !markers.some((marker) => marker.kind === 'intro'))) {
    const siblings = await prisma.mediaItem.findMany({
      where: {
        accountId: media.accountId,
        type: 'episode',
        id: { not: media.id },
        file: { is: { status: 'ready' } },
        ...(media.seriesMetadataProviderId
          ? { seriesMetadataProviderId: media.seriesMetadataProviderId }
          : media.seriesDisplayTitle
            ? { seriesDisplayTitle: { equals: media.seriesDisplayTitle, mode: 'insensitive' } }
            : { seriesTitle: { equals: media.seriesTitle ?? '', mode: 'insensitive' } }),
      },
      select: { id: true, seasonNumber: true, episodeNumber: true, file: { select: { modifiedAt: true } } },
      take: 24,
    });
    const siblingAssets = siblings.length ? await prisma.mediaPlaybackAsset.findMany({
      where: { mediaId: { in: siblings.map((sibling) => sibling.id) }, status: { in: ['ready', 'queued', 'generating'] }, fingerprint: { not: Prisma.JsonNull } },
      select: { mediaId: true, fingerprint: true, sourceModifiedAt: true },
    }) : [];
    const siblingModifiedAt = new Map(siblings.map((sibling) => [sibling.id, sibling.file?.modifiedAt ?? null]));
    const siblingFingerprints = siblingAssets.flatMap((asset) => {
      if (!playbackFingerprintMatchesSource(asset.sourceModifiedAt, siblingModifiedAt.get(asset.mediaId) ?? null)) return [];
      const parsed = playbackFingerprintSet(asset.fingerprint);
      const sibling = siblings.find((candidate) => candidate.id === asset.mediaId);
      return parsed && sibling ? [{ mediaId: asset.mediaId, seasonNumber: sibling.seasonNumber, episodeNumber: sibling.episodeNumber, fingerprint: parsed }] : [];
    });

    if (!markers.some((marker) => marker.kind === 'intro')) {
      const explicitRecapEndSeconds = Math.ceil(
        (markers.find((marker) => marker.kind === 'recap')?.endMs ?? 0) / 1_000,
      );
      const references = siblingFingerprints.map((asset) => asset.fingerprint.opening);
      const minimumReferences = references.length >= 2 ? 2 : 1;
      const detection = analyzeRepeatedIntro(fingerprint.opening, references, {
        minimumSeconds: 12,
        minimumReferences,
        minimumConfidence: minimumReferences === 1 ? 0.9 : 0.8,
        minimumStartSeconds: explicitRecapEndSeconds > 0 ? explicitRecapEndSeconds : 0,
        maximumStartSeconds: 10 * 60,
        maximumEndSeconds: 15 * 60,
      });
      introAnalysis = withoutMarker(detection);
      if (detection.marker) markers.push(detection.marker);
    }
    if (!markers.some((marker) => marker.kind === 'recap')) {
      const previousEpisodes = siblingFingerprints
        .filter((candidate) => episodeComesBefore(candidate, media))
        .sort((left, right) => (right.seasonNumber ?? 0) - (left.seasonNumber ?? 0) || (right.episodeNumber ?? 0) - (left.episodeNumber ?? 0))
        .slice(0, 3)
        .map((candidate) => candidate.fingerprint.whole);
      const detection = analyzePreviousEpisodeRecap(
        fingerprint.opening,
        previousEpisodes,
        markers.find((marker) => marker.kind === 'intro') ?? null,
      );
      recapAnalysis = withoutMarker(detection);
      if (detection.marker) markers.push(detection.marker);
    }
  }
  if (!markers.some((marker) => marker.kind === 'credits')) {
    const blackSegments = await detectLateBlackSegments(sourcePath, durationMs).catch(() => []);
    const tailSamples = await createCreditsTailSamples(sourcePath, durationMs).catch(() => []);
    const credits = creditsMarkerFromTailEvidence(tailSamples, blackSegments, durationMs);
    if (credits) {
      markers.push(credits);
      creditsAnalysis = withoutMarker({ state: 'detected', reason: 'credits_tail_detected', referenceCount: 0, supportCount: tailSamples.length, usableFrameRatio: 1, confidence: credits.confidence, marker: credits, source: credits.source });
    }
  }
  return { markers, recapAnalysis, introAnalysis, creditsAnalysis, externalProvider: externalLookup.summary };
}

export async function commitPlaybackAnalysis(prisma: PrismaClient, input: PlaybackAnalysisCommit): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const currentManual = await tx.mediaTimelineMarker.findMany({
      where: { accountId: input.accountId, mediaId: input.mediaId, source: 'manual' },
      select: { kind: true },
    });
    const manualKinds = new Set(currentManual.map((marker) => marker.kind));
    await tx.mediaTimelineMarker.deleteMany({
      where: { accountId: input.accountId, mediaId: input.mediaId, source: { not: 'manual' } },
    });
    const generatedMarkers = input.markers.filter((marker) => marker.source !== 'manual' && !manualKinds.has(marker.kind));
    if (generatedMarkers.length) {
      await tx.mediaTimelineMarker.createMany({
        data: generatedMarkers.map((marker) => ({ accountId: input.accountId, mediaId: input.mediaId, ...marker })),
      });
    }
    await tx.mediaPlaybackAsset.update({
      where: { mediaId: input.mediaId },
      data: input.assetData,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function prioritizeTimelineMarkers(...sources: readonly TimelineMarker[][]): TimelineMarker[] {
  const markers: TimelineMarker[] = [];
  for (const source of sources) {
    for (const marker of source) {
      if (!markers.some((existing) => existing.kind === marker.kind)) markers.push(marker);
    }
  }
  return markers;
}

type MarkerDetection = ReturnType<typeof analyzeRepeatedIntro>;
type MarkerAnalysis = Omit<MarkerDetection, 'marker'>;

function analysisForMarker(kind: TimelineMarker['kind'], markers: readonly TimelineMarker[]): MarkerAnalysis {
  const marker = markers.find((candidate) => candidate.kind === kind);
  if (!marker) return { state: 'not-detected', reason: 'no_repeated_sequence', referenceCount: 0, supportCount: 0, usableFrameRatio: 0, confidence: null, source: null, analysisVersion: playbackMarkerAnalysisVersion, analyzedAt: new Date().toISOString() };
  const reason = marker.source === 'manual' ? 'manual_marker' : marker.source === 'chapter' ? 'chapter_marker' : marker.source === 'external' ? 'external_provider' : 'detected';
  return { state: 'detected', reason, referenceCount: 0, supportCount: 0, usableFrameRatio: 1, confidence: marker.confidence, source: marker.source, analysisVersion: playbackMarkerAnalysisVersion, analyzedAt: new Date().toISOString() };
}

function withoutMarker(detection: MarkerDetection): MarkerAnalysis {
  const { marker: _marker, ...analysis } = detection;
  return { ...analysis, source: detection.marker?.source ?? detection.source ?? null, analysisVersion: playbackMarkerAnalysisVersion, analyzedAt: new Date().toISOString() };
}

function externalMarkerAnalysis(kind: 'intro' | 'recap' | 'credits', lookup: { markers: TimelineMarker[]; summary: TheIntroDbLookupSummary }): MarkerAnalysis {
  const marker = lookup.markers.find((candidate) => candidate.kind === kind);
  return {
    state: 'detected',
    reason: 'external_provider',
    referenceCount: 0,
    supportCount: lookup.summary.segments[kind] ?? 1,
    usableFrameRatio: 1,
    confidence: marker?.confidence ?? 0.82,
    source: 'external',
    analysisVersion: playbackMarkerAnalysisVersion,
    analyzedAt: new Date().toISOString(),
  };
}

export function playbackFingerprintMatchesSource(sourceModifiedAt: Date | null, fileModifiedAt: Date | null): boolean {
  return Boolean(sourceModifiedAt && fileModifiedAt && sourceModifiedAt.getTime() === fileModifiedAt.getTime());
}

function episodeComesBefore(
  candidate: { seasonNumber: number | null; episodeNumber: number | null },
  media: { seasonNumber: number | null; episodeNumber: number | null },
): boolean {
  const candidateSeason = candidate.seasonNumber ?? 0;
  const mediaSeason = media.seasonNumber ?? 0;
  if (candidateSeason !== mediaSeason) return candidateSeason < mediaSeason;
  return (candidate.episodeNumber ?? 0) < (media.episodeNumber ?? 0);
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

async function createFingerprintSet(sourcePath: string, durationMs: number): Promise<PlaybackFingerprintSet> {
  const durationSeconds = durationMs / 1_000;
  const opening = await createFingerprint(sourcePath, {
    intervalSeconds: fingerprintIntervalSeconds,
    offsetSeconds: fingerprintOffsetSeconds,
    durationSeconds: Math.max(0, Math.min(15 * 60, durationSeconds - fingerprintOffsetSeconds)),
  });
  const wholeIntervalSeconds = Math.max(5, Math.min(15, Math.ceil(durationSeconds / 600)));
  const whole = await createFingerprint(sourcePath, {
    intervalSeconds: wholeIntervalSeconds,
    offsetSeconds: 0,
    durationSeconds,
  });
  return { version: fingerprintVersion, opening, whole };
}

async function createFingerprint(
  sourcePath: string,
  options: { intervalSeconds: number; offsetSeconds: number; durationSeconds: number },
): Promise<FrameFingerprint> {
  const { stdout } = await runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-ss', String(options.offsetSeconds), '-i', sourcePath,
    '-t', String(options.durationSeconds), '-vf', `fps=1/${options.intervalSeconds},scale=9:8:force_original_aspect_ratio=increase,crop=9:8,format=gray`,
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
  return { version: fingerprintVersion, intervalSeconds: options.intervalSeconds, offsetSeconds: options.offsetSeconds, hashes, quality };
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
  const durationSeconds = durationMs / 1_000;
  const startSeconds = Math.max(0, durationSeconds * 0.8);
  const { stderr } = await runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'info', '-ss', String(startSeconds), '-i', sourcePath,
    '-t', String(durationSeconds - startSeconds), '-vf', 'blackdetect=d=1.2:pic_th=0.94',
    '-an', '-f', 'null', '-',
  ]);
  return [...stderr.matchAll(/black_start:([\d.]+).*?black_end:([\d.]+)/g)].map((match) => {
    const detectedStart = Number(match[1]);
    const detectedEnd = Number(match[2]);
    const offset = detectedStart < startSeconds / 2 ? startSeconds : 0;
    return { startMs: Math.round((offset + detectedStart) * 1_000), endMs: Math.round((offset + detectedEnd) * 1_000) };
  });
}

async function createCreditsTailSamples(sourcePath: string, durationMs: number): Promise<CreditsTailSample[]> {
  const intervalSeconds = 2;
  const durationSeconds = durationMs / 1_000;
  const startSeconds = Math.max(0, durationSeconds * 0.8);
  const width = 64;
  const height = 36;
  const frameSize = width * height;
  const { stdout } = await runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-ss', String(startSeconds), '-i', sourcePath,
    '-t', String(durationSeconds - startSeconds),
    '-vf', `fps=1/${intervalSeconds},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=gray`,
    '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
  ]);
  const samples: CreditsTailSample[] = [];
  let previous: Buffer | null = null;
  for (let offset = 0, index = 0; offset + frameSize <= stdout.length; offset += frameSize, index += 1) {
    const frame = stdout.subarray(offset, offset + frameSize);
    let lumaTotal = 0;
    let motionTotal = 0;
    let edgeCount = 0;
    let edgeComparisons = 0;
    for (let pixel = 0; pixel < frame.length; pixel += 1) {
      const value = frame[pixel]!;
      lumaTotal += value;
      if (previous) motionTotal += Math.abs(value - previous[pixel]!);
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x + 1 < width) {
        edgeComparisons += 1;
        if (Math.abs(value - frame[pixel + 1]!) >= 24) edgeCount += 1;
      }
      if (y + 1 < height) {
        edgeComparisons += 1;
        if (Math.abs(value - frame[pixel + width]!) >= 24) edgeCount += 1;
      }
    }
    samples.push({
      atMs: Math.round((startSeconds + index * intervalSeconds) * 1_000),
      luma: lumaTotal / frame.length / 255,
      motion: previous ? motionTotal / frame.length / 255 : 1,
      edgeDensity: edgeComparisons ? edgeCount / edgeComparisons : 0,
    });
    previous = frame;
  }
  return samples;
}

async function trickplayCanBeReused(assetDirectory: string, expectedSheetCount: number): Promise<boolean> {
  if (expectedSheetCount < 1) return false;
  const entries = await readdir(assetDirectory).catch(() => []);
  return entries.filter((name) => /^sprite-\d{3}\.jpg$/.test(name)).length >= expectedSheetCount;
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
        version: parsed.version === 4 ? 4 : parsed.version === 3 ? 3 : parsed.version === 2 ? 2 : 1,
        intervalSeconds,
        offsetSeconds,
        hashes: parsed.hashes as string[],
        ...(quality ? { quality } : {}),
      }
    : null;
}

function playbackFingerprintSet(value: Prisma.JsonValue): PlaybackFingerprintSet | null {
  const parsed = jsonObject(value);
  if (parsed.version === fingerprintVersion && parsed.opening && parsed.whole) {
    const opening = playbackFingerprint(parsed.opening as Prisma.JsonValue);
    const whole = playbackFingerprint(parsed.whole as Prisma.JsonValue);
    if (opening && whole) return { version: fingerprintVersion, opening, whole };
  }
  const legacy = playbackFingerprint(value);
  return legacy ? { version: fingerprintVersion, opening: legacy, whole: legacy } : null;
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
