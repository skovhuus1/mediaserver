import { ForbiddenException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { buildAdaptiveQualityPlan, detectVideoSignalProfile, isHevcCodec, resolveCpuTranscodeProfile, type AuthenticatedUser } from '@boltbytes/contracts';
import { availableParallelism } from 'node:os';
import { isPrivileged } from '../common/auth';
import { correlationId } from '../common/request-context';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { readEnvironment } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { createCastStreamToken } from './cast-stream-token';
import { streamTokenMatches } from './direct-stream-policy';
import { AuthorizePlaybackDto, CastHandoffDto, ReconfigurePlaybackDto } from './playback.dto';
import { choosePlaybackMethod, shouldTranscodeCompatibleSource } from './playback-decision';
import { StreamReservationService } from './stream-reservation.service';
import { imageSubtitleDescriptors, SubtitleStreamService } from './subtitle-stream.service';
import { TranscodeStreamService } from './transcode-stream.service';

const cpuTranscodeProfile = resolveCpuTranscodeProfile({
  availableThreads: availableParallelism(),
  renditionCount: 4,
  configuredThreads: process.env.BB_MEDIA_CPU_TRANSCODE_THREADS,
  configuredRenditions: process.env.BB_MEDIA_MAX_TRANSCODE_RENDITIONS,
  configuredPreset: process.env.BB_MEDIA_CPU_TRANSCODE_PRESET,
  configuredMaxHeight: process.env.BB_MEDIA_MAX_TRANSCODE_HEIGHT
    ?? (/^(?:true|1|yes)$/i.test(process.env.BB_MEDIA_GPU_ENABLED?.trim() ?? '') ? 2160 : 1080),
});

type PlaybackQualityMode = 'auto' | 'fixed' | 'original';

type PlaybackAudioTrack = {
  id: string;
  streamIndex: number;
  label: string;
  language: string;
  codec: string | null;
  channels: number | null;
  default: boolean;
  selected: boolean;
};

function asJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const values = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length ? values : [...fallback];
}

function normalizeLanguage(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return {
    dan: 'da',
    danish: 'da',
    da: 'da',
    eng: 'en',
    english: 'en',
    en: 'en',
    nor: 'no',
    nob: 'no',
    nno: 'no',
    norwegian: 'no',
    swe: 'sv',
    swedish: 'sv',
    sv: 'sv',
    ger: 'de',
    deu: 'de',
    german: 'de',
    de: 'de',
    spa: 'es',
    spanish: 'es',
    es: 'es',
    fre: 'fr',
    fra: 'fr',
    french: 'fr',
    fr: 'fr',
  }[normalized] ?? normalized;
}

function languageLabel(language: string): string {
  return {
    da: 'Dansk',
    en: 'Engelsk',
    no: 'Norsk',
    sv: 'Svensk',
    de: 'Tysk',
    es: 'Spansk',
    fr: 'Fransk',
  }[language] ?? (language ? language.toUpperCase() : 'Ukendt sprog');
}

function audioChannelLabel(channels: number | null): string | null {
  if (channels === null || channels <= 0) return null;
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  if (channels === 6) return '5.1';
  if (channels === 8) return '7.1';
  return `${channels} kanaler`;
}

function playbackAudioTracks(probe: unknown, preferredLanguages: string[]): PlaybackAudioTrack[] {
  const root = asJsonObject(probe);
  const streams = Array.isArray(root.streams) ? root.streams.map(asJsonObject) : [];
  const tracks = streams.flatMap((stream, audioOrdinal): PlaybackAudioTrack[] => {
    if (stream.codec_type !== 'audio') return [];
    const streamIndex = finiteInteger(stream.index);
    if (streamIndex === null) return [];
    const tags = asJsonObject(stream.tags);
    const disposition = asJsonObject(stream.disposition);
    const language = normalizeLanguage(tags.language);
    const codec = typeof stream.codec_name === 'string' ? stream.codec_name.toUpperCase() : null;
    const channels = finiteInteger(stream.channels);
    const defaultTrack = disposition.default === 1 || disposition.default === true;
    const title = typeof tags.title === 'string' && tags.title.trim() !== ''
      ? tags.title.trim()
      : null;
    const details = [
      languageLabel(language),
      codec,
      audioChannelLabel(channels),
    ].filter((value): value is string => Boolean(value));
    const baseLabel = title ?? `Lydspor ${audioOrdinal + 1}`;
    return [{
      id: `audio-${streamIndex}`,
      streamIndex,
      label: details.length ? `${baseLabel} · ${details.join(' · ')}` : baseLabel,
      language,
      codec,
      channels,
      default: defaultTrack,
      selected: false,
    }];
  });
  if (!tracks.length) return tracks;
  const preferred = preferredLanguages
    .map(normalizeLanguage)
    .filter(Boolean);
  const selected =
    tracks.find((track) => preferred.includes(track.language))
    ?? tracks.find((track) => track.default)
    ?? tracks[0]!;
  return tracks.map((track) => ({
    ...track,
    selected: track.id === selected.id,
  }));
}

