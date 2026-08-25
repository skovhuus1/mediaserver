import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { correlationId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import {
  UpdateDevicePreferencesDto,
  UpdateProfilePreferencesDto,
} from './preferences.dto';
import { HOME_ROW_IDS, normalizeHomeLayout } from './home-layout';

export interface PreferenceActor {
  accountId: string;
  sub: string;
  profileId?: string | null;
  deviceId?: string | null;
}

const PROFILE_DEFAULTS = {
  preferredAudioLanguages: ['da', 'en'],
  preferredSubtitleLanguages: ['da', 'en'],
  subtitleMode: 'auto',
  subtitleStyle: 'broadcast',
  subtitleTextColor: '#FFFFFF',
  subtitleSizePercent: 100,
  subtitleBottomOffsetPercent: 6,
  subtitleTimingOffsetMs: 0,
  autoplayNext: true,
  recommendationsEnabled: true,
  homeRowOrder: [...HOME_ROW_IDS],
  hiddenHomeRows: [],
} as const;

const DEVICE_DEFAULTS = {
  qualityMode: 'auto',
  fixedQualityHeight: null,
  allowUpscale: true,
  upscaleMode: 'device',
  bufferProfile: 'auto',
  dataSaver: false,
  playbackRate: 1,
  hdrMode: 'auto',
} as const;

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getProfilePreferences(actor: PreferenceActor) {
    const profile = await this.requireProfile(actor);
    const preferences = await this.prisma.profilePreferences.findUnique({
      where: { profileId: profile.id },
    });
    const homeLayout = normalizeHomeLayout(preferences?.homeRowOrder, preferences?.hiddenHomeRows);

    return {
      profile: {
        id: profile.id,
        name: profile.name,
        avatarKey: profile.avatarKey,
        language: profile.language,
        isChild: profile.isChildProfile,
        pinProtected: Boolean(profile.pinHash),
      },
      preferences: {
        ...PROFILE_DEFAULTS,
        ...(preferences
          ? {
              preferredAudioLanguages: this.languages(
                preferences.preferredAudioLanguages,
                PROFILE_DEFAULTS.preferredAudioLanguages,
              ),
              preferredSubtitleLanguages: this.languages(
                preferences.preferredSubtitleLanguages,
                PROFILE_DEFAULTS.preferredSubtitleLanguages,
              ),
              subtitleMode: preferences.subtitleMode,
              subtitleStyle: preferences.subtitleStyle,
              subtitleTextColor: preferences.subtitleTextColor,
              subtitleSizePercent: preferences.subtitleSizePercent,
              subtitleBottomOffsetPercent: preferences.subtitleBottomOffsetPercent,
              subtitleTimingOffsetMs: preferences.subtitleTimingOffsetMs,
              autoplayNext: preferences.autoplayNext,
              recommendationsEnabled: preferences.recommendationsEnabled,
              homeRowOrder: homeLayout.order,
              hiddenHomeRows: homeLayout.hidden,
            }
          : { homeRowOrder: homeLayout.order, hiddenHomeRows: homeLayout.hidden }),
      },
    };
  }

  async updateProfilePreferences(
    actor: PreferenceActor,
    input: UpdateProfilePreferencesDto,
  ) {
    const profile = await this.requireProfile(actor);

    if ((input.newPin || input.clearPin) && profile.pinHash) {
      if (!input.currentPin) {
        throw new UnauthorizedException({
          code: 'profile_current_pin_required',
          message: 'The current profile PIN is required',
        });
      }
      if (!(await bcrypt.compare(input.currentPin, profile.pinHash))) {
        throw new UnauthorizedException({
          code: 'profile_current_pin_invalid',
          message: 'The current profile PIN is invalid',
        });
      }
    }
    if (input.newPin && input.clearPin) {
      throw new BadRequestException({
        code: 'profile_pin_conflict',
        message: 'A profile PIN cannot be set and removed in the same request',
      });
    }

    const pinHash = input.newPin
      ? await bcrypt.hash(input.newPin, 12)
      : input.clearPin
        ? null
        : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: profile.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.avatarKey !== undefined ? { avatarKey: input.avatarKey } : {}),
          ...(input.language !== undefined ? { language: input.language } : {}),
          ...(pinHash !== undefined ? { pinHash } : {}),
        },
      });
      await tx.profilePreferences.upsert({
        where: { profileId: profile.id },
        create: {
          profileId: profile.id,
          accountId: actor.accountId,
          preferredAudioLanguages:
            input.preferredAudioLanguages ??
            [...PROFILE_DEFAULTS.preferredAudioLanguages],
          preferredSubtitleLanguages:
            input.preferredSubtitleLanguages ??
            [...PROFILE_DEFAULTS.preferredSubtitleLanguages],
          subtitleMode: input.subtitleMode ?? PROFILE_DEFAULTS.subtitleMode,
          subtitleStyle: input.subtitleStyle ?? PROFILE_DEFAULTS.subtitleStyle,
          subtitleTextColor:
            input.subtitleTextColor?.toUpperCase() ?? PROFILE_DEFAULTS.subtitleTextColor,
          subtitleSizePercent:
            input.subtitleSizePercent ?? PROFILE_DEFAULTS.subtitleSizePercent,
          subtitleBottomOffsetPercent:
            input.subtitleBottomOffsetPercent ??
            PROFILE_DEFAULTS.subtitleBottomOffsetPercent,
          subtitleTimingOffsetMs:
            input.subtitleTimingOffsetMs ?? PROFILE_DEFAULTS.subtitleTimingOffsetMs,
          autoplayNext: input.autoplayNext ?? PROFILE_DEFAULTS.autoplayNext,
          recommendationsEnabled:
            input.recommendationsEnabled ??
            PROFILE_DEFAULTS.recommendationsEnabled,
          homeRowOrder: input.homeRowOrder ?? [...PROFILE_DEFAULTS.homeRowOrder],
          hiddenHomeRows: input.hiddenHomeRows ?? [...PROFILE_DEFAULTS.hiddenHomeRows],
        },
        update: {
          ...(input.preferredAudioLanguages !== undefined
            ? { preferredAudioLanguages: input.preferredAudioLanguages }
            : {}),
          ...(input.preferredSubtitleLanguages !== undefined
            ? { preferredSubtitleLanguages: input.preferredSubtitleLanguages }
            : {}),
          ...(input.subtitleMode !== undefined
            ? { subtitleMode: input.subtitleMode }
            : {}),
          ...(input.subtitleStyle !== undefined
            ? { subtitleStyle: input.subtitleStyle }
            : {}),
          ...(input.subtitleTextColor !== undefined
            ? { subtitleTextColor: input.subtitleTextColor.toUpperCase() }
            : {}),
          ...(input.subtitleSizePercent !== undefined
            ? { subtitleSizePercent: input.subtitleSizePercent }
            : {}),
          ...(input.subtitleBottomOffsetPercent !== undefined
            ? { subtitleBottomOffsetPercent: input.subtitleBottomOffsetPercent }
            : {}),
          ...(input.subtitleTimingOffsetMs !== undefined
            ? { subtitleTimingOffsetMs: input.subtitleTimingOffsetMs }
            : {}),
          ...(input.autoplayNext !== undefined
            ? { autoplayNext: input.autoplayNext }
            : {}),
          ...(input.recommendationsEnabled !== undefined
            ? { recommendationsEnabled: input.recommendationsEnabled }
            : {}),
          ...(input.homeRowOrder !== undefined
            ? { homeRowOrder: normalizeHomeLayout(input.homeRowOrder, []).order }
            : {}),
          ...(input.hiddenHomeRows !== undefined
            ? { hiddenHomeRows: normalizeHomeLayout([], input.hiddenHomeRows).hidden }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: profile.id,
          correlationId: correlationId(),
          action: 'profile.preferences_update',
          outcome: 'allowed',
          code: 'profile_preferences_updated',
          details: { resourceId: profile.id },
        },
      });
    });

    await this.redis.delete(this.recommendationKey(actor));
    return this.getProfilePreferences(actor);
  }

  async getDevicePreferences(actor: PreferenceActor) {
    const device = await this.requireDevice(actor);
    return {
      deviceId: device.id,
      preferences: {
        qualityMode: device.qualityMode ?? DEVICE_DEFAULTS.qualityMode,
        fixedQualityHeight:
          device.fixedQualityHeight ?? DEVICE_DEFAULTS.fixedQualityHeight,
        allowUpscale: device.allowUpscale ?? DEVICE_DEFAULTS.allowUpscale,
        upscaleMode: device.upscaleMode ?? DEVICE_DEFAULTS.upscaleMode,
        bufferProfile: device.bufferProfile ?? DEVICE_DEFAULTS.bufferProfile,
        dataSaver: device.dataSaver ?? DEVICE_DEFAULTS.dataSaver,
        playbackRate: device.playbackRate ?? DEVICE_DEFAULTS.playbackRate,
        hdrMode: device.hdrMode ?? DEVICE_DEFAULTS.hdrMode,
      },
    };
  }

  async updateDevicePreferences(
    actor: PreferenceActor,
    input: UpdateDevicePreferencesDto,
  ) {
    const device = await this.requireDevice(actor);
    const qualityMode = input.qualityMode ?? device.qualityMode;
    const fixedHeight = input.fixedQualityHeight ?? device.fixedQualityHeight;
    if (qualityMode === 'fixed' && !fixedHeight) {
      throw new BadRequestException({
        code: 'fixed_quality_height_required',
        message: 'A fixed maximum resolution is required in fixed mode',
      });
    }

    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: device.id },
        data: {
          ...(input.qualityMode !== undefined
            ? { qualityMode: input.qualityMode }
            : {}),
          ...(input.fixedQualityHeight !== undefined
            ? { fixedQualityHeight: input.fixedQualityHeight }
            : {}),
          ...(input.allowUpscale !== undefined
            ? { allowUpscale: input.allowUpscale }
            : {}),
          ...(input.upscaleMode !== undefined
            ? { upscaleMode: input.upscaleMode }
            : {}),
          ...(input.bufferProfile !== undefined
            ? { bufferProfile: input.bufferProfile }
            : {}),
          ...(input.dataSaver !== undefined
            ? { dataSaver: input.dataSaver }
            : {}),
          ...(input.playbackRate !== undefined
            ? { playbackRate: input.playbackRate }
            : {}),
          ...(input.hdrMode !== undefined ? { hdrMode: input.hdrMode } : {}),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId ?? null,
          correlationId: correlationId(),
          action: 'device.preferences_update',
          outcome: 'allowed',
          code: 'device_preferences_updated',
          details: { resourceId: device.id },
        },
      }),
    ]);
    return this.getDevicePreferences(actor);
  }

  private async requireProfile(actor: PreferenceActor) {
    if (!actor.profileId) {
      throw new ForbiddenException({
        code: 'active_profile_required',
        message: 'Select a profile before changing profile preferences',
      });
    }
    const profile = await this.prisma.profile.findFirst({
      where: {
        id: actor.profileId,
        accountId: actor.accountId,
        archivedAt: null,
      },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'profile_not_found',
        message: 'The active profile is unavailable',
      });
    }
    return profile;
  }

  private async requireDevice(actor: PreferenceActor) {
    if (!actor.deviceId) {
      throw new ForbiddenException({
        code: 'registered_device_required',
        message: 'A registered device is required for device preferences',
      });
    }
    const device = await this.prisma.device.findFirst({
      where: {
        id: actor.deviceId,
        accountId: actor.accountId,
        userId: actor.sub,
        isRevoked: false,
      },
    });
    if (!device) {
      throw new NotFoundException({
        code: 'device_not_found',
        message: 'The active device is unavailable',
      });
    }
    return device;
  }

  private languages(value: unknown, fallback: readonly string[]) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value
      : [...fallback];
  }

  private recommendationKey(actor: PreferenceActor) {
    return `recommendations:${actor.accountId}:${actor.profileId ?? 'none'}`;
  }
}
