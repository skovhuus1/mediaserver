import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type EntitlementTemplate = {
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
  allowRemoteStreaming: boolean;
  allowOfflineDownloads: boolean;
  allowHdr: boolean;
  allowDolbyVision: boolean;
  allowLosslessAudio: boolean;
  releaseDelayMonths: number;
  releaseDelayDays: number;
};

export type CreatePlanDto = {
  name: string;
  internalCode: string;
  isPublic?: boolean;
  description?: string;
  price?: number;
  currency?: string;
  billingInterval?: string;
  trialDays?: number;
  graceDays?: number;
  entitlements: EntitlementTemplate;
};

export type CreatePlanVersionDto = {
  planId: string;
  entitlements: EntitlementTemplate;
  isActive?: boolean;
};

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    return this.prisma.plans.findMany({
      include: {
        plan_versions: {
          orderBy: { version_number: 'desc' },
          take: 1,
          include: { plan_entitlements: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async listVersions() {
    return this.prisma.plan_versions.findMany({
      include: { plans: true, plan_entitlements: true },
      orderBy: [{ plan_id: 'asc' }, { version_number: 'desc' }],
    });
  }

  async createPlan(dto: CreatePlanDto) {
    const exists = await this.prisma.plans.count({ where: { internal_code: dto.internalCode } });
    if (exists > 0) {
      throw new BadRequestException({ code: 'plan_exists', message: 'Plan intern kode bruges allerede' });
    }

    return this.prisma.plans.create({
      data: {
        name: dto.name,
        internal_code: dto.internalCode,
        description: dto.description,
        is_public: dto.isPublic ?? false,
        price: dto.price ?? 0,
        currency: dto.currency ?? 'USD',
        billing_interval: dto.billingInterval ?? 'monthly',
        trial_days: dto.trialDays ?? 0,
        grace_period_days: dto.graceDays ?? 0,
        plan_versions: {
          create: {
            version_number: 1,
            is_active: true,
            effective_at: new Date(),
            max_concurrent_streams: dto.entitlements.maxConcurrentStreams,
            max_registered_devices: dto.entitlements.maxRegisteredDevices,
            max_offline_downloads: dto.entitlements.maxOfflineDownloads,
            max_video_resolution: dto.entitlements.maxVideoResolution,
            max_video_bitrate: dto.entitlements.maxVideoBitrate,
            max_audio_channels: dto.entitlements.maxAudioChannels,
            release_delay_months: dto.entitlements.releaseDelayMonths,
            release_delay_days: dto.entitlements.releaseDelayDays,
            allow_subtitle_burn_in: dto.entitlements.allowSubtitleBurnIn,
            allow_remote_streaming: dto.entitlements.allowRemoteStreaming,
            allow_offline_downloads: dto.entitlements.allowOfflineDownloads,
            allow_hdr: dto.entitlements.allowHdr,
            allow_dolby_vision: dto.entitlements.allowDolbyVision,
            allow_lossless_audio: dto.entitlements.allowLosslessAudio,
            allow_direct_play: dto.entitlements.allowDirectPlay,
            allow_direct_stream: dto.entitlements.allowDirectStream,
            allow_video_transcode: dto.entitlements.allowVideoTranscode,
            allow_audio_transcode: dto.entitlements.allowAudioTranscode,
            snapshot: {
              entitlements: dto.entitlements,
              reason: 'initial-version',
            },
            plan_entitlements: {
              create: {
                snapshot: {
                  ...dto.entitlements,
                },
              },
            },
          },
        },
      },
    });
  }

  async createVersion(dto: CreatePlanVersionDto) {
    const last = await this.prisma.plan_versions.findFirst({
      where: { plan_id: dto.planId },
      orderBy: { version_number: 'desc' },
    });

    if (!last) {
      throw new BadRequestException({ code: 'plan_missing', message: 'Plan findes ikke' });
    }

    return this.prisma.plan_versions.create({
      data: {
        plan_id: dto.planId,
        version_number: (last.version_number ?? 0) + 1,
        is_active: dto.isActive ?? false,
        effective_at: new Date(),
        max_concurrent_streams: dto.entitlements.maxConcurrentStreams,
        max_registered_devices: dto.entitlements.maxRegisteredDevices,
        max_offline_downloads: dto.entitlements.maxOfflineDownloads,
        max_video_resolution: dto.entitlements.maxVideoResolution,
        max_video_bitrate: dto.entitlements.maxVideoBitrate,
        max_audio_channels: dto.entitlements.maxAudioChannels,
        release_delay_months: dto.entitlements.releaseDelayMonths,
        release_delay_days: dto.entitlements.releaseDelayDays,
        allow_subtitle_burn_in: dto.entitlements.allowSubtitleBurnIn,
        allow_remote_streaming: dto.entitlements.allowRemoteStreaming,
        allow_offline_downloads: dto.entitlements.allowOfflineDownloads,
        allow_hdr: dto.entitlements.allowHdr,
        allow_dolby_vision: dto.entitlements.allowDolbyVision,
        allow_lossless_audio: dto.entitlements.allowLosslessAudio,
        allow_direct_play: dto.entitlements.allowDirectPlay,
        allow_direct_stream: dto.entitlements.allowDirectStream,
        allow_video_transcode: dto.entitlements.allowVideoTranscode,
        allow_audio_transcode: dto.entitlements.allowAudioTranscode,
        snapshot: {
          entitlements: dto.entitlements,
          reason: 'new-version',
          copiedFrom: last.version_number,
        },
        plan_entitlements: {
          create: { snapshot: { ...dto.entitlements } },
        },
      },
    });
  }
}
