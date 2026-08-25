import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { detectVideoSignalProfile, selectSeriesContinuation, type AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PlaybackProgressDto } from './playback-history.dto';
import { normalizePlaybackProgress } from './playback-progress';
import { StreamReservationService } from './stream-reservation.service';

const watchlistMediaInclude = Prisma.validator<Prisma.MediaItemInclude>()({
  file: true,
  library: { select: { id: true, name: true, type: true } },
});

type WatchlistMedia = Prisma.MediaItemGetPayload<{
  include: typeof watchlistMediaInclude;
}>;

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
        media: { file: { is: { status: 'ready' } } },
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

    return entries.flatMap((entry) => {
      const durationMs = entry.media.file?.durationMs ?? null;
      if (durationMs && entry.positionMs / durationMs >= 0.9) return [];
      const file = entry.media.file
        ? (({ probe: _probe, ...publicFile }) => ({ ...publicFile, sizeBytes: entry.media.file!.sizeBytes.toString() }))(entry.media.file)
        : null;
      return [{
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
        width: entry.media.width,
        height: entry.media.height,
        hdr: detectVideoSignalProfile(entry.media.file?.probe).hdr,
        library: entry.media.library,
        file,
        progress: {
          positionMs: entry.positionMs,
          durationMs,
          percent: durationMs ? Math.min(100, Math.round((entry.positionMs / durationMs) * 100)) : 0,
          updatedAt: entry.updatedAt,
        },
      }];
    });
  }

  async watchlist(actor: AuthenticatedUser) {
    const profileId = this.profileId(actor);
    const entries = await this.prisma.watchlistEntry.findMany({
      where: { accountId: actor.accountId, profileId },
      include: { media: { include: watchlistMediaInclude } },
      orderBy: { createdAt: 'desc' },
    });
    const histories = await this.prisma.playbackHistory.findMany({
      where: {
        accountId: actor.accountId,
        profileId,
        mediaId: { in: entries.map((entry) => entry.mediaId) },
      },
    });
    const progress = new Map(histories.map((entry) => [entry.mediaId, entry]));
    return entries.map((entry) => this.publicMedia(entry.media, progress.get(entry.mediaId)));
  }

  async removeFromContinueWatching(actor: AuthenticatedUser, mediaId: string) {
    const profileId = this.profileId(actor);
    const result = await this.prisma.playbackHistory.deleteMany({
      where: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId,
        mediaId,
      },
    });

    return { mediaId, removed: result.count > 0 };
  }

  async addToWatchlist(actor: AuthenticatedUser, mediaId: string) {
    const profileId = this.profileId(actor);
    await this.media(actor, mediaId);
    const entry = await this.prisma.watchlistEntry.upsert({
      where: { profileId_mediaId: { profileId, mediaId } },
      create: { accountId: actor.accountId, profileId, mediaId },
      update: {},
    });
    return { mediaId: entry.mediaId, inWatchlist: true, createdAt: entry.createdAt };
  }

  async removeFromWatchlist(actor: AuthenticatedUser, mediaId: string) {
    const profileId = this.profileId(actor);
    await this.prisma.watchlistEntry.deleteMany({
      where: { accountId: actor.accountId, profileId, mediaId },
    });
    return { mediaId, inWatchlist: false };
  }

  async mediaStatus(actor: AuthenticatedUser, mediaId: string) {
    const profileId = this.profileId(actor);
    await this.media(actor, mediaId);
    const [watchlist, history] = await Promise.all([
      this.prisma.watchlistEntry.findUnique({
        where: { profileId_mediaId: { profileId, mediaId } },
      }),
      this.prisma.playbackHistory.findUnique({
        where: { profileId_mediaId: { profileId, mediaId } },
      }),
    ]);
    return {
      mediaId,
      inWatchlist: Boolean(watchlist),
      watched: history?.completed ?? false,
      positionMs: history?.positionMs ?? 0,
    };
  }

  async setWatched(actor: AuthenticatedUser, mediaId: string, watched: boolean) {
    const profileId = this.profileId(actor);
    const media = await this.media(actor, mediaId);
    const positionMs = watched ? media.file?.durationMs ?? 0 : 0;
    const history = await this.prisma.playbackHistory.upsert({
      where: { profileId_mediaId: { profileId, mediaId } },
      create: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId,
        mediaId,
        positionMs,
        completed: watched,
      },
      update: { positionMs, completed: watched },
    });
    return {
      mediaId,
      watched: history.completed,
      positionMs: history.positionMs,
    };
  }

  async nextEpisode(
    actor: AuthenticatedUser,
    identity: string | {
      seriesTitle?: string;
      seriesDisplayTitle?: string;
      seriesMetadataProviderId?: string;
      afterMediaId?: string;
    },
  ) {
    const request = typeof identity === 'string' ? { seriesTitle: identity } : identity;
    const providerId = request.seriesMetadataProviderId?.trim();
    const displayTitle = request.seriesDisplayTitle?.trim();
    const normalizedTitle = request.seriesTitle?.trim();
    if (
      !actor.profileId
      || (!providerId && !displayTitle && !normalizedTitle)
      || [providerId, displayTitle, normalizedTitle].some((value) => (value?.length ?? 0) > 240)
    ) return null;
    const episodes = await this.prisma.mediaItem.findMany({
      where: {
        accountId: actor.accountId,
        type: 'episode',
        ...(providerId
          ? { seriesMetadataProviderId: providerId }
          : displayTitle
            ? { seriesDisplayTitle: { equals: displayTitle, mode: 'insensitive' as const } }
            : { seriesTitle: { equals: normalizedTitle!, mode: 'insensitive' as const } }),
        file: { is: { status: 'ready' } },
      },
      include: {
        file: true,
        library: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }, { title: 'asc' }],
    });
    if (!episodes.length) return null;
    const history = await this.prisma.playbackHistory.findMany({
      where: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: actor.profileId,
        mediaId: { in: episodes.map((episode) => episode.id) },
      },
    });
    const progressByMedia = new Map(history.map((entry) => [entry.mediaId, entry]));
    const continuation = selectSeriesContinuation(episodes.map((episode) => {
      const progress = progressByMedia.get(episode.id);
      return {
        id: episode.id,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        progress: progress ? {
          positionMs: progress.positionMs,
          durationMs: episode.file?.durationMs ?? 0,
          completed: progress.completed,
          updatedAt: progress.updatedAt,
        } : null,
      };
    }), request.afterMediaId);
    const media = continuation ? episodes.find((episode) => episode.id === continuation.mediaId) ?? null : null;
    if (!media) return null;
    const progress = progressByMedia.get(media.id);
    const file = media.file
      ? (({ probe: _probe, ...publicFile }) => ({ ...publicFile, sizeBytes: media.file!.sizeBytes.toString() }))(media.file)
      : null;
    return {
      media: {
        ...media,
        hdr: detectVideoSignalProfile(media.file?.probe).hdr,
        file,
      },
      resumePositionMs: continuation?.resumePositionMs ?? progress?.positionMs ?? 0,
    };
  }

  private profileId(actor: AuthenticatedUser) {
    if (!actor.profileId) {
      throw new BadRequestException({
        code: 'active_profile_required',
        message: 'An active profile is required',
      });
    }
    return actor.profileId;
  }

  private async media(actor: AuthenticatedUser, mediaId: string) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      include: watchlistMediaInclude,
    });
    if (!media) {
      throw new NotFoundException({
        code: 'media_not_found',
        message: 'Media was not found in this account',
      });
    }
    return media;
  }

  private publicMedia(
    media: WatchlistMedia,
    history?: { positionMs: number; completed: boolean; updatedAt: Date },
  ) {
    const durationMs = media.file?.durationMs ?? null;
    const file = media.file
      ? (({ probe: _probe, ...publicFile }) => ({
          ...publicFile,
          sizeBytes: media.file!.sizeBytes.toString(),
        }))(media.file)
      : null;
    return {
      id: media.id,
      title: media.title,
      type: media.type,
      category: media.category,
      seriesTitle: media.seriesTitle,
      seriesDisplayTitle: media.seriesDisplayTitle,
      seriesMetadataProviderId: media.seriesMetadataProviderId,
      releaseYear: media.releaseYear,
      seasonNumber: media.seasonNumber,
      episodeNumber: media.episodeNumber,
      overview: media.overview,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      width: media.width,
      height: media.height,
      hdr: detectVideoSignalProfile(media.file?.probe).hdr,
      library: media.library,
      file,
      progress: history && !history.completed
        ? {
            positionMs: history.positionMs,
            durationMs,
            percent: durationMs
              ? Math.min(100, Math.round((history.positionMs / durationMs) * 100))
              : 0,
            updatedAt: history.updatedAt,
          }
        : null,
      watched: history?.completed ?? false,
    };
  }
}
