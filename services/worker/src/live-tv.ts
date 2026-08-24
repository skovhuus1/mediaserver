import { Prisma, type PrismaClient, type SystemJob } from '@prisma/client';
import { describeLiveTvChannel, normalizeLiveTvIdentity } from '@boltbytes/contracts';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { updateJobProgress } from './job-progress.js';
import { parseM3uDocument, parseXmlTv, resolveM3uEpgUrl } from './live-tv-parsers.js';
import {
  disableMissingLiveTvSources,
  forEachLiveTvEntryByIdentity,
  hasLiveTvChannelMetadataChanges,
  hasLiveTvSourceChanges,
  stableChannelNumber,
} from './live-tv-import-batching.js';
import { loadLiveTvChannelImportIndex, rememberLiveTvImportChannel, resolveLiveTvImportChannel } from './live-tv-channel-import.js';
import { decryptSecret, encryptSecret } from './secret-value.js';
import { defaultAudioTrack, findLiveTvTrack, isBitmapSubtitle, parseLiveTvProbe, type LiveTvTrackCatalog } from './live-tv-tracks.js';

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
  const provider = await prisma.liveTvProvider.findFirst({ where: { id: providerId, accountId: job.accountId }, include: { connections: { where: { enabled: true } }, epgSource: true } });
  if (!provider) throw new Error('Live TV provider was not found');
  let epgSourceConfigured = Boolean(provider.epgSource);
  let epgSourceEnabled = provider.epgSource?.enabled ?? false;
  let epgSourceDiscovered = false;
  const epgNeedsRecovery = Boolean(provider.epgSource?.enabled && (
    provider.epgSource.healthStatus !== 'healthy' || !provider.epgSource.lastImportedAt
  ));
  const channelIndex = await loadLiveTvChannelImportIndex(prisma, job.accountId);
  await updateJobProgress(prisma, job, { stage: 'Henter M3U', current: 0, total: provider.connections.length, message: provider.name });
  let imported = 0;
  let createdSources = 0;
  let updatedSources = 0;
  let unchangedSources = 0;
  let disabledSources = 0;
  let updatedChannels = 0;
  const startedAt = Date.now();
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
      const document = parseM3uDocument(text);
      const entries = document.entries;
      if (!entries.length) throw new Error('M3U-listen indeholder ingen gyldige HTTP-kanaler');
      const existingSources = await prisma.liveTvChannelSource.findMany({
        where: { connectionId: connection.id },
        select: {
          id: true, channelId: true, streamFingerprint: true, externalId: true,
          sourceName: true, streamFormat: true, qualityLabel: true, qualityRank: true,
          priority: true, enabled: true,
        },
      });
      const sourceIndex = new Map(existingSources.map((source) => [source.streamFingerprint, source]));
      const discoveredEpgUrl = resolveM3uEpgUrl(document.epgUrls, playlistUrl);
      if (discoveredEpgUrl && !epgSourceConfigured) {
        await ensureDiscoveredEpgSource(prisma, job, providerId, discoveredEpgUrl);
        epgSourceConfigured = true;
        epgSourceEnabled = true;
        epgSourceDiscovered = true;
      }
      const seen: string[] = [];
      let processed = 0;
      let nextProgressAt = Date.now() + 5_000;
      await forEachLiveTvEntryByIdentity(entries, (entry) => (
        describeLiveTvChannel(entry).canonicalKey
      ), async (entry) => {
        if (Date.now() >= nextProgressAt) {
          nextProgressAt = Date.now() + 5_000;
          await renew();
          await updateJobProgress(prisma, job, { stage: 'Importerer kanaler', current: imported + processed, total: imported + entries.length, message: connection.name });
        }
        const streamUrl = new URL(entry.url, playlistUrl).toString();
        const streamFingerprint = hash(streamUrl);
        const resolved = await resolveLiveTvImportChannel(prisma, job.accountId, channelIndex, entry);
        let channel = resolved.channel;
        if (!channel.metadataLocked) {
          const metadata = {
            tvgId: channel.tvgId ?? entry.tvgId,
            name: resolved.descriptor.displayName,
            number: stableChannelNumber(channel.number, entry.channelNumber),
            logoUrl: entry.logoUrl ?? channel.logoUrl,
            groupName: entry.groupName ?? channel.groupName,
          };
          if (hasLiveTvChannelMetadataChanges(channel, metadata)) {
            channel = await prisma.liveTvChannel.update({ where: { id: channel.id }, data: metadata });
            rememberLiveTvImportChannel(channelIndex, channel);
            updatedChannels += 1;
          }
        }
        const sourceState = {
          channelId: channel.id,
          externalId: entry.tvgId,
          sourceName: entry.name,
          streamFormat: inferFormat(streamUrl),
          qualityLabel: resolved.descriptor.qualityLabel,
          qualityRank: resolved.descriptor.qualityRank,
          priority: connection.priority,
          enabled: true,
        };
        const existingSource = sourceIndex.get(streamFingerprint);
        if (!existingSource) {
          const created = await prisma.liveTvChannelSource.create({ data: {
            ...sourceState,
            connectionId: connection.id,
            encryptedStreamUrl: encryptSecret(streamUrl) as unknown as Prisma.InputJsonValue,
            streamFingerprint,
          } });
          sourceIndex.set(streamFingerprint, created);
          createdSources += 1;
        } else if (hasLiveTvSourceChanges(existingSource, sourceState)) {
          const updated = await prisma.liveTvChannelSource.update({
            where: { id: existingSource.id },
            data: { ...sourceState, lastSeenAt: new Date() },
          });
          sourceIndex.set(streamFingerprint, updated);
          updatedSources += 1;
        } else {
          unchangedSources += 1;
        }
        seen.push(streamFingerprint);
        processed += 1;
      });
      disabledSources += await disableMissingLiveTvSources(prisma, connection.id, seen);
      await prisma.liveTvConnection.update({ where: { id: connection.id }, data: { healthStatus: 'healthy', lastError: null, lastImportedAt: new Date() } });
      imported += entries.length;
    } catch (error) {
      const message = safeError(error);
      errors.push(`${connection.name}: ${message}`);
      await prisma.liveTvConnection.update({ where: { id: connection.id }, data: { healthStatus: 'failed', lastError: message } });
    }
    await updateJobProgress(prisma, job, {
      stage: 'M3U-kilder', current: connectionIndex + 1, total: provider.connections.length,
      percent: ((connectionIndex + 1) / provider.connections.length) * 100,
      message: `${createdSources} nye · ${updatedSources} ændret · ${unchangedSources} uændret`,
    });
  }
  if (!imported) throw new Error(errors.join(' | ') || 'Ingen M3U-forbindelser kunne importeres');
  if (provider.connections.length && errors.length === provider.connections.length) throw new Error(errors.join(' | '));
  let epgQueued = false;
  if (epgSourceEnabled) {
    const futurePrograms = await prisma.liveTvProgram.count({
      where: { accountId: job.accountId, providerId, endsAt: { gt: new Date() } },
    });
    if (epgSourceDiscovered || epgNeedsRecovery || futurePrograms === 0) {
      epgQueued = await queueProviderEpgAfterPlaylistImport(
        prisma,
        job,
        providerId,
        epgSourceDiscovered ? 'm3u_epg_discovery' : 'playlist_epg_recovery',
      );
    }
  }
  const result = {
    processed: imported,
    createdSources,
    updatedSources,
    unchangedSources,
    disabledSources,
    updatedChannels,
    sourceErrors: errors.length,
    epgQueued,
    durationMs: Date.now() - startedAt,
    auditAction: 'live_tv.import.completed',
  };
  job.payload = { ...(job.payload as Prisma.JsonObject), result };
  await prisma.auditLog.create({ data: {
    accountId: job.accountId,
    userId: typeof (job.payload as Prisma.JsonObject).requestedBy === 'string'
      ? (job.payload as Prisma.JsonObject).requestedBy as string
      : null,
    action: result.auditAction,
    outcome: errors.length ? 'partial' : 'success',
    code: providerId,
    details: result,
  } });
  await updateJobProgress(prisma, job, {
    stage: 'Færdig', current: imported, total: imported, percent: 100,
    message: `${createdSources} nye · ${updatedSources} ændret · ${unchangedSources} uændret · ${disabledSources} deaktiveret${errors.length ? ` · ${errors.length} kildefejl` : ''}${epgQueued ? ' · XMLTV sat i kø' : ''}`,
  });
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
    const channels = await prisma.liveTvChannel.findMany({ where: { accountId: job.accountId }, include: { sources: { select: { externalId: true, sourceName: true } } } });
    const byTvg = new Map(channels.flatMap((channel) => [channel.tvgId, ...channel.sources.map((item) => item.externalId)]
      .flatMap((value) => value ? [[normalizeLiveTvIdentity(value), channel]] as const : [])));
    const byCanonicalName = new Map(channels.flatMap((channel) => [channel.name, ...channel.sources.map((item) => item.sourceName)]
      .map((name) => [describeLiveTvChannel({ name }).canonicalKey, channel] as const)));
    const from = new Date(Date.now() - 6 * 60 * 60_000);
    const until = new Date(Date.now() + 14 * 24 * 60 * 60_000);
    if (!parsed.programs.length) throw new Error('XMLTV-kilden indeholder ingen gyldige programmer');
    const relevantPrograms = parsed.programs.filter((program) => program.endsAt > from && program.startsAt < until);
    if (!relevantPrograms.length) throw new Error('XMLTV-kilden indeholder ingen programmer i det aktuelle 14-dages vindue; kontrollér kildens data og tidszone');
    const rows = relevantPrograms.flatMap((program) => {
      const metadata = parsed.channels.get(program.channelExternalId);
      const channel = byTvg.get(normalizeLiveTvIdentity(program.channelExternalId))
        ?? (metadata?.name ? byCanonicalName.get(describeLiveTvChannel({ name: metadata.name }).canonicalKey) : undefined);
      return channel ? [{ accountId: job.accountId, providerId, channelId: channel.id, startsAt: program.startsAt, endsAt: program.endsAt,
        title: program.title, subtitle: program.subtitle, description: program.description, category: program.category,
        iconUrl: program.iconUrl, episode: program.episode }] : [];
    });
    if (!rows.length) {
      const sampleIds = [...new Set(relevantPrograms.slice(0, 5).map((program) => program.channelExternalId))].join(', ');
      throw new Error(`XMLTV hentede ${relevantPrograms.length} aktuelle programmer, men ingen kunne matches med M3U-kanalernes tvg-id eller navn${sampleIds ? ` (eksempler: ${sampleIds})` : ''}`);
    }
    const unmatchedPrograms = relevantPrograms.length - rows.length;
    await prisma.liveTvProgram.deleteMany({ where: { providerId, accountId: job.accountId, endsAt: { gte: from } } });
    for (let index = 0; index < rows.length; index += 500) {
      await renew();
      await prisma.liveTvProgram.createMany({ data: rows.slice(index, index + 500), skipDuplicates: true });
      await updateJobProgress(prisma, job, { stage: 'Importerer programguide', current: Math.min(index + 500, rows.length), total: rows.length, percent: rows.length ? Math.min(100, ((index + 500) / rows.length) * 100) : 100 });
    }
    await prisma.liveTvEpgSource.update({ where: { id: source.id }, data: { healthStatus: 'healthy', lastError: null, lastImportedAt: new Date() } });
    await updateJobProgress(prisma, job, {
      stage: 'Færdig', current: rows.length, total: rows.length, percent: 100,
      message: `${rows.length} programmer importeret${unmatchedPrograms ? ` · ${unmatchedPrograms} kunne ikke matches` : ''}`,
    });
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
  const tracks = await probeLiveTvTracks(sourceUrl).catch((): LiveTvTrackCatalog => ({ audio: [], subtitles: [] }));
  const selectedAudio = findLiveTvTrack(tracks, 'audio', lease.selectedAudioTrackId) ?? defaultAudioTrack(tracks);
  const selectedSubtitle = findLiveTvTrack(tracks, 'subtitle', lease.selectedSubtitleTrackId);
  let method = lease.method;
  if (selectedSubtitle) method = 'transcode';
  if (method === 'direct_stream' && payload.allowTranscodeFallback === true) {
    const codec = await probeVideoCodec(sourceUrl).catch(() => null);
    if (codec && codec !== 'h264') method = 'transcode';
  }
  await prisma.liveTvLease.update({ where: { id: lease.id }, data: {
    method,
    availableTracks: tracks as unknown as Prisma.InputJsonValue,
    selectedAudioTrackId: selectedAudio?.id ?? null,
    selectedSubtitleTrackId: selectedSubtitle?.id ?? null,
  } });
  await updateJobProgress(prisma, job, { stage: method === 'transcode' ? 'Transcoder Live TV' : 'Remuxer Live TV', current: 0, total: null, message: 'Forbinder til kanalkilden' });
  try {
    await runFfmpegLive(prisma, job, lease.id, sourceUrl, output, method, tracks, selectedAudio?.id ?? null, selectedSubtitle?.id ?? null, renew);
  } catch (error) {
    if (method === 'direct_stream' && payload.allowTranscodeFallback === true) {
      await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
      await prisma.liveTvLease.update({ where: { id: lease.id }, data: { method: 'transcode', status: 'preparing', lastError: null } });
      await updateJobProgress(prisma, job, { stage: 'Skifter til transcoding', message: 'Remux var ikke kompatibel; prøver softwaretranscoding' });
      await runFfmpegLive(prisma, job, lease.id, sourceUrl, output, 'transcode', tracks, selectedAudio?.id ?? null, selectedSubtitle?.id ?? null, renew);
      return;
    }
    await prisma.liveTvLease.updateMany({ where: { id: lease.id, jobId: job.id }, data: { status: 'failed', lastError: safeError(error) } });
    throw error;
  }
}

