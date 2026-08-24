import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import type { MediaTargetType } from './media-target';

export class CreatePlaylistDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class AddPlaylistItemDto {
  @IsOptional()
  @IsIn(['auto', 'media', 'movie', 'series', 'episode'])
  targetType?: MediaTargetType | 'auto';
}

export class ReorderPlaylistItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  itemIds!: string[];

  @IsISO8601()
  expectedUpdatedAt!: string;
}
