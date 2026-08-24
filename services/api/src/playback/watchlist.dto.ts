import { IsIn, IsOptional } from 'class-validator';
import type { MediaTargetType } from './media-target';

export class WatchlistTargetDto {
  @IsOptional()
  @IsIn(['auto', 'media', 'movie', 'series', 'episode'])
  targetType?: MediaTargetType | 'auto';
}
