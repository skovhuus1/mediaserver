import type { PrismaClient, SystemJob } from '@prisma/client';
import { spawn } from 'node:child_process';
import { realpath, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

type ClaimedOfflineJob = SystemJob & { attemptNumber: number };

export function offlineTranscodeArguments(input: {
  sourcePath: string;
  outputPath: string;
  sourceHeight: number | null;
  qualityHeight: number;
}) {
  const height = input.sourceHeight && input.sourceHeight > 0
    ? Math.min(input.sourceHeight, input.qualityHeight)
    : input.qualityHeight;
  const bitrate = height <= 360 ? 800_000 : height <= 480 ? 1_400_000 : height <= 720 ? 3_000_000 : 6_000_000;
  const args = [
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-progress', 'pipe:1',
    '-nostats',
    '-i', input.sourcePath,
    '-map', '0:v:0',
    '-map', '0:a:0?',
  ];
  if (!input.sourceHeight || input.sourceHeight > height) {
    args.push('-vf', `scale=-2:${height}`);
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-maxrate', String(bitrate),
    '-bufsize', String(bitrate * 2),
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.1',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ac', '2',
    '-sn',
    '-movflags', '+faststart',
    '-f', 'mp4',
    '-y',
    input.outputPath,
  );
  return args;
}

export async function prepareOfflineDownload(
  prisma: PrismaClient,
  job: ClaimedOfflineJob,
  transcodeRoot: string,
  renewLease: () => Promise<void>,
) {
  const payload = jsonObject(job.payload);
  const downloadId = typeof payload.downloadId === 'string' ? payload.downloadId : null;
  const generation = typeof payload.generation === 'string' ? payload.generation : null;
  if (!downloadId || !generation) throw new Error('offline.prepare requires downloadId and generation');
  const download = await prisma.offlineDownload.findFirst({
    where: { id: downloadId, accountId: job.accountId, generation },
    include: { media: { include: { file: { include: { storageRoot: true } } } } },
  });
  if (!download) return;
  const file = download.media.file;
  if (!file || file.status !== 'ready') throw new Error('Offline source file is unavailable');
  const claimed = await prisma.offlineDownload.updateMany({
    where: { id: download.id, generation },
    data: { status: 'preparing', progress: 0, error: null },
  });
  if (claimed.count !== 1) return;

  const root = await realpath(file.storageRoot.mountPath);
  const sourcePath = await realpath(resolve(root, ...file.relativePath.split('/')));
  if (!isWithin(root, sourcePath)) throw new Error('Offline source escapes its storage root');
  const outputDirectory = resolve(transcodeRoot, 'offline', download.id, generation);
  if (!isWithin(transcodeRoot, outputDirectory)) throw new Error('Offline output escapes transcode root');
  const partialPath = resolve(outputDirectory, 'media.partial.mp4');
  const outputPath = resolve(outputDirectory, 'media.mp4');
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  try {
    await runFfmpeg({
      args: offlineTranscodeArguments({
        sourcePath,
        outputPath: partialPath,
        sourceHeight: download.media.height,
        qualityHeight: download.qualityHeight,
      }),
      durationMs: file.durationMs,
      renewLease,
      onProgress: async (progress) => {
        const current = await prisma.offlineDownload.updateMany({
          where: { id: download.id, generation },
          data: { progress },
        });
        if (current.count !== 1) throw new Error('Offline preparation was cancelled');
      },
    });
    await rename(partialPath, outputPath);
    const outputStat = await stat(outputPath);
    const updated = await prisma.offlineDownload.updateMany({
      where: { id: download.id, generation },
      data: {
        status: 'ready',
        progress: 100,
        outputPath: `offline/${download.id}/${generation}/media.mp4`,
        sizeBytes: BigInt(outputStat.size),
        readyAt: new Date(),
        error: null,
      },
    });
    if (updated.count !== 1) throw new Error('Offline preparation was superseded');
    const parent = resolve(transcodeRoot, 'offline', download.id);
    const entries = await readdir(parent, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && entry.name !== generation)
      .map((entry) => rm(resolve(parent, entry.name), { recursive: true, force: true })));
  } catch (error) {
    await prisma.offlineDownload.updateMany({
      where: { id: download.id, generation },
      data: {
        status: 'failed',
        error: (error instanceof Error ? error.message : 'Offline preparation failed').slice(0, 2_000),
      },
    });
    await rm(partialPath, { force: true });
    throw error;
  }
}

async function runFfmpeg(input: {
  args: string[];
  durationMs: number | null;
  renewLease: () => Promise<void>;
  onProgress: (progress: number) => Promise<void>;
}) {
  const child = spawn('ffmpeg', input.args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let output = '';
  let errors = '';
  let lastProgress = -1;
  let progressQueue = Promise.resolve();
  let leaseFailure: Error | null = null;
  const leaseTimer = setInterval(() => {
    void input.renewLease().catch((error: unknown) => {
      leaseFailure = error instanceof Error ? error : new Error('Worker lost offline preparation lease');
      child.kill('SIGTERM');
    });
  }, 15_000);
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
    const lines = output.split(/\r?\n/);
    output = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('out_time_ms=') || !input.durationMs) continue;
      const microseconds = Number.parseInt(line.slice('out_time_ms='.length), 10);
      if (!Number.isFinite(microseconds)) continue;
      const progress = Math.max(1, Math.min(99, Math.floor(microseconds / (input.durationMs * 10))));
      if (progress <= lastProgress) continue;
      lastProgress = progress;
      progressQueue = progressQueue.then(() => input.onProgress(progress));
      void progressQueue.catch(() => child.kill('SIGTERM'));
    }
  });
  child.stderr.on('data', (chunk: string) => {
    errors = `${errors}${chunk}`.slice(-8_000);
  });
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  }).finally(() => clearInterval(leaseTimer));
  await progressQueue;
  if (leaseFailure) throw leaseFailure;
  if (code !== 0) throw new Error(errors.trim() || `FFmpeg exited with code ${code ?? 'unknown'}`);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isWithin(root: string, candidate: string) {
  const path = relative(root, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
