import { Prisma, type PrismaClient, type SystemJob } from '@prisma/client';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { updateJobProgress } from './job-progress.js';
import { parseM3u, parseXmlTv, normalizeLiveTvIdentity } from './live-tv-parsers.js';
import { disableMissingLiveTvSources, forEachLiveTvEntryByIdentity, stableChannelNumber } from './live-tv-import-batching.js';
import { decryptSecret, encryptSecret } from './secret-value.js';

type LiveJob = SystemJob & { attemptNumber?: number };
const execFileAsync = promisify(execFile);
const MEBIBYTE = 1024 * 1024;
export const DEFAULT_LIVE_TV_IMPORT_MAX_BYTES = 256 * MEBIBYTE;
export const DEFAULT_LIVE_TV_EPG_MAX_BYTES = 200 * MEBIBYTE;
export interface LiveTvSourceProgress { receivedBytes: number; totalBytes: number | null }
export interface LiveTvSourceFetchOptions {
  allowGzip?: boolean;
  timeoutMs?: number;
  onProgress?: (progress: LiveTvSourceProgress) => Promise<void> | void;
}

export async function importLiveTvPlaylist(prisma: PrismaClient, job: LiveJob, renew: () => Promise<void>) {
  const providerId = stringPayload(job, 'providerId');
  const provider = await prisma.liveTvProvider.findFirst({ where: { id: providerId, accountId: job.accountId }, include: { connections: { where: { enabled: true } } } });
  if (!provider) throw new Error('Live TV provider was not found');
  await updateJobProgress(prisma, job, { stage: 'Henter M3U', current: 0, total: provider.connections.length, message: provider.name });
  let imported = 0;
  const errors: string[] = [];
  for (const [connectionIndex, connection] of provider.connections.entries()) {
    try {
      await renew();
      const playlistUrl = decryptSecret(connection.playlistUrl);
      const text = await fetchLiveTvSourceText(playlistUrl, maxBytes('BB_MEDIA_LIVE_TV_IMPORT_MAX_BYTES', DEFAULT_LIVE_TV_IMPORT_MAX_BYTES), {
        onProgress: async ({ receivedBytes, totalBytes }) => {
          await renew();
          await updateJobProgress(prisma, job, {
            stage: 'Henter M3U', current: receivedBytes, total: totalBytes,
            percent: totalBytes ? Math.min(99, (receivedBytes / totalBytes) * 100) : null,
            message: sourceDownloadMessage(connection.name, receivedBytes, totalBytes),
          });
        },
      });
      const entries = parseM3u(text);
      if (!entries.length) throw new Error('M3U-listen indeholder ingen gyldige HTTP-kanaler');
      const seen: string[] = [];
      let processed = 0;
      let nextProgressAt = Date.now() + 5_000;
      await forEachLiveTvEntryByIdentity(entries, (entry) => (
        entry.tvgId
          ? `tvg:${normalizeLiveTvIdentity(entry.tvgId)}`
          : `name:${normalizeLiveTvIdentity(entry.tvgName ?? entry.name)}`
      ), async (entry) => {
        if (Date.now() >= nextProgressAt) {
          nextProgressAt = Date.now() + 5_000;
          await renew();
          await updateJobProgress(prisma, job, { stage: 'Importerer kanaler', current: imported + processed, total: imported + entries.length, message: connection.name });
        }
        const streamUrl = new URL(entry.url, playlistUrl).toString();
        const streamFingerprint = hash(streamUrl);
        const identity = entry.tvgId ? `tvg:${normalizeLiveTvIdentity(entry.tvgId)}` : `name:${normalizeLiveTvIdentity(entry.tvgName ?? entry.name)}`;
        let channel = await prisma.liveTvChannel.findUnique({ where: { accountId_canonicalKey: { accountId: job.accountId, canonicalKey: identity } } });
        if (!channel) channel = await prisma.liveTvChannel.create({ data: { accountId: job.accountId, canonicalKey: identity, tvgId: entry.tvgId,
          name: entry.tvgName ?? entry.name, number: entry.channelNumber, logoUrl: entry.logoUrl, groupName: entry.groupName } });
        else if (!channel.metadataLocked) channel = await prisma.liveTvChannel.update({ where: { id: channel.id }, data: {
          tvgId: entry.tvgId ?? channel.tvgId, name: entry.tvgName ?? entry.name, number: stableChannelNumber(channel.number, entry.channelNumber),
          logoUrl: entry.logoUrl ?? channel.logoUrl, groupName: entry.groupName ?? channel.groupName,
        } });
        await prisma.liveTvChannelSource.upsert({
          where: { connectionId_streamFingerprint: { connectionId: connection.id, streamFingerprint } },
          create: { channelId: channel.id, connectionId: connection.id, externalId: entry.tvgId, sourceName: entry.name,
            encryptedStreamUrl: encryptSecret(streamUrl) as unknown as Prisma.InputJsonValue, streamFingerprint,
            streamFormat: inferFormat(streamUrl), priority: connection.priority, enabled: true },
          update: { channelId: channel.id, externalId: entry.tvgId, sourceName: entry.name,
            encryptedStreamUrl: encryptSecret(streamUrl) as unknown as Prisma.InputJsonValue, streamFormat: inferFormat(streamUrl), enabled: true, lastSeenAt: new Date() },
        });
        seen.push(streamFingerprint);
        processed += 1;
      });
      await disableMissingLiveTvSources(prisma, connection.id, seen);
      await prisma.liveTvConnection.update({ where: { id: connection.id }, data: { healthStatus: 'healthy', lastError: null, lastImportedAt: new Date() } });
      imported += entries.length;
    } catch (error) {
      const message = safeError(error);
      errors.push(`${connection.name}: ${message}`);
      await prisma.liveTvConnection.update({ where: { id: connection.id }, data: { healthStatus: 'failed', lastError: message } });
    }
    await updateJobProgress(prisma, job, { stage: 'M3U-kilder', current: connectionIndex + 1, total: provider.connections.length, percent: ((connectionIndex + 1) / provider.connections.length) * 100, message: `${imported} kanaler` });
  }
  if (!imported) throw new Error(errors.join(' | ') || 'Ingen M3U-forbindelser kunne importeres');
  if (provider.connections.length && errors.length === provider.connections.length) throw new Error(errors.join(' | '));
  await updateJobProgress(prisma, job, { stage: 'Færdig', current: imported, total: imported, percent: 100, message: `${imported} kanalforekomster importeret${errors.length ? ` · ${errors.length} kildefejl` : ''}` });
}

