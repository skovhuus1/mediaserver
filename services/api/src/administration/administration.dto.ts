import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 100)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  password?: string;

  @IsOptional()
  @IsUUID()
  planVersionId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  profileName?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  displayName?: string;
}

export class SuspendUserDto {
  @IsBoolean()
  suspended!: boolean;
}

export class CreateProfileDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsBoolean()
  isChildProfile = false;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/)
  pin?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isChildProfile?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/)
  pin?: string;

  @IsOptional()
  @IsBoolean()
  clearPin?: boolean;
}

export class ArchiveProfileDto {
  @IsBoolean()
  archived!: boolean;
}

export class PlanEntitlementsDto {
  @IsInt() @Min(1) @Max(20)
  maxConcurrentStreams!: number;

  @IsInt() @Min(1) @Max(100)
  maxRegisteredDevices!: number;

  @IsInt() @Min(240) @Max(8640)
  maxVideoResolution!: number;

  @IsInt() @Min(128) @Max(500_000)
  maxVideoBitrate!: number;

  @IsBoolean()
  allowDirectPlay!: boolean;

  @IsBoolean()
  allowDirectStream!: boolean;

  @IsBoolean()
  allowVideoTranscode!: boolean;

  @IsBoolean()
  allowAudioTranscode!: boolean;

  @IsBoolean()
  allowSubtitleBurnIn!: boolean;

  @IsBoolean()
  allowChromecast!: boolean;

  @IsBoolean()
  allowOfflineDownload!: boolean;

  @IsInt() @Min(0) @Max(120)
  releaseDelayMonths!: number;

  @IsInt() @Min(0) @Max(3650)
  releaseDelayDays!: number;
}

export class CreatePlanDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(2, 80)
  internalCode!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @ValidateNested()
  @Type(() => PlanEntitlementsDto)
  entitlements!: PlanEntitlementsDto;
}

export class CreatePlanVersionDto {
  @IsUUID()
  planId!: string;

  @IsBoolean()
  isActive!: boolean;

  @ValidateNested()
  @Type(() => PlanEntitlementsDto)
  entitlements!: PlanEntitlementsDto;

  @IsOptional()
  @IsBoolean()
  migrateActiveSubscriptions = false;
}

export class CreateSubscriptionDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  planVersionId!: string;

  @IsOptional()
  @IsIn(['pending', 'trialing', 'active'])
  status?: 'pending' | 'trialing' | 'active';
}

export class ChangeSubscriptionPlanDto {
  @IsUUID()
  planVersionId!: string;
}

export class CreateEntitlementOverrideDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsObject()
  values!: Record<string, unknown>;

  @IsString()
  @Length(3, 500)
  reason!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class PlaybackAnalysisQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  q?: string;

  @IsOptional()
  @IsIn(['all', 'missing', 'queued', 'generating', 'ready', 'failed'])
  status: 'all' | 'missing' | 'queued' | 'generating' | 'ready' | 'failed' = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  take = 40;
}

export class PlaybackMarkerDto {
  @IsIn(['intro', 'recap', 'credits'])
  kind!: 'intro' | 'recap' | 'credits';

  @IsInt()
  @Min(0)
  startMs!: number;

  @IsInt()
  @Min(1)
  endMs!: number;
}

export class UpdatePlaybackMarkersDto {
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PlaybackMarkerDto)
  markers!: PlaybackMarkerDto[];
}
