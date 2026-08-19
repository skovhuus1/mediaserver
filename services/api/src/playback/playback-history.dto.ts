import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PlaybackProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  positionMs!: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  durationMs?: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class SetWatchedDto {
  @IsBoolean()
  watched!: boolean;
}
