import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested } from 'class-validator';

export class CreateLibraryDto {
  @IsUUID()
  storageRootId!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsIn(['movie', 'series', 'mixed'])
  type!: 'movie' | 'series' | 'mixed';

  @IsString()
  @Length(1, 1024)
  path!: string;

  @IsOptional()
  @IsBoolean()
  recursive = true;

  @IsOptional()
  @IsBoolean()
  autoScanEnabled = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(10_080)
  scanIntervalMinutes = 60;
}

export class UpdateLibraryDto {
  @IsOptional()
  @IsUUID()
  storageRootId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsIn(['movie', 'series', 'mixed'])
  type?: 'movie' | 'series' | 'mixed';

  @IsOptional()
  @IsString()
  @Length(1, 1024)
  path?: string;

  @IsOptional()
  @IsBoolean()
  recursive?: boolean;

  @IsOptional()
  @IsBoolean()
  autoScanEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(10_080)
  scanIntervalMinutes?: number;
}

export class BrowseLibraryDirectoriesDto {
  @IsUUID()
  storageRootId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 4096)
  path?: string;
}

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  q?: string;

  @IsOptional()
  @IsIn(['movie', 'series', 'episode'])
  type?: 'movie' | 'series' | 'episode';

  @IsOptional()
  @IsString()
  @Length(1, 120)
  category?: string;

  @IsOptional()
  @IsUUID()
  libraryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  seriesTitle?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  seriesDisplayTitle?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  seriesMetadataProviderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 24;

  @IsOptional()
  @IsIn(['newest', 'title', 'year'])
  sort: 'newest' | 'title' | 'year' = 'newest';
}

export class MediaDetailsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  season?: number;
}

export class CreateMediaDto {
  @IsUUID()
  libraryId!: string;

  @IsString()
  @Length(1, 240)
  title!: string;

  @IsIn(['movie', 'series', 'season', 'episode'])
  type!: 'movie' | 'series' | 'season' | 'episode';

  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
  codec?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  container?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  bitrate?: number;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @IsDateString()
  availabilityOverride?: string;
}

export class QueueMetadataDto {
  @IsOptional()
  @IsIn(['all', 'movie', 'series'])
  mediaType: 'all' | 'movie' | 'series' = 'all';
}

export class SetMetadataLockDto {
  @IsBoolean()
  locked!: boolean;
}

export class MetadataMatchQueryDto {
  @IsString()
  @Length(1, 120)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  q!: string;
}

export class ApplyMetadataMatchDto {
  @IsIn(['tmdb', 'tvdb'])
  provider!: 'tmdb' | 'tvdb';

  @IsString()
  @Matches(/^\d{1,12}$/)
  providerId!: string;

  @IsOptional()
  @IsBoolean()
  locked = true;
}

export class QueuePlaybackAssetsBatchDto {
  @IsOptional()
  @IsIn(['missing', 'all'])
  mode: 'missing' | 'all' = 'missing';

  @IsOptional()
  @IsIn(['all', 'movie', 'series'])
  mediaType: 'all' | 'movie' | 'series' = 'all';
}

export class TimelineMarkerRangeDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  startMs!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(86_400_000)
  endMs!: number;
}

export class UpdateTimelineMarkersDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TimelineMarkerRangeDto)
  intro?: TimelineMarkerRangeDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimelineMarkerRangeDto)
  credits?: TimelineMarkerRangeDto | null;
}
