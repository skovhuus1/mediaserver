import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

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
