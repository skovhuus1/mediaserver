import type { Prisma, PrismaClient, SystemJob } from '@prisma/client';
import { execFile, spawn } from 'node:child_process';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { decryptSecret } from './secret-value.js';
import { updateJobProgress } from './job-progress.js';

type ClaimedJob = SystemJob & { attemptNumber: number };
const execFileAsync = promisify(execFile);
const activeLeaseStatuses = ['preparing', 'ready', 'active'];

export async function processLiveTvRecordingJob(prisma: PrismaClient, job: ClaimedJob, renewLease: () => Promise<void>) {
  const recordingId = stringValue(objectValue(job.payload).recordingId);
  if (!recordingId) throw new Error('live-tv.record requires recordingId');
  const recording = await reserveRecordingSource(prisma, job, recordingId);
  if (!recording) return;
  const effectiveEnd = new Date(recording.endsAt.getTime() + recording.postPaddingSeconds * 1_000);
  const durationMs = Math.max(1_000, effectiveEnd.getTime() - Date.now());
  const outputRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode', 'live-tv-recordings');
  const outputDirectory = resolve(outputRoot, recording.id);
  const partialPath = resolve(outputDirectory, 'recording.partial.mp4');
  const outputPath = resolve(outputDirectory, 'recording.mp4');
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const sourceUrl = decryptSecret(recording.source!.encryptedStreamUrl);
  const codec = await probeVideoCodec(sourceUrl);
  const transcodeVideo = codec !== 'h264';
  await updateJobProgress(prisma, job, { stage: 'Optager', percent: 1, message: `${recording.channel.name} · ${transcodeVideo ? 'H.264 softwaretranscoding' : 'Direct Stream'}` });
  try {
    await runRecordingFfmpeg({ prisma, job, recordingId: recording.id, sourceUrl, partialPath, durationMs, transcodeVideo, renewLease });
    await rename(partialPath, outputPath);
    const output = await stat(outputPath);
    const updated = await prisma.liveTvRecording.updateMany({ where: { id: recording.id, jobId: job.id, status: 'recording' }, data: { status: 'completed', progress: 100, outputPath: `live-tv-recordings/${recording.id}/recording.mp4`, sizeBytes: BigInt(output.size), durationMs, error: null, recordingEndedAt: new Date() } });
    if (updated.count !== 1) throw new Error('Live TV-optagelsen blev annulleret før færdiggørelse');
    await updateJobProgress(prisma, job, { stage: 'Færdig', percent: 100, message: 'Optagelsen er klar til afspilning' });
  } catch (error) {
    const message = safeError(error);
    await prisma.liveTvRecording.updateMany({ where: { id: recording.id, jobId: job.id, status: { in: ['queued', 'recording'] } }, data: { status: 'failed', error: message.slice(0, 2_000), recordingEndedAt: new Date() } });
    await prisma.liveTvConnection.updateMany({ where: { id: recording.connectionId! }, data: { healthStatus: 'failed', lastError: message.slice(0, 2_000) } });
    await rm(partialPath, { force: true });
    throw error;
  }
}

