import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class EvaluateEntitlementDto {
  @IsString()
  @IsNotEmpty()
  profileId!: string;

  @IsString()
  @IsNotEmpty()
  mediaId!: string;

  @IsString()
  @IsNotEmpty()
  action!: 'playback' | 'cast' | 'transcode' | 'offline_download' | 'direct_play' | 'direct_stream';

  @IsOptional()
  @IsObject()
  deviceContext?: {
    deviceId: string;
    type: string;
    platform?: string;
    appVersion?: string;
    supportsCodec?: string[];
  };
}
