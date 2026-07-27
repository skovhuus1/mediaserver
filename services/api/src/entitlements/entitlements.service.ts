import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser, EffectiveEntitlements, EntitlementDecision } from '@boltbytes/contracts';
import { isPrivileged } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import { applyEntitlementOverrides, decideEntitlement } from './entitlement-engine';
import { EvaluateEntitlementDto } from './entitlements.dto';

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(actor: AuthenticatedUser, dto: EvaluateEntitlementDto): Promise<EntitlementDecision> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: dto.profileId, accountId: actor.accountId },
      include: {
        user: {
          include: {
            subscriptions: {
              where: {
                status: { in: ['active', 'trialing', 'grace_period'] },
                startsAt: { lte: new Date() },
                OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              },
              include: { planVersion: true, snapshot: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            entitlementOverrides: {
              where: {
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!profile || (!isPrivileged(actor) && profile.userId !== actor.sub)) {
      throw new ForbiddenException({ code: 'profile_not_owned', message: 'The profile is not available to this user' });
    }
    if (profile.user.status !== 'active') {
      return { allowed: false, code: 'user_inactive', reasons: ['The user is suspended or inactive'], availableAt: null, effective: zeroEntitlements() };
    }

    const [media, device] = await Promise.all([
      this.prisma.mediaItem.findFirst({ where: { id: dto.mediaId, accountId: actor.accountId } }),
      this.prisma.device.findFirst({
        where: {
          id: dto.device.deviceId,
          accountId: actor.accountId,
          userId: actor.sub,
          isRevoked: false,
        },
      }),
    ]);
    if (!media) throw new ForbiddenException({ code: 'media_not_available', message: 'The media item is not available in this account' });
    if (!device) throw new ForbiddenException({ code: 'device_not_registered', message: 'The playback device is not registered or has been revoked' });

    const subscription = profile.user.subscriptions[0];
    if (!subscription) {
      return { allowed: false, code: 'subscription_missing', reasons: ['No active subscription exists'], availableAt: null, effective: zeroEntitlements() };
    }
    const version = subscription.planVersion;
    const base: EffectiveEntitlements = {
      maxConcurrentStreams: version.maxConcurrentStreams,
      maxRegisteredDevices: version.maxRegisteredDevices,
      maxVideoResolution: version.maxVideoResolution,
      maxVideoBitrate: version.maxVideoBitrate,
      allowDirectPlay: version.allowDirectPlay,
      allowDirectStream: version.allowDirectStream,
      allowVideoTranscode: version.allowVideoTranscode,
      allowAudioTranscode: version.allowAudioTranscode,
      allowSubtitleBurnIn: version.allowSubtitleBurnIn,
      allowChromecast: version.allowChromecast,
      allowOfflineDownload: version.allowOfflineDownload,
      releaseDelayMonths: version.releaseDelayMonths,
      releaseDelayDays: version.releaseDelayDays,
    };
    const userOverrides = profile.user.entitlementOverrides
      .filter((override) => override.profileId === null)
      .map((override) => override.values);
    const profileOverrides = profile.user.entitlementOverrides
      .filter((override) => override.profileId === profile.id)
      .map((override) => override.values);
    const effective = applyEntitlementOverrides(base, [...userOverrides, ...profileOverrides]);
    return decideEntitlement({
      action: dto.action,
      entitlements: effective,
      releaseDate: media.releaseDate,
      availabilityOverride: media.availabilityOverride,
      now: new Date(),
    });
  }
}

function zeroEntitlements(): EffectiveEntitlements {
  return {
    maxConcurrentStreams: 0,
    maxRegisteredDevices: 0,
    maxVideoResolution: 0,
    maxVideoBitrate: 0,
    allowDirectPlay: false,
    allowDirectStream: false,
    allowVideoTranscode: false,
    allowAudioTranscode: false,
    allowSubtitleBurnIn: false,
    allowChromecast: false,
    allowOfflineDownload: false,
    releaseDelayMonths: 0,
    releaseDelayDays: 0,
  };
}
