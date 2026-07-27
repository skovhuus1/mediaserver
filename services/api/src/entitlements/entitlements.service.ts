import { EntitlementAction, EntitlementDecision } from '@bb-media/shared-types';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DeviceContext = {
  deviceId: string;
  type: string;
  platform?: string | null;
  appVersion?: string | null;
  supportsCodec?: string[];
};

type EntitlementSnapshot = {
  maxConcurrentStreams: number;
  maxRegisteredDevices: number;
  maxOfflineDownloads: number;
  maxVideoResolution: number;
  maxVideoBitrate: number;
  maxAudioChannels: number;
  allowDirectPlay: boolean;
  allowDirectStream: boolean;
  allowVideoTranscode: boolean;
  allowAudioTranscode: boolean;
  allowSubtitleBurnIn: boolean;
  allowChromecast: boolean;
  allowOfflineDownload: boolean;
  allowHdr: boolean;
  allowDolbyVision: boolean;
  allowLosslessAudio: boolean;
  releaseDelayMonths: number;
  releaseDelayDays: number;
};

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForProfile(
    profileId: string,
    mediaId: string,
    deviceContext: DeviceContext,
    action: EntitlementAction,
  ): Promise<EntitlementDecision> {
    const profile = await this.prisma.profiles.findUnique({
      where: { id: profileId },
      include: {
        accounts: true,
        users: {
          include: {
            subscriptions: {
              where: {
                status: {
                  in: ['active', 'trialing', 'grace_period', 'pending'],
                },
              },
              include: {
                plan_versions: {
                  include: { plan_entitlements: true },
                },
              },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
            user_entitlement_overrides: {
              where: {
                OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
              },
              orderBy: { granted_at: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!profile) {
      return this.deniedProfile('unknown_profile', ['Profil ikke fundet']);
    }

    if (!profile.users) {
      return this.deniedProfile('profile_without_owner', ['Profilen er ikke knyttet til en bruger']);
    }

    const user = profile.users;
    if (user.status !== 'active') {
      return this.deniedProfile('user_inactive', ['Brugeren er inaktiv']);
    }
    if (profile.accounts.status !== 'active') {
      return this.deniedProfile('account_inactive', ['Kontoen er ikke aktiv']);
    }

    const media = await this.prisma.media_items.findUnique({ where: { id: mediaId } });
    if (!media) {
      return this.deniedProfile('media_missing', ['Mediet findes ikke']);
    }

    const subscription = user.subscriptions?.[0];
    if (!subscription?.plan_versions) {
      return this.deniedProfile('no_subscription', ['Intet aktivt abonnement']);
    }

    const effective = this.resolveEffectiveEntitlements(subscription.plan_versions);
    const effectiveWithOverrides = this.applyOverrides(effective, user.user_entitlement_overrides?.[0]?.overrides);

    const releaseDecision = this.getReleaseDecision(subscription.plan_versions, media, effectiveWithOverrides);
    if (!releaseDecision.allowed) {
      return releaseDecision;
    }

    const actionDecision = this.validateAction(action, effectiveWithOverrides, deviceContext);
    if (!actionDecision.allowed) {
      return actionDecision;
    }

    return {
      allowed: true,
      reason: null,
      reasons: ['Adgang givet'],
      action: action as unknown as EntitlementAction,
      effectiveEntitlements: effectiveWithOverrides,
    };
  }

  private deniedProfile(reason: string, reasons: string[]) {
    return {
      allowed: false,
      reason,
      reasons,
      action: 'playback',
      effectiveEntitlements: {
        maxConcurrentStreams: 0,
        maxRegisteredDevices: 0,
        maxOfflineDownloads: 0,
        maxVideoResolution: 0,
        maxVideoBitrate: 0,
        maxAudioChannels: 0,
        allowDirectPlay: false,
        allowDirectStream: false,
        allowVideoTranscode: false,
        allowAudioTranscode: false,
        allowSubtitleBurnIn: false,
        allowChromecast: false,
        allowOfflineDownload: false,
        allowHdr: false,
        allowDolbyVision: false,
        allowLosslessAudio: false,
        releaseDelayMonths: 0,
        releaseDelayDays: 0,
      },
    };
  }

  private applyOverrides(base: EntitlementSnapshot, overrides: unknown) {
    if (!overrides || typeof overrides !== 'object') {
      return base;
    }

    const extra = overrides as Record<string, unknown>;
    const mergeNumber = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const mergeBoolean = (value: unknown, fallback: boolean) =>
      typeof value === 'boolean' ? value : fallback;

    return {
      ...base,
      ...extra,
      maxConcurrentStreams: mergeNumber(extra.maxConcurrentStreams ?? extra.max_concurrent_streams, base.maxConcurrentStreams),
      maxRegisteredDevices: mergeNumber(extra.maxRegisteredDevices ?? extra.max_registered_devices, base.maxRegisteredDevices),
      maxOfflineDownloads: mergeNumber(extra.maxOfflineDownloads ?? extra.max_offline_downloads, base.maxOfflineDownloads),
      maxVideoResolution: mergeNumber(extra.maxVideoResolution ?? extra.max_video_resolution, base.maxVideoResolution),
      maxVideoBitrate: mergeNumber(extra.maxVideoBitrate ?? extra.max_video_bitrate, base.maxVideoBitrate),
      maxAudioChannels: mergeNumber(extra.maxAudioChannels ?? extra.max_audio_channels, base.maxAudioChannels),
      allowDirectPlay: mergeBoolean(extra.allowDirectPlay ?? extra.allow_direct_play, base.allowDirectPlay),
      allowDirectStream: mergeBoolean(extra.allowDirectStream ?? extra.allow_direct_stream, base.allowDirectStream),
      allowVideoTranscode: mergeBoolean(extra.allowVideoTranscode ?? extra.allow_video_transcode, base.allowVideoTranscode),
      allowAudioTranscode: mergeBoolean(extra.allowAudioTranscode ?? extra.allow_audio_transcode, base.allowAudioTranscode),
      allowSubtitleBurnIn: mergeBoolean(extra.allowSubtitleBurnIn ?? extra.allow_subtitle_burn_in, base.allowSubtitleBurnIn),
      allowChromecast: mergeBoolean(extra.allowChromecast ?? extra.allow_chromecast, base.allowChromecast),
      allowOfflineDownload: mergeBoolean(
        extra.allowOfflineDownload ??
          extra.allowOfflineDownloads ??
          extra.allow_offline_downloads ??
          extra.allow_offline_download,
        base.allowOfflineDownload,
      ),
      allowHdr: mergeBoolean(extra.allowHdr ?? extra.allow_hdr, base.allowHdr),
      allowDolbyVision: mergeBoolean(extra.allowDolbyVision ?? extra.allow_dolby_vision, base.allowDolbyVision),
      allowLosslessAudio: mergeBoolean(extra.allowLosslessAudio ?? extra.allow_lossless_audio, base.allowLosslessAudio),
      releaseDelayMonths: mergeNumber(extra.releaseDelayMonths ?? extra.release_delay_months, base.releaseDelayMonths),
      releaseDelayDays: mergeNumber(extra.releaseDelayDays ?? extra.release_delay_days, base.releaseDelayDays),
    };
  }

  private validateAction(action: EntitlementAction, entitlements: Record<string, unknown>, deviceContext: DeviceContext) {
    if (action === 'cast' && entitlements.allowChromecast !== true) {
      return this.deniedProfile('action_forbidden', ['Cast er ikke tilladt']);
    }
    if (action === 'offline_download' && entitlements.allowOfflineDownload !== true) {
      return this.deniedProfile('action_forbidden', ['Offline download er ikke tilladt']);
    }
    if (action === 'transcode' && entitlements.allowVideoTranscode !== true) {
      return this.deniedProfile('action_forbidden', ['Transcoding er ikke tilladt']);
    }

    if (!deviceContext?.supportsCodec?.length && action === 'playback') {
      return this.deniedProfile('missing_device_context', ['Manglende codec support-oplysninger']);
    }

    return {
      allowed: true,
      reason: null,
      reasons: [],
      action,
      effectiveEntitlements: entitlements as any,
    };
  }

  private getReleaseDecision(planVersion: { release_delay_months: number | null; release_delay_days: number | null }, media: any, effective: Record<string, unknown>) {
    const baseDate =
      media.availability_override ??
      media.digital_release_date ??
      media.physical_release_date ??
      media.first_air_date ??
      media.original_release_date ??
      media.metadata_release_date ??
      media.availability_date;

    if (!baseDate) {
      return this.deniedProfile('release_date_missing', ['Manglende udgivelsesdato']);
    }

    const releaseDate = new Date(baseDate);
    const adjustedRelease = this.addCalendarOffset(
      releaseDate,
      Number(planVersion.release_delay_months ?? 0),
      Number(planVersion.release_delay_days ?? 0),
    );

    if (adjustedRelease > new Date()) {
      return {
        allowed: false,
        reason: 'release_delay_active',
        reasons: ['Medie er stadig under release window'],
        action: 'playback',
        effectiveEntitlements: effective as any,
      };
    }

    return {
      allowed: true,
      reason: null,
      reasons: [],
      action: 'playback',
      effectiveEntitlements: effective as any,
    };
  }

  private resolveEffectiveEntitlements(planVersion: {
    max_concurrent_streams: number | null;
    max_registered_devices: number | null;
    max_offline_downloads: number | null;
    max_video_resolution: number | null;
    max_video_bitrate: number | null;
    max_audio_channels: number | null;
    allow_direct_play: boolean | null;
    allow_direct_stream: boolean | null;
    allow_video_transcode: boolean | null;
    allow_audio_transcode: boolean | null;
    allow_subtitle_burn_in: boolean | null;
    allow_remote_streaming: boolean | null;
    allow_offline_downloads: boolean | null;
    allow_chromecast: boolean | null;
    allow_hdr: boolean | null;
    allow_dolby_vision: boolean | null;
    allow_lossless_audio: boolean | null;
    release_delay_months: number | null;
    release_delay_days: number | null;
    plan_entitlements?: { snapshot?: Record<string, unknown> | null } | null;
  }): EntitlementSnapshot {
    const snapshot = (planVersion?.plan_entitlements?.snapshot ?? {}) as Record<string, unknown>;

    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

    return {
      maxConcurrentStreams: num(
        snapshot.maxConcurrentStreams ?? snapshot.max_concurrent_streams ?? planVersion?.max_concurrent_streams,
        1,
      ),
      maxRegisteredDevices: num(
        snapshot.maxRegisteredDevices ?? snapshot.max_registered_devices ?? planVersion?.max_registered_devices,
        1,
      ),
      maxOfflineDownloads: num(
        snapshot.maxOfflineDownloads ?? snapshot.max_offline_downloads ?? snapshot.allow_offline_downloads ?? planVersion?.max_offline_downloads,
        0,
      ),
      maxVideoResolution: num(
        snapshot.maxVideoResolution ?? snapshot.max_video_resolution ?? planVersion?.max_video_resolution,
        1080,
      ),
      maxVideoBitrate: num(
        snapshot.maxVideoBitrate ?? snapshot.max_video_bitrate ?? planVersion?.max_video_bitrate,
        4000,
      ),
      maxAudioChannels: num(snapshot.maxAudioChannels ?? snapshot.max_audio_channels ?? planVersion?.max_audio_channels, 2),
      allowDirectPlay: bool(snapshot.allowDirectPlay ?? snapshot.allow_direct_play ?? planVersion?.allow_direct_play, true),
      allowDirectStream: bool(snapshot.allowDirectStream ?? snapshot.allow_direct_stream ?? planVersion?.allow_direct_stream, false),
      allowVideoTranscode: bool(snapshot.allowVideoTranscode ?? snapshot.allow_video_transcode ?? planVersion?.allow_video_transcode, false),
      allowAudioTranscode: bool(snapshot.allowAudioTranscode ?? snapshot.allow_audio_transcode ?? planVersion?.allow_audio_transcode, false),
      allowSubtitleBurnIn: bool(snapshot.allowSubtitleBurnIn ?? snapshot.allow_subtitle_burn_in ?? planVersion?.allow_subtitle_burn_in, false),
      allowChromecast: bool(snapshot.allowChromecast ?? snapshot.allow_chromecast ?? planVersion?.allow_chromecast, false),
      allowOfflineDownload: bool(
        snapshot.allowOfflineDownload ??
          snapshot.allowOfflineDownloads ??
          snapshot.allow_offline_downloads ??
          snapshot.allow_offline_download ??
          planVersion?.allow_offline_downloads,
        false,
      ),
      allowHdr: bool(snapshot.allowHdr ?? snapshot.allow_hdr ?? planVersion?.allow_hdr, false),
      allowDolbyVision: bool(snapshot.allowDolbyVision ?? snapshot.allow_dolby_vision ?? planVersion?.allow_dolby_vision, false),
      allowLosslessAudio: bool(snapshot.allowLosslessAudio ?? snapshot.allow_lossless_audio ?? planVersion?.allow_lossless_audio, false),
      releaseDelayMonths: num(snapshot.releaseDelayMonths ?? snapshot.release_delay_months ?? planVersion?.release_delay_months, 0),
      releaseDelayDays: num(snapshot.releaseDelayDays ?? snapshot.release_delay_days ?? planVersion?.release_delay_days, 0),
    };
  }

  private addCalendarOffset(date: Date, months: number, days: number) {
    const result = new Date(date.getTime());
    result.setMonth(result.getMonth() + months);
    result.setDate(result.getDate() + days);
    return result;
  }
}
