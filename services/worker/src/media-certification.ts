import { PrismaClient } from '@prisma/client';
import { detectVideoSignalProfile } from '@boltbytes/contracts';
import { execFile } from 'node:child_process';
import { mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';

const textSubtitleCodecs = new Set(['ass', 'mov_text', 'ssa', 'srt', 'subrip', 'webvtt']);
const imageSubtitleCodecs = new Set([
  'dvb_subtitle',
  'dvd_subtitle',
  'hdmv_pgs_subtitle',
  'pgssub',
  'vobsub',
]);

export type ProbeStreamSummary = {
  index: number;
  codec: string;
  kind: 'audio' | 'subtitle' | 'video';
  subtitleKind?: 'image' | 'text' | 'unknown';
};

export type MediaProbeSummary = {
  container: string;
  videoCodec: string;
  resolution: string;
  hdr: string;
  bitDepth: number | null;
  audioCodecs: string[];
  subtitleCodecs: string[];
  streams: ProbeStreamSummary[];
};

export type CertificationCandidate = {
  fileId: string;
  mediaId: string;
  title: string;
  mediaType: string;
  relativePath: string;
  storageLabel: string;
  storageMountPath: string;
  durationMs: number | null;
  sizeBytes: number;
  summary: MediaProbeSummary;
  signature: string;
};

export type CertificationTestResult = {
  status: 'failed' | 'passed' | 'skipped';
  durationMs: number;
  message: string;
};

export type CertificationSampleResult = {
  fileId: string;
  mediaId: string;
  title: string;
  mediaType: string;
  relativePath: string;
  storageLabel: string;
  summary: MediaProbeSummary;
  signature: string;
  tests: Record<string, CertificationTestResult>;
  status: 'failed' | 'passed';
};

export type CertificationCoverage = {
  containers: Record<string, number>;
  videoCodecs: Record<string, number>;
  resolutions: Record<string, number>;
  hdrProfiles: Record<string, number>;
  audioCodecs: Record<string, number>;
  subtitleCodecs: Record<string, number>;
};

export type MediaCertificationReport = {
  schemaVersion: 1;
  generatedAt: string;
  options: {
    accountId: string | null;
    decodeSeconds: number;
    includeTranscode: boolean;
    inventoryLimit: number | null;
    maxSamples: number;
    sampleConcurrency: number;
  };
  inventory: {
    files: number;
    uniqueSignatures: number;
    sampledFiles: number;
  };
  coverage: CertificationCoverage;
  summary: {
    passedSamples: number;
    failedSamples: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
  };
  samples: CertificationSampleResult[];
};

export type MediaCertificationOptions = {
  accountId?: string;
  decodeSeconds?: number;
  includeTranscode?: boolean;
  inventoryLimit?: number;
  maxSamples?: number;
  outputDirectory?: string;
  sampleConcurrency?: number;
};

type CommandResult = CertificationTestResult & { stdout: string };

export function classifyMediaProbe(
  probe: unknown,
  fallback: {
    container?: string | null;
    videoCodec?: string | null;
    width?: number | null;
    height?: number | null;
  } = {},
): MediaProbeSummary {
  const root = asObject(probe);
  const rawStreams = Array.isArray(root.streams) ? root.streams.map(asObject) : [];
  const format = asObject(root.format);
  const videoSignal = detectVideoSignalProfile(probe);
  const video = rawStreams.find((stream) => stream.codec_type === 'video') ?? {};
  const streams = rawStreams.flatMap((stream): ProbeStreamSummary[] => {
    const kind = stringValue(stream.codec_type);
    const codec = normalizeCodec(stringValue(stream.codec_name));
    const index = integerValue(stream.index);
    if (index === null || !codec || !['audio', 'subtitle', 'video'].includes(kind ?? '')) return [];
    return [{
      index,
      codec,
      kind: kind as ProbeStreamSummary['kind'],
      ...(kind === 'subtitle'
        ? {
            subtitleKind: textSubtitleCodecs.has(codec)
              ? 'text' as const
              : imageSubtitleCodecs.has(codec)
                ? 'image' as const
                : 'unknown' as const,
          }
        : {}),
    }];
  });
  const width = integerValue(video.width) ?? fallback.width ?? null;
  const height = integerValue(video.height) ?? fallback.height ?? null;
  const container = normalizeContainer(
    fallback.container ?? stringValue(format.format_name) ?? 'unknown',
  );
  const videoCodec = normalizeCodec(
    videoSignal.codec ?? fallback.videoCodec ?? 'unknown',
  ) || 'unknown';
  return {
    container,
    videoCodec,
    resolution: resolutionLabel(width, height),
    hdr: videoSignal.hdr ?? 'sdr',
    bitDepth: videoSignal.bitDepth,
    audioCodecs: uniqueSorted(
      streams.filter((stream) => stream.kind === 'audio').map((stream) => stream.codec),
    ),
    subtitleCodecs: uniqueSorted(
      streams.filter((stream) => stream.kind === 'subtitle').map((stream) => stream.codec),
    ),
    streams,
  };
}

export function mediaCertificationSignature(summary: MediaProbeSummary): string {
  return [
    summary.container,
    summary.videoCodec,
    summary.resolution,
    summary.hdr,
    summary.audioCodecs.join('+') || 'no-audio',
    summary.subtitleCodecs.join('+') || 'no-subtitles',
  ].join('|');
}

export function buildCertificationCoverage(
  candidates: CertificationCandidate[],
): CertificationCoverage {
  const coverage: CertificationCoverage = {
    containers: {},
    videoCodecs: {},
    resolutions: {},
    hdrProfiles: {},
    audioCodecs: {},
    subtitleCodecs: {},
  };
  for (const candidate of candidates) {
    increment(coverage.containers, candidate.summary.container);
    increment(coverage.videoCodecs, candidate.summary.videoCodec);
    increment(coverage.resolutions, candidate.summary.resolution);
    increment(coverage.hdrProfiles, candidate.summary.hdr);
    for (const codec of candidate.summary.audioCodecs) increment(coverage.audioCodecs, codec);
    for (const codec of candidate.summary.subtitleCodecs) increment(coverage.subtitleCodecs, codec);
  }
  return coverage;
}

export function selectCertificationSamples(
  candidates: CertificationCandidate[],
  maximum: number,
): CertificationCandidate[] {
  const remaining = [...candidates].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath));
  const selected: CertificationCandidate[] = [];
  const covered = new Set<string>();
  const signatures = new Set<string>();
  while (remaining.length && selected.length < maximum) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const tokens = coverageTokens(candidate.summary);
      const newCoverage = tokens.filter((token) => !covered.has(token)).length;
      const signatureBonus = signatures.has(candidate.signature) ? 0 : 1;
      const score = newCoverage * 100 + signatureBonus;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;
    selected.push(chosen);
    signatures.add(chosen.signature);
    for (const token of coverageTokens(chosen.summary)) covered.add(token);
    if (bestScore <= 0) break;
  }
  return selected;
}

