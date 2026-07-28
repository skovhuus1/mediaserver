import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import type { EntitlementAction } from '@boltbytes/contracts';

export class DeviceContextDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  supportedCodecs?: string[];
}

export class EvaluateEntitlementDto {
  @IsUUID()
  profileId!: string;

  @IsUUID()
  mediaId!: string;

  @IsIn(['playback', 'cast', 'offline_download'])
  action!: EntitlementAction;

  @ValidateNested()
  @Type(() => DeviceContextDto)
  device!: DeviceContextDto;
}
