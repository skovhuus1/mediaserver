import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';

export class PlaybackCapabilitiesDto {
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
