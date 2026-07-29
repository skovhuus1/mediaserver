import { ForbiddenException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { buildAdaptiveQualityPlan, detectVideoSignalProfile, isHevcCodec, type AuthenticatedUser } from '@boltbytes/contracts';
import { isPrivileged } from '../common/auth';
import { correlationId } from '../common/request-context';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { readEnvironment } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { createCastStreamToken } from './cast-stream-token';
import { streamTokenMatches } from './direct-stream-policy';
import { AuthorizePlaybackDto, CastHandoffDto, ReconfigurePlaybackDto } from './playback.dto';
import { choosePlaybackMethod } from './playback-decision';
import { StreamReservationService } from './stream-reservation.service';
import { imageSubtitleDescriptors, SubtitleStreamService } from './subtitle-stream.service';
import { TranscodeStreamService } from './transcode-stream.service';

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
    const adaptiveQuality = buildAdaptiveQualityPlan({
      sourceWidth: media.width,
      sourceHeight: media.height,
      sourceBitrate: media.bitrate,
      sourceHdr: Boolean(sourceVideo.hdr),
      planMaxHeight: entitlement.effective.maxVideoResolution,
      planMaxBitrate: entitlement.effective.maxVideoBitrate * 1_000,
      serverMaxHeight: Number(process.env.BB_MEDIA_MAX_TRANSCODE_HEIGHT ?? 2160),
      screenHeight: dto.capabilities.screenHeight ?? null,
      devicePixelRatio: dto.capabilities.devicePixelRatio ?? null,
      estimatedDownlinkMbps: dto.capabilities.estimatedDownlinkMbps ?? null,
      qualityMode: device.qualityMode as 'auto' | 'fixed' | 'original',
      fixedQualityHeight: device.fixedQualityHeight,
      allowUpscale: device.allowUpscale,
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
      supportedContainers: dto.capabilities.supportedContainers,
      entitlements: entitlement.effective,
    });
    const decision =
      normalDecision.allowed
      && normalDecision.method === 'direct_play'
      && device.qualityMode !== 'original'
      && entitlement.effective.allowVideoTranscode
        ? {
            allowed: true as const,
            method: 'transcode' as const,
            code: 'adaptive_transcode',
            reason: 'Adaptive quality is enabled for this device',
          }
        : normalDecision;
    if (!decision.allowed) {
      await this.audit(actor, dto, 'denied', decision.code, { reason: decision.reason });
      throw new ForbiddenException({ code: decision.code, message: decision.reason });
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
      if (decision.method === 'transcode') {
        try {
          await this.transcodeStream.enqueue(session.id, actor.accountId, {
            maxVideoResolution: entitlement.effective.maxVideoResolution,
            maxVideoBitrate: entitlement.effective.maxVideoBitrate,
            preserveHdr: Boolean(
              sourceVideo.hdr
              && dto.capabilities.supportsHdr
              && dto.capabilities.supportedCodecs.some((codec) => isHevcCodec(codec)),
            ),
            adaptiveQuality,
            hdrMode: device.hdrMode,
          });
        } catch (error) {
          await this.reservations.release(actor, session.id, 'transcode_queue_failed');
          throw error;
        }
      }
      await this.audit(actor, dto, 'allowed', 'playback_authorized', { method: decision.method, sessionId: session.id });
      const token = encodeURIComponent(session.streamToken);
      const streamUrl = decision.method === 'transcode'
        ? `/api/v1/playback/sessions/${session.id}/hls/master.m3u8?token=${token}`
        : `/api/v1/playback/sessions/${session.id}/stream?token=${token}`;
      const subtitleTracks = await this.subtitleStream.listForPlayback(
        session.id,
        session.streamToken,
        media.file,
        decision.method === 'transcode',
      );
      return {
        sessionId: session.id,
        logicalSessionId: session.logicalSessionId,
        method: decision.method,
        streamToken: session.streamToken,
        streamUrl,
        contentType: decision.method === 'transcode' ? 'application/x-mpegURL' : this.directContentType(media.container),
        subtitleTracks,
        playbackPreferences: {
          qualityMode: device.qualityMode,
          fixedQualityHeight: device.fixedQualityHeight,
          allowUpscale: device.allowUpscale,
          dataSaver: device.dataSaver,
          playbackRate: device.playbackRate,
          hdrMode: device.hdrMode,
          preferredAudioLanguages: profilePreferences?.preferredAudioLanguages ?? ['da', 'en'],
          preferredSubtitleLanguages: profilePreferences?.preferredSubtitleLanguages ?? ['da', 'en'],
          subtitleMode: profilePreferences?.subtitleMode ?? 'auto',
          autoplayNext: profilePreferences?.autoplayNext ?? true,
        },
        adaptiveQuality,
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
            height: decision.method === 'direct_play'
              ? media.height
              : Math.min(media.height ?? entitlement.effective.maxVideoResolution, entitlement.effective.maxVideoResolution),
            hdr: decision.method === 'direct_play'
              ? sourceVideo.hdr
              : sourceVideo.hdr && dto.capabilities.supportsHdr && isHevcCodec(sourceVideo.codec)
                ? sourceVideo.hdr
                : null,
          },
        },
        ...(decision.method === 'transcode'
          ? { transcodeStatusUrl: `/api/v1/playback/sessions/${session.id}/transcode-status?token=${token}` }
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
    if (!entitlement.allowed || !entitlement.effective.allowVideoTranscode) {
      throw new ForbiddenException({
        code: entitlement.allowed
          ? 'video_transcode_not_allowed'
          : entitlement.code,
        message:
          entitlement.reasons[0]
          ?? 'The active plan does not allow stream reconfiguration',
      });
    }
    if (dto.burnIn && !entitlement.effective.allowSubtitleBurnIn) {
      throw new ForbiddenException({
        code: 'subtitle_burn_in_not_allowed',
        message: 'The active plan does not allow subtitle burn-in',
      });
    }

    const sourceVideo = detectVideoSignalProfile(session.media.file.probe);
    const adaptiveQuality = buildAdaptiveQualityPlan({
      sourceWidth: session.media.width,
      sourceHeight: session.media.height,
      sourceBitrate: session.media.bitrate,
      sourceHdr: Boolean(sourceVideo.hdr),
      planMaxHeight: entitlement.effective.maxVideoResolution,
      planMaxBitrate: entitlement.effective.maxVideoBitrate * 1_000,
      serverMaxHeight: Number(process.env.BB_MEDIA_MAX_TRANSCODE_HEIGHT ?? 2160),
      screenHeight: null,
      devicePixelRatio: null,
      estimatedDownlinkMbps: null,
      qualityMode: session.device.qualityMode as 'auto' | 'fixed' | 'original',
      fixedQualityHeight: session.device.fixedQualityHeight,
      allowUpscale: session.device.allowUpscale,
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
        data: { method: 'transcode', lastHeartbeatAt: new Date() },
      }),
    ]);
    await this.transcodeStream.enqueue(session.id, actor.accountId, {
      maxVideoResolution: entitlement.effective.maxVideoResolution,
      maxVideoBitrate: entitlement.effective.maxVideoBitrate,
      preserveHdr: Boolean(
        sourceVideo.hdr
        && session.device.hdrMode !== 'force_sdr',
      ),
      adaptiveQuality,
      hdrMode: session.device.hdrMode,
      subtitleTrackId: dto.burnIn ? dto.subtitleTrackId ?? null : null,
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
          subtitleTrackId: dto.subtitleTrackId ?? null,
        },
      },
    });
    const token = encodeURIComponent(dto.streamToken);
    return {
      accepted: true,
      sessionId: session.id,
      logicalSessionId: session.logicalSessionId,
      method: 'transcode',
      streamUrl: `/api/v1/playback/sessions/${session.id}/hls/master.m3u8?token=${token}`,
      transcodeStatusUrl: `/api/v1/playback/sessions/${session.id}/transcode-status?token=${token}`,
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
    const streamPath = session.method === 'transcode'
      ? `/api/v1/playback/sessions/${session.id}/hls/master.m3u8?token=${encodedToken}`
      : `/api/v1/playback/sessions/${session.id}/stream?token=${encodedToken}`;
    const subtitleTracks = await this.subtitleStream.listForPlayback(
      session.id,
      signed.token,
      session.media.file,
      session.method === 'transcode',
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
      contentType: session.method === 'transcode'
        ? 'application/x-mpegURL'
        : this.directContentType(session.media.container),
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

  list(actor: AuthenticatedUser) {
    return this.prisma.playbackSession.findMany({
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
        leaseExpiresAt: true,
        lastHeartbeatAt: true,
        startedAt: true,
        media: { select: { id: true, title: true, type: true } },
        device: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
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
    if (container === 'webm') return 'video/webm';
    if (container === 'mov' || container === 'mp4') return 'video/mp4';
    return 'application/octet-stream';
  }
}
