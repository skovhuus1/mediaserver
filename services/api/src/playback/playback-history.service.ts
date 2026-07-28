import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PlaybackProgressDto } from './playback-history.dto';
import { normalizePlaybackProgress } from './playback-progress';
import { StreamReservationService } from './stream-reservation.service';

@Injectable()
export class PlaybackHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: StreamReservationService,
  ) {}

  context(actor: AuthenticatedUser) {
    return {
      profileId: actor.profileId,
      deviceId: actor.deviceId,
    };
  }

  async updateProgress(actor: AuthenticatedUser, sessionId: string, dto: PlaybackProgressDto) {
    const session = await this.prisma.playbackSession.findFirst({
      where: {
        id: sessionId,
        accountId: actor.accountId,
        userId: actor.sub,
      },
      include: {
        media: { include: { file: true } },
      },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'playback_session_missing',
        message: 'Playback session does not exist for the current user',
      });
    }

    const progress = normalizePlaybackProgress(
      dto.positionMs,
      dto.durationMs ?? session.media.file?.durationMs,
      dto.completed,
    );
    const history = await this.prisma.playbackHistory.upsert({
      where: {
        profileId_mediaId: {
          profileId: session.profileId,
          mediaId: session.mediaId,
        },
      },
      create: {
        accountId: session.accountId,
        userId: session.userId,
        profileId: session.profileId,
        mediaId: session.mediaId,
        playbackSessionId: session.id,
        positionMs: progress.positionMs,
        completed: progress.completed,
      },
      update: {
        playbackSessionId: session.id,
        positionMs: progress.positionMs,
        completed: progress.completed,
      },
    });

    if (progress.completed && session.status === 'active') {
      await this.reservations.release(actor, session.id, 'completed');
    }
    return {
      id: history.id,
      mediaId: history.mediaId,
      positionMs: history.positionMs,
      durationMs: progress.durationMs,
      completed: history.completed,
      updatedAt: history.updatedAt,
    };
  }

  async continueWatching(actor: AuthenticatedUser) {
    if (!actor.profileId) return [];
    const entries = await this.prisma.playbackHistory.findMany({
      where: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: actor.profileId,
        completed: false,
        positionMs: { gt: 0 },
      },
      include: {
        media: {
          include: {
            file: true,
            library: { select: { id: true, name: true, type: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });

    return entries.map((entry) => {
      const durationMs = entry.media.file?.durationMs ?? null;
      return {
        id: entry.media.id,
        title: entry.media.title,
        type: entry.media.type,
        category: entry.media.category,
        seriesTitle: entry.media.seriesTitle,
        releaseYear: entry.media.releaseYear,
        seasonNumber: entry.media.seasonNumber,
        episodeNumber: entry.media.episodeNumber,
        posterPath: entry.media.posterPath,
        backdropPath: entry.media.backdropPath,
        codec: entry.media.codec,
        container: entry.media.container,
        library: entry.media.library,
        file: entry.media.file
          ? { ...entry.media.file, sizeBytes: entry.media.file.sizeBytes.toString() }
          : null,
        progress: {
          positionMs: entry.positionMs,
          durationMs,
          percent: durationMs ? Math.min(100, Math.round((entry.positionMs / durationMs) * 100)) : 0,
          updatedAt: entry.updatedAt,
        },
      };
    });
  }
}