async function runFfmpegLive(prisma: PrismaClient, job: LiveJob, leaseId: string, sourceUrl: string, output: string, method: string, tracks: LiveTvTrackCatalog, audioTrackId: string | null, subtitleTrackId: string | null, renew: () => Promise<void>) {
  const audio = findLiveTvTrack(tracks, 'audio', audioTrackId) ?? defaultAudioTrack(tracks);
  const subtitle = findLiveTvTrack(tracks, 'subtitle', subtitleTrackId);
  if (subtitle && !isBitmapSubtitle(subtitle.codec)) throw new Error(`Live TV subtitle codec ${subtitle.codec} cannot be rendered safely`);
  const videoMapping = subtitle
    ? ['-filter_complex', `[0:v:0][0:${subtitle.streamIndex}]overlay[vout]`, '-map', '[vout]']
    : ['-map', '0:v:0?'];
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts+discardcorrupt', '-rw_timeout', '15000000', '-i', sourceUrl,
    ...videoMapping, '-map', audio ? `0:${audio.streamIndex}` : '0:a:0?', ...(method === 'transcode'
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

async function probeLiveTvTracks(url: string): Promise<LiveTvTrackCatalog> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title:stream_disposition=default,forced', '-of', 'json', url,
  ], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
  return parseLiveTvProbe(JSON.parse(stdout) as unknown);
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

async function ensureDiscoveredEpgSource(prisma: PrismaClient, job: LiveJob, providerId: string, epgUrl: string) {
  const encryptedUrl = encryptSecret(epgUrl) as unknown as Prisma.InputJsonValue;
  await prisma.liveTvEpgSource.upsert({
    where: { providerId },
    create: {
      accountId: job.accountId,
      providerId,
      encryptedUrl,
      enabled: true,
      healthStatus: 'unknown',
      lastError: null,
    },
    update: { encryptedUrl, enabled: true, healthStatus: 'unknown', lastError: null },
  });
}

async function queueProviderEpgAfterPlaylistImport(
  prisma: PrismaClient,
  job: LiveJob,
  providerId: string,
  trigger: 'm3u_epg_discovery' | 'playlist_epg_recovery',
) {
  const active = await prisma.systemJob.findMany({
    where: { accountId: job.accountId, type: 'live-tv.epg', status: { in: ['queued', 'running'] } },
    take: 100,
  });
  if (active.some((pending) => (pending.payload as Record<string, unknown>)?.providerId === providerId)) return false;
  await prisma.$transaction([
    prisma.systemJob.create({
      data: {
        accountId: job.accountId,
        type: 'live-tv.epg',
        status: 'queued',
        maxAttempts: 3,
        payload: { providerId, trigger, sourceJobId: job.id },
      },
    }),
    prisma.liveTvProvider.update({ where: { id: providerId }, data: { lastEpgQueuedAt: new Date() } }),
  ]);
  return true;
}