export async function importLiveTvEpg(prisma: PrismaClient, job: LiveJob, renew: () => Promise<void>) {
  const providerId = stringPayload(job, 'providerId');
  const source = await prisma.liveTvEpgSource.findFirst({ where: { providerId, accountId: job.accountId, enabled: true }, include: { provider: true } });
  if (!source) throw new Error('XMLTV source was not found');
  try {
    await updateJobProgress(prisma, job, { stage: 'Henter XMLTV', current: 0, total: null, message: source.provider.name });
    const xml = await fetchLiveTvSourceText(decryptSecret(source.encryptedUrl), maxBytes('BB_MEDIA_LIVE_TV_EPG_MAX_BYTES', DEFAULT_LIVE_TV_EPG_MAX_BYTES), {
      allowGzip: true,
      onProgress: async ({ receivedBytes, totalBytes }) => {
        await renew();
        await updateJobProgress(prisma, job, {
          stage: 'Henter XMLTV', current: receivedBytes, total: totalBytes,
          percent: totalBytes ? Math.min(99, (receivedBytes / totalBytes) * 100) : null,
          message: sourceDownloadMessage(source.provider.name, receivedBytes, totalBytes),
        });
      },
    });
    await renew();
    const parsed = parseXmlTv(xml);
    const channels = await prisma.liveTvChannel.findMany({ where: { accountId: job.accountId } });
    const byTvg = new Map(channels.flatMap((channel) => channel.tvgId ? [[normalizeLiveTvIdentity(channel.tvgId), channel]] as const : []));
    const byName = new Map(channels.map((channel) => [normalizeLiveTvIdentity(channel.name), channel]));
    const from = new Date(Date.now() - 6 * 60 * 60_000);
    const until = new Date(Date.now() + 14 * 24 * 60 * 60_000);
    const rows = parsed.programs.flatMap((program) => {
      if (program.endsAt <= from || program.startsAt >= until) return [];
      const metadata = parsed.channels.get(program.channelExternalId);
      const channel = byTvg.get(normalizeLiveTvIdentity(program.channelExternalId)) ?? (metadata?.name ? byName.get(normalizeLiveTvIdentity(metadata.name)) : undefined);
      return channel ? [{ accountId: job.accountId, providerId, channelId: channel.id, startsAt: program.startsAt, endsAt: program.endsAt,
        title: program.title, subtitle: program.subtitle, description: program.description, category: program.category,
        iconUrl: program.iconUrl, episode: program.episode }] : [];
    });
    await prisma.liveTvProgram.deleteMany({ where: { providerId, accountId: job.accountId, endsAt: { gte: from } } });
    for (let index = 0; index < rows.length; index += 500) {
      await renew();
      await prisma.liveTvProgram.createMany({ data: rows.slice(index, index + 500), skipDuplicates: true });
      await updateJobProgress(prisma, job, { stage: 'Importerer programguide', current: Math.min(index + 500, rows.length), total: rows.length, percent: rows.length ? Math.min(100, ((index + 500) / rows.length) * 100) : 100 });
    }
    await prisma.liveTvEpgSource.update({ where: { id: source.id }, data: { healthStatus: 'healthy', lastError: null, lastImportedAt: new Date() } });
    await updateJobProgress(prisma, job, { stage: 'Færdig', current: rows.length, total: rows.length, percent: 100, message: `${rows.length} programmer importeret` });
  } catch (error) {
    await prisma.liveTvEpgSource.update({ where: { id: source.id }, data: { healthStatus: 'failed', lastError: safeError(error) } });
    throw error;
  }
}