export async function runMediaCertification(
  prisma: PrismaClient,
  input: MediaCertificationOptions = {},
): Promise<{ jsonPath: string; markdownPath: string; report: MediaCertificationReport }> {
  const options = {
    accountId: input.accountId?.trim() || null,
    decodeSeconds: clampInteger(input.decodeSeconds, 1, 15, 3),
    includeTranscode: input.includeTranscode !== false,
    inventoryLimit: input.inventoryLimit
      ? clampInteger(input.inventoryLimit, 1, 100_000, 5_000)
      : null,
    maxSamples: clampInteger(input.maxSamples, 1, 100, 24),
    outputDirectory: resolve(input.outputDirectory?.trim() || '/app/data/certification'),
    sampleConcurrency: clampInteger(input.sampleConcurrency, 1, 4, 1),
  };
  const files = await prisma.mediaFile.findMany({
    where: {
      status: 'ready',
      ...(options.accountId ? { accountId: options.accountId } : {}),
    },
    include: {
      mediaItem: { select: { id: true, title: true, type: true } },
      storageRoot: { select: { label: true, mountPath: true } },
    },
    orderBy: { relativePath: 'asc' },
    ...(options.inventoryLimit ? { take: options.inventoryLimit } : {}),
  });
  const candidates = files.map((file): CertificationCandidate => {
    const summary = classifyMediaProbe(file.probe, {
      container: file.container,
      videoCodec: file.videoCodec,
      width: file.width,
      height: file.height,
    });
    return {
      fileId: file.id,
      mediaId: file.mediaItem.id,
      title: file.mediaItem.title,
      mediaType: String(file.mediaItem.type),
      relativePath: file.relativePath,
      storageLabel: file.storageRoot.label,
      storageMountPath: file.storageRoot.mountPath,
      durationMs: file.durationMs,
      sizeBytes: Number(file.sizeBytes),
      summary,
      signature: mediaCertificationSignature(summary),
    };
  });
  const selected = selectCertificationSamples(candidates, options.maxSamples);
  const samples = await mapConcurrent(selected, options.sampleConcurrency, (candidate) =>
    certifySample(candidate, options.decodeSeconds, options.includeTranscode));
  const tests = samples.flatMap((sample) => Object.values(sample.tests));
  const generatedAt = new Date().toISOString();
  const report: MediaCertificationReport = {
    schemaVersion: 1,
    generatedAt,
    options: {
      accountId: options.accountId,
      decodeSeconds: options.decodeSeconds,
      includeTranscode: options.includeTranscode,
      inventoryLimit: options.inventoryLimit,
      maxSamples: options.maxSamples,
      sampleConcurrency: options.sampleConcurrency,
    },
    inventory: {
      files: candidates.length,
      uniqueSignatures: new Set(candidates.map((candidate) => candidate.signature)).size,
      sampledFiles: samples.length,
    },
    coverage: buildCertificationCoverage(candidates),
    summary: {
      passedSamples: samples.filter((sample) => sample.status === 'passed').length,
      failedSamples: samples.filter((sample) => sample.status === 'failed').length,
      passedTests: tests.filter((test) => test.status === 'passed').length,
      failedTests: tests.filter((test) => test.status === 'failed').length,
      skippedTests: tests.filter((test) => test.status === 'skipped').length,
    },
    samples,
  };
  await mkdir(options.outputDirectory, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const jsonPath = resolve(options.outputDirectory, `media-matrix-${stamp}.json`);
  const markdownPath = resolve(options.outputDirectory, `media-matrix-${stamp}.md`);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
    writeFile(markdownPath, renderCertificationMarkdown(report), { mode: 0o600 }),
  ]);
  return { jsonPath, markdownPath, report };
}

