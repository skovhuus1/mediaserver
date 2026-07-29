import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { correlationId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { PreferenceActor } from '../preferences/preferences.service';
import { RecommendationFeedbackDto } from './recommendations.dto';
import {
  RecommendationFeatures,
  RecommendationSignal,
  scoreRecommendation,
} from './recommendation-score';

interface RecommendationCard {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: number | null;
  communityRating: number | null;
  reason: string;
  score: number;
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(actor: PreferenceActor) {
    const profile = await this.requireProfile(actor);
    const [preferences, latestHistory, latestFeedback] = await Promise.all([
      this.prisma.profilePreferences.findUnique({
        where: { profileId: profile.id },
      }),
      this.prisma.playbackHistory.findFirst({
        where: { accountId: actor.accountId, profileId: profile.id },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.recommendationFeedback.findFirst({
        where: { accountId: actor.accountId, profileId: profile.id },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    const cacheKey = [
      this.cacheKey(actor),
      preferences?.updatedAt.getTime() ?? 0,
      latestHistory?.updatedAt.getTime() ?? 0,
      latestFeedback?.updatedAt.getTime() ?? 0,
    ].join(':');
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as unknown;
      } catch {
        await this.redis.delete(cacheKey);
      }
    }

    const feedbackRows = await this.prisma.recommendationFeedback.findMany({
      where: { accountId: actor.accountId, profileId: profile.id },
    });
    const feedback = new Map(
      feedbackRows.map((row) => [row.mediaId, row.type]),
    );
    const history = await this.prisma.playbackHistory.findMany({
      where: {
        accountId: actor.accountId,
        profileId: profile.id,
        ...(preferences?.recommendationResetAt
          ? { updatedAt: { gte: preferences.recommendationResetAt } }
          : {}),
      },
      include: { media: { include: { file: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const candidates = await this.prisma.mediaItem.findMany({
      where: {
        accountId: actor.accountId,
        file: { isNot: null },
      },
      include: { file: true },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });

    const personalized = preferences?.recommendationsEnabled ?? true;
    const watchedIds = new Set(
      history
        .filter((entry) => entry.completed)
        .map((entry) => entry.mediaId),
    );
    const watchedSeries = new Set(
      history
        .filter((entry) => entry.completed && entry.media.seriesTitle)
        .map((entry) => entry.media.seriesTitle!),
    );
    const signals: RecommendationSignal[] = personalized
      ? history.map((entry) => {
          const ageDays =
            (Date.now() - entry.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
          const recency = Math.max(0.05, 1 - ageDays / 180);
          const baseWeight = entry.completed
            ? 1
            : entry.media.file?.durationMs
              && entry.positionMs / entry.media.file.durationMs >= 0.1
              ? 0.6
              : 0;
          return {
            ...this.features(entry.media),
            weight: baseWeight * recency,
          };
        })
      : [];

    const ranked = candidates
      .filter(
        (media) =>
          !watchedIds.has(media.id)
          && (!media.seriesTitle || !watchedSeries.has(media.seriesTitle))
          && feedback.get(media.id) !== 'hidden',
      )
      .map((media) => {
        const result = scoreRecommendation(
          this.features(media),
          signals,
          feedback.get(media.id) as 'like' | 'dislike' | 'hidden' | undefined,
        );
        return {
          id: media.id,
          title: media.title,
          category: media.category ?? 'uncategorized',
          summary: media.overview,
          posterPath: media.posterPath,
          backdropPath: media.backdropPath,
          releaseYear: media.releaseYear,
          communityRating: media.rating,
          reason: personalized
            ? result.reason
            : 'Populært i dit lokale bibliotek',
          score: result.score,
        } satisfies RecommendationCard;
      })
      .filter((media) => Number.isFinite(media.score))
      .sort((left, right) => right.score - left.score);

    const mostRecent = history[0]?.media;
    const primaryReason = mostRecent
      ? `Fordi du så ${mostRecent.title}`
      : `Udvalgt til ${profile.name}`;
    const response = {
      personalized,
      hero: ranked[0] ?? null,
      sections: [
        {
          id: 'for-you',
          title: `Udvalgt til ${profile.name}`,
          items: ranked.slice(0, 20),
        },
        {
          id: 'because-you-watched',
          title: primaryReason,
          items: ranked.slice(5, 25),
        },
        {
          id: 'new-and-rated',
          title: 'Nyt og højt vurderet',
          items: ranked
            .slice()
            .sort(
              (left, right) =>
                (right.releaseYear ?? 0) - (left.releaseYear ?? 0) ||
                (right.communityRating ?? 0) - (left.communityRating ?? 0),
            )
            .slice(0, 20),
        },
      ].filter((section) => section.items.length > 0),
    };
    await this.redis.setEx(cacheKey, 900, JSON.stringify(response));
    return response;
  }

  async setFeedback(
    actor: PreferenceActor,
    mediaId: string,
    input: RecommendationFeedbackDto,
  ) {
    const profile = await this.requireProfile(actor);
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true },
    });
    if (!media) {
      throw new NotFoundException({
        code: 'media_not_found',
        message: 'Media item was not found',
      });
    }
    const [result] = await this.prisma.$transaction([
      this.prisma.recommendationFeedback.upsert({
        where: {
          profileId_mediaId: { profileId: profile.id, mediaId },
        },
        create: {
          accountId: actor.accountId,
          profileId: profile.id,
          mediaId,
          type: input.type,
        },
        update: { type: input.type },
      }),
      this.prisma.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: profile.id,
          correlationId: correlationId(),
          action: 'recommendation.feedback_update',
          outcome: 'allowed',
          code: 'recommendation_feedback_updated',
          details: { resourceId: mediaId, type: input.type },
        },
      }),
    ]);
    await this.redis.delete(this.cacheKey(actor));
    return result;
  }

  async removeFeedback(actor: PreferenceActor, mediaId: string) {
    const profile = await this.requireProfile(actor);
    await this.prisma.$transaction([
      this.prisma.recommendationFeedback.deleteMany({
        where: {
          accountId: actor.accountId,
          profileId: profile.id,
          mediaId,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: profile.id,
          correlationId: correlationId(),
          action: 'recommendation.feedback_remove',
          outcome: 'allowed',
          code: 'recommendation_feedback_removed',
          details: { resourceId: mediaId },
        },
      }),
    ]);
    await this.redis.delete(this.cacheKey(actor));
    return { removed: true };
  }

  async reset(actor: PreferenceActor) {
    const profile = await this.requireProfile(actor);
    const resetAt = new Date();
    await this.prisma.$transaction([
      this.prisma.profilePreferences.upsert({
        where: { profileId: profile.id },
        create: {
          profileId: profile.id,
          accountId: actor.accountId,
          preferredAudioLanguages: ['da', 'en'],
          preferredSubtitleLanguages: ['da', 'en'],
          recommendationResetAt: resetAt,
        },
        update: { recommendationResetAt: resetAt },
      }),
      this.prisma.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: profile.id,
          correlationId: correlationId(),
          action: 'recommendation.reset',
          outcome: 'allowed',
          code: 'recommendation_reset',
          details: { resourceId: profile.id, resetAt: resetAt.toISOString() },
        },
      }),
    ]);
    await this.redis.delete(this.cacheKey(actor));
    return { reset: true };
  }

  private async requireProfile(actor: PreferenceActor) {
    if (!actor.profileId) {
      throw new ForbiddenException({
        code: 'active_profile_required',
        message: 'Select a profile before requesting recommendations',
      });
    }
    const profile = await this.prisma.profile.findFirst({
      where: {
        id: actor.profileId,
        accountId: actor.accountId,
        archivedAt: null,
      },
      select: { id: true, name: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'profile_not_found',
        message: 'The active profile is unavailable',
      });
    }
    return profile;
  }

  private features(media: {
    category: string | null;
    genres: unknown;
    credits: unknown;
    similarProviderIds: unknown;
    rating: number | null;
    metadataProvider: string | null;
    metadataProviderId: string | null;
  }): RecommendationFeatures {
    const genres = this.stringList(media.genres);
    const credits = Array.isArray(media.credits)
      ? media.credits
          .map((credit) =>
            credit &&
            typeof credit === 'object' &&
            'id' in credit &&
            typeof credit.id === 'string'
              ? credit.id
              : null,
          )
          .filter((credit): credit is string => Boolean(credit))
      : [];
    return {
      category: media.category ?? 'uncategorized',
      genres,
      credits,
      providerIds: [
        ...this.stringList(media.similarProviderIds),
        ...(media.metadataProvider && media.metadataProviderId
          ? [`${media.metadataProvider}:${media.metadataProviderId}`]
          : []),
      ],
      rating: media.rating ?? 0,
    };
  }

  private stringList(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private cacheKey(actor: PreferenceActor) {
    return `recommendations:${actor.accountId}:${actor.profileId ?? 'none'}`;
  }
}