export async function runLiveTvStream(prisma: PrismaClient, job: LiveJob, root: string, renew: () => Promise<void>) {
  const leaseId = stringPayload(job, 'leaseId');
  const payload = job.payload as Record<string, unknown>;
  const lease = await prisma.liveTvLease.findFirst({ where: { id: leaseId, accountId: job.accountId, jobId: job.id }, include: { source: true } });
  if (!lease) throw new Error('Live TV lease was not found for stream job');
  const output = resolve(root, 'live-tv', lease.id);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const sourceUrl = decryptSecret(lease.source.encryptedStreamUrl);
  let method = lease.method;
  if (method === 'direct_stream' && payload.allowTranscodeFallback === true) {
    const codec = await probeVideoCodec(sourceUrl).catch(() => null);
    if (codec && codec !== 'h264') method = 'transcode';
  }
  if (method !== lease.method) await prisma.liveTvLease.update({ where: { id: lease.id }, data: { method } });
  await updateJobProgress(prisma, job, { stage: method === 'transcode' ? 'Transcoder Live TV' : 'Remuxer Live TV', current: 0, total: null, message: 'Forbinder til kanalkilden' });
  try {
    await runFfmpegLive(prisma, job, lease.id, sourceUrl, output, method, renew);
  } catch (error) {
    if (method === 'direct_stream' && payload.allowTranscodeFallback === true) {
      await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
      await prisma.liveTvLease.update({ where: { id: lease.id }, data: { method: 'transcode', status: 'preparing', lastError: null } });
      await updateJobProgress(prisma, job, { stage: 'Skifter til transcoding', message: 'Remux var ikke kompatibel; prøver softwaretranscoding' });
      await runFfmpegLive(prisma, job, lease.id, sourceUrl, output, 'transcode', renew);
      return;
    }
    await prisma.liveTvLease.updateMany({ where: { id: lease.id, jobId: job.id }, data: { status: 'failed', lastError: safeError(error) } });
    throw error;
  }
}

async function runFfmpegLive(prisma: PrismaClient, job: LiveJob, leaseId: string, sourceUrl: string, output: string, method: string, renew: () => Promise<void>) {
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts+discardcorrupt', '-rw_timeout', '15000000', '-i', sourceUrl,
    '-map', '0:v:0?', '-map', '0:a:0?', ...(method === 'transcode'
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ac', '2']
      : ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ac', '2']),
    '-f', 'hls', '-hls_time', '4', '-hls_list_size', String(liveTvPauseSegmentCount()), '-hls_flags', 'delete_segments+append_list+omit_endlist+independent_segments',
    '-hls_segment_filename', resolve(output, 'segment-%08d.ts'), resolve(output, 'index.m3u8')];
  await new Promise<void>((resolveJob, rejectJob) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; let stopping = false; let ready = false; let checking = false;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    const timer = setInterval(() => {
      if (checking) return; checking = true;
      void Promise.all([renew(), prisma.liveTvLease.findUnique({ where: { id: leaseId } }), readdir(output).catch((): string[] => [])]).then(async ([, current, files]) => {
        if (!current || current.jobId !== job.id || !['preparing', 'ready', 'active'].includes(current.status) || current.leaseExpiresAt <= new Date()) {
          stopping = true; child.kill('SIGTERM'); return;
        }
        if (!ready && files.includes('index.m3u8') && files.some((file) => file.endsWith('.ts'))) {
          ready = true;
          await prisma.liveTvLease.updateMany({ where: { id: leaseId, jobId: job.id }, data: { status: 'ready', lastError: null } });
          await updateJobProgress(prisma, job, { stage: 'Live', percent: 100, message: method === 'transcode' ? 'Softwaretranscoding aktiv' : 'Direct Stream-remux aktiv' });
        }
      }).catch((error) => { stderr = `${stderr}\n${safeError(error)}`; child.kill('SIGTERM'); }).finally(() => { checking = false; });
    }, 2_000);
    child.once('error', (error) => { clearInterval(timer); rejectJob(error); });
    child.once('close', (code) => { clearInterval(timer); if (stopping) resolveJob(); else rejectJob(new Error(`FFmpeg Live TV sluttede med kode ${code}: ${stderr.trim() || 'ingen diagnosticering'}`)); });
  });
}

