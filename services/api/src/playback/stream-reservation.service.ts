import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedUser, PlaybackMethod } from '@boltbytes/contracts';
import { isPrivileged } from '../common/auth';
import { readEnvironment } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';

type ReservationInput = {
  actor: AuthenticatedUser;
  profileId: string;
  mediaId: string;
  deviceId: string;
  method: PlaybackMethod;
  isCastSession: boolean;
  maxConcurrentStreams: number;
};

@Injectable()
export class StreamReservationService {
  private readonly leaseSeconds = readEnvironment().sessionLeaseSeconds;

  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: ReservationInput) {
    const streamToken = randomBytes(48).toString('base64url');
    const streamTokenHash = createHash('sha256').update(streamToken).digest('hex');
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.leaseSeconds * 1000);

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:stream-reservation'),
          hashtext(CAST(${input.actor.sub} AS text))
        )
      `;
      const expired = await tx.playbackSession.findMany({
        where: {
          userId: input.actor.sub,
          status: { in: ['reserving', 'active', 'paused'] },
          leaseExpiresAt: { lte: now },
        },
        select: { id: true },
      });
      if (expired.length) {
        const ids = expired.map(({ id }) => id);
        await tx.playbackSession.updateMany({
          where: { id: { in: ids } },
          data: { status: 'expired', endedAt: now },
        });
        await tx.streamReservation.updateMany({
          where: { playbackSessionId: { in: ids }, releasedAt: null },
          data: { releasedAt: now, reason: 'lease_expired' },
        });
      }

      const activeCount = await tx.playbackSession.count({
        where: {
          userId: input.actor.sub,
          status: { in: ['reserving', 'active', 'paused'] },
          leaseExpiresAt: { gt: now },
        },
      });
      if (activeCount >= input.maxConcurrentStreams) {
        throw new ForbiddenException({
          code: 'max_streams_reached',
          message: `The active plan allows ${input.maxConcurrentStreams} concurrent stream(s); ${activeCount} are already active`,
          details: { activeCount, limit: input.maxConcurrentStreams },
        });
      }

      return tx.playbackSession.create({
        data: {
          accountId: input.actor.accountId,
          userId: input.actor.sub,
          profileId: input.profileId,
          deviceId: input.deviceId,
          mediaId: input.mediaId,
          logicalSessionId: randomUUID(),
          method: input.method,
          status: 'active',
          streamTokenHash,
          isCastSession: input.isCastSession,
          leaseExpiresAt,
          reservation: {
            create: {
              accountId: input.actor.accountId,
              userId: input.actor.sub,
            },
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    return { ...session, streamToken };
  }

  async heartbeat(actor: AuthenticatedUser, sessionId: string) {
    const session = await this.ownedSession(actor, sessionId);
    if (!['reserving', 'active', 'paused'].includes(session.status)) {
      throw new BadRequestException({ code: 'session_finished', message: 'The playback session is already finished' });
    }
    const now = new Date();
    const result = await this.prisma.playbackSession.updateMany({
      where: {
        id: session.id,
        status: { in: ['reserving', 'active', 'paused'] },
      },
      data: {
        lastHeartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + this.leaseSeconds * 1000),
      },
    });
    if (result.count !== 1) throw new BadRequestException({ code: 'heartbeat_conflict', message: 'The session changed while heartbeat was processed' });
    return { accepted: true, leaseSeconds: this.leaseSeconds };
  }

  async release(actor: AuthenticatedUser, sessionId: string, reason = 'user_stopped') {
    const session = await this.ownedSession(actor, sessionId);
    if (!['reserving', 'active', 'paused'].includes(session.status)) return { released: false, status: session.status };
    const now = new Date();
    const nextStatus = reason === 'terminated_by_admin' ? 'terminated_by_admin' : 'user_stopped';
    await this.prisma.$transaction([
      this.prisma.playbackSession.update({
        where: { id: session.id },
        data: { status: nextStatus, endedAt: now, leaseExpiresAt: now },
      }),
      this.prisma.streamReservation.updateMany({
        where: { playbackSessionId: session.id, releasedAt: null },
        data: { releasedAt: now, reason },
      }),
    ]);
    return { released: true, status: nextStatus };
  }

  private async ownedSession(actor: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.playbackSession.findFirst({
      where: {
        id: sessionId,
        accountId: actor.accountId,
        ...(isPrivileged(actor) ? {} : { userId: actor.sub }),
      },
    });
    if (!session) throw new NotFoundException({ code: 'session_not_found', message: 'Playback session was not found' });
    return session;
  }
}
