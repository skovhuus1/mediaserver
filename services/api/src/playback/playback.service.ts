import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementAction, EntitlementDecision } from '@bb-media/shared-types';
import { PlaybackDecisionService } from './playback-decision.service';
import { StreamReservationService } from './stream-reservation.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

type AuthorizeRequest = {
  profileId: string;
  mediaId: string;
  deviceId: string;
  deviceType: string;
  appVersion?: string;
  playbackContext?: {
    deviceId: string;
    type: string;
    supportsCodecs?: string[];
  };
  requestedAction?: EntitlementAction;
  isCastSession?: boolean;
};

@Injectable()
export class PlaybackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly decision: PlaybackDecisionService,
    private readonly reservations: StreamReservationService,
  ) {}

  async authorize(user: any, dto: AuthorizeRequest) {
    const action: EntitlementAction = dto.requestedAction ?? 'playback';
    const evaluation = await this.entitlements.evaluateForProfile(
      dto.profileId,
      dto.mediaId,
      {
        deviceId: dto.deviceId,
        type: dto.deviceType,
        appVersion: dto.appVersion,
        supportsCodec: dto.playbackContext?.supportsCodecs,
      },
      action,
    );

    if (!evaluation.allowed) {
      throw new ForbiddenException({
        code: evaluation.reason ?? 'entitlement_denied',
        message: evaluation.reasons[0] ?? 'Access denied',
        reasons: evaluation.reasons,
      });
    }

    const media = await this.prisma.media_items.findUnique({ where: { id: dto.mediaId } });
    if (!media) {
      throw new NotFoundException({
        code: 'media_not_found',
        message: 'Medie ikke fundet',
      });
    }

    const method = await this.decision.chooseMethod(media, {
      supportsCodecs: dto.playbackContext?.supportsCodecs,
    }, evaluation.effectiveEntitlements);

    if (method === 'transcode' && !evaluation.effectiveEntitlements.allowVideoTranscode) {
      throw new ForbiddenException({
        code: 'transcode_blocked',
        message: 'Plan tillader ikke transcode',
      });
    }

    const session = await this.reservations.reserve({
      accountId: user.accountId,
      userId: user.sub,
      profileId: dto.profileId,
      deviceId: dto.deviceId,
      mediaId: dto.mediaId,
      playbackMethod: method,
      isCastSession: dto.isCastSession ?? false,
      maxConcurrentStreams: Number(evaluation.effectiveEntitlements.maxConcurrentStreams || 1),
      leaseSeconds: Number(process.env.SESSION_LEASE_SECONDS ?? 90),
    });

    await this.prisma.audit_logs.create({
      data: {
        account_id: user.accountId,
        user_id: user.sub,
        profile_id: dto.profileId,
        device_id: dto.deviceId,
        session_id: session.id,
        category: 'playback',
        action: 'authorize',
        reason: 'ok',
        details: {
          mediaId: dto.mediaId,
          method,
        },
      },
    });

    return {
      sessionId: session.id,
      status: session.status,
      method,
      leaseExpiresAt: session.lease_expires_at,
      streamToken: session.stream_token,
      entitlementDecision: evaluation as EntitlementDecision,
    };
  }

  async listSessions(accountId?: string) {
    if (!accountId) {
      return [];
    }

    const now = new Date();
    const expiredSessions = await this.prisma.playback_sessions.findMany({
      where: {
        account_id: accountId,
        status: { in: ['active', 'reserving', 'paused'] },
        lease_expires_at: { lt: now },
      },
      select: { id: true },
    });

    if (expiredSessions.length > 0) {
      const expiredIds = expiredSessions.map((session) => session.id);
      await this.prisma.$transaction([
        this.prisma.playback_sessions.updateMany({
          where: {
            id: { in: expiredIds },
            status: { in: ['active', 'reserving', 'paused'] },
          },
          data: {
            status: 'expired',
            ended_at: now,
          },
        }),
        this.prisma.stream_reservations.updateMany({
          where: {
            playback_session_id: { in: expiredIds },
            released_at: null,
          },
          data: {
            released_at: now,
            reason: 'lease_expired',
          },
        }),
      ]);
    }

    return this.prisma.playback_sessions.findMany({
      where: {
        account_id: accountId,
        status: { in: ['active', 'reserving', 'paused'] },
      },
      include: {
        media_items: true,
        users: true,
        devices: true,
      },
      orderBy: { last_heartbeat_at: 'desc' },
    });
  }

  async refreshHeartbeat(id: string, leaseSeconds: number) {
    return this.reservations.refreshHeartbeat(id, leaseSeconds);
  }

  async releaseSession(id: string, reason: string) {
    return this.reservations.release(id, reason);
  }
}