export function liveTvPauseSegmentCount(raw = process.env.BB_MEDIA_LIVE_TV_PAUSE_BUFFER_SECONDS): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  const seconds = Math.max(60, Math.min(7_200, Number.isFinite(parsed) ? parsed : 7_200));
  return Math.ceil(seconds / 4);
}

async function probeVideoCodec(url: string) {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', url], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  return stdout.trim().toLowerCase();
}

export async function fetchLiveTvSourceText(url: string, limit: number, options: LiveTvSourceFetchOptions = {}) {
  const { allowGzip = false, onProgress } = options;
  const timeoutMs = options.timeoutMs ?? sourceFetchTimeoutMs();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'BoltBytes-Media/1.0', accept: '*/*' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declaredLengthValue = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    const totalBytes = Number.isFinite(declaredLengthValue) && declaredLengthValue >= 0 ? declaredLengthValue : null;
    if (totalBytes !== null && totalBytes > limit) throw sourceLimitError(limit);
    if (!response.body) return '';

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let lastProgressAt = 0;
    const reportProgress = async (force = false) => {
      if (!onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressAt < 1_000) return;
      lastProgressAt = now;
      await onProgress({ receivedBytes, totalBytes });
    };
    await reportProgress(true);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > limit) {
        await reader.cancel().catch(() => undefined);
        throw sourceLimitError(limit);
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      await reportProgress();
    }
    await reportProgress(true);

    const bytes = Buffer.concat(chunks, receivedBytes);
    let decoded = bytes;
    if (allowGzip && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      try { decoded = gunzipSync(bytes, { maxOutputLength: limit }); }
      catch (error) {
        if (error instanceof RangeError || (error instanceof Error && /larger than/i.test(error.message))) throw sourceLimitError(limit);
        throw error;
      }
    }
    if (decoded.length > limit) throw sourceLimitError(limit);
    return decoded.toString('utf8');
  } finally { clearTimeout(timer); }
}

function stringPayload(job: LiveJob, key: string) { const value = (job.payload as Record<string, unknown>)?.[key]; if (typeof value !== 'string') throw new Error(`${job.type} payload requires ${key}`); return value; }
function inferFormat(url: string) { return /\.m3u8(?:$|[?#])/i.test(url) ? 'hls' : 'mpegts'; }
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function maxBytes(name: string, fallback: number) { const value = Number.parseInt(process.env[name] ?? '', 10); return Number.isFinite(value) && value >= 1024 * 1024 ? value : fallback; }
function sourceFetchTimeoutMs() { const value = Number.parseInt(process.env.BB_MEDIA_LIVE_TV_FETCH_TIMEOUT_MS ?? '', 10); return Number.isFinite(value) ? Math.max(30_000, Math.min(900_000, value)) : 300_000; }
function sourceLimitError(limit: number) { return new Error(`Kilden overstiger sikkerhedsgrænsen på ${Math.max(1, Math.ceil(limit / MEBIBYTE))} MiB. Hæv BB_MEDIA_LIVE_TV_IMPORT_MAX_BYTES eller BB_MEDIA_LIVE_TV_EPG_MAX_BYTES, hvis kilden er betroet.`); }
function sourceDownloadMessage(name: string, receivedBytes: number, totalBytes: number | null) { return `${name} · ${formatMebibytes(receivedBytes)}${totalBytes !== null ? ` / ${formatMebibytes(totalBytes)}` : ''}`; }
function formatMebibytes(bytes: number) { return `${(bytes / MEBIBYTE).toFixed(bytes >= 10 * MEBIBYTE ? 0 : 1)} MiB`; }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000); }
