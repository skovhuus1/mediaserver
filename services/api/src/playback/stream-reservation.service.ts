import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ReservePayload = {
  accountId: string;
  userId: string;
  profileId: string;
  deviceId: string;
  mediaId: string;
  playbackMethod: string;
  isCastSession: boolean;
  leaseSeconds: number;
  maxConcurrentStreams: number;
};

@Injectable()
export class StreamReservationService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(payload: ReservePayload) {
    if (!payload.accountId || !payload.userId || !payload.profileId || !payload.deviceId || !payload.mediaId) {
      throw new BadRequestException({
        code: 'missing_reservation_context',
        message: 'Missing required reservation context',
      });
    }

    const leaseSeconds = Number(payload.leaseSeconds ?? 90);
    const maxConcurrentStreams = Number(payload.maxConcurrentStreams) > 0 ? Number(payload.maxConcurrentStreams) : 1;
    const now = new Date();
    const lease = new Date(now.getTime() + leaseSeconds * 1000);

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${payload.accountId}));`;

      const activeCount = await tx.playback_sessions.count({
        where: {
          account_id: payload.accountId,
          status: { in: ['reserving', 'active', 'paused'] },
        },
      });

      if (activeCount >= maxConcurrentStreams) {
        throw new ForbiddenException({
          code: 'max_streams_reached',
          message: `Maximum concurrent streams reached: ${activeCount}/${maxConcurrentStreams}`,
        });
      }

      const session = await tx.playback_sessions.create({
        data: {
          account_id: payload.accountId,
          profile_id: payload.profileId,
          user_id: payload.userId,
          device_id: payload.deviceId,
          media_id: payload.mediaId,
          media_source_id: null,
          playback_method: payload.playbackMethod,
          lease_expires_at: lease,
          status: 'reserving',
          started_at: now,
          last_heartbeat_at: now,
          ip_address: null,
          is_local: false,
          is_cast_session: payload.isCastSession ?? false,
          stream_token: this.createToken(),
        },
      });

      await tx.stream_reservations.create({
        data: {
          playback_session_id: session.id,
          account_id: payload.accountId,
          device_id: payload.deviceId,
          media_id: payload.mediaId,
        },
      });

      return tx.playback_sessions.update({
        where: { id: session.id },
        data: { status: 'active' },
      });
    });
  }

  async refreshHeartbeat(sessionId: string, leaseTtl: number) {
    const lease = new Date(Date.now() + (leaseTtl || 90) * 1000);
    const current = await this.prisma.playback_sessions.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (!current || !['active', 'reserving', 'paused'].includes(current.status)) {
      throw new BadRequestException({ code: 'session_not_heartbeat', message: 'Session findes ikke eller er afsluttet' });
    }

    const nextStatus = current.status === 'paused' ? 'paused' : 'active';

    const updated = await this.prisma.playback_sessions.updateMany({
      where: {
        id: sessionId,
        status: { in: ['reserving', 'active', 'paused'] },
      },
      data: {
        last_heartbeat_at: new Date(),
        lease_expires_at: lease,
        status: nextStatus,
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException({ code: 'session_not_heartbeat', message: 'Session findes ikke eller er afsluttet' });
    }

    return { sessionId, heartbeatAccepted: true };
  }

  async release(sessionId: string, reason: string) {
    const reasonNormalized = reason?.trim()?.toLowerCase() ?? '';
    const shouldReleaseReservation = !['pause', 'paused', 'buffer', 'buffering'].includes(reasonNormalized);

    const nextState =
      reasonNormalized === 'pause' || reasonNormalized === 'paused'
        ? 'paused'
        : reasonNormalized === 'buffer' || reasonNormalized === 'buffering'
          ? 'active'
          : reasonNormalized === 'user_stopped'
            ? 'user_stopped'
            : reasonNormalized === 'terminated_by_admin'
              ? 'terminated_by_admin'
              : reasonNormalized === 'failed'
                ? 'failed'
                : reasonNormalized === 'completed'
                  ? 'completed'
                  : reasonNormalized === 'stopped'
                    ? 'disconnected'
                    : 'disconnected';
    const endedAt = ['paused', 'active'].includes(nextState) ? null : new Date();

    const updated = await this.prisma.playback_sessions.updateMany({
      where: { id: sessionId },
      data: {
        status: nextState,
        ended_at: endedAt,
      },
    });

    if (!updated.count) {
      throw new BadRequestException({ code: 'session_not_found', message: 'Session findes ikke' });
    }

    if (shouldReleaseReservation) {
      await this.prisma.stream_reservations.updateMany({
        where: { playback_session_id: sessionId, released_at: null },
        data: { released_at: new Date(), reason },
      });
    }

    return { sessionId, released: true, reason };
  }

  private createToken() {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

