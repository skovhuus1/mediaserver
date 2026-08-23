import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEFAULT_ADMIN_CHANNEL_PAGE_SIZE,
  MAX_ADMIN_CHANNEL_PAGE_SIZE,
  MAX_ADMIN_LIVE_TV_CHANNELS,
} from './live-tv-channel-catalog';
import { DEFAULT_LIVE_TV_GUIDE_PAGE_SIZE, MAX_LIVE_TV_GUIDE_PAGE_SIZE } from './live-tv-guide';

const urlOptions = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class CreateLiveTvProviderDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(120) connectionName!: string;
  @IsUrl(urlOptions) @MaxLength(4096) playlistUrl!: string;
  @IsOptional() @IsUrl(urlOptions) @MaxLength(4096) epgUrl?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(10_000) priority = 100;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) perUserStreamLimit = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) maxConcurrentStreams = 1;
}

export class UpdateLiveTvProviderDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) priority?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perUserStreamLimit?: number;
  @IsOptional() @IsUrl(urlOptions) @MaxLength(4096) epgUrl?: string;
  @IsOptional() @IsBoolean() clearEpg?: boolean;
}

export class CreateLiveTvConnectionDto {
  @IsString() @MaxLength(120) name!: string;
  @IsUrl(urlOptions) @MaxLength(4096) playlistUrl!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(10_000) priority = 100;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) maxConcurrentStreams = 1;
}

export class UpdateLiveTvConnectionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsUrl(urlOptions) @MaxLength(4096) playlistUrl?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) priority?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) maxConcurrentStreams?: number;
}

export class UpdateLiveTvChannelDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99_999) number?: number;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) groupName?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() isAdult?: boolean;
  @IsOptional() @IsBoolean() metadataLocked?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
}

export class BulkUpdateLiveTvChannelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ADMIN_LIVE_TV_CHANNELS)
  @IsUUID('4', { each: true })
  channelIds!: string[];

  @IsIn(['show', 'hide'])
  action!: 'show' | 'hide';
}

export class ListAdminLiveTvChannelsDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsString() @MaxLength(120) group?: string;
  @IsOptional() @IsIn(['all', 'visible', 'hidden']) visibility: 'all' | 'visible' | 'hidden' = 'all';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_ADMIN_CHANNEL_PAGE_SIZE) pageSize = DEFAULT_ADMIN_CHANNEL_PAGE_SIZE;
}

export class ListLiveTvGuideDto {
  @IsOptional() @IsString() @MaxLength(64) from?: string;
  @IsOptional() @IsString() @MaxLength(64) to?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsString() @MaxLength(120) group?: string;
  @IsOptional() @IsIn(['true', 'false']) favorites: 'true' | 'false' = 'false';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_LIVE_TV_GUIDE_PAGE_SIZE) pageSize = DEFAULT_LIVE_TV_GUIDE_PAGE_SIZE;
}

export class LiveTvGuideNeighborDto {
  @IsIn(['next', 'previous'])
  direction!: 'next' | 'previous';
}

export class BulkUpdateLiveTvChannelGroupDto {
  @IsString() @MaxLength(120) groupName!: string;
  @IsIn(['show', 'hide']) action!: 'show' | 'hide';
}

export class UpdateLiveTvSourceDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) priority?: number;
  @IsOptional() @IsIn(['auto', 'hls', 'mpegts']) streamFormat?: string;
}

export class MergeLiveTvChannelDto {
  @IsString() sourceChannelId!: string;
}

export class LiveTvAuthorizeDto {
  @IsString() channelId!: string;
  @IsOptional() @IsBoolean() isCastSession?: boolean;
  @IsOptional() @IsIn(['auto', 'direct_play', 'direct_stream', 'transcode']) preferredMethod?: string;
}

export class LiveTvSwitchDto extends LiveTvAuthorizeDto {
  @IsString() @MaxLength(256) streamToken!: string;
}

export class LiveTvTokenDto {
  @IsString() @MaxLength(256) streamToken!: string;
}

export class LiveTvHeartbeatDto {
  @IsOptional() @IsIn(['starting', 'playing', 'paused', 'buffering']) runtimeState?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500_000_000) currentBitrate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3_600_000) bufferAheadMs?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) stallCount?: number;
}
