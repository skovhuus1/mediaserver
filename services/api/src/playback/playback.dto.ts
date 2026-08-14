import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  supportedAudioCodecs?: string[];

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

export class ReconfigurePlaybackDto {
  @IsString()
  @Length(32, 512)
  streamToken!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  subtitleTrackId?: string;

  @IsBoolean()
  burnIn!: boolean;
}

export class PlaybackHeartbeatDto {
  @IsOptional()
  @IsIn(['starting', 'playing', 'paused', 'buffering'])
  runtimeState?: 'starting' | 'playing' | 'paused' | 'buffering';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  positionMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  durationMs?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  currentBitrate?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4320)
  currentHeight?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  bufferAheadMs?: number | null;
}
