import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PrepareOfflineDownloadDto {
  @IsUUID()
  mediaId!: string;

  @IsOptional()
  @IsIn([360, 480, 720, 1080])
  qualityHeight = 1080;
}

export class OfflineDownloadProgressDto {
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  positionMs!: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