function selectPlaybackAudioTrack(
  tracks: PlaybackAudioTrack[],
  audioTrackId: string | undefined,
): PlaybackAudioTrack | null {
  if (!tracks.length) {
    if (!audioTrackId) return null;
    throw new UnprocessableEntityException({
      code: 'audio_track_invalid',
      message: 'The selected audio track is not available for this title',
    });
  }
  if (!audioTrackId) return tracks.find((track) => track.selected) ?? tracks[0]!;
  const selected = tracks.find((track) => track.id === audioTrackId);
  if (!selected) {
    throw new UnprocessableEntityException({
      code: 'audio_track_invalid',
      message: 'The selected audio track is not available for this title',
    });
  }
  return selected;
}

function audioTracksWithSelection(
  tracks: PlaybackAudioTrack[],
  selected: PlaybackAudioTrack | null,
): PlaybackAudioTrack[] {
  return tracks.map((track) => ({
    ...track,
    selected: selected !== null && track.id === selected.id,
  }));
}

@Injectable()
export class PlaybackService {
  private readonly environment = readEnvironment();

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly reservations: StreamReservationService,
    private readonly transcodeStream: TranscodeStreamService,
    private readonly subtitleStream: SubtitleStreamService,
  ) {}

  async authorize(actor: AuthenticatedUser, dto: AuthorizePlaybackDto) {
    const entitlement = await this.entitlements.evaluate(actor, {
      profileId: dto.profileId,
      mediaId: dto.mediaId,
      action: dto.isCastSession ? 'cast' : 'playback',
      device: { deviceId: dto.deviceId, supportedCodecs: dto.capabilities.supportedCodecs },
    });
    if (!entitlement.allowed) {
      await this.audit(actor, dto, 'denied', entitlement.code, { reasons: entitlement.reasons });
      throw new ForbiddenException({
        code: entitlement.code,
        message: entitlement.reasons[0] ?? 'Playback entitlement was denied',
        details: { reasons: entitlement.reasons, availableAt: entitlement.availableAt },
      });
    }

    const media = await this.prisma.mediaItem.findFirst({
      where: { id: dto.mediaId, accountId: actor.accountId },
      include: { file: { include: { storageRoot: true } } },
    });
    if (!media) throw new NotFoundException({ code: 'media_not_found', message: 'Media item was not found' });
    if (!media.file || media.file.status !== 'ready') {
      throw new UnprocessableEntityException({
        code: 'media_file_not_ready',
        message: 'The media item has no readable scanned file',
      });
    }
    const [device, profilePreferences] = await Promise.all([
      this.prisma.device.findFirst({
        where: {
          id: dto.deviceId,
          accountId: actor.accountId,
          userId: actor.sub,
          isRevoked: false,
        },
      }),
      this.prisma.profilePreferences.findUnique({
        where: { profileId: dto.profileId },
      }),
    ]);
    if (!device) {
      throw new NotFoundException({
        code: 'device_not_found',
        message: 'The active playback device was not found',
      });
    }
    const sourceVideo = detectVideoSignalProfile(media.file.probe);
    const preferredAudioLanguages = stringArray(
      profilePreferences?.preferredAudioLanguages,
      ['da', 'en'],
    );
    const audioTracks = playbackAudioTracks(
      media.file.probe,
      preferredAudioLanguages,
    );
    const selectedAudioTrack = selectPlaybackAudioTrack(audioTracks, undefined);
    const requestedUpscaleMode = (
      dto.capabilities.upscaleMode ?? device.upscaleMode ?? 'server'
    ) as 'off' | 'device' | 'server';
    const upscaleMode: 'off' | 'server' =
      device.allowUpscale && requestedUpscaleMode !== 'off' ? 'server' : 'off';
    const adaptiveQuality = buildAdaptiveQualityPlan({
      sourceWidth: media.width,
      sourceHeight: media.height,
      sourceBitrate: media.bitrate,
      sourceHdr: Boolean(sourceVideo.hdr),
      planMaxHeight: entitlement.effective.maxVideoResolution,
      planMaxBitrate: entitlement.effective.maxVideoBitrate * 1_000,
      serverMaxHeight: cpuTranscodeProfile.maxHeight,
      serverMaxRenditions: cpuTranscodeProfile.maxRenditions,
      screenHeight: dto.capabilities.screenHeight ?? null,
      devicePixelRatio: dto.capabilities.devicePixelRatio ?? null,
      estimatedDownlinkMbps: dto.capabilities.estimatedDownlinkMbps ?? null,
      qualityMode: device.qualityMode as 'auto' | 'fixed' | 'original',
      fixedQualityHeight: device.fixedQualityHeight,
      allowUpscale: upscaleMode !== 'off',
      upscaleMode,
      dataSaver: device.dataSaver,
      hdrMode: device.hdrMode as 'auto' | 'prefer_hdr' | 'force_sdr',
    });
    const normalDecision = choosePlaybackMethod({
      codec: media.codec,
      container: media.container,
      height: media.height,
      bitrate: media.bitrate,
      hdr: sourceVideo.hdr,
      supportsHdr: dto.capabilities.supportsHdr,
      supportedCodecs: dto.capabilities.supportedCodecs,
      audioCodec: media.file.audioCodec,
      supportedAudioCodecs: dto.capabilities.supportedAudioCodecs,
      supportedContainers: dto.capabilities.supportedContainers,
      entitlements: entitlement.effective,
    });
    const compatibleSourcePolicy = shouldTranscodeCompatibleSource({
      qualityMode: device.qualityMode as 'auto' | 'fixed' | 'original',
      sourceHeight: media.height,
      sourceBitrate: media.bitrate,
      targetHeight: adaptiveQuality.effectiveMaxHeight,
      estimatedDownlinkMbps: dto.capabilities.estimatedDownlinkMbps ?? null,
      dataSaver: device.dataSaver,
      preferDirectPlay: !/^(?:false|0|no)$/i.test(process.env.BB_MEDIA_PREFER_DIRECT_PLAY?.trim() ?? ''),
      allowUpscale: upscaleMode !== 'off',
      upscaleMode,
      autoTranscodeOnBandwidth: /^(?:true|1|yes)$/i.test(
        process.env.BB_MEDIA_AUTO_TRANSCODE_ON_BANDWIDTH?.trim() ?? '',
      ),
    });
    let decision =
      normalDecision.allowed
      && normalDecision.method !== 'transcode'
      && compatibleSourcePolicy.required
      && entitlement.effective.allowVideoTranscode
        ? {
            allowed: true as const,
            method: 'transcode' as const,
            code: 'adaptive_transcode',
            reason: compatibleSourcePolicy.reason,
            directPlayBlockers: normalDecision.directPlayBlockers,
          }
        : normalDecision;
    if (!decision.allowed) {
      await this.audit(actor, dto, 'denied', decision.code, { reason: decision.reason });
      throw new ForbiddenException({ code: decision.code, message: decision.reason });
    }

    const startPositionMs = Math.max(
      0,
      Math.min(
        dto.startPositionMs ?? 0,
        Math.max(0, (media.file?.durationMs ?? 0) - 1_000),
      ),
    );
    if (
      startPositionMs > 0
      && decision.method === 'direct_stream'
      && entitlement.effective.allowVideoTranscode
    ) {
      decision = {
        ...decision,
        method: 'transcode',
        code: 'accurate_seek_transcode',
        reason: 'Accurate resume requires synchronized video and audio transcoding',
      };
    }
    try {
      const session = await this.reservations.reserve({
        actor,
        profileId: dto.profileId,
        mediaId: dto.mediaId,
        deviceId: dto.deviceId,
        method: decision.method,
        isCastSession: dto.isCastSession,
        maxConcurrentStreams: entitlement.effective.maxConcurrentStreams,
      });
      const deliveryQuality = decision.method === 'direct_stream'
        ? this.directStreamQuality(adaptiveQuality, media, Boolean(sourceVideo.hdr))
        : adaptiveQuality;
      let hlsGeneration: string | null = null;
      if (decision.method !== 'direct_play') {
        try {
          hlsGeneration = await this.transcodeStream.enqueue(session.id, actor.accountId, {
            streamMode: decision.method,
            ...(decision.method === 'direct_stream'
              ? {
                  audioMode: decision.directPlayBlockers.includes('audio_codec_unsupported')
                    ? 'aac' as const
                    : 'copy' as const,
                }
              : {}),
            maxVideoResolution: entitlement.effective.maxVideoResolution,
            maxVideoBitrate: entitlement.effective.maxVideoBitrate,
            preserveHdr: Boolean(
              sourceVideo.hdr
              && dto.capabilities.supportsHdr
              && dto.capabilities.supportedCodecs.some((codec) => isHevcCodec(codec)),
            ),
            adaptiveQuality: deliveryQuality,
            hdrMode: device.hdrMode,
            ...(selectedAudioTrack
              ? {
                  audioTrackId: selectedAudioTrack.id,
                  audioStreamIndex: selectedAudioTrack.streamIndex,
                }
              : {}),
            startPositionMs,
          });
        } catch (error) {
          await this.reservations.release(actor, session.id, 'hls_queue_failed');
          throw error;
        }
      }
      await this.audit(actor, dto, 'allowed', 'playback_authorized', {
        method: decision.method,
        sessionId: session.id,
        decisionCode: decision.code,
        reason: decision.reason,
        directPlayBlockers: decision.directPlayBlockers,
        startPositionMs,
      });
      const token = encodeURIComponent(session.streamToken);
      const hlsQuery = hlsGeneration
        ? `token=${token}&generation=${encodeURIComponent(hlsGeneration)}`
        : `token=${token}`;
      const streamUrl = decision.method === 'direct_play'
        ? `/api/v1/playback/sessions/${session.id}/stream?token=${token}`
        : `/api/v1/playback/sessions/${session.id}/hls/master.m3u8?${hlsQuery}`;
      const subtitleTracks = await this.subtitleStream.listForPlayback(
        session.id,
        session.streamToken,
        media.file,
        true,
      );
      const embeddedSubtitles = subtitleTracks.some((track) => track.id.startsWith('embedded-'));
      if (decision.method === 'direct_play' && embeddedSubtitles) {
        try {
          await this.transcodeStream.enqueueSubtitles(session.id, actor.accountId);
        } catch (error) {
          await this.reservations.release(actor, session.id, 'subtitle_queue_failed');
          throw error;
        }
      }
      return {
        sessionId: session.id,
        logicalSessionId: session.logicalSessionId,
        method: decision.method,
        streamToken: session.streamToken,
        streamUrl,
        contentType: decision.method === 'direct_play' ? this.directContentType(media.container) : 'application/x-mpegURL',
        subtitleTracks,
        audioTracks: audioTracksWithSelection(audioTracks, selectedAudioTrack),
        selectedAudioTrackId: selectedAudioTrack?.id ?? null,
        ...(embeddedSubtitles
          ? { subtitlePreparationStatusUrl: `/api/v1/playback/sessions/${session.id}/subtitle-status?token=${token}` }
          : {}),
        playbackPreferences: {
          qualityMode: device.qualityMode,
          fixedQualityHeight: device.fixedQualityHeight,
          allowUpscale: upscaleMode !== 'off',
          upscaleMode,
          bufferProfile: device.bufferProfile,
          dataSaver: device.dataSaver,
          playbackRate: device.playbackRate,
          hdrMode: device.hdrMode,
          preferredAudioLanguages,
          preferredSubtitleLanguages: profilePreferences?.preferredSubtitleLanguages ?? ['da', 'en'],
          subtitleMode: profilePreferences?.subtitleMode ?? 'auto',
          autoplayNext: profilePreferences?.autoplayNext ?? true,
          subtitleStyle: profilePreferences?.subtitleStyle ?? 'broadcast',
          subtitleTextColor: profilePreferences?.subtitleTextColor ?? '#FFFFFF',
          subtitleSizePercent: profilePreferences?.subtitleSizePercent ?? 100,
          subtitleBottomOffsetPercent:
            profilePreferences?.subtitleBottomOffsetPercent ?? 6,
          subtitleTimingOffsetMs: profilePreferences?.subtitleTimingOffsetMs ?? 0,
        },
        adaptiveQuality: {
          ...deliveryQuality,
          hardwareUpscale: false,
        },
        videoProfile: {
          source: {
            width: media.width,
            height: media.height,
            bitrate: media.bitrate,
            codec: sourceVideo.codec ?? media.codec,
            hdr: sourceVideo.hdr,
            bitDepth: sourceVideo.bitDepth,
          },
          output: {
            height: decision.method !== 'transcode'
              ? media.height
              : Math.min(media.height ?? entitlement.effective.maxVideoResolution, entitlement.effective.maxVideoResolution),
            hdr: decision.method !== 'transcode'
              ? sourceVideo.hdr
              : sourceVideo.hdr && dto.capabilities.supportsHdr && isHevcCodec(sourceVideo.codec)
                ? sourceVideo.hdr
                : null,
          },
        },
        ...(decision.method !== 'direct_play'
          ? { transcodeStatusUrl: `/api/v1/playback/sessions/${session.id}/transcode-status?${hlsQuery}` }
          : {}),
        leaseExpiresAt: session.leaseExpiresAt,
        decision: { entitlement, playback: decision },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const code = typeof response === 'object' && response !== null && 'code' in response
          ? String(response.code)
          : 'playback_rejected';
        await this.audit(actor, dto, 'denied', code, {});
      }
      throw error;
    }
  }

  async reconfigure(
    actor: AuthenticatedUser,
    sessionId: string,
    dto: ReconfigurePlaybackDto,
  ) {
    const session = await this.prisma.playbackSession.findFirst({
      where: {
        id: sessionId,
        accountId: actor.accountId,
        ...(isPrivileged(actor) ? {} : { userId: actor.sub }),
        status: { in: ['reserving', 'active', 'paused'] },
        leaseExpiresAt: { gt: new Date() },
      },
      include: {
        media: { include: { file: true } },
        device: true,
      },
    });
    if (!session || !session.media.file) {
      throw new NotFoundException({
        code: 'session_not_found',
        message: 'Playback session was not found or has expired',
      });
    }
    if (!streamTokenMatches(dto.streamToken, session.streamTokenHash)) {
      throw new ForbiddenException({
        code: 'stream_token_invalid',
        message: 'The playback stream token is invalid',
      });
    }
    if (dto.burnIn && !dto.subtitleTrackId) {
      throw new UnprocessableEntityException({
        code: 'subtitle_track_required',
        message: 'A subtitle track is required for burn-in',
      });
    }
    if (
      dto.burnIn
      && !imageSubtitleDescriptors(session.media.file.probe)
        .some((track) => `burnin-${track.streamIndex}` === dto.subtitleTrackId)
    ) {
      throw new UnprocessableEntityException({
        code: 'subtitle_burn_in_track_invalid',
        message: 'The selected track is not a supported image subtitle',
      });
    }
    const entitlement = await this.entitlements.evaluate(actor, {
      profileId: session.profileId,
      mediaId: session.mediaId,
      action: 'playback',
      device: {
        deviceId: session.deviceId,
        supportedCodecs: [],
      },
    });
    if (!entitlement.allowed) {
      throw new ForbiddenException({
        code: entitlement.code,
        message:
          entitlement.reasons[0]
          ?? 'Playback access is not allowed',
      });
    }

    const sourceVideo = detectVideoSignalProfile(session.media.file.probe);
    const requestedQualityMode = (
      dto.qualityMode ?? session.device.qualityMode
    ) as PlaybackQualityMode;
    const requestedFixedQualityHeight =
      dto.fixedQualityHeight ?? session.device.fixedQualityHeight;
    if (
      requestedQualityMode === 'fixed'
      && (requestedFixedQualityHeight === null || requestedFixedQualityHeight === undefined)
    ) {
      throw new UnprocessableEntityException({
        code: 'fixed_quality_height_required',
        message: 'A fixed quality height is required when qualityMode is fixed',
      });
    }
    const fallbackUpscaleMode: 'server' = 'server';
    const rawUpscaleMode = (
      dto.upscaleMode ?? session.device.upscaleMode ?? fallbackUpscaleMode
    ) as 'off' | 'server' | 'device';
    const requestedAllowUpscale = dto.allowUpscale ?? (rawUpscaleMode !== 'off');
    const requestedUpscaleMode: 'off' | 'server' = requestedAllowUpscale && rawUpscaleMode !== 'off'
      ? 'server'
      : 'off';
    const audioTracks = playbackAudioTracks(session.media.file.probe, []);
    const selectedAudioTrack = selectPlaybackAudioTrack(
      audioTracks,
      dto.audioTrackId,
    );
    const startPositionMs = Math.max(
      0,
      Math.min(
        dto.startPositionMs ?? 0,
        Math.max(0, (session.media.file.durationMs ?? 0) - 1_000),
      ),
    );
    const streamMode = dto.burnIn
      || dto.forceTranscode === true
      || startPositionMs > 0
      ? 'transcode' as const
      : session.method === 'direct_stream'
        ? 'direct_stream' as const
        : 'transcode' as const;
    if (
      streamMode === 'transcode'
      && !dto.burnIn
      && !entitlement.effective.allowVideoTranscode
    ) {
      throw new ForbiddenException({
        code: 'video_transcode_not_allowed',
        message: 'The active plan does not allow video transcoding for playback recovery',
      });
    }
    const adaptiveQuality = buildAdaptiveQualityPlan({
      sourceWidth: session.media.width,
      sourceHeight: session.media.height,
      sourceBitrate: session.media.bitrate,
      sourceHdr: Boolean(sourceVideo.hdr),
      planMaxHeight: entitlement.effective.maxVideoResolution,
      planMaxBitrate: entitlement.effective.maxVideoBitrate * 1_000,
      serverMaxHeight: cpuTranscodeProfile.maxHeight,
      serverMaxRenditions: cpuTranscodeProfile.maxRenditions,
      screenHeight: dto.capabilities?.screenHeight ?? null,
      devicePixelRatio: dto.capabilities?.devicePixelRatio ?? null,
      estimatedDownlinkMbps: dto.capabilities?.estimatedDownlinkMbps ?? null,
      qualityMode: requestedQualityMode,
      fixedQualityHeight: requestedQualityMode === 'fixed'
        ? requestedFixedQualityHeight
        : null,
      allowUpscale: requestedAllowUpscale,
      upscaleMode: requestedUpscaleMode,
      dataSaver: session.device.dataSaver,
      hdrMode: session.device.hdrMode as 'auto' | 'prefer_hdr' | 'force_sdr',
    });
    await this.prisma.$transaction([
      this.prisma.systemJob.updateMany({
        where: {
          accountId: actor.accountId,
          type: 'playback.transcode',
          status: { in: ['queued', 'running'] },
          payload: { path: ['sessionId'], equals: session.id },
        },
        data: { status: 'failed', leaseExpiresAt: null },
      }),
      this.prisma.playbackSession.update({
        where: { id: session.id },
        data: { method: streamMode, lastHeartbeatAt: new Date() },
      }),
    ]);
    const hlsGeneration = await this.transcodeStream.enqueue(session.id, actor.accountId, {
      streamMode,
      ...(streamMode === 'direct_stream' ? { audioMode: 'aac' as const } : {}),
      maxVideoResolution: entitlement.effective.maxVideoResolution,
      maxVideoBitrate: entitlement.effective.maxVideoBitrate,
      preserveHdr: Boolean(
        sourceVideo.hdr
        && session.device.hdrMode !== 'force_sdr',
      ),
      adaptiveQuality,
      hdrMode: session.device.hdrMode,
      subtitleTrackId: dto.burnIn ? dto.subtitleTrackId ?? null : null,
      ...(selectedAudioTrack
        ? {
            audioTrackId: selectedAudioTrack.id,
            audioStreamIndex: selectedAudioTrack.streamIndex,
          }
        : {}),
      startPositionMs,
    });
    await this.prisma.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: session.profileId,
        correlationId: correlationId(),
        action: 'playback.configuration_update',
        outcome: 'allowed',
        code: 'playback_configuration_updated',
        details: {
          sessionId: session.id,
          logicalSessionId: session.logicalSessionId,
          burnIn: dto.burnIn,
          forceTranscode: dto.forceTranscode === true,
          subtitleTrackId: dto.subtitleTrackId ?? null,
          audioTrackId: selectedAudioTrack?.id ?? null,
          audioStreamIndex: selectedAudioTrack?.streamIndex ?? null,
          qualityMode: requestedQualityMode,
          fixedQualityHeight: requestedFixedQualityHeight,
          allowUpscale: requestedAllowUpscale,
          upscaleMode: requestedUpscaleMode,
          startPositionMs,
          hlsGeneration,
        },
      },
    });
    const token = encodeURIComponent(dto.streamToken);
    const hlsQuery = `token=${token}&generation=${encodeURIComponent(hlsGeneration)}`;
    return {
      accepted: true,
      sessionId: session.id,
      logicalSessionId: session.logicalSessionId,
      method: streamMode,
      streamUrl: `/api/v1/playback/sessions/${session.id}/hls/master.m3u8?${hlsQuery}`,
      contentType: 'application/x-mpegURL',
      transcodeStatusUrl: `/api/v1/playback/sessions/${session.id}/transcode-status?${hlsQuery}`,
      audioTracks: audioTracksWithSelection(audioTracks, selectedAudioTrack),
      selectedAudioTrackId: selectedAudioTrack?.id ?? null,
      adaptiveQuality,
    };
  }

  async handoffToCast(
    actor: AuthenticatedUser,
    sessionId: string,
    dto: CastHandoffDto,
    requestOrigin?: string,
  ) {
    const session = await this.prisma.playbackSession.findFirst({
      where: {
        id: sessionId,
        accountId: actor.accountId,
        ...(isPrivileged(actor) ? {} : { userId: actor.sub }),
        status: { in: ['reserving', 'active', 'paused'] },
        leaseExpiresAt: { gt: new Date() },
      },
      include: {
        media: {
          include: {
            file: { include: { storageRoot: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException({ code: 'session_not_found', message: 'Playback session was not found or has expired' });
    if (!streamTokenMatches(dto.streamToken, session.streamTokenHash)) {
      throw new ForbiddenException({ code: 'stream_token_invalid', message: 'The playback stream token is invalid' });
    }
    const entitlement = await this.entitlements.evaluate(actor, {
      profileId: session.profileId,
      mediaId: session.mediaId,
      action: 'cast',
      device: { deviceId: session.deviceId, supportedCodecs: [] },
    });
    if (!entitlement.allowed) {
      throw new ForbiddenException({
        code: entitlement.code,
        message: entitlement.reasons[0] ?? 'Chromecast is not allowed by the active plan',
      });
    }
    if (!session.media.file || session.media.file.status !== 'ready') {
      throw new UnprocessableEntityException({
        code: 'media_file_not_ready',
        message: 'The media item has no readable scanned file',
      });
    }
    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { externalUrl: true },
    });
    const publicBaseUrl = this.castPublicBaseUrl(account?.externalUrl, requestOrigin);
    const signed = createCastStreamToken(
      session.id,
      dto.streamToken,
      this.environment.jwtSecret,
      this.environment.castTokenTtlSeconds,
    );
    const encodedToken = encodeURIComponent(signed.token);
    const streamPath = session.method === 'direct_play'
      ? `/api/v1/playback/sessions/${session.id}/stream?token=${encodedToken}`
      : `/api/v1/playback/sessions/${session.id}/hls/master.m3u8?token=${encodedToken}`;
    const subtitleTracks = await this.subtitleStream.listForPlayback(
      session.id,
      signed.token,
      session.media.file,
      true,
    );
    await this.prisma.playbackSession.update({
      where: { id: session.id },
      data: { isCastSession: true, lastHeartbeatAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: session.profileId,
        correlationId: correlationId(),
        action: 'playback.cast_handoff',
        outcome: 'allowed',
        code: 'cast_handoff_accepted',
        details: { sessionId: session.id, logicalSessionId: session.logicalSessionId, mediaId: session.mediaId },
      },
    });
    return {
      accepted: true,
      sessionId: session.id,
      logicalSessionId: session.logicalSessionId,
      method: session.method,
      streamUrl: new URL(streamPath, publicBaseUrl).toString(),
      heartbeatUrl: new URL(
        `/api/v1/playback/sessions/${session.id}/cast-heartbeat?token=${encodedToken}`,
        publicBaseUrl,
      ).toString(),
      releaseUrl: new URL(
        `/api/v1/playback/sessions/${session.id}/cast-heartbeat?token=${encodedToken}`,
        publicBaseUrl,
      ).toString(),
      contentType: session.method === 'direct_play'
        ? this.directContentType(session.media.container)
        : 'application/x-mpegURL',
      subtitleTracks: subtitleTracks.map((track) => ({
        ...track,
        src: track.src ? new URL(track.src, publicBaseUrl).toString() : null,
      })),
      tokenExpiresAt: signed.expiresAt,
    };
  }

  async cancelCastHandoff(actor: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.playbackSession.findFirst({
      where: {
        id: sessionId,
        accountId: actor.accountId,
        ...(isPrivileged(actor) ? {} : { userId: actor.sub }),
        status: { in: ['reserving', 'active', 'paused'] },
        leaseExpiresAt: { gt: new Date() },
      },
    });
    if (!session) {
      throw new NotFoundException({ code: 'session_not_found', message: 'Playback session was not found or has expired' });
    }
    await this.prisma.playbackSession.update({
      where: { id: session.id },
      data: { isCastSession: false, lastHeartbeatAt: new Date() },
    });
    return { accepted: true, sessionId: session.id, logicalSessionId: session.logicalSessionId };
  }

  private castPublicBaseUrl(configuredUrl: string | null | undefined, requestOrigin: string | undefined): string {
    const candidates = [process.env.BB_MEDIA_PUBLIC_URL, configuredUrl, requestOrigin];
    for (const candidate of candidates) {
      if (!candidate?.trim()) continue;
      try {
        const parsed = new URL(candidate.trim());
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
        if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) continue;
        return `${parsed.protocol}//${parsed.host}/`;
      } catch {
        // Try the next configured source.
      }
    }
    throw new UnprocessableEntityException({
      code: 'cast_public_url_required',
      message: 'Chromecast requires a receiver-accessible server URL. Set BB_MEDIA_PUBLIC_URL or the server external URL.',
    });
  }

  private directStreamQuality(
    adaptiveQuality: ReturnType<typeof buildAdaptiveQualityPlan>,
    media: { width: number | null; height: number | null; bitrate: number | null },
    hdr: boolean,
  ): ReturnType<typeof buildAdaptiveQualityPlan> {
    const height = media.height ?? adaptiveQuality.effectiveMaxHeight;
    const width = media.width ?? Math.round(height * 16 / 9);
    const bitrate = media.bitrate ?? adaptiveQuality.effectiveMaxBitrate;
    return {
      mode: 'original',
      effectiveMaxHeight: height,
      effectiveMaxBitrate: bitrate,
      estimatedBandwidth: adaptiveQuality.estimatedBandwidth,
      renditions: [{
        name: height >= 2160 ? '4K' : `${height}p`,
        width,
        height,
        bitrate,
        bandwidth: Math.round(bitrate * 1.08),
        upscaled: false,
        hdr,
      }],
    };
  }

  async list(actor: AuthenticatedUser) {
    const sessions = await this.prisma.playbackSession.findMany({
      where: {
        accountId: actor.accountId,
        ...(isPrivileged(actor) ? {} : { userId: actor.sub }),
        status: { in: ['reserving', 'active', 'paused'] },
      },
      select: {
        id: true,
        logicalSessionId: true,
        method: true,
        status: true,
        isCastSession: true,
        runtimeState: true,
        positionMs: true,
        durationMs: true,
        currentBitrate: true,
        currentHeight: true,
        bufferAheadMs: true,
        bandwidthEstimate: true,
        droppedFrames: true,
        totalFrames: true,
        stallCount: true,
        playbackRate: true,
        audioTrack: true,
        subtitleTrack: true,
        lastStateChangedAt: true,
        leaseExpiresAt: true,
        lastHeartbeatAt: true,
        startedAt: true,
        media: { select: { id: true, title: true, type: true } },
        device: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    const transcodeJobs = sessions.length
      ? await this.prisma.systemJob.findMany({
          where: {
            accountId: actor.accountId,
            type: 'playback.transcode',
            status: { in: ['queued', 'running', 'completed', 'failed'] },
            OR: sessions.map((session) => ({
              payload: { path: ['sessionId'], equals: session.id },
            })),
          },
          select: { payload: true },
          orderBy: { updatedAt: 'desc' },
        })
      : [];
    const engines = new Map<string, { backend: 'nvenc' | 'software'; encoder: string | null }>();
    for (const job of transcodeJobs) {
      const payload = job.payload !== null && typeof job.payload === 'object' && !Array.isArray(job.payload)
        ? job.payload as Record<string, unknown>
        : {};
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
      if (!sessionId || engines.has(sessionId)) continue;
      engines.set(sessionId, {
        backend: payload.transcodeBackend === 'nvenc' ? 'nvenc' : 'software',
        encoder: typeof payload.transcodeEncoder === 'string' ? payload.transcodeEncoder : null,
      });
    }
    return sessions.map((session) => ({
      ...session,
      transcodeBackend: engines.get(session.id)?.backend ?? null,
      transcodeEncoder: engines.get(session.id)?.encoder ?? null,
    }));
  }

  private audit(
    actor: AuthenticatedUser,
    dto: AuthorizePlaybackDto,
    outcome: string,
    code: string,
    details: object,
  ): Promise<unknown> {
    return this.prisma.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: dto.profileId,
        correlationId: correlationId(),
        action: 'playback.authorize',
        outcome,
        code,
        details: { mediaId: dto.mediaId, deviceId: dto.deviceId, ...details },
      },
    });
  }

  private directContentType(container: string | null): string {
    const containers = container?.toLowerCase().split(',').map((value) => value.trim()) ?? [];
    if (containers.includes('webm')) return 'video/webm';
    if (containers.some((value) => value === 'mov' || value === 'mp4')) return 'video/mp4';
    return 'application/octet-stream';
  }
}
