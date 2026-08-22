import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateLiveTvAutomationDto {
  @IsOptional() @IsBoolean() autoRefreshEnabled?: boolean;
  @IsOptional() @IsInt() @Min(5) @Max(1440) playlistRefreshMinutes?: number;
  @IsOptional() @IsInt() @Min(15) @Max(4320) epgRefreshMinutes?: number;
}

export class RunLiveTvMaintenanceDto {
  @IsIn(['playlist', 'epg']) kind!: 'playlist' | 'epg';
}
