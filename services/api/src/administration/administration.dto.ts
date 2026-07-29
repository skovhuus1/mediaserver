import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
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

  @IsString()
  @MinLength(12)
  password!: string;
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
}