export function renderCertificationMarkdown(report: MediaCertificationReport): string {
  const lines = [
    '# BoltBytes Media compatibility certification',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Inventory: ${report.inventory.files} files, ${report.inventory.uniqueSignatures} signatures, ${report.inventory.sampledFiles} runtime samples.`,
    '',
    `Result: ${report.summary.passedSamples} passed samples, ${report.summary.failedSamples} failed samples, ${report.summary.failedTests} failed tests.`,
    '',
    '## Coverage',
    '',
    '| Dimension | Values |',
    '| --- | --- |',
    `| Containers | ${coverageText(report.coverage.containers)} |`,
    `| Video | ${coverageText(report.coverage.videoCodecs)} |`,
    `| Resolution | ${coverageText(report.coverage.resolutions)} |`,
    `| HDR | ${coverageText(report.coverage.hdrProfiles)} |`,
    `| Audio | ${coverageText(report.coverage.audioCodecs)} |`,
    `| Subtitles | ${coverageText(report.coverage.subtitleCodecs)} |`,
    '',
    '## Runtime samples',
    '',
    '| Status | Title | Signature | Failed test |',
    '| --- | --- | --- | --- |',
  ];
  for (const sample of report.samples) {
    const failed = Object.entries(sample.tests)
      .filter(([, result]) => result.status === 'failed')
      .map(([name, result]) => `${name}: ${result.message}`)
      .join('; ');
    lines.push(
      `| ${sample.status} | ${markdownCell(sample.title)} | ${markdownCell(sample.signature)} | ${markdownCell(failed || '-')} |`,
    );
  }
  lines.push('', 'Reports contain library-relative paths only. Temporary remux files are removed after each sample.', '');
  return lines.join('\n');
}

async function certifySample(
  candidate: CertificationCandidate,
  seconds: number,
  includeTranscode: boolean,
): Promise<CertificationSampleResult> {
  const tests: Record<string, CertificationTestResult> = {};
  let mediaPath: string;
  const filesystemStarted = Date.now();
  try {
    const rootPath = await realpath(candidate.storageMountPath);
    const unresolved = resolve(rootPath, ...candidate.relativePath.replace(/\\/g, '/').split('/'));
    if (!isPathWithin(rootPath, unresolved)) throw new Error('Media path escapes its storage root');
    mediaPath = await realpath(unresolved);
    if (!isPathWithin(rootPath, mediaPath)) throw new Error('Resolved media path escapes its storage root');
    const fileStat = await stat(mediaPath);
    if (!fileStat.isFile() || fileStat.size <= 0) throw new Error('Media path is not a readable file');
    tests.filesystem = passed(Date.now() - filesystemStarted, 'Readable scanned file');
  } catch (error) {
    tests.filesystem = failed(Date.now() - filesystemStarted, errorMessage(error));
    return sampleResult(candidate, tests);
  }

  const seekSeconds = Math.max(
    0,
    Math.min(60, Math.floor(((candidate.durationMs ?? 0) / 1000) * 0.25)),
  );
  tests.ffprobe = withoutStdout(await runCommand('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,format_name:stream=index,codec_type,codec_name,width,height',
    '-of', 'json',
    mediaPath,
  ], mediaPath, 60_000));
  if (tests.ffprobe.status === 'failed') return sampleResult(candidate, tests);

  tests.decode = withoutStdout(await runCommand('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    ...(seekSeconds ? ['-ss', String(seekSeconds)] : []),
    '-i', mediaPath,
    '-t', String(seconds),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-sn', '-dn', '-f', 'null', '-',
  ], mediaPath, 120_000));

  const temporaryPath = resolve(
    tmpdir(),
    `boltbytes-media-cert-${process.pid}-${candidate.fileId}.ts`,
  );
  const remux = await runCommand('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    ...(seekSeconds ? ['-ss', String(seekSeconds)] : []),
    '-i', mediaPath,
    '-t', String(seconds),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'copy', '-c:a', 'aac', '-ac', '2',
    '-sn', '-dn', '-f', 'mpegts', '-y', temporaryPath,
  ], mediaPath, 120_000);
  if (remux.status === 'passed') {
    const remuxProbe = await runCommand('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', temporaryPath,
    ], temporaryPath, 30_000);
    tests.directStreamRemux = remuxProbe.status === 'passed'
      ? passed(remux.durationMs + remuxProbe.durationMs, 'Video copy and AAC remux are readable')
      : withoutStdout(remuxProbe);
  } else {
    tests.directStreamRemux = withoutStdout(remux);
  }
  await rm(temporaryPath, { force: true }).catch(() => undefined);

  const textSubtitle = candidate.summary.streams.find(
    (stream) => stream.kind === 'subtitle' && stream.subtitleKind === 'text',
  );
  tests.embeddedTextSubtitle = textSubtitle
    ? withoutStdout(await runCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-i', mediaPath,
        '-map', `0:${textSubtitle.index}`,
        '-t', '300', '-f', 'webvtt', '-',
      ], mediaPath, 90_000))
    : skipped('No embedded text subtitle in this sample');

  const imageSubtitle = candidate.summary.streams.find(
    (stream) => stream.kind === 'subtitle' && stream.subtitleKind === 'image',
  );
  tests.imageSubtitleBurnIn = imageSubtitle
    ? withoutStdout(await runCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        ...(seekSeconds ? ['-ss', String(seekSeconds)] : []),
        '-i', mediaPath,
        '-t', String(Math.min(seconds, 2)),
        '-filter_complex', `[0:v:0][0:${imageSubtitle.index}]overlay=eof_action=pass:shortest=0`,
        '-an', '-f', 'null', '-',
      ], mediaPath, 120_000))
    : skipped('No image subtitle in this sample');

  const sidecars = await discoverSidecars(mediaPath);
  tests.sidecarSubtitle = sidecars.length
    ? withoutStdout(await runCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-i', sidecars[0]!, '-f', 'webvtt', '-',
      ], sidecars[0]!, 30_000))
    : skipped('No matching SRT/WebVTT sidecar in this sample');

  tests.softwareTranscode = includeTranscode
    ? withoutStdout(await runCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        ...(seekSeconds ? ['-ss', String(seekSeconds)] : []),
        '-i', mediaPath,
        '-t', String(seconds),
        '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', 'scale=-2:720:force_original_aspect_ratio=decrease,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2',
        '-c:a', 'aac', '-ac', '2', '-sn', '-dn', '-f', 'null', '-',
      ], mediaPath, 180_000))
    : skipped('Software transcode disabled by command option');
  return sampleResult(candidate, tests);
}

function sampleResult(
  candidate: CertificationCandidate,
  tests: Record<string, CertificationTestResult>,
): CertificationSampleResult {
  return {
    fileId: candidate.fileId,
    mediaId: candidate.mediaId,
    title: candidate.title,
    mediaType: candidate.mediaType,
    relativePath: candidate.relativePath,
    storageLabel: candidate.storageLabel,
    summary: candidate.summary,
    signature: candidate.signature,
    tests,
    status: Object.values(tests).some((test) => test.status === 'failed') ? 'failed' : 'passed',
  };
}

async function runCommand(
  command: string,
  args: string[],
  mediaPath: string,
  timeout: number,
): Promise<CommandResult> {
  const started = Date.now();
  return new Promise((resolveResult) => {
    execFile(command, args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout,
    }, (error, stdout, stderr) => {
      const durationMs = Date.now() - started;
      if (!error) {
        resolveResult({
          ...passed(durationMs, `${command} completed`),
          stdout,
        });
        return;
      }
      const raw = stderr.trim() || error.message;
      resolveResult({
        ...failed(durationMs, redactPath(raw, mediaPath)),
        stdout,
      });
    });
  });
}

async function discoverSidecars(mediaPath: string): Promise<string[]> {
  const extension = extname(mediaPath);
  const stem = basename(mediaPath, extension).toLowerCase();
  const entries = await readdir(dirname(mediaPath), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      const subtitleExtension = extname(name).toLowerCase();
      const subtitleStem = basename(name, subtitleExtension).toLowerCase();
      return ['.srt', '.vtt'].includes(subtitleExtension)
        && (subtitleStem === stem || subtitleStem.startsWith(`${stem}.`));
    })
    .sort((left, right) => left.localeCompare(right))
    .map((name) => resolve(dirname(mediaPath), name));
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]!);
    }
  }));
  return results;
}

function coverageTokens(summary: MediaProbeSummary): string[] {
  return uniqueSorted([
    `container:${summary.container}`,
    `video:${summary.videoCodec}`,
    `resolution:${summary.resolution}`,
    `hdr:${summary.hdr}`,
    ...summary.audioCodecs.map((codec) => `audio:${codec}`),
    ...summary.subtitleCodecs.map((codec) => `subtitle:${codec}`),
  ]);
}

function resolutionLabel(width: number | null, height: number | null): string {
  const longEdge = Math.max(width ?? 0, height ?? 0);
  const shortEdge = Math.min(width ?? 0, height ?? 0);
  if (longEdge >= 3800 || shortEdge >= 2100) return '2160p';
  if (longEdge >= 2500 || shortEdge >= 1400) return '1440p';
  if (longEdge >= 1900 || shortEdge >= 1000) return '1080p';
  if (longEdge >= 1200 || shortEdge >= 700) return '720p';
  if (longEdge || shortEdge) return 'sd';
  return 'unknown';
}

function normalizeContainer(value: string): string {
  const normalized = value.toLowerCase().split(',')[0]?.trim() || 'unknown';
  if (['matroska', 'webm'].includes(normalized)) return normalized === 'webm' ? 'webm' : 'mkv';
  if (['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(normalized)) return 'mp4';
  return normalized;
}

function normalizeCodec(value: string | null | undefined): string {
  const normalized = value?.toLowerCase().trim() ?? '';
  if (['avc', 'avc1', 'h.264', 'x264'].includes(normalized)) return 'h264';
  if (['h265', 'hev1', 'hvc1', 'x265'].includes(normalized)) return 'hevc';
  if (normalized === 'e-ac-3') return 'eac3';
  if (normalized === 'ac-3') return 'ac3';
  return normalized;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value!));
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function passed(durationMs: number, message: string): CertificationTestResult {
  return { status: 'passed', durationMs, message };
}

function failed(durationMs: number, message: string): CertificationTestResult {
  return { status: 'failed', durationMs, message: message.slice(0, 2_000) };
}

function skipped(message: string): CertificationTestResult {
  return { status: 'skipped', durationMs: 0, message };
}

function withoutStdout(result: CommandResult): CertificationTestResult {
  return { status: result.status, durationMs: result.durationMs, message: result.message };
}

function redactPath(message: string, mediaPath: string): string {
  return message.replaceAll(mediaPath, '[media]').replaceAll('\\', '/');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown certification failure';
}

function isPathWithin(root: string, candidate: string): boolean {
  const nested = relative(root, candidate);
  return nested === '' || (!nested.startsWith('..') && !isAbsolute(nested));
}

function coverageText(values: Record<string, number>): string {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
  return entries.length
    ? entries.map(([name, count]) => `${markdownCell(name)} (${count})`).join(', ')
    : '-';
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ').trim();
}
