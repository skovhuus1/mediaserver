import { IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateLiveTvRecordingDto {
  @IsOptional() @IsUUID() programId?: string;
  @ValidateIf((value: CreateLiveTvRecordingDto) => !value.programId) @IsUUID() channelId?: string;
  @ValidateIf((value: CreateLiveTvRecordingDto) => !value.programId) @IsString() @MaxLength(240) title?: string;
  @ValidateIf((value: CreateLiveTvRecordingDto) => !value.programId) @IsISO8601() startsAt?: string;
  @ValidateIf((value: CreateLiveTvRecordingDto) => !value.programId) @IsISO8601() endsAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(600) prePaddingSeconds?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1800) postPaddingSeconds?: number;
}