async function reserveRecordingSource(prisma: PrismaClient, job: ClaimedJob, recordingId: string) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.liveTvRecording.findFirst({ where: { id: recordingId, accountId: job.accountId, jobId: job.id, status: 'queued' } });
    if (!initial) return null;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('bbmedia:live-tv-pool'), hashtext(CAST(${initial.accountId} AS text)))::text AS lock_result`;
    const recording = await tx.liveTvRecording.findFirst({ where: { id: initial.id, jobId: job.id, status: 'queued' } });
    if (!recording) return null;
    const sources = await tx.liveTvChannelSource.findMany({ where: { channelId: recording.channelId, enabled: true, connection: { enabled: true, provider: { enabled: true } } }, include: { channel: true, connection: { include: { provider: { include: { connections: { select: { id: true } } } } } } } });
    const ordered = sources.sort((left, right) => healthRank(left.connection.healthStatus) - healthRank(right.connection.healthStatus) || left.connection.provider.priority - right.connection.provider.priority || left.connection.priority - right.connection.priority || left.priority - right.priority);
    for (const source of ordered) {
      const providerConnections = source.connection.provider.connections.map((connection) => connection.id);
      const [connectionLeases, connectionRecordings, userLeases, userRecordings] = await Promise.all([
        tx.liveTvLease.count({ where: { connectionId: source.connectionId, status: { in: activeLeaseStatuses }, leaseExpiresAt: { gt: new Date() } } }),
        tx.liveTvRecording.count({ where: { connectionId: source.connectionId, status: 'recording', id: { not: recording.id } } }),
        tx.liveTvLease.count({ where: { userId: recording.userId, connectionId: { in: providerConnections }, status: { in: activeLeaseStatuses }, leaseExpiresAt: { gt: new Date() } } }),
        tx.liveTvRecording.count({ where: { userId: recording.userId, connectionId: { in: providerConnections }, status: 'recording', id: { not: recording.id } } }),
      ]);
      if (connectionLeases + connectionRecordings >= source.connection.maxConcurrentStreams) continue;
      if (userLeases + userRecordings >= source.connection.provider.perUserStreamLimit) continue;
      return tx.liveTvRecording.update({ where: { id: recording.id }, data: { sourceId: source.id, connectionId: source.connectionId, status: 'recording', progress: 1, error: null, recordingStartedAt: new Date() }, include: { source: true, channel: true } });
    }
    throw new Error('Ingen ledig M3U-forbindelse til den planlagte optagelse');
  }, { isolationLevel: 'ReadCommitted' as Prisma.TransactionIsolationLevel });
}

async function probeVideoCodec(sourceUrl: string) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', sourceUrl], { timeout: 15_000, maxBuffer: 256_000 });
    return stdout.trim().toLowerCase();
  } catch { return 'unknown'; }
}

async function runRecordingFfmpeg(input: { prisma: PrismaClient; job: ClaimedJob; recordingId: string; sourceUrl: string; partialPath: string; durationMs: number; transcodeVideo: boolean; renewLease: () => Promise<void> }) {
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-i', input.sourceUrl, '-map', '0:v:0', '-map', '0:a:0?', '-t', (input.durationMs / 1_000).toFixed(3), ...(input.transcodeVideo ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy']), '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-sn', '-movflags', '+faststart', '-f', 'mp4', '-y', input.partialPath];
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  let output = ''; let errors = ''; let progress = -1; let stopped: Error | null = null; let queue = Promise.resolve();
  const timer = setInterval(() => {
    void Promise.all([input.renewLease(), input.prisma.liveTvRecording.findUnique({ where: { id: input.recordingId }, select: { status: true, jobId: true } })]).then(([, recording]) => {
      if (!recording || recording.status !== 'recording' || recording.jobId !== input.job.id) { stopped = new Error('Live TV-optagelsen blev annulleret'); child.kill('SIGTERM'); }
    }).catch((error: unknown) => { stopped = error instanceof Error ? error : new Error('Worker mistede optagelsesleasen'); child.kill('SIGTERM'); });
  }, 10_000);
  child.stdout.on('data', (chunk: string) => {
    output += chunk; const lines = output.split(/\r?\n/); output = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('out_time_ms=')) continue;
      const micros = Number.parseInt(line.slice(12), 10); if (!Number.isFinite(micros)) continue;
      const next = Math.max(1, Math.min(99, Math.floor(micros / (input.durationMs * 10)))); if (next <= progress) continue; progress = next;
      queue = queue.then(async () => { await input.prisma.liveTvRecording.updateMany({ where: { id: input.recordingId, jobId: input.job.id, status: 'recording' }, data: { progress: next } }); await updateJobProgress(input.prisma, input.job, { stage: 'Optager', percent: next, message: `${next}% optaget` }); });
      void queue.catch(() => child.kill('SIGTERM'));
    }
  });
  child.stderr.on('data', (chunk: string) => { errors = `${errors}${chunk}`.slice(-8_000); });
  const code = await new Promise<number | null>((resolveExit, reject) => { child.once('error', reject); child.once('close', resolveExit); }).finally(() => clearInterval(timer));
  await queue;
  if (stopped) throw stopped;
  if (code !== 0) throw new Error(errors.trim() || `FFmpeg-optagelse sluttede med kode ${code ?? 'ukendt'}`);
}

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown) { return typeof value === 'string' ? value : null; }
function healthRank(value: string) { return value === 'healthy' ? 0 : value === 'unknown' ? 1 : 2; }
function safeError(error: unknown) { return error instanceof Error ? error.message : String(error); }
