import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';

export class PlaybackCapabilitiesDto {
  @IsOptional()
  @IsNumber()
  @Min(240)
  @Max(4320)
  screenHeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(4)
  devicePixelRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  estimatedDownlinkMbps?: number;

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  supportedCodecs!: string[];

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  supportedContainers!: string[];

  @IsOptional()
  @IsBoolean()
  supportsHdr = false;
}

export class AuthorizePlaybackDto {
  @IsUUID()
  profileId!: string;

  @IsUUID()
  mediaId!: string;

  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsBoolean()
  isCastSession = false;

  @ValidateNested()
  @Type(() => PlaybackCapabilitiesDto)
  capabilities!: PlaybackCapabilitiesDto;
}

export class CastHandoffDto {
  @IsString()
  @Length(32, 512)
  streamToken!: string;
}
