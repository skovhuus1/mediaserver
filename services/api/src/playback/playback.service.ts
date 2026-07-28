import { ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { isPrivileged } from '../common/auth';
import { correlationId } from '../common/request-context';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizePlaybackDto } from './playback.dto';
import { choosePlaybackMethod } from './playback-decision';
import { StreamReservationService } from './stream-reservation.service';

@Injectable()
export class PlaybackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly reservations: StreamReservationService,
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

    const media = await this.prisma.mediaItem.findFirst({ where: { id: dto.mediaId, accountId: actor.accountId } });
    if (!media) throw new NotFoundException({ code: 'media_not_found', message: 'Media item was not found' });
    const decision = choosePlaybackMethod({
      codec: media.codec,
      container: media.container,
      supportedCodecs: dto.capabilities.supportedCodecs,
      supportedContainers: dto.capabilities.supportedContainers,
      entitlements: entitlement.effective,
    });
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
      await this.audit(actor, dto, 'allowed', 'playback_authorized', { method: decision.method, sessionId: session.id });
      return {
        sessionId: session.id,
        logicalSessionId: session.logicalSessionId,
        method: decision.method,
        streamToken: session.streamToken,
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
        leaseExpiresAt: true,
        lastHeartbeatAt: true,
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
}

